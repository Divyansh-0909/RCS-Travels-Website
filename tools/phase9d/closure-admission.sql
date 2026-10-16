-- Official pgcrypto, isolated custody server only. Source secrets are bootstrap-only roots.
CREATE EXTENSION pgcrypto WITH SCHEMA custody;
GRANT EXECUTE ON FUNCTION custody.hmac(text,text,text) TO custody_owner;
SET ROLE custody_owner;
ALTER TABLE custody.sources ADD verification_secret text CHECK(length(verification_secret)>=32);
ALTER TABLE custody.sources ADD service text NOT NULL DEFAULT 'broker-receiver-v1';
CREATE FUNCTION custody.serialize(e jsonb) RETURNS text LANGUAGE sql
SET search_path=pg_catalog,custody,pg_temp AS $$
  SELECT '{'||string_agg(to_jsonb(key)::text||':'||value::text,',' ORDER BY key COLLATE "C")||'}' FROM jsonb_each(e)
$$;
CREATE FUNCTION custody.valid_event(e jsonb,service text) RETURNS boolean LANGUAGE plpgsql
SET search_path=pg_catalog,custody,pg_temp AS $$
DECLARE fields text[]=ARRAY['schema','source','service','database','sequence','previous','localId','sourceHash','action','actor','request','attempt','evidenceHash','evidenceVersion','receipt','configuration','generation','frozen','observed']; field text;
BEGIN
  IF e IS NULL OR jsonb_typeof(e)<>'object' THEN RETURN false; END IF;
  IF e->>'schema' IN('custody-event-v2','custody-denial-v1') THEN fields=fields||ARRAY['identityHash','ownerHash']; END IF;
  IF e->>'schema'='custody-denial-v1' THEN fields=fields||ARRAY['serverIdentity','authenticatedRole','actorTrust','sqlstate','logSessionHash','logLine','denialClass']; END IF;
  IF e-fields<>'{}'::jsonb OR (SELECT count(*) FROM jsonb_object_keys(e))<>array_length(fields,1) OR
    EXISTS(SELECT 1 FROM jsonb_each(e) WHERE jsonb_typeof(value) NOT IN('string','null')) THEN RETURN false; END IF;
  FOREACH field IN ARRAY ARRAY['schema','source','service','database','sequence','previous','localId','sourceHash','action','actor','frozen','observed'] LOOP
    IF jsonb_typeof(e->field) IS DISTINCT FROM 'string' THEN RETURN false; END IF;
  END LOOP;
  IF e->>'service' IS DISTINCT FROM service OR e->>'frozen'<>'e484afc4c7fa724ea29af6edd962c48b814dc73a10e4f4a5e33833ad26afbe75' OR
    e->>'source'!~'^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$' OR
    e->>'sequence'!~'^[1-9][0-9]{0,14}$' OR e->>'localId'!~'^[1-9][0-9]{0,14}$' THEN RETURN false; END IF;
  FOREACH field IN ARRAY ARRAY['database','previous','sourceHash'] LOOP
    IF e->>field !~ '^[a-f0-9]{64}$' THEN RETURN false; END IF;
  END LOOP;
  FOREACH field IN ARRAY ARRAY['evidenceHash','configuration'] LOOP
    IF e->field<>'null'::jsonb AND e->>field !~ '^[a-f0-9]{64}$' THEN RETURN false; END IF;
  END LOOP;
  FOREACH field IN ARRAY ARRAY['request','attempt','receipt'] LOOP
    IF e->field<>'null'::jsonb AND e->>field !~ '^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$' THEN RETURN false; END IF;
  END LOOP;
  IF (e->'generation'<>'null'::jsonb AND e->>'generation'!~'^(0|[1-9][0-9]{0,14})$') OR
    (e->'evidenceVersion'<>'null'::jsonb AND e->>'evidenceVersion'<>'responsibility-evidence-v1') OR
    e->>'observed'!~'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$' OR
    NOT pg_input_is_valid(e->>'observed','timestamp with time zone') THEN RETURN false; END IF;
  IF to_char((e->>'observed')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')<>e->>'observed' THEN RETURN false; END IF;
  IF service='broker-receiver-v1' THEN
    RETURN e->>'schema'='custody-event-v1' AND e->>'actor' IN('broker9d_exec','broker9d_guard','broker9d_ops','broker9d_reconciler') AND
      e->>'action' IN('REGISTER','RESERVE','BUDGET_DENIED','DISPATCH_ADMITTED','SEND_ATTEMPT','RESPONSE_OBSERVED','OUTCOME_UNKNOWN','RECOVER','GUARDED_RESULT_COMMITTED','USAGE_RECONCILED','USAGE_CONFLICT','UNSENT_TERMINAL_RELEASE','OPERATION_STOP','OPERATION_RESUME','OPERATION_TERMINATE','OPERATION_CLEAN');
  END IF;
  IF service='denial-observer-v2' AND e->>'schema'='custody-denial-v1' THEN
    RETURN e->>'actor'='trusted_observer' AND e->>'database'=e->>'serverIdentity' AND COALESCE(e->>'serverIdentity','')~'^[a-f0-9]{64}$' AND
      COALESCE(e->>'logSessionHash','')~'^[a-f0-9]{64}$' AND COALESCE(e->>'authenticatedRole','')~'^[a-z][a-z0-9_]{0,62}$' AND COALESCE(e->>'logLine','')~'^[1-9][0-9]{0,14}$' AND
      COALESCE(e->>'identityHash','')~'^[a-f0-9]{64}$' AND e->'ownerHash'='null'::jsonb AND e->>'denialClass' IN('APPLICATION_WRITE','BUDGET_CONFIGURATION','AUDIT_HISTORY','ROLE_ESCALATION','AUTHENTICATION','SIGNING_SECRET','GUARD_WRITE','OPERATIONS_CONTROL','DATABASE_DENIAL') AND
      ((e->>'sqlstate'='42501' AND e->>'actorTrust'='AUTHENTICATED' AND e->>'action'='PERMISSION_DENIED') OR
       (e->>'sqlstate'='28P01' AND e->>'actorTrust'='CLAIMED_UNAUTHENTICATED' AND e->>'action'='AUTHENTICATION_FAILED'));
  END IF;
  IF e->>'schema'<>'custody-event-v2' OR COALESCE(e->>'identityHash','')!~'^[a-f0-9]{64}$' OR
    (e->'ownerHash'<>'null'::jsonb AND e->>'ownerHash'!~'^[a-f0-9]{64}$') OR
    e->>'actor' NOT IN('application_transaction','shadow9d_exporter','shadow9d_capture','shadow9d_ops','shadow9d_worker','shadow9d_recorder','custody_operator','trusted_observer','broker9d_exec','broker9d_guard','broker9d_ops','broker9d_reconciler') THEN RETURN false; END IF;
  RETURN CASE service
    WHEN 'source-lineage-v2' THEN e->>'action' IN('SOURCE_LINEAGE','OUTBOX_CREATED','OUTBOX_CHANGED','LOCAL_AUDIT','RECOVERY_AUTHORIZED')
    WHEN 'receiver-lineage-v2' THEN e->>'action' IN('RECEIPT_ACCEPTED','WORK_ADMITTED','WORK_CHANGED','LOCAL_AUDIT','RECOVERY_AUTHORIZED')
    WHEN 'denial-observer-v2' THEN e->>'action' IN('PERMISSION_DENIED','AUTHENTICATION_FAILED') ELSE false END;
END $$;
CREATE FUNCTION custody.ingest(frame jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,custody,pg_temp AS $$
DECLARE source custody.sources; event jsonb; key text; canonical text;
BEGIN
  IF frame IS NULL OR jsonb_typeof(frame)<>'object' OR frame-ARRAY['event','mac']<>'{}'::jsonb OR
    octet_length(frame::text)>8192 OR COALESCE(frame->>'mac','')!~'^[a-f0-9]{64}$' OR
    COALESCE(frame#>>'{event,source}','')!~'^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$' THEN
    RAISE EXCEPTION 'FRAME_DENIED' USING ERRCODE='23514';
  END IF;
  event=frame->'event';SELECT * INTO source FROM custody.sources WHERE sources.source=(event->>'source')::uuid FOR UPDATE;
  IF source.source IS NULL OR source.verification_secret IS NULL OR custody.valid_event(event,source.service) IS NOT TRUE THEN
    RAISE EXCEPTION 'SOURCE_CONTRACT_DENIED' USING ERRCODE='23514';
  END IF;
  canonical=custody.serialize(event);
  IF encode(custody.hmac('custody-source-v1'||chr(10)||canonical,source.verification_secret,'sha256'),'hex')<>frame->>'mac' THEN
    RAISE EXCEPTION 'SOURCE_MAC_DENIED' USING ERRCODE='23514';
  END IF;
  SELECT key_id INTO key FROM custody.keys WHERE status='ACTIVE' FOR SHARE;
  RETURN custody.accept(event,encode(sha256(convert_to('custody-event-v1'||chr(10)||canonical,'UTF8')),'hex'),key);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA custody FROM PUBLIC;
RESET ROLE;
-- Extension routines are owned by the trusted extension installer, not by
-- custody_owner. Revoke as the installer as well; SET ROLE cannot revoke another
-- owner's default PUBLIC grants.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA custody FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION custody.accept(jsonb,text,text),custody.active_key() FROM custody_ingest;
GRANT EXECUTE ON FUNCTION custody.ingest(jsonb) TO custody_ingest;
-- The original table-wide inspector grant would otherwise include the new private column.
REVOKE SELECT ON custody.sources FROM custody_inspector;
GRANT SELECT(source,seq,head,service) ON custody.sources TO custody_inspector;
