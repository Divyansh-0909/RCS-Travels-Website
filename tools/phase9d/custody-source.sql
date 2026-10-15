-- Disposable receiver ONLY, after accepted broker-recovery.sql. No operative migration.
CREATE ROLE custody_source_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
CREATE ROLE custody_sender LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
CREATE ROLE custody_verifier LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
CREATE ROLE custody_operator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
CREATE SCHEMA custody_export AUTHORIZATION custody_source_owner;
GRANT USAGE ON SCHEMA broker9d,transport9d TO custody_source_owner;
GRANT SELECT ON broker9d.requests,broker9d.attempts,broker9d.events TO custody_source_owner;
GRANT EXECUTE ON FUNCTION transport9d.serialize(jsonb),transport9d.hmac(text,text,text) TO custody_source_owner;
SET ROLE custody_source_owner;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
CREATE TABLE custody_export.control(singleton boolean PRIMARY KEY CHECK(singleton),source uuid NOT NULL,secret text NOT NULL,
  seq bigint NOT NULL DEFAULT 0,head text NOT NULL DEFAULT repeat('0',64),max_pending int NOT NULL DEFAULT 100 CHECK(max_pending>0));
CREATE TABLE custody_export.events(seq bigint PRIMARY KEY,local_id bigint UNIQUE NOT NULL,event jsonb NOT NULL,hash text NOT NULL UNIQUE,
  attempts int NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),status text NOT NULL DEFAULT 'PENDING' CHECK(status IN('PENDING','REVIEW','ACKED')),
  receipt jsonb, CHECK((status='ACKED')=(receipt IS NOT NULL)));
ALTER TABLE custody_export.events ADD recoveries int NOT NULL DEFAULT 0 CHECK(recoveries BETWEEN 0 AND 3);
CREATE TABLE custody_export.retries(id uuid PRIMARY KEY,seq bigint NOT NULL,actor text NOT NULL,expected int NOT NULL);
CREATE FUNCTION custody_export.capture() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,custody_export,pg_temp SET TimeZone='UTC' AS $$
DECLARE c custody_export.control; q broker9d.requests; a broker9d.attempts; e jsonb; h text; pending bigint;
BEGIN
  SELECT * INTO STRICT c FROM custody_export.control FOR UPDATE;
  SELECT * INTO q FROM broker9d.requests WHERE id=NEW.request_id;
  SELECT * INTO a FROM broker9d.attempts WHERE id=NEW.attempt_id;
  e=jsonb_build_object('schema','custody-event-v1','source',c.source::text,'service','broker-receiver-v1',
    'database',encode(sha256(convert_to(current_database(),'UTF8')),'hex'),'sequence',(c.seq+1)::text,'previous',c.head,
    'localId',NEW.id::text,'sourceHash',encode(sha256(convert_to(to_jsonb(NEW)::text,'UTF8')),'hex'),
    'action',NEW.action,'actor',NEW.actor,'request',NEW.request_id::text,'attempt',NEW.attempt_id::text,
    'evidenceHash',q.evidence_hash,'evidenceVersion',CASE WHEN q.id IS NOT NULL THEN 'responsibility-evidence-v1' END,
    'receipt',q.receipt::text,'configuration',q.configuration_hash,'generation',COALESCE(a.generation,q.generation)::text,
    'frozen','e484afc4c7fa724ea29af6edd962c48b814dc73a10e4f4a5e33833ad26afbe75',
    'observed',to_char(NEW.at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  h=encode(sha256(convert_to('custody-event-v1'||chr(10)||transport9d.serialize(e),'UTF8')),'hex');
  SELECT count(*) INTO pending FROM custody_export.events WHERE status='PENDING';
  INSERT INTO custody_export.events(seq,local_id,event,hash,status) VALUES(c.seq+1,NEW.id,e,h,CASE WHEN pending>=c.max_pending THEN 'REVIEW' ELSE 'PENDING' END);
  UPDATE custody_export.control SET seq=c.seq+1,head=h;
  RETURN NEW;
END $$;
CREATE FUNCTION custody_export.frame(n bigint) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,custody_export,pg_temp AS $$
DECLARE e custody_export.events; c custody_export.control;
BEGIN
  SELECT * INTO e FROM custody_export.events WHERE seq=n;
  IF e.seq IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO STRICT c FROM custody_export.control;
  RETURN jsonb_build_object('event',e.event,'mac',encode(transport9d.hmac('custody-source-v1'||chr(10)||transport9d.serialize(e.event),c.secret,'sha256'),'hex'));
END $$;
CREATE FUNCTION custody_export.next() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,custody_export,pg_temp AS $$
DECLARE e custody_export.events;
BEGIN
  SELECT * INTO e FROM custody_export.events WHERE status<>'ACKED' ORDER BY seq LIMIT 1 FOR UPDATE;
  IF e.seq IS NULL OR e.status='REVIEW' THEN RETURN NULL; END IF;
  UPDATE custody_export.events SET attempts=attempts+1,status=CASE WHEN attempts+1=3 THEN 'REVIEW' ELSE status END WHERE seq=e.seq;
  RETURN custody_export.frame(e.seq);
END $$;
CREATE FUNCTION custody_export.ack(n bigint,h text,r jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,custody_export,pg_temp AS $$
BEGIN
  -- Only the separately credentialed signature verifier may call this routine.
  UPDATE custody_export.events SET status='ACKED',receipt=r WHERE seq=n AND hash=h AND (receipt IS NULL OR receipt=r);
  RETURN FOUND;
END $$;
CREATE FUNCTION custody_export.retry(operation uuid,n bigint,expected int) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,custody_export,pg_temp AS $$
DECLARE e custody_export.events; r custody_export.retries; c custody_export.control;
BEGIN
  SELECT * INTO STRICT c FROM custody_export.control FOR UPDATE;
  SELECT * INTO e FROM custody_export.events WHERE seq=n FOR UPDATE;
  SELECT * INTO r FROM custody_export.retries WHERE id=operation;
  IF r.id IS NOT NULL THEN RETURN r.seq=n AND r.expected=expected AND r.actor=session_user; END IF;
  IF e.seq IS NULL OR e.status<>'REVIEW' OR e.attempts<>expected OR e.recoveries>=3 THEN RETURN false; END IF;
  IF (SELECT count(*) FROM custody_export.events WHERE status='PENDING')>=c.max_pending THEN RETURN false; END IF;
  INSERT INTO custody_export.retries VALUES(operation,n,session_user,expected);
  UPDATE custody_export.events SET status='PENDING',attempts=0,recoveries=recoveries+1 WHERE seq=n;RETURN true;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA custody_export FROM PUBLIC;
RESET ROLE;
CREATE TRIGGER custody_capture AFTER INSERT ON broker9d.events FOR EACH ROW EXECUTE FUNCTION custody_export.capture();
GRANT USAGE ON SCHEMA custody_export TO custody_sender,custody_verifier,custody_operator;
GRANT EXECUTE ON FUNCTION custody_export.next(),custody_export.frame(bigint) TO custody_sender;
GRANT EXECUTE ON FUNCTION custody_export.ack(bigint,text,jsonb) TO custody_verifier;
GRANT EXECUTE ON FUNCTION custody_export.retry(uuid,bigint,int) TO custody_operator;
