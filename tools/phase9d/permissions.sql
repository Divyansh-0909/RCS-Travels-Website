-- ISOLATED REHEARSAL ONLY: not a migration or production activation script.
-- Launcher verifies a harness-owned loopback database before executing.
CREATE ROLE shadow9d_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
CREATE ROLE shadow9d_auditor NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
CREATE ROLE shadow9d_worker LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
CREATE ROLE shadow9d_capture LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
CREATE ROLE shadow9d_ops LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
CREATE ROLE shadow9d_inspector LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
CREATE ROLE shadow9d_recorder LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
CREATE SCHEMA shadow9d AUTHORIZATION shadow9d_owner;
CREATE SCHEMA audit9d AUTHORIZATION shadow9d_auditor;
SET ROLE shadow9d_auditor;
-- PostgreSQL's global default includes PUBLIC execution on new routines.
-- Revoke at owner scope; a schema-local revoke cannot undo a global default.
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
CREATE TABLE audit9d.events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT clock_timestamp(),
  identity text NOT NULL, action text NOT NULL, work_id bigint, detail jsonb NOT NULL
);
CREATE FUNCTION audit9d.append(action text, work_id bigint, detail jsonb) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, audit9d, pg_temp AS $$
  INSERT INTO audit9d.events(identity,action,work_id,detail) VALUES(session_user,action,work_id,detail)
