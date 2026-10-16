-- Optional owned source/receiver adapter; __CRYPTO__ is replaced only with outbox9d or transport9d by trusted bootstrap.
CREATE SCHEMA custody_lineage AUTHORIZATION shadow9d_owner;
SET ROLE shadow9d_owner;
CREATE TABLE custody_lineage.control(singleton boolean PRIMARY KEY CHECK(singleton),source uuid NOT NULL,service text NOT NULL,
  secret text NOT NULL,now_at timestamptz NOT NULL,seq bigint NOT NULL DEFAULT 0,head text NOT NULL DEFAULT repeat('0',64),
  max_events int NOT NULL DEFAULT 1000 CHECK(max_events BETWEEN 1 AND 10000),deferred bigint NOT NULL DEFAULT 0,last_deferred_hash text);
CREATE TABLE custody_lineage.events(seq bigint PRIMARY KEY,identity text UNIQUE NOT NULL,event jsonb NOT NULL,hash text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK(status IN('PENDING','REVIEW','ACKED')),attempts int NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
  receipt jsonb,CHECK((status='ACKED')=(receipt IS NOT NULL)));
CREATE FUNCTION custody_lineage.serialize(v jsonb) RETURNS text LANGUAGE sql
SET search_path=pg_catalog,custody_lineage,pg_temp AS $$
  SELECT '{'||string_agg(to_jsonb(key)::text||':'||value::text,',' ORDER BY key COLLATE "C")||'}' FROM jsonb_each(v)
