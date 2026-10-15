-- Owned disposable receiver database ONLY. Install after permissions.sql.
-- No application tables, source access or operative imports are required.
CREATE SCHEMA transport9d AUTHORIZATION shadow9d_owner;
CREATE EXTENSION pgcrypto WITH SCHEMA transport9d;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA transport9d FROM PUBLIC;
GRANT EXECUTE ON FUNCTION transport9d.hmac(text,text,text) TO shadow9d_owner;
SET ROLE shadow9d_owner;
CREATE TABLE transport9d.configuration (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  service_id uuid NOT NULL, receipt_key text NOT NULL CHECK(length(receipt_key)>=32)
);
-- Configuration must be supplied by the owned bootstrap, never the service.
CREATE TABLE transport9d.receipts (
  logical_key text PRIMARY KEY, payload_binding text NOT NULL,
  receipt uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(), work_id bigint UNIQUE NOT NULL
);
-- Same ASCII-key canonical projection algorithm as the accepted source adapter.
CREATE FUNCTION transport9d.serialize(v jsonb) RETURNS text
LANGUAGE plpgsql SET search_path=pg_catalog,transport9d,pg_temp AS $$
BEGIN
  IF jsonb_typeof(v)='object' THEN RETURN '{'||COALESCE((SELECT string_agg(to_jsonb(key)::text||':'||transport9d.serialize(value),',' ORDER BY key COLLATE "C") FROM jsonb_each(v)),'')||'}'; END IF;
  IF jsonb_typeof(v)='array' THEN RETURN '['||COALESCE((SELECT string_agg(transport9d.serialize(value),',' ORDER BY n) FROM jsonb_array_elements(v) WITH ORDINALITY t(value,n)),'')||']'; END IF;
  RETURN v::text;
END $$;
CREATE FUNCTION transport9d.receive(payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,transport9d,pg_temp AS $$
DECLARE c shadow9d.control; r transport9d.receipts; w bigint; binding text; body jsonb; cfg transport9d.configuration;
BEGIN
  SELECT * INTO c FROM shadow9d.control FOR UPDATE;
  IF payload IS NULL OR jsonb_typeof(payload) IS DISTINCT FROM 'object' OR
    octet_length(payload::text)>65536 OR
    (payload-ARRAY['schema','projection','config','collector','frozenV5','key','lineage','snapshot','evidenceHash','originalCommitment'])<>'{}'::jsonb OR
    payload->>'schema' IS DISTINCT FROM 'shadow-export-v1' OR payload->>'projection' IS DISTINCT FROM 'shadow-minimized-v1' OR
    payload->>'config' IS DISTINCT FROM 'inactive-isolated-export-v1' OR payload->>'collector' IS DISTINCT FROM 'phase7-committed-journal-v1' OR
    payload->>'frozenV5' IS DISTINCT FROM 'e484afc4c7fa724ea29af6edd962c48b814dc73a10e4f4a5e33833ad26afbe75' OR
    COALESCE(payload->>'key','') !~ '^[a-f0-9]{64}$' OR COALESCE(payload->>'evidenceHash','') !~ '^[a-f0-9]{64}$' OR
    COALESCE(payload->>'originalCommitment','') !~ '^[a-f0-9]{64}$' OR
    jsonb_typeof(payload->'lineage') IS DISTINCT FROM 'object' OR
    ((payload->'lineage')-ARRAY['caseId','bookingId','actorId','sourceEvent','evidenceId','sourceWorkId','evidenceVersion'])<>'{}'::jsonb OR
    payload#>>'{lineage,evidenceVersion}' IS DISTINCT FROM 'responsibility-evidence-v1' OR
    EXISTS(SELECT 1 FROM unnest(ARRAY['caseId','bookingId','actorId','sourceEvent','evidenceId','sourceWorkId']) k
      WHERE COALESCE(payload#>>ARRAY['lineage',k],'') !~ '^[a-f0-9]{64}$') OR
    payload#>>'{lineage,caseId}' IS DISTINCT FROM payload#>>'{snapshot,caseId}' OR
    payload#>>'{lineage,bookingId}' IS DISTINCT FROM payload#>>'{snapshot,bookingId}' OR
    COALESCE(payload#>>'{snapshot,caseType}','') NOT IN ('DRIVER_CANCELLATION','RIDER_CANCELLATION','DRIVER_LATE') OR
    shadow9d.valid_snapshot(payload->'snapshot') IS NOT TRUE THEN RETURN NULL; END IF;
  IF payload->>'evidenceHash' IS DISTINCT FROM encode(sha256(convert_to(transport9d.serialize((payload->'snapshot')-'generatedAt'),'UTF8')),'hex') THEN RETURN NULL; END IF;
  SELECT * INTO cfg FROM transport9d.configuration;
  IF cfg.service_id IS NULL THEN RETURN NULL; END IF;
  binding=encode(sha256(convert_to(payload::text,'UTF8')),'hex');
  SELECT * INTO r FROM transport9d.receipts WHERE logical_key=payload->>'key';
  IF r.logical_key IS NOT NULL THEN
    IF r.payload_binding IS DISTINCT FROM binding THEN RETURN NULL; END IF;
  ELSE
    IF c.stopped THEN RETURN NULL; END IF;
    w=shadow9d.enqueue(payload->>'key',payload->'snapshot',payload->>'evidenceHash',payload->>'originalCommitment');
    IF w IS NULL THEN RETURN NULL; END IF;
    INSERT INTO transport9d.receipts(logical_key,payload_binding,work_id) VALUES(payload->>'key',binding,w) RETURNING * INTO r;
  END IF;
  body=jsonb_build_object('schema','shadow-receipt-v1','service',cfg.service_id,'key',r.logical_key,
    'payloadBinding',r.payload_binding,'receipt',r.receipt,'workId',r.work_id::text,
    'status',(SELECT status FROM shadow9d.work WHERE id=r.work_id));
  RETURN jsonb_build_object('body',body,'mac',encode(transport9d.hmac(body::text,cfg.receipt_key,'sha256'),'hex'));
END $$;
RESET ROLE;
REVOKE ALL ON ALL TABLES IN SCHEMA transport9d FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA transport9d FROM PUBLIC;
GRANT EXECUTE ON FUNCTION transport9d.hmac(text,text,text) TO shadow9d_owner;
GRANT USAGE ON SCHEMA transport9d TO shadow9d_capture,shadow9d_inspector;
GRANT EXECUTE ON FUNCTION transport9d.receive(jsonb) TO shadow9d_capture;
REVOKE EXECUTE ON FUNCTION shadow9d.enqueue(text,jsonb,text,text) FROM shadow9d_capture;
GRANT SELECT ON transport9d.receipts TO shadow9d_inspector;