$$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA audit9d FROM PUBLIC;
RESET ROLE;
GRANT USAGE ON SCHEMA audit9d TO shadow9d_owner, shadow9d_recorder, shadow9d_inspector;
GRANT EXECUTE ON FUNCTION audit9d.append(text,bigint,jsonb) TO shadow9d_owner, shadow9d_recorder;
GRANT SELECT ON audit9d.events TO shadow9d_inspector;
SET ROLE shadow9d_owner;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
CREATE TABLE shadow9d.control (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  stopped boolean NOT NULL DEFAULT true, epoch bigint NOT NULL DEFAULT 0,
  now_at timestamptz NOT NULL,
  max_concurrent int NOT NULL DEFAULT 2 CHECK(max_concurrent BETWEEN 1 AND 8),
  request_budget int NOT NULL DEFAULT 20 CHECK(request_budget BETWEEN 0 AND 10000),
  used_requests int NOT NULL DEFAULT 0,
  queue_limit int NOT NULL DEFAULT 100 CHECK(queue_limit BETWEEN 1 AND 10000)
);
INSERT INTO shadow9d.control(now_at) VALUES('2026-10-12T16:00:00Z');
CREATE TABLE shadow9d.work (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  logical_key text UNIQUE NOT NULL CHECK(logical_key ~ '^[a-f0-9]{64}$'), snapshot jsonb,
  evidence_hash text NOT NULL CHECK(evidence_hash ~ '^[a-f0-9]{64}$'),
  provenance text NOT NULL CHECK(provenance ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PROCESSING','RETRYABLE','COMPLETED','MANUAL_REVIEW')),
  attempts int NOT NULL DEFAULT 0, lease_token uuid, lease_owner text, epoch bigint,
  lease_until timestamptz, next_retry_at timestamptz,
  created_at timestamptz NOT NULL, result jsonb,
  CHECK(snapshot IS NULL OR octet_length(snapshot::text)<=65536)
);
CREATE INDEX work_pending ON shadow9d.work(status,created_at);
CREATE FUNCTION shadow9d.valid_categories(v jsonb) RETURNS boolean
LANGUAGE sql SET search_path = pg_catalog, shadow9d, pg_temp AS $$
  SELECT CASE WHEN jsonb_typeof(v)='array' THEN NOT EXISTS(
    SELECT 1 FROM jsonb_array_elements(v) e WHERE jsonb_typeof(e) IS DISTINCT FROM 'string' OR
      e #>> '{}' NOT IN ('booking','assignment','routing','location','connectivity','notification','payment','payout','cancellation','feasibility','progress','external')
  ) ELSE false END
$$;
CREATE FUNCTION shadow9d.valid_instant(v jsonb, nullable boolean) RETURNS boolean
LANGUAGE sql SET search_path = pg_catalog, shadow9d, pg_temp AS $$
  SELECT (nullable AND v='null'::jsonb) OR
    (jsonb_typeof(v)='string' AND COALESCE(v #>> '{}','') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,3})?Z$'
      AND pg_input_is_valid(v #>> '{}', 'timestamp with time zone'))
$$;
CREATE FUNCTION shadow9d.valid_snapshot(s jsonb) RETURNS boolean
LANGUAGE plpgsql SET search_path = pg_catalog, shadow9d, pg_temp AS $$
DECLARE e jsonb; o jsonb; item jsonb;
BEGIN
  IF s IS NULL OR jsonb_typeof(s) IS DISTINCT FROM 'object' OR
    COALESCE(s->>'caseId','') !~ '^[a-f0-9]{64}$' OR COALESCE(s->>'bookingId','') !~ '^[a-f0-9]{64}$' OR
    s->>'evidenceVersion' IS DISTINCT FROM 'responsibility-evidence-v1' OR
    COALESCE(s->>'caseType','') NOT IN ('DRIVER_CANCELLATION','FAILED_PICKUP','DRIVER_LATE','DRIVER_OFFLINE','RIDER_CANCELLATION','PLATFORM_ASSIGNMENT_FAILURE','REPLACEMENT_FAILURE') OR
    shadow9d.valid_instant(s->'generatedAt',false) IS NOT TRUE OR shadow9d.valid_instant(s->'scheduledAt',true) IS NOT TRUE OR shadow9d.valid_instant(s->'occurredAt',true) IS NOT TRUE OR
    shadow9d.valid_categories(s #> '{completeness,requiredCategories}') IS NOT TRUE OR shadow9d.valid_categories(s #> '{completeness,missing}') IS NOT TRUE OR shadow9d.valid_categories(s #> '{completeness,unavailable}') IS NOT TRUE OR
    ((s->'completeness') - ARRAY['requiredCategories','complete','missing','unavailable']) <> '{}'::jsonb OR
    s #> '{completeness,complete}' IS DISTINCT FROM 'false'::jsonb OR
    jsonb_typeof(s->'timeline') IS DISTINCT FROM 'array' OR
    jsonb_typeof(s->'contradictions') IS DISTINCT FROM 'array' OR
    (s - ARRAY['caseId','bookingId','caseType','evidenceVersion','scheduledAt','occurredAt','generatedAt','timeline','completeness','contradictions']) <> '{}'::jsonb THEN RETURN false; END IF;
  FOR e IN SELECT value FROM jsonb_array_elements(s->'timeline') LOOP
    IF shadow9d.valid_categories(jsonb_build_array(e->'category')) IS NOT TRUE OR
      COALESCE(e->>'basis','') NOT IN ('direct','derived') OR shadow9d.valid_instant(e->'observedAt',false) IS NOT TRUE OR shadow9d.valid_instant(e->'receivedAt',false) IS NOT TRUE OR
      e->'value' IS DISTINCT FROM '{"redacted":true}'::jsonb OR
      e->'quality' IS DISTINCT FROM '{"redacted":true}'::jsonb OR e->>'kind' IS DISTINCT FROM 'minimized_observation' OR
      e->>'source' IS DISTINCT FROM 'isolated-minimized-v1' OR e->>'availability' IS DISTINCT FROM 'unknown' OR
      e->'claimKey' IS DISTINCT FROM 'null'::jsonb OR COALESCE(e->>'id','') !~ '^[a-f0-9]{64}$' OR
      jsonb_typeof(e->'derivedFrom') IS DISTINCT FROM 'array' OR
      (e - ARRAY['id','category','kind','value','source','basis','derivedFrom','availability','claimKey','observedAt','receivedAt','quality']) <> '{}'::jsonb THEN RETURN false; END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(e->'derivedFrom') LOOP
      IF COALESCE(item #>> '{}','') !~ '^[a-f0-9]{64}$' THEN RETURN false; END IF;
    END LOOP;
  END LOOP;
  FOR e IN SELECT value FROM jsonb_array_elements(s->'contradictions') LOOP
    IF COALESCE(e->>'claimKey','') !~ '^[a-f0-9]{64}$' OR jsonb_typeof(e->'observations') IS DISTINCT FROM 'array' OR
      (e - ARRAY['claimKey','observations']) <> '{}'::jsonb THEN RETURN false; END IF;
    FOR o IN SELECT value FROM jsonb_array_elements(e->'observations') LOOP
      IF o->'value' IS DISTINCT FROM '{"redacted":true}'::jsonb OR jsonb_typeof(o->'evidenceIds') IS DISTINCT FROM 'array' OR
        (o - ARRAY['value','evidenceIds']) <> '{}'::jsonb THEN RETURN false; END IF;
      FOR item IN SELECT value FROM jsonb_array_elements(o->'evidenceIds') LOOP
        IF COALESCE(item #>> '{}','') !~ '^[a-f0-9]{64}$' THEN RETURN false; END IF;
      END LOOP;
    END LOOP;
  END LOOP;
  RETURN true;
END $$;
CREATE FUNCTION shadow9d.enqueue(key text, snapshot jsonb, evidence_hash text, provenance text) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, shadow9d, pg_temp AS $$
DECLARE c shadow9d.control; existing bigint; result bigint;
BEGIN
  SELECT * INTO c FROM shadow9d.control FOR UPDATE;
  IF NOT shadow9d.valid_snapshot(snapshot) THEN PERFORM audit9d.append('PRIVACY_REJECTED',NULL,'{}'); RETURN NULL; END IF;
  IF c.stopped THEN PERFORM audit9d.append('CAPTURE_STOPPED',NULL,'{}'); RETURN NULL; END IF;
  SELECT id INTO existing FROM shadow9d.work w WHERE w.logical_key=key;
  IF existing IS NOT NULL THEN
    IF EXISTS(SELECT 1 FROM shadow9d.work w WHERE w.id=existing AND (
      w.evidence_hash IS DISTINCT FROM enqueue.evidence_hash OR
      w.provenance IS DISTINCT FROM enqueue.provenance OR
      (w.snapshot IS NOT NULL AND w.snapshot IS DISTINCT FROM enqueue.snapshot))) THEN
      PERFORM audit9d.append('DUPLICATE_CONFLICT',existing,'{}'); RETURN NULL;
    END IF;
    PERFORM audit9d.append('DUPLICATE',existing,'{}'); RETURN existing;
  END IF;
  IF (SELECT count(*) FROM shadow9d.work WHERE status<>'COMPLETED')>=c.queue_limit THEN
    PERFORM audit9d.append('BACKPRESSURE',NULL,'{}'); RETURN NULL;
  END IF;
  INSERT INTO shadow9d.work(logical_key,snapshot,evidence_hash,provenance,created_at)
    VALUES(key,snapshot,evidence_hash,provenance,c.now_at) RETURNING id INTO result;
  PERFORM audit9d.append('ENQUEUE',result,jsonb_build_object('hash',evidence_hash,'provenance',provenance));
  RETURN result;
END $$;
CREATE FUNCTION shadow9d.set_stop(stop boolean) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, shadow9d, pg_temp AS $$
DECLARE version bigint;
BEGIN
  UPDATE shadow9d.control SET stopped=stop,epoch=epoch+1 RETURNING epoch INTO version;
  PERFORM audit9d.append('CONTROL',NULL,jsonb_build_object('stopped',stop,'epoch',version));
  RETURN version;
END $$;
CREATE FUNCTION shadow9d.claim() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, shadow9d, pg_temp AS $$
DECLARE c shadow9d.control; w shadow9d.work;
BEGIN
  SELECT * INTO c FROM shadow9d.control FOR UPDATE;
  IF c.stopped THEN PERFORM audit9d.append('CLAIM_STOPPED',NULL,'{}'); RETURN NULL; END IF;
  UPDATE shadow9d.work SET status='MANUAL_REVIEW',lease_until=NULL
    WHERE status='PROCESSING' AND lease_until<=c.now_at AND attempts>=4;
  IF (SELECT count(*) FROM shadow9d.work WHERE status='PROCESSING' AND lease_until>c.now_at)>=c.max_concurrent THEN
    PERFORM audit9d.append('CONCURRENCY_LIMIT',NULL,'{}'); RETURN NULL;
  END IF;
  SELECT * INTO w FROM shadow9d.work WHERE attempts<4 AND (
    status='PENDING' OR (status='RETRYABLE' AND next_retry_at<=c.now_at) OR
    (status='PROCESSING' AND lease_until<=c.now_at))
    ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1;
  IF w.id IS NULL THEN RETURN NULL; END IF;
  UPDATE shadow9d.work SET status='PROCESSING',attempts=attempts+1,lease_owner=session_user,
    lease_token=gen_random_uuid(),epoch=c.epoch,lease_until=c.now_at+interval '2 minutes'
    WHERE id=w.id RETURNING * INTO w;
  PERFORM audit9d.append('CLAIM',w.id,jsonb_build_object('attempt',w.attempts,'epoch',w.epoch,'lease',w.lease_token));
  RETURN to_jsonb(w)-'result';
END $$;
CREATE FUNCTION shadow9d.permit(id bigint, token uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, shadow9d, pg_temp AS $$
DECLARE c shadow9d.control; allowed boolean;
BEGIN
  SELECT * INTO c FROM shadow9d.control FOR UPDATE;
  SELECT EXISTS(SELECT 1 FROM shadow9d.work w WHERE w.id=permit.id AND lease_token=token AND
    lease_owner=session_user AND w.epoch=c.epoch AND lease_until>c.now_at AND status='PROCESSING') INTO allowed;
  IF c.stopped OR NOT allowed THEN PERFORM audit9d.append('ANALYSIS_DENIED',id,'{}'); RETURN false; END IF;
  IF c.used_requests>=c.request_budget THEN PERFORM audit9d.append('QUOTA_DENIED',id,'{}'); RETURN false; END IF;
  UPDATE shadow9d.control SET used_requests=used_requests+1;
  PERFORM audit9d.append('ANALYSIS_PERMITTED',id,jsonb_build_object('request',c.used_requests+1));
  RETURN true;
END $$;
CREATE FUNCTION shadow9d.complete(id bigint, token uuid, result jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, shadow9d, pg_temp AS $$
DECLARE c shadow9d.control; w shadow9d.work; safe jsonb;
BEGIN
  SELECT * INTO c FROM shadow9d.control FOR UPDATE;
  SELECT * INTO w FROM shadow9d.work WHERE work.id=complete.id FOR UPDATE;
  IF c.stopped OR w.id IS NULL OR w.epoch<>c.epoch OR w.lease_owner<>session_user OR
    w.lease_token IS DISTINCT FROM token OR w.lease_until<=c.now_at OR w.status<>'PROCESSING' THEN
    PERFORM audit9d.append('COMMIT_DENIED',id,'{}'); RETURN false;
  END IF;
  IF result IS NULL OR octet_length(result::text)>32768 OR result->>'mode' IS DISTINCT FROM 'SHADOW' OR
    result->>'route' IS DISTINCT FROM 'NEEDS_ADMIN_REVIEW' OR
    COALESCE(result->>'suggestedClassification','') NOT IN ('DRIVER_CAUSED','PLATFORM_CAUSED','VALID_WAIVED','EXTERNAL_OR_UNCERTAIN','NEEDS_REVIEW') OR
    COALESCE(result->>'severity','') NOT IN ('LOW','MODERATE','HIGH') OR
    jsonb_typeof(result->'confidence') IS DISTINCT FROM 'number' THEN
    PERFORM audit9d.append('RESULT_REJECTED',id,'{}'); RETURN false;
  END IF;
  IF (result->>'confidence')::numeric NOT BETWEEN 0 AND 1 THEN
    PERFORM audit9d.append('RESULT_REJECTED',id,'{}'); RETURN false;
  END IF;
  -- Categorical recommendation only. Worker-supplied free text, secrets, model
  -- names, extra fields, facts and alleged final authority never enter custody.
  safe=jsonb_build_object('mode','SHADOW','route','NEEDS_ADMIN_REVIEW',
    'suggestedClassification',result->'suggestedClassification',
    'confidence',result->'confidence','severity',result->'severity',
    'factualValidation',jsonb_build_object('valid',CASE WHEN jsonb_typeof(result #> '{factualValidation,valid}')='boolean' THEN result #> '{factualValidation,valid}' ELSE NULL END),'guardRoute','NEEDS_ADMIN_REVIEW','adapterIdentity','responsibility-jev-v5-production-envelope-v1','schemaIdentity','shadow-minimized-v1','frozenV5','e484afc4c7fa724ea29af6edd962c48b814dc73a10e4f4a5e33833ad26afbe75','analysisId',CASE WHEN result->>'analysisProviderId' ~ '^[a-f0-9]{64}$' THEN result->>'analysisProviderId' ELSE NULL END,'model',CASE WHEN result->>'model' ~ '^jev-[0-9.]+$' THEN result->>'model' ELSE 'offline-unrecognized' END,'humanReview','PENDING','execution','OFF');
  UPDATE shadow9d.work SET status='COMPLETED',lease_until=NULL,result=safe WHERE work.id=complete.id;
  PERFORM audit9d.append('COMPLETE',id,jsonb_build_object('hash',w.evidence_hash,'recommendation',safe));
  RETURN true;
END $$;
CREATE FUNCTION shadow9d.fail(id bigint, token uuid, category text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, shadow9d, pg_temp AS $$
DECLARE c shadow9d.control; w shadow9d.work;
BEGIN
  SELECT * INTO c FROM shadow9d.control FOR UPDATE;
  SELECT * INTO w FROM shadow9d.work WHERE work.id=fail.id FOR UPDATE;
  IF w.id IS NULL OR w.lease_owner<>session_user OR w.lease_token IS DISTINCT FROM token OR w.status<>'PROCESSING' THEN
    PERFORM audit9d.append('FAIL_DENIED',id,'{}'); RETURN false;
  END IF;
  UPDATE shadow9d.work SET status=CASE WHEN attempts<4 THEN 'RETRYABLE' ELSE 'MANUAL_REVIEW' END,
    lease_until=NULL,next_retry_at=c.now_at+interval '30 seconds' WHERE work.id=fail.id;
  PERFORM audit9d.append('FAIL',id,jsonb_build_object('category',CASE WHEN category='ANALYST_TIMEOUT' THEN category ELSE 'BOUNDED_FAILURE' END));
  RETURN true;
END $$;
CREATE FUNCTION shadow9d.delete_payload(id bigint) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, shadow9d, pg_temp AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM shadow9d.work WHERE work.id=delete_payload.id AND status IN ('COMPLETED','MANUAL_REVIEW')) THEN RETURN false; END IF;
  UPDATE shadow9d.work SET snapshot=NULL,result=NULL WHERE work.id=delete_payload.id;
  PERFORM audit9d.append('PAYLOAD_DELETED',id,'{}'); RETURN true;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA shadow9d FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA shadow9d FROM PUBLIC;
RESET ROLE;
GRANT USAGE ON SCHEMA shadow9d TO shadow9d_worker,shadow9d_capture,shadow9d_ops,shadow9d_inspector;
GRANT EXECUTE ON FUNCTION shadow9d.claim(),shadow9d.permit(bigint,uuid),shadow9d.complete(bigint,uuid,jsonb),shadow9d.fail(bigint,uuid,text) TO shadow9d_worker;
GRANT EXECUTE ON FUNCTION shadow9d.enqueue(text,jsonb,text,text) TO shadow9d_capture;
GRANT EXECUTE ON FUNCTION shadow9d.set_stop(boolean),shadow9d.delete_payload(bigint) TO shadow9d_ops;
GRANT SELECT ON shadow9d.work,shadow9d.control TO shadow9d_inspector;
