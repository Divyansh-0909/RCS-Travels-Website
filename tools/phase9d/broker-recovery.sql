-- OPTIONAL ISOLATED RECEIVER EXTENSION. Never an application migration.
-- Install after broker.sql. Bootstrap supplies a separate synthetic issuer key.
CREATE ROLE broker9d_reconciler LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
GRANT EXECUTE ON FUNCTION transport9d.hmac(text,text,text) TO broker9d_owner;
SET ROLE broker9d_owner;
ALTER TABLE broker9d.requests ALTER COLUMN payload DROP NOT NULL;
ALTER TABLE broker9d.requests DROP CONSTRAINT requests_status_check;
ALTER TABLE broker9d.requests ADD CHECK(status IN ('PENDING','RESERVED','DISPATCH_ADMITTED','OUTCOME_UNKNOWN','RESPONSE_OBSERVED','GUARDED_RESULT_COMMITTED','MANUAL_REVIEW','TERMINAL'));
ALTER TABLE broker9d.requests ADD revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0);
ALTER TABLE broker9d.requests ADD cleaned boolean NOT NULL DEFAULT false;
ALTER TABLE broker9d.control ADD CHECK(isfinite(now_at));
ALTER TABLE broker9d.attempts ADD dispatch_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid();
ALTER TABLE broker9d.attempts ADD usage_conflict boolean NOT NULL DEFAULT false;
ALTER TABLE broker9d.events ADD detail jsonb NOT NULL DEFAULT '{}';
CREATE TABLE broker9d.usage_authority(key_id text PRIMARY KEY CHECK(key_id='offline-issuer-v1'),secret text NOT NULL CHECK(length(secret)>=32));
CREATE TABLE broker9d.usage_receipts(
  digest text PRIMARY KEY,receipt_id uuid NOT NULL,request_id uuid NOT NULL REFERENCES broker9d.requests,
  attempt_id uuid NOT NULL REFERENCES broker9d.attempts,body jsonb NOT NULL,mac text NOT NULL,
  disposition text NOT NULL CHECK(disposition IN ('ACCEPTED','CONFLICT')),at timestamptz NOT NULL
);
CREATE TABLE broker9d.operations(
  id uuid PRIMARY KEY,target uuid,action text NOT NULL,arguments_hash text NOT NULL,
  actor text NOT NULL,reason text NOT NULL,outcome jsonb NOT NULL,at timestamptz NOT NULL
);
CREATE FUNCTION broker9d.revision() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,broker9d,pg_temp AS $$
BEGIN
  IF OLD.status='TERMINAL' AND NEW.status<>'TERMINAL' THEN RAISE EXCEPTION 'terminal fence' USING ERRCODE='42501'; END IF;
  NEW.revision=OLD.revision+1;RETURN NEW;
END $$;
CREATE TRIGGER request_revision BEFORE UPDATE ON broker9d.requests FOR EACH ROW EXECUTE FUNCTION broker9d.revision();
-- Keep the accepted validation bytes as a private implementation, then fence it.
ALTER FUNCTION broker9d.allowed(uuid,uuid,text[]) RENAME TO allowed_before_recovery;
DO $$ BEGIN
  EXECUTE replace(pg_get_functiondef('broker9d.allowed_before_recovery(uuid,uuid,text[])'::regprocedure),'allowed.','allowed_before_recovery.');
END $$;
CREATE FUNCTION broker9d.allowed(id uuid,token uuid,states text[]) RETURNS boolean LANGUAGE sql
SET search_path=pg_catalog,broker9d,pg_temp AS $$
  SELECT COALESCE(broker9d.allowed_before_recovery(allowed.id,allowed.token,allowed.states) AND q.status NOT IN ('TERMINAL','MANUAL_REVIEW')
    AND NOT a.usage_conflict AND NOT q.cleaned AND
    (NOT ('RESPONSE_OBSERVED'=ANY(allowed.states)) OR EXISTS(SELECT 1 FROM broker9d.usage_receipts u WHERE u.attempt_id=a.id
      AND u.disposition='ACCEPTED' AND u.body->>'outcome'='SUCCESS' AND u.body->>'responseHash'=a.response_hash)),false)
  FROM broker9d.attempts a JOIN broker9d.requests q ON q.id=a.request_id WHERE a.id=allowed.id
