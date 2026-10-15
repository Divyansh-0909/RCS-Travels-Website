-- ISOLATED OFFLINE INSTALLER, after permissions.sql and transport-receiver.sql.
-- Dedicated schema/identities in the receiver DB; no application tables.
CREATE ROLE broker9d_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
CREATE ROLE broker9d_exec LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
CREATE ROLE broker9d_guard LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
CREATE ROLE broker9d_ops LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
CREATE SCHEMA broker9d AUTHORIZATION broker9d_owner;
GRANT USAGE ON SCHEMA transport9d,shadow9d TO broker9d_owner;
GRANT SELECT ON transport9d.receipts,shadow9d.work TO broker9d_owner;
GRANT EXECUTE ON FUNCTION shadow9d.valid_snapshot(jsonb),shadow9d.valid_instant(jsonb,boolean),shadow9d.valid_categories(jsonb),transport9d.serialize(jsonb) TO broker9d_owner;
SET ROLE broker9d_owner;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
CREATE TABLE broker9d.configuration (
  version text PRIMARY KEY CHECK(version='offline-broker-v1'),
  frozen text NOT NULL CHECK(frozen='e484afc4c7fa724ea29af6edd962c48b814dc73a10e4f4a5e33833ad26afbe75'),
  max_attempts integer NOT NULL CHECK(max_attempts BETWEEN 1 AND 4),
  max_requests integer NOT NULL CHECK(max_requests BETWEEN 1 AND 100),
  max_concurrent integer NOT NULL CHECK(max_concurrent BETWEEN 1 AND 8),
  max_inflight integer NOT NULL CHECK(max_inflight BETWEEN 1 AND 8),
  input_reserve bigint NOT NULL CHECK(input_reserve>0),output_reserve bigint NOT NULL CHECK(output_reserve>0),
  minor_reserve bigint NOT NULL CHECK(minor_reserve>0),
  input_limit bigint NOT NULL CHECK(input_limit>=input_reserve),output_limit bigint NOT NULL CHECK(output_limit>=output_reserve),
  minor_limit bigint NOT NULL CHECK(minor_limit>=minor_reserve)
);
INSERT INTO broker9d.configuration VALUES('offline-broker-v1','e484afc4c7fa724ea29af6edd962c48b814dc73a10e4f4a5e33833ad26afbe75',2,20,2,1,1024,256,5,20480,5120,100);
CREATE TABLE broker9d.control(singleton boolean PRIMARY KEY CHECK(singleton),stopped boolean NOT NULL,
  generation bigint NOT NULL CHECK(generation>=0),now_at timestamptz NOT NULL);
INSERT INTO broker9d.control VALUES(true,true,0,'2026-10-13T00:00:00Z');
CREATE TABLE broker9d.requests(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),logical_key text UNIQUE NOT NULL,
  receipt uuid UNIQUE NOT NULL,work_id bigint UNIQUE NOT NULL,payload jsonb NOT NULL,
  binding text NOT NULL,evidence_hash text NOT NULL,configuration text NOT NULL REFERENCES broker9d.configuration,configuration_hash text NOT NULL,
  generation bigint NOT NULL,status text NOT NULL CHECK(status IN ('PENDING','RESERVED','DISPATCH_ADMITTED','OUTCOME_UNKNOWN','RESPONSE_OBSERVED','GUARDED_RESULT_COMMITTED','MANUAL_REVIEW'))
);
CREATE TABLE broker9d.attempts(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),request_id uuid NOT NULL REFERENCES broker9d.requests,
  number integer NOT NULL CHECK(number>0),token uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  owner text NOT NULL CHECK(owner='broker9d_exec'),generation bigint NOT NULL,lease_until timestamptz NOT NULL,
  status text NOT NULL CHECK(status IN ('RESERVED','DISPATCH_ADMITTED','OUTCOME_UNKNOWN','RESPONSE_OBSERVED','COMMITTED','RELEASED','REJECTED')),
  input_reserved bigint NOT NULL CHECK(input_reserved>0),output_reserved bigint NOT NULL CHECK(output_reserved>0),minor_reserved bigint NOT NULL CHECK(minor_reserved>0),
  usage_state text NOT NULL CHECK(usage_state IN ('RESERVED','UNKNOWN','CONFIRMED','RELEASED')),
  input_used bigint CHECK(input_used BETWEEN 0 AND input_reserved),output_used bigint CHECK(output_used BETWEEN 0 AND output_reserved),minor_used bigint CHECK(minor_used BETWEEN 0 AND minor_reserved),
  admitted_at timestamptz,send_at timestamptz,may_have_escaped boolean NOT NULL DEFAULT false,response jsonb,response_hash text,
  UNIQUE(request_id,number),CHECK(response IS NULL OR octet_length(response::text)<=32768),
  CHECK((usage_state='CONFIRMED')=(input_used IS NOT NULL AND output_used IS NOT NULL AND minor_used IS NOT NULL))
);
CREATE INDEX attempts_active ON broker9d.attempts(status,lease_until);
CREATE TABLE broker9d.results(request_id uuid PRIMARY KEY REFERENCES broker9d.requests,attempt_id uuid UNIQUE NOT NULL REFERENCES broker9d.attempts,
  result jsonb NOT NULL,digest text NOT NULL,generation bigint NOT NULL,committed_at timestamptz NOT NULL);