$$;
CREATE FUNCTION custody_lineage.emit(action text,id text,owner_id text,original jsonb,actor text) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,custody_lineage,pg_temp SET TimeZone='UTC' AS $$
DECLARE c custody_lineage.control; identity_key text; e jsonb; digest text; existing bigint; original_digest text; transport_service text;
BEGIN
  SELECT * INTO STRICT c FROM custody_lineage.control FOR UPDATE;
  identity_key=encode(__CRYPTO__.hmac(id,c.secret,'sha256'),'hex');
  digest=encode(sha256(convert_to(original::text,'UTF8')),'hex');
  SELECT seq,event->>'sourceHash' INTO existing,original_digest FROM custody_lineage.events WHERE events.identity=identity_key;
  IF existing IS NOT NULL THEN
    IF original_digest IS DISTINCT FROM digest THEN RAISE EXCEPTION 'SOURCE_IDENTITY_CONFLICT' USING ERRCODE='23514'; END IF;
    RETURN existing;
  END IF;
  IF c.deferred>0 OR (SELECT count(*) FROM custody_lineage.events)>=c.max_events THEN
    -- Preserve original authoritative journals. A stopped-control event must never veto STOP.
    IF action='LOCAL_AUDIT' AND original->>'action'='CONTROL' THEN
      UPDATE custody_lineage.control SET deferred=deferred+1,last_deferred_hash=digest;RETURN NULL;
    END IF;
    RAISE EXCEPTION 'AUDIT_HISTORY_CAPACITY' USING ERRCODE='54000';
  END IF;
  IF c.service='source-lineage-v2' THEN SELECT service_id::text INTO transport_service FROM outbox9d.transport_configuration;
  ELSE SELECT service_id::text INTO transport_service FROM transport9d.configuration;END IF;
  e=jsonb_build_object('schema','custody-event-v2','source',c.source::text,'service',c.service,
    'database',encode(sha256(convert_to(current_database(),'UTF8')),'hex'),'sequence',(c.seq+1)::text,'previous',c.head,
    'localId',(c.seq+1)::text,'sourceHash',digest,'identityHash',identity_key,
    'ownerHash',CASE WHEN owner_id IS NOT NULL THEN encode(__CRYPTO__.hmac(owner_id,c.secret,'sha256'),'hex') END,
    'action',action,'actor',actor,'request',NULL,'attempt',NULL,'receipt',original->>'receipt',
    'evidenceHash',COALESCE(original->>'evidenceHash',original->>'evidence_hash',original#>>'{payload,evidenceHash}'),
    'evidenceVersion',CASE WHEN COALESCE(original->>'evidenceHash',original->>'evidence_hash',original#>>'{payload,evidenceHash}') IS NOT NULL THEN 'responsibility-evidence-v1' END,
    'configuration',encode(sha256(convert_to(jsonb_build_object('adapter','isolated-custody-lineage-v2','transportService',transport_service,'protocol','shadow-export-v1','projection','shadow-minimized-v1','export','inactive-isolated-export-v1')::text,'UTF8')),'hex'),
    'generation',original->>'epoch','frozen','e484afc4c7fa724ea29af6edd962c48b814dc73a10e4f4a5e33833ad26afbe75',
    'observed',to_char(c.now_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  digest=encode(sha256(convert_to('custody-event-v1'||chr(10)||custody_lineage.serialize(e),'UTF8')),'hex');
  INSERT INTO custody_lineage.events(seq,identity,event,hash) VALUES(c.seq+1,identity_key,e,digest);
  UPDATE custody_lineage.control SET seq=c.seq+1,head=digest;RETURN c.seq+1;
END $$;
CREATE FUNCTION custody_lineage.capture() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,custody_lineage,pg_temp SET TimeZone='UTC' AS $$
DECLARE original jsonb; action text; identity text; actor text; source jsonb;
BEGIN
  IF TG_OP='UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
  original=to_jsonb(NEW);identity=TG_TABLE_SCHEMA||'.'||TG_TABLE_NAME||':'||COALESCE(original->>'id',original->>'logical_key',original->>'receipt');
  actor=CASE WHEN session_user IN('shadow9d_exporter','shadow9d_capture','shadow9d_ops','shadow9d_worker','shadow9d_recorder','custody_operator','broker9d_exec','broker9d_guard','broker9d_ops','broker9d_reconciler') THEN session_user ELSE 'application_transaction' END;
  IF TG_TABLE_SCHEMA='outbox9d' AND TG_TABLE_NAME='deliveries' THEN
    action=CASE WHEN TG_OP='INSERT' THEN 'OUTBOX_CREATED' ELSE 'OUTBOX_CHANGED' END;
    SELECT outbox9d.source(original->>'source_work_id') INTO source;
    IF source->>'lineageValid'='true' THEN
      PERFORM custody_lineage.emit('SOURCE_LINEAGE','source:'||(source->>'workId')||':'||(source->>'evidenceHash'),source->>'actorId',source,'application_transaction');
    END IF;
  ELSIF TG_TABLE_SCHEMA='transport9d' THEN action='RECEIPT_ACCEPTED';
  ELSIF TG_TABLE_SCHEMA='shadow9d' THEN action=CASE WHEN TG_OP='INSERT' THEN 'WORK_ADMITTED' ELSE 'WORK_CHANGED' END;
  ELSIF TG_TABLE_SCHEMA='custody_export' THEN action='RECOVERY_AUTHORIZED';
  ELSE action='LOCAL_AUDIT'; END IF;
  PERFORM custody_lineage.emit(action,identity||':'||encode(sha256(convert_to(original::text,'UTF8')),'hex'),NULL,original,actor);
  RETURN NEW;
END $$;
CREATE FUNCTION custody_lineage.frame(n bigint) RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path=pg_catalog,custody_lineage,pg_temp AS $$
  SELECT jsonb_build_object('event',e.event,'mac',encode(__CRYPTO__.hmac('custody-source-v1'||chr(10)||custody_lineage.serialize(e.event),c.secret,'sha256'),'hex'))
  FROM custody_lineage.events e CROSS JOIN custody_lineage.control c WHERE e.seq=n
$$;
CREATE FUNCTION custody_lineage.next() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,custody_lineage,pg_temp AS $$
DECLARE e custody_lineage.events;
BEGIN
  SELECT * INTO e FROM custody_lineage.events WHERE status<>'ACKED' ORDER BY seq LIMIT 1 FOR UPDATE;
  IF e.seq IS NULL OR e.status='REVIEW' THEN RETURN NULL; END IF;
  UPDATE custody_lineage.events SET attempts=attempts+1,status=CASE WHEN attempts+1=3 THEN 'REVIEW' ELSE status END WHERE seq=e.seq;
  RETURN custody_lineage.frame(e.seq);
END $$;
CREATE FUNCTION custody_lineage.ack(n bigint,h text,r jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,custody_lineage,pg_temp AS $$
BEGIN
  UPDATE custody_lineage.events SET status='ACKED',receipt=r WHERE seq=n AND hash=h AND
    r#>>'{body,hash}'=h AND r#>>'{body,sequence}'=n::text AND r#>>'{body,source}'=event->>'source' AND
    r#>>'{body,custodian}'='isolated-custody-v1' AND r#>>'{body,outcome}'='COMMITTED' AND
    COALESCE(r->>'signature','')~'^[A-Za-z0-9+/]{86}==$' AND (receipt IS NULL OR receipt=r);
  RETURN FOUND;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA custody_lineage FROM PUBLIC;
RESET ROLE;
-- Bootstrap grants only frame access to its dedicated sender; no emit/trigger execution is granted.