$$;
ALTER FUNCTION broker9d.observe(uuid,uuid,jsonb) RENAME TO observe_before_recovery;
DO $$ BEGIN
  EXECUTE replace(pg_get_functiondef('broker9d.observe_before_recovery(uuid,uuid,jsonb)'::regprocedure),'observe.','observe_before_recovery.');
END $$;
CREATE FUNCTION broker9d.observe(id uuid,token uuid,response jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,broker9d,pg_temp AS $$
DECLARE a broker9d.attempts;q broker9d.requests;ok boolean;u jsonb;
BEGIN
  PERFORM 1 FROM broker9d.control FOR UPDATE;
  SELECT * INTO a FROM broker9d.attempts WHERE attempts.id=observe.id FOR UPDATE;
  SELECT * INTO q FROM broker9d.requests WHERE requests.id=a.request_id;
  IF a.owner IS DISTINCT FROM session_user OR a.token IS DISTINCT FROM token THEN RETURN false; END IF;
  IF q.status='TERMINAL' OR q.cleaned THEN RETURN false; END IF;
  IF a.response_hash IS NOT NULL THEN RETURN a.response_hash=encode(sha256(convert_to(response::text,'UTF8')),'hex'); END IF;
  SELECT body INTO u FROM broker9d.usage_receipts WHERE attempt_id=observe.id AND disposition='ACCEPTED';
  IF u IS NOT NULL AND u->>'responseHash' IS DISTINCT FROM encode(sha256(convert_to(response::text,'UTF8')),'hex') THEN RETURN false; END IF;
  -- A model/worker usage field is an observation, not accounting authority.
  ok=broker9d.observe_before_recovery(id,token,response);
  IF ok AND NOT EXISTS(SELECT 1 FROM broker9d.usage_receipts WHERE attempt_id=observe.id AND disposition='ACCEPTED') THEN
    UPDATE broker9d.attempts SET usage_state='UNKNOWN',input_used=NULL,output_used=NULL,minor_used=NULL WHERE attempts.id=observe.id;
  ELSIF ok THEN
    UPDATE broker9d.attempts SET usage_state='CONFIRMED',input_used=(u->>'input')::bigint,output_used=(u->>'output')::bigint,minor_used=(u->>'minor')::bigint WHERE attempts.id=observe.id;
  END IF;
  RETURN ok;
END $$;
ALTER FUNCTION broker9d.register(jsonb) RENAME TO register_before_recovery;
CREATE FUNCTION broker9d.register(message jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,broker9d,pg_temp AS $$
DECLARE q broker9d.requests;
BEGIN
  PERFORM 1 FROM broker9d.control FOR UPDATE;
  SELECT * INTO q FROM broker9d.requests WHERE logical_key=message#>>'{payload,key}';
  IF q.cleaned THEN
    IF message-ARRAY['protocol','configuration','receipt','payload']='{}'::jsonb AND message->>'protocol'='broker-request-v1'
      AND message->>'configuration'=q.configuration AND message->>'receipt'=q.receipt::text
      AND encode(sha256(convert_to((message->'payload')::text,'UTF8')),'hex')=q.binding THEN RETURN q.id; END IF;
    RETURN NULL;
  END IF;
  RETURN broker9d.register_before_recovery(message);
END $$;
ALTER FUNCTION broker9d.recover(uuid) RENAME TO recover_before_recovery;
DO $$ BEGIN
  EXECUTE replace(pg_get_functiondef('broker9d.recover_before_recovery(uuid)'::regprocedure),'recover.','recover_before_recovery.');
END $$;
CREATE FUNCTION broker9d.recover(id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,broker9d,pg_temp AS $$
DECLARE c broker9d.control;a broker9d.attempts;q broker9d.requests;
BEGIN
  SELECT * INTO c FROM broker9d.control FOR UPDATE;
  SELECT * INTO a FROM broker9d.attempts WHERE attempts.id=recover.id FOR UPDATE;
  SELECT * INTO q FROM broker9d.requests WHERE requests.id=a.request_id;
  IF q.status='TERMINAL' THEN
    IF a.lease_until>c.now_at OR a.status<>'RESERVED' OR a.admitted_at IS NOT NULL OR a.send_at IS NOT NULL THEN RETURN false; END IF;
    UPDATE broker9d.attempts SET status='RELEASED',usage_state='RELEASED' WHERE attempts.id=recover.id;
    PERFORM broker9d.event('UNSENT_TERMINAL_RELEASE',q.id,a.id);RETURN true;
  END IF;
  RETURN broker9d.recover_before_recovery(id);
END $$;
CREATE FUNCTION broker9d.reconcile(receipt jsonb) RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,broker9d,pg_temp AS $$
DECLARE b jsonb;key text;d text;a broker9d.attempts;q broker9d.requests;previous broker9d.usage_receipts;c broker9d.control;k text;
BEGIN
  SELECT * INTO c FROM broker9d.control FOR UPDATE;
  IF receipt IS NULL OR jsonb_typeof(receipt) IS DISTINCT FROM 'object' OR octet_length(receipt::text)>4096 OR
    receipt-ARRAY['body','mac']<>'{}'::jsonb THEN RETURN 'INVALID'; END IF;
  b=receipt->'body';
  IF jsonb_typeof(b) IS DISTINCT FROM 'object' OR b-ARRAY['schema','issuer','keyId','receiptId','requestId','attemptId','dispatchId','configurationHash','frozen','provider','model','generation','responseHash','outcome','input','output','minor']<>'{}'::jsonb THEN RETURN 'INVALID'; END IF;
  IF b->>'schema' IS DISTINCT FROM 'offline-usage-v1' OR b->>'issuer' IS DISTINCT FROM 'independent-offline-provider'
    OR b->>'keyId' IS DISTINCT FROM 'offline-issuer-v1' OR b->>'provider' IS DISTINCT FROM 'typesafe-ai'
    OR b->>'model' IS DISTINCT FROM 'jev-1.13.0' OR b->>'frozen' IS DISTINCT FROM 'e484afc4c7fa724ea29af6edd962c48b814dc73a10e4f4a5e33833ad26afbe75'
    OR COALESCE(b->>'outcome','') NOT IN ('SUCCESS','BILLED_FAILURE','NO_DISPATCH') THEN RETURN 'INVALID'; END IF;
  FOREACH k IN ARRAY ARRAY['receiptId','requestId','attemptId','dispatchId'] LOOP
    IF COALESCE(b->>k,'') !~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' THEN RETURN 'INVALID'; END IF;
  END LOOP;
  FOREACH k IN ARRAY ARRAY['input','output','minor'] LOOP
    IF jsonb_typeof(b->k) IS DISTINCT FROM 'number' OR COALESCE(b->>k,'') !~ '^[0-9]{1,9}$' THEN RETURN 'INVALID'; END IF;
  END LOOP;
  SELECT secret INTO key FROM broker9d.usage_authority WHERE key_id=b->>'keyId';
  IF key IS NULL OR receipt->>'mac' IS DISTINCT FROM encode(transport9d.hmac('offline-usage-v1'||chr(10)||transport9d.serialize(b),key,'sha256'),'hex') THEN RETURN 'INVALID'; END IF;
  d=encode(sha256(convert_to(transport9d.serialize(receipt),'UTF8')),'hex');
  IF EXISTS(SELECT 1 FROM broker9d.usage_receipts WHERE digest=d) THEN RETURN 'DUPLICATE'; END IF;
  SELECT * INTO a FROM broker9d.attempts WHERE attempts.id=(b->>'attemptId')::uuid FOR UPDATE;
  SELECT * INTO q FROM broker9d.requests WHERE requests.id=a.request_id;
  IF a.id IS NULL OR b->>'requestId' IS DISTINCT FROM a.request_id::text OR b->>'dispatchId' IS DISTINCT FROM a.dispatch_id::text
    OR b->>'generation' IS DISTINCT FROM a.generation::text OR b->>'configurationHash' IS DISTINCT FROM q.configuration_hash
    OR a.admitted_at IS NULL OR (b->>'input')::bigint>a.input_reserved OR (b->>'output')::bigint>a.output_reserved OR (b->>'minor')::bigint>a.minor_reserved
    OR NOT (b ? 'responseHash') OR jsonb_typeof(b->'responseHash') NOT IN ('string','null')
    OR (b->>'responseHash' IS NOT NULL AND (b->>'responseHash' !~ '^[a-f0-9]{64}$' OR (a.response_hash IS NOT NULL AND b->>'responseHash'<>a.response_hash)))
    OR (b->>'outcome'='SUCCESS' AND (b->>'responseHash' IS NULL OR a.send_at IS NULL))
    OR (b->>'outcome'='BILLED_FAILURE' AND a.send_at IS NULL)
    OR (b->>'outcome'='NO_DISPATCH' AND (a.send_at IS NOT NULL OR (b->>'input')::bigint<>0 OR (b->>'output')::bigint<>0 OR (b->>'minor')::bigint<>0)) THEN RETURN 'INVALID'; END IF;
  SELECT * INTO previous FROM broker9d.usage_receipts WHERE attempt_id=a.id AND disposition='ACCEPTED';
  IF previous.digest IS NOT NULL OR EXISTS(SELECT 1 FROM broker9d.usage_receipts WHERE receipt_id=(b->>'receiptId')::uuid) THEN
    INSERT INTO broker9d.usage_receipts VALUES(d,(b->>'receiptId')::uuid,q.id,a.id,b,receipt->>'mac','CONFLICT',c.now_at);
    UPDATE broker9d.attempts SET usage_conflict=true WHERE attempts.id=a.id;
    PERFORM broker9d.event('USAGE_CONFLICT',q.id,a.id);RETURN 'CONFLICT';
  END IF;
  INSERT INTO broker9d.usage_receipts VALUES(d,(b->>'receiptId')::uuid,q.id,a.id,b,receipt->>'mac','ACCEPTED',c.now_at);
  IF b->>'outcome'='NO_DISPATCH' THEN
    UPDATE broker9d.attempts SET usage_state='RELEASED',status='RELEASED',input_used=NULL,output_used=NULL,minor_used=NULL WHERE attempts.id=a.id;
  ELSE
    UPDATE broker9d.attempts SET usage_state='CONFIRMED',input_used=(b->>'input')::bigint,output_used=(b->>'output')::bigint,minor_used=(b->>'minor')::bigint,
      status=CASE WHEN response IS NULL THEN 'REJECTED' ELSE status END WHERE attempts.id=a.id;
  END IF;
  PERFORM broker9d.event('USAGE_RECONCILED',q.id,a.id);RETURN 'ACCEPTED';
END $$;
CREATE FUNCTION broker9d.inspect(target uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path=pg_catalog,broker9d,pg_temp AS $$
  SELECT jsonb_build_object('control',(SELECT to_jsonb(c) FROM broker9d.control c),'request',to_jsonb(q)-'payload',
    'attempts',COALESCE((SELECT jsonb_agg(to_jsonb(a)-ARRAY['token','response'] ORDER BY a.number) FROM broker9d.attempts a WHERE request_id=q.id),'[]'),
    'receipts',COALESCE((SELECT jsonb_agg(to_jsonb(u)-'mac' ORDER BY at,digest) FROM broker9d.usage_receipts u WHERE request_id=q.id),'[]'),
    'operations',COALESCE((SELECT jsonb_agg(to_jsonb(o) ORDER BY at,id) FROM broker9d.operations o WHERE o.target=q.id),'[]'))
  FROM broker9d.requests q WHERE q.id=target
$$;
CREATE FUNCTION broker9d.accounting() RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path=pg_catalog,broker9d,pg_temp AS $$
  SELECT jsonb_build_object('attempts',count(*),'lifetimeInputReserved',COALESCE(sum(input_reserved),0),'lifetimeOutputReserved',COALESCE(sum(output_reserved),0),
    'lifetimeMinorReserved',COALESCE(sum(minor_reserved),0),'confirmedMinor',COALESCE(sum(minor_used) FILTER(WHERE usage_state='CONFIRMED'),0),
    'unknownMinor',COALESCE(sum(minor_reserved) FILTER(WHERE usage_state='UNKNOWN'),0),
    'disputedMinor',COALESCE(sum(minor_reserved) FILTER(WHERE usage_conflict),0),
    'heldMinor',COALESCE(sum(minor_reserved) FILTER(WHERE usage_state<>'RELEASED'),0),
    'availableMinor',(SELECT minor_limit FROM broker9d.configuration)-COALESCE(sum(minor_reserved) FILTER(WHERE usage_state<>'RELEASED'),0),
    'active',(SELECT count(*) FROM broker9d.attempts a JOIN broker9d.requests q ON q.id=a.request_id WHERE q.status<>'TERMINAL' AND a.status IN ('RESERVED','DISPATCH_ADMITTED','OUTCOME_UNKNOWN','RESPONSE_OBSERVED')),
    'backlog',(SELECT count(*) FROM broker9d.requests WHERE status='PENDING'),'externalReconciliation',(SELECT count(*) FROM broker9d.attempts WHERE usage_state='UNKNOWN' OR usage_conflict),
    'oldestPending',(SELECT min(e.at) FROM broker9d.events e JOIN broker9d.requests q ON q.id=e.request_id WHERE e.action='REGISTER' AND q.status='PENDING'),
    'configuration',(SELECT to_jsonb(cfg) FROM broker9d.configuration cfg),
    'clock',(SELECT now_at FROM broker9d.control)) FROM broker9d.attempts
$$;
CREATE FUNCTION broker9d.operate(operation uuid,target uuid,action text,expected bigint,reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,broker9d,pg_temp AS $$
DECLARE c broker9d.control;q broker9d.requests;o broker9d.operations;h text;answer jsonb;
BEGIN
  SELECT * INTO c FROM broker9d.control FOR UPDATE;
  h=encode(sha256(convert_to(jsonb_build_array(target,action,expected,reason)::text,'UTF8')),'hex');
  SELECT * INTO o FROM broker9d.operations WHERE id=operation;
  IF o.id IS NOT NULL THEN
    IF o.actor=session_user AND o.arguments_hash=h THEN RETURN o.outcome; END IF;
    RETURN jsonb_build_object('status','CONFLICT');
  END IF;
  IF operation IS NULL OR expected IS NULL OR reason NOT IN ('OPERATOR_STOP','OPERATOR_RESUME','UNRESOLVED_PROVIDER','EXHAUSTED','STALE_GENERATION','RETENTION_MINIMIZATION') OR reason IS NULL THEN RETURN jsonb_build_object('status','INVALID'); END IF;
  IF (action='STOP' AND reason<>'OPERATOR_STOP') OR (action='RESUME' AND reason<>'OPERATOR_RESUME')
    OR (action='CLEAN' AND reason<>'RETENTION_MINIMIZATION') OR (action='TERMINATE' AND reason NOT IN ('UNRESOLVED_PROVIDER','EXHAUSTED','STALE_GENERATION')) THEN RETURN jsonb_build_object('status','INVALID'); END IF;
  IF action IN ('STOP','RESUME') THEN
    IF target IS NOT NULL OR c.generation<>expected THEN RETURN jsonb_build_object('status','STALE'); END IF;
    UPDATE broker9d.control SET stopped=action='STOP',generation=generation+1 RETURNING * INTO c;
    answer=jsonb_build_object('status','APPLIED','generation',c.generation);
  ELSE
    SELECT * INTO q FROM broker9d.requests WHERE requests.id=target FOR UPDATE;
    IF q.id IS NULL OR q.revision<>expected THEN RETURN jsonb_build_object('status','STALE'); END IF;
    IF action='TERMINATE' AND q.status NOT IN ('TERMINAL','GUARDED_RESULT_COMMITTED') THEN
      UPDATE broker9d.requests SET status='TERMINAL' WHERE requests.id=target;
    ELSIF action='CLEAN' AND q.status IN ('TERMINAL','GUARDED_RESULT_COMMITTED') THEN
      UPDATE broker9d.requests SET payload=NULL,cleaned=true WHERE requests.id=target;
      UPDATE broker9d.attempts SET response=NULL WHERE request_id=target;
      IF shadow9d.broker_payload_cleanup(target) IS NOT TRUE THEN RAISE EXCEPTION 'cleanup custody mismatch' USING ERRCODE='23514'; END IF;
    ELSE RETURN jsonb_build_object('status','INVALID'); END IF;
    answer=jsonb_build_object('status','APPLIED','request',target,'revision',(SELECT revision FROM broker9d.requests WHERE requests.id=target));
  END IF;
  INSERT INTO broker9d.operations VALUES(operation,target,action,h,session_user,reason,answer,c.now_at);
  INSERT INTO broker9d.events(at,actor,action,request_id,detail) VALUES(c.now_at,session_user,'OPERATION_'||action,target,jsonb_build_object('id',operation,'reason',reason,'expected',expected));
  RETURN answer;
END $$;
RESET ROLE;
-- Narrow cross-schema cleanup: the existing receiver owner can clear only the
-- work linked to an already-cleaned terminal broker tombstone. No source access.
GRANT SELECT(id,status,cleaned,work_id) ON broker9d.requests TO shadow9d_owner;
GRANT USAGE ON SCHEMA broker9d TO shadow9d_owner;
SET ROLE shadow9d_owner;
CREATE FUNCTION shadow9d.broker_payload_cleanup(target uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,shadow9d,pg_temp AS $$
DECLARE target_work bigint;
BEGIN
  SELECT work_id INTO target_work FROM broker9d.requests WHERE id=target AND cleaned AND status IN ('TERMINAL','GUARDED_RESULT_COMMITTED');
  IF target_work IS NULL THEN RETURN false; END IF;
  UPDATE shadow9d.work SET snapshot=NULL,result=NULL,status='MANUAL_REVIEW' WHERE id=target_work;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM audit9d.append('BROKER_PAYLOAD_DELETED',target_work,jsonb_build_object('request',target));RETURN true;
END $$;
RESET ROLE;
REVOKE ALL ON FUNCTION shadow9d.broker_payload_cleanup(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shadow9d.broker_payload_cleanup(uuid) TO broker9d_owner;
REVOKE ALL ON ALL TABLES IN SCHEMA broker9d FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA broker9d FROM PUBLIC;
-- Private legacy routines no longer callable by services.
REVOKE EXECUTE ON FUNCTION broker9d.observe_before_recovery(uuid,uuid,jsonb),broker9d.register_before_recovery(jsonb) FROM broker9d_exec;
REVOKE EXECUTE ON FUNCTION broker9d.recover_before_recovery(uuid) FROM broker9d_exec;
GRANT USAGE ON SCHEMA broker9d TO broker9d_reconciler;
GRANT EXECUTE ON FUNCTION broker9d.register(jsonb),broker9d.observe(uuid,uuid,jsonb),broker9d.recover(uuid) TO broker9d_exec;
GRANT EXECUTE ON FUNCTION broker9d.reconcile(jsonb) TO broker9d_reconciler,broker9d_ops;
GRANT EXECUTE ON FUNCTION broker9d.inspect(uuid),broker9d.accounting(),broker9d.operate(uuid,uuid,text,bigint,text) TO broker9d_ops;
-- Operations must use versioned, idempotent control instead of the legacy API.
REVOKE EXECUTE ON FUNCTION broker9d.set_stop(boolean) FROM broker9d_ops;
GRANT SELECT ON broker9d.usage_receipts,broker9d.operations TO shadow9d_inspector;