CREATE TABLE broker9d.events(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,at timestamptz NOT NULL,
  actor text NOT NULL,action text NOT NULL,request_id uuid,attempt_id uuid);
CREATE FUNCTION broker9d.event(action text,request_id uuid,attempt_id uuid) RETURNS void LANGUAGE sql
SET search_path=pg_catalog,broker9d,pg_temp AS $$
  INSERT INTO broker9d.events(at,actor,action,request_id,attempt_id) SELECT now_at,session_user,action,request_id,attempt_id FROM broker9d.control
$$;
CREATE FUNCTION broker9d.set_stop(stop boolean) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,broker9d,pg_temp AS $$
DECLARE g bigint;
BEGIN
  UPDATE broker9d.control SET stopped=stop,generation=generation+1 RETURNING generation INTO g;
  PERFORM broker9d.event('CONTROL',NULL,NULL);RETURN g;
END $$;
CREATE FUNCTION broker9d.register(message jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,broker9d,pg_temp AS $$
DECLARE c broker9d.control;p jsonb;r transport9d.receipts;w shadow9d.work;q broker9d.requests;b text;
BEGIN
  SELECT * INTO c FROM broker9d.control FOR UPDATE;
  IF c.stopped OR message IS NULL OR jsonb_typeof(message)<>'object' OR octet_length(message::text)>70000 OR
    message-ARRAY['protocol','configuration','receipt','payload']<>'{}'::jsonb OR message->>'protocol' IS DISTINCT FROM 'broker-request-v1' OR
    message->>'configuration' IS DISTINCT FROM 'offline-broker-v1' OR COALESCE(message->>'receipt','') !~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' THEN RETURN NULL; END IF;
  p=message->'payload';
  SELECT * INTO r FROM transport9d.receipts WHERE receipt=(message->>'receipt')::uuid;
  SELECT * INTO w FROM shadow9d.work WHERE id=r.work_id;
  b=encode(sha256(convert_to(p::text,'UTF8')),'hex');
  IF r.receipt IS NULL OR r.payload_binding IS DISTINCT FROM b OR r.logical_key IS DISTINCT FROM p->>'key' OR
    w.snapshot IS NULL OR w.snapshot IS DISTINCT FROM p->'snapshot' OR w.evidence_hash IS DISTINCT FROM p->>'evidenceHash' OR
    w.provenance IS DISTINCT FROM p->>'originalCommitment' OR shadow9d.valid_snapshot(w.snapshot) IS NOT TRUE OR
    p->>'frozenV5' IS DISTINCT FROM (SELECT frozen FROM broker9d.configuration WHERE version=message->>'configuration') THEN RETURN NULL; END IF;
  SELECT * INTO q FROM broker9d.requests WHERE logical_key=r.logical_key;
  IF q.id IS NOT NULL THEN
    IF q.binding=b AND q.receipt=r.receipt AND q.configuration=message->>'configuration' AND
      q.configuration_hash=(SELECT encode(sha256(convert_to(to_jsonb(cfg)::text,'UTF8')),'hex') FROM broker9d.configuration cfg WHERE version=q.configuration) THEN RETURN q.id; END IF;
    RETURN NULL;
  END IF;
  INSERT INTO broker9d.requests(logical_key,receipt,work_id,payload,binding,evidence_hash,configuration,configuration_hash,generation,status)
    VALUES(r.logical_key,r.receipt,w.id,p,b,w.evidence_hash,message->>'configuration',
      (SELECT encode(sha256(convert_to(to_jsonb(cfg)::text,'UTF8')),'hex') FROM broker9d.configuration cfg WHERE version=message->>'configuration'),c.generation,'PENDING') RETURNING id INTO q.id;
  PERFORM broker9d.event('REGISTER',q.id,NULL);RETURN q.id;
END $$;
CREATE FUNCTION broker9d.reserve(id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,broker9d,pg_temp AS $$
DECLARE c broker9d.control;q broker9d.requests;cfg broker9d.configuration;a broker9d.attempts;n integer;
BEGIN
  SELECT * INTO c FROM broker9d.control FOR UPDATE;
  SELECT * INTO q FROM broker9d.requests WHERE requests.id=reserve.id FOR UPDATE;
  SELECT * INTO cfg FROM broker9d.configuration WHERE version=q.configuration;
  IF c.stopped OR q.id IS NULL OR q.generation<>c.generation OR q.status<>'PENDING' OR
    q.configuration_hash IS DISTINCT FROM encode(sha256(convert_to(to_jsonb(cfg)::text,'UTF8')),'hex') OR
    EXISTS(SELECT 1 FROM broker9d.results WHERE request_id=q.id) THEN RETURN NULL; END IF;
  SELECT count(*)+1 INTO n FROM broker9d.attempts WHERE request_id=q.id;
  IF n>cfg.max_attempts OR (SELECT count(*) FROM broker9d.attempts)>=cfg.max_requests OR
    (SELECT count(*) FROM broker9d.attempts WHERE status IN ('RESERVED','DISPATCH_ADMITTED','OUTCOME_UNKNOWN','RESPONSE_OBSERVED'))>=cfg.max_concurrent OR
    (SELECT COALESCE(sum(input_reserved),0) FROM broker9d.attempts WHERE usage_state<>'RELEASED')+cfg.input_reserve>cfg.input_limit OR
    (SELECT COALESCE(sum(output_reserved),0) FROM broker9d.attempts WHERE usage_state<>'RELEASED')+cfg.output_reserve>cfg.output_limit OR
    (SELECT COALESCE(sum(minor_reserved),0) FROM broker9d.attempts WHERE usage_state<>'RELEASED')+cfg.minor_reserve>cfg.minor_limit THEN
    UPDATE broker9d.requests SET status='MANUAL_REVIEW' WHERE requests.id=q.id;
    PERFORM broker9d.event('BUDGET_DENIED',q.id,NULL);RETURN NULL;
  END IF;
  INSERT INTO broker9d.attempts(request_id,number,owner,generation,lease_until,status,input_reserved,output_reserved,minor_reserved,usage_state)
    VALUES(q.id,n,session_user,c.generation,c.now_at+interval '60 seconds','RESERVED',cfg.input_reserve,cfg.output_reserve,cfg.minor_reserve,'RESERVED') RETURNING * INTO a;
  UPDATE broker9d.requests SET status='RESERVED' WHERE requests.id=q.id;
  PERFORM broker9d.event('RESERVE',q.id,a.id);
  RETURN jsonb_build_object('id',a.id,'requestId',q.id,'token',a.token,'generation',a.generation,'payload',q.payload);
END $$;
CREATE FUNCTION broker9d.allowed(id uuid,token uuid,states text[]) RETURNS boolean LANGUAGE sql
SET search_path=pg_catalog,broker9d,pg_temp AS $$
  SELECT COALESCE(NOT c.stopped AND a.token=allowed.token AND a.generation=c.generation AND q.generation=c.generation AND
    a.lease_until>c.now_at AND a.owner='broker9d_exec' AND a.status=ANY(states) AND
    q.evidence_hash=w.evidence_hash AND q.payload->'snapshot'=w.snapshot AND r.payload_binding=q.binding AND r.receipt=q.receipt AND
    q.configuration=cfg.version AND q.configuration_hash=encode(sha256(convert_to(to_jsonb(cfg)::text,'UTF8')),'hex') AND
    q.payload->>'frozenV5'=cfg.frozen AND NOT EXISTS(SELECT 1 FROM broker9d.results WHERE request_id=q.id),false)
  FROM broker9d.attempts a JOIN broker9d.requests q ON q.id=a.request_id
  JOIN broker9d.configuration cfg ON cfg.version=q.configuration JOIN transport9d.receipts r ON r.work_id=q.work_id
  JOIN shadow9d.work w ON w.id=q.work_id CROSS JOIN broker9d.control c WHERE a.id=allowed.id
$$;
CREATE FUNCTION broker9d.admit(id uuid,token uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,broker9d,pg_temp AS $$
DECLARE c broker9d.control;a broker9d.attempts;limit_at integer;
BEGIN
  SELECT * INTO c FROM broker9d.control FOR UPDATE;
  SELECT * INTO a FROM broker9d.attempts WHERE attempts.id=admit.id FOR UPDATE;
  SELECT max_inflight INTO limit_at FROM broker9d.configuration WHERE version=(SELECT configuration FROM broker9d.requests WHERE requests.id=a.request_id);
  IF broker9d.allowed(id,token,ARRAY['RESERVED']) IS NOT TRUE OR a.owner<>session_user OR
    (SELECT count(*) FROM broker9d.attempts WHERE status IN ('DISPATCH_ADMITTED','OUTCOME_UNKNOWN'))>=limit_at THEN RETURN false; END IF;
  UPDATE broker9d.attempts SET status='DISPATCH_ADMITTED',admitted_at=c.now_at,usage_state='UNKNOWN' WHERE attempts.id=admit.id;
  UPDATE broker9d.requests SET status='DISPATCH_ADMITTED' WHERE requests.id=a.request_id;
  PERFORM broker9d.event('DISPATCH_ADMITTED',a.request_id,id);RETURN true;
END $$;
CREATE FUNCTION broker9d.begin_send(id uuid,token uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,broker9d,pg_temp AS $$
DECLARE c broker9d.control;a broker9d.attempts;
BEGIN
  SELECT * INTO c FROM broker9d.control FOR UPDATE;
  SELECT * INTO a FROM broker9d.attempts WHERE attempts.id=begin_send.id FOR UPDATE;
  IF broker9d.allowed(id,token,ARRAY['DISPATCH_ADMITTED']) IS NOT TRUE OR a.owner<>session_user OR a.send_at IS NOT NULL THEN RETURN false; END IF;
  UPDATE broker9d.attempts SET send_at=c.now_at,may_have_escaped=true WHERE attempts.id=begin_send.id;
  PERFORM broker9d.event('SEND_ATTEMPT',a.request_id,id);RETURN true;
END $$;
CREATE FUNCTION broker9d.valid_envelope(e jsonb,case_id text) RETURNS boolean LANGUAGE sql
SET search_path=pg_catalog,broker9d,pg_temp AS $$
  SELECT COALESCE(jsonb_typeof(e)='object' AND e-ARRAY['analysisId','contractVersion','provider','model','output']='{}'::jsonb AND
    e->>'analysisId' ~ '^[a-f0-9]{64}$' AND e->>'contractVersion'='responsibility-analysis-v1' AND
    e->>'provider'='typesafe-ai' AND e->>'model'='jev-1.13.0' AND jsonb_typeof(e->'output')='object' AND
    (e->'output')-ARRAY['caseId','suggestedClassification','confidence','factsSupporting','factsAgainst','contradictions','missingEvidence','inferences','severityAssessment','suggestedActionCategory','explanationSummary']='{}'::jsonb AND
    e#>>'{output,caseId}'=case_id AND e#>>'{output,suggestedClassification}' IN ('DRIVER_CAUSED','PLATFORM_CAUSED','VALID_WAIVED','UNDETERMINED') AND
    jsonb_typeof(e#>'{output,confidence}')='number' AND
    e#>'{output,factsSupporting}'='[]'::jsonb AND e#>'{output,factsAgainst}'='[]'::jsonb AND e#>'{output,contradictions}'='[]'::jsonb AND
    e#>'{output,missingEvidence}'='[]'::jsonb AND e#>'{output,inferences}'='[]'::jsonb AND
    e#>>'{output,severityAssessment}' IN ('MINIMAL','MODERATE','AGGRAVATED','UNKNOWN') AND
    e#>>'{output,suggestedActionCategory}' IN ('AUTO_UPHOLD_CANDIDATE','AUTO_WAIVE_CANDIDATE','ADMIN_REVIEW') AND
    e#>>'{output,explanationSummary}'='Bounded Jev V5 categorical recommendation. No freeform facts or citations were returned; independent evidence and policy checks determine eligibility.',false)
$$;
CREATE FUNCTION broker9d.observe(id uuid,token uuid,response jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,broker9d,pg_temp AS $$
DECLARE c broker9d.control;a broker9d.attempts;u jsonb;h text;
BEGIN
  SELECT * INTO c FROM broker9d.control FOR UPDATE;
  SELECT * INTO a FROM broker9d.attempts WHERE attempts.id=observe.id FOR UPDATE;
  h=encode(sha256(convert_to(response::text,'UTF8')),'hex');
  IF a.owner IS DISTINCT FROM session_user OR a.token IS DISTINCT FROM token OR a.send_at IS NULL THEN RETURN false; END IF;
  IF a.response_hash IS NOT NULL THEN RETURN a.response_hash=h; END IF;
  u=response->'usage';
  IF response IS NULL OR jsonb_typeof(response) IS DISTINCT FROM 'object' OR octet_length(response::text)>32768 OR
    response-ARRAY['envelope','usage']<>'{}'::jsonb OR
    broker9d.valid_envelope(response->'envelope',(SELECT payload#>>'{snapshot,caseId}' FROM broker9d.requests WHERE requests.id=a.request_id)) IS NOT TRUE OR
    jsonb_typeof(u) IS DISTINCT FROM 'object' OR u-ARRAY['input','output','minor','receipt']<>'{}'::jsonb OR
    jsonb_typeof(u->'input') IS DISTINCT FROM 'number' OR jsonb_typeof(u->'output') IS DISTINCT FROM 'number' OR jsonb_typeof(u->'minor') IS DISTINCT FROM 'number' OR
    COALESCE(u->>'input','') !~ '^[0-9]{1,9}$' OR COALESCE(u->>'output','') !~ '^[0-9]{1,9}$' OR COALESCE(u->>'minor','') !~ '^[0-9]{1,9}$' OR
    COALESCE(u->>'receipt','') !~ '^[a-f0-9]{64}$' OR (u->>'input')::bigint>a.input_reserved OR
    (u->>'output')::bigint>a.output_reserved OR (u->>'minor')::bigint>a.minor_reserved THEN RETURN false; END IF;
  -- Accounting accepts a late observed receipt, but does NOT authorize a current result.
  UPDATE broker9d.attempts SET response=observe.response,response_hash=h,usage_state='CONFIRMED',input_used=(u->>'input')::bigint,
    output_used=(u->>'output')::bigint,minor_used=(u->>'minor')::bigint,status='RESPONSE_OBSERVED' WHERE attempts.id=observe.id;
  UPDATE broker9d.requests SET status='RESPONSE_OBSERVED' WHERE requests.id=a.request_id;
  PERFORM broker9d.event('RESPONSE_OBSERVED',a.request_id,id);RETURN true;
END $$;
CREATE FUNCTION broker9d.unknown(id uuid,token uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,broker9d,pg_temp AS $$
DECLARE a broker9d.attempts;
BEGIN
  PERFORM 1 FROM broker9d.control FOR UPDATE;
  SELECT * INTO a FROM broker9d.attempts WHERE attempts.id=unknown.id FOR UPDATE;
  IF a.token IS DISTINCT FROM token OR a.owner IS DISTINCT FROM session_user OR a.status<>'DISPATCH_ADMITTED' THEN RETURN false; END IF;
  UPDATE broker9d.attempts SET status='OUTCOME_UNKNOWN' WHERE attempts.id=unknown.id;
  UPDATE broker9d.requests SET status='OUTCOME_UNKNOWN' WHERE requests.id=a.request_id;
  PERFORM broker9d.event('OUTCOME_UNKNOWN',a.request_id,id);RETURN true;
END $$;
CREATE FUNCTION broker9d.recover(id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,broker9d,pg_temp AS $$
DECLARE c broker9d.control;a broker9d.attempts;
BEGIN
  SELECT * INTO c FROM broker9d.control FOR UPDATE;
  SELECT * INTO a FROM broker9d.attempts WHERE attempts.id=recover.id FOR UPDATE;
  IF a.id IS NULL OR a.lease_until>c.now_at THEN RETURN false; END IF;
  IF a.status='RESERVED' THEN
    UPDATE broker9d.attempts SET status='RELEASED',usage_state='RELEASED' WHERE attempts.id=recover.id;
    UPDATE broker9d.requests SET status=CASE WHEN generation=c.generation AND NOT c.stopped AND
      a.number<(SELECT max_attempts FROM broker9d.configuration WHERE version=configuration) THEN 'PENDING' ELSE 'MANUAL_REVIEW' END WHERE requests.id=a.request_id;
  ELSIF a.status='DISPATCH_ADMITTED' THEN
    UPDATE broker9d.attempts SET status='OUTCOME_UNKNOWN' WHERE attempts.id=recover.id;
    UPDATE broker9d.requests SET status='OUTCOME_UNKNOWN' WHERE requests.id=a.request_id;
  ELSE RETURN false; END IF;
  PERFORM broker9d.event('RECOVER',a.request_id,id);RETURN true;
END $$;
CREATE FUNCTION broker9d.guard_input(id uuid,token uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,broker9d,pg_temp AS $$
BEGIN
  IF broker9d.allowed(id,token,ARRAY['RESPONSE_OBSERVED']) IS NOT TRUE THEN RETURN NULL; END IF;
  RETURN (SELECT jsonb_build_object('evidence',q.payload->'snapshot','response',a.response,'requestId',q.id,'responseHash',a.response_hash)
    FROM broker9d.attempts a JOIN broker9d.requests q ON q.id=a.request_id WHERE a.id=guard_input.id);
END $$;
CREATE FUNCTION broker9d.commit_result(id uuid,token uuid,result jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,broker9d,pg_temp AS $$
DECLARE c broker9d.control;a broker9d.attempts;q broker9d.requests;s broker9d.results;h text;
BEGIN
  SELECT * INTO c FROM broker9d.control FOR UPDATE;
  SELECT * INTO a FROM broker9d.attempts WHERE attempts.id=commit_result.id FOR UPDATE;
  SELECT * INTO q FROM broker9d.requests WHERE requests.id=a.request_id;
  SELECT * INTO s FROM broker9d.results WHERE request_id=q.id;
  h=encode(sha256(convert_to(result::text,'UTF8')),'hex');
  IF a.token IS DISTINCT FROM token THEN RETURN false; END IF;
  IF s.request_id IS NOT NULL THEN RETURN s.attempt_id=id AND s.digest=h; END IF;
  IF broker9d.allowed(id,token,ARRAY['RESPONSE_OBSERVED']) IS NOT TRUE OR a.usage_state<>'CONFIRMED' OR
    result IS NULL OR jsonb_typeof(result) IS DISTINCT FROM 'object' OR octet_length(result::text)>32768 OR
    result-ARRAY['mode','route','evidenceHash','analysisId','responseHash','output','gate']<>'{}'::jsonb OR
    result->>'mode' IS DISTINCT FROM 'SHADOW' OR result->>'route' IS DISTINCT FROM 'NEEDS_ADMIN_REVIEW' OR
    result->>'evidenceHash' IS DISTINCT FROM q.evidence_hash OR result->>'responseHash' IS DISTINCT FROM a.response_hash OR
    result->>'analysisId' IS DISTINCT FROM a.response#>>'{envelope,analysisId}' OR
    result->'output' IS DISTINCT FROM a.response#>'{envelope,output}' OR
    result#>>'{gate,route}' IS DISTINCT FROM 'NEEDS_ADMIN_REVIEW' THEN RETURN false; END IF;
  INSERT INTO broker9d.results VALUES(q.id,a.id,result,h,c.generation,c.now_at);
  UPDATE broker9d.attempts SET status='COMMITTED' WHERE attempts.id=commit_result.id;
  UPDATE broker9d.requests SET status='GUARDED_RESULT_COMMITTED' WHERE requests.id=q.id;
  PERFORM broker9d.event('GUARDED_RESULT_COMMITTED',q.id,id);RETURN true;
END $$;
RESET ROLE;
REVOKE ALL ON ALL TABLES IN SCHEMA broker9d FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA broker9d FROM PUBLIC;
GRANT USAGE ON SCHEMA broker9d TO broker9d_exec,broker9d_guard,broker9d_ops,shadow9d_inspector;
GRANT EXECUTE ON FUNCTION broker9d.register(jsonb),broker9d.reserve(uuid),broker9d.admit(uuid,uuid),broker9d.begin_send(uuid,uuid),
  broker9d.observe(uuid,uuid,jsonb),broker9d.unknown(uuid,uuid),broker9d.recover(uuid) TO broker9d_exec;
GRANT EXECUTE ON FUNCTION broker9d.guard_input(uuid,uuid),broker9d.commit_result(uuid,uuid,jsonb) TO broker9d_guard;
GRANT EXECUTE ON FUNCTION broker9d.set_stop(boolean) TO broker9d_ops;
GRANT SELECT ON ALL TABLES IN SCHEMA broker9d TO shadow9d_inspector;
-- Exclude the previous worker from competing for this optional broker fixture.
REVOKE EXECUTE ON FUNCTION shadow9d.claim(),shadow9d.permit(bigint,uuid),shadow9d.complete(bigint,uuid,jsonb) FROM shadow9d_worker;
