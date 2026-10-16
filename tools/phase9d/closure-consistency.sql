-- Owned disposable databases only. A snapshot of an existing committed row is
-- a later observation, never proof that all earlier transitions were captured.
GRANT SELECT ON audit9d.events TO shadow9d_owner;
DO $$BEGIN IF to_regclass('custody_export.retries') IS NOT NULL THEN GRANT USAGE ON SCHEMA custody_export TO shadow9d_owner;GRANT SELECT ON custody_export.retries TO shadow9d_owner;END IF;END$$;
SET ROLE shadow9d_owner;
CREATE FUNCTION custody_lineage.committed_rows() RETURNS TABLE(family text,relation_name text,original jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,custody_lineage,pg_temp SET TimeZone='UTC' AS $$
BEGIN
  RETURN QUERY SELECT 'LOCAL_AUDIT'::text,'audit9d.events'::text,to_jsonb(a) FROM (SELECT * FROM audit9d.events ORDER BY id LIMIT 1001) a;
  IF (SELECT service FROM custody_lineage.control)='source-lineage-v2' THEN
    RETURN QUERY SELECT 'OUTBOX_CHANGED'::text,'outbox9d.deliveries'::text,to_jsonb(d) FROM (SELECT * FROM outbox9d.deliveries ORDER BY id LIMIT 1001) d;
  ELSE
    RETURN QUERY SELECT 'RECEIPT_ACCEPTED'::text,'transport9d.receipts'::text,to_jsonb(r) FROM (SELECT * FROM transport9d.receipts ORDER BY receipt LIMIT 1001) r;
    RETURN QUERY SELECT 'WORK_CHANGED'::text,'shadow9d.work'::text,to_jsonb(w) FROM (SELECT * FROM shadow9d.work ORDER BY id LIMIT 1001) w;
    RETURN QUERY SELECT 'RECOVERY_AUTHORIZED'::text,'custody_export.retries'::text,to_jsonb(r) FROM (SELECT * FROM custody_export.retries ORDER BY id LIMIT 1001) r;
  END IF;
END $$;
CREATE FUNCTION custody_lineage.capture_existing() RETURNS int LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,custody_lineage,pg_temp SET TimeZone='UTC' AS $$
DECLARE row record; total int=0; id text;
BEGIN
  FOR row IN SELECT * FROM custody_lineage.committed_rows() LOOP
    total=total+1;IF total>1000 THEN RAISE EXCEPTION 'AUDIT_INSPECTION_LIMIT' USING ERRCODE='54000';END IF;
    id=row.relation_name||':'||COALESCE(row.original->>'id',row.original->>'logical_key',row.original->>'receipt');
    PERFORM custody_lineage.emit(row.family,id||':'||encode(sha256(convert_to(row.original::text,'UTF8')),'hex'),NULL,row.original,'trusted_observer');
  END LOOP;
  RETURN total;
END $$;
CREATE FUNCTION custody_lineage.capture_status() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,custody_lineage,pg_temp SET TimeZone='UTC' AS $$
DECLARE c custody_lineage.control; e custody_lineage.events; expected bigint=1; previous text=repeat('0',64); row record; digest text; missing int=0; inspected int=0;
BEGIN
  -- Existing SQL source helpers are VOLATILE. Require a transaction snapshot
  -- that also fences those nested reads. No mutation repairs a missing event.
  IF current_setting('transaction_isolation') NOT IN('repeatable read','serializable') THEN
    RETURN jsonb_build_object('status','CONSISTENCY_SNAPSHOT_REQUIRED');
  END IF;
  SELECT * INTO STRICT c FROM custody_lineage.control;
  FOR e IN SELECT * FROM custody_lineage.events ORDER BY seq LIMIT 1001 LOOP
    IF expected>1000 THEN RETURN jsonb_build_object('status','INSPECTION_LIMIT'); END IF;
    IF e.seq<>expected OR e.event->>'sequence'<>e.seq::text OR e.event->>'source'<>c.source::text OR e.event->>'previous'<>previous OR
      e.hash<>encode(sha256(convert_to('custody-event-v1'||chr(10)||custody_lineage.serialize(e.event),'UTF8')),'hex') THEN
      RETURN jsonb_build_object('status','CAPTURE_GAP','sequence',expected::text);
    END IF;
    previous=e.hash;expected=expected+1;
  END LOOP;
  IF c.seq<>expected-1 OR c.head<>previous THEN RETURN jsonb_build_object('status','CAPTURE_GAP','headMismatch',true);END IF;
  FOR row IN SELECT * FROM custody_lineage.committed_rows() LOOP
    inspected=inspected+1;IF inspected>1000 THEN RETURN jsonb_build_object('status','INSPECTION_LIMIT');END IF;
    digest=encode(sha256(convert_to(row.original::text,'UTF8')),'hex');
    IF NOT EXISTS(SELECT 1 FROM custody_lineage.events WHERE event->>'sourceHash'=digest) THEN missing=missing+1;END IF;
  END LOOP;
  IF c.service='source-lineage-v2' THEN
    FOR row IN SELECT value AS expected FROM jsonb_array_elements(custody_lineage.expected_sources()) LOOP
      inspected=inspected+1;IF inspected>1000 THEN RETURN jsonb_build_object('status','INSPECTION_LIMIT');END IF;
      IF NOT EXISTS(SELECT 1 FROM custody_lineage.events WHERE event->>'identityHash'=row.expected->>'identityHash' AND event->>'evidenceHash'=row.expected->>'evidenceHash') THEN missing=missing+1;END IF;
    END LOOP;
  END IF;
  RETURN jsonb_build_object('status',CASE WHEN missing>0 THEN 'UNCAPTURED_COMMITTED_SOURCE' WHEN c.deferred>0 THEN 'DEFERRED_CAPTURE' ELSE 'CAPTURE_CONSISTENT' END,
    'missingCommittedRows',missing,'deferredControlObservations',c.deferred,'inspectedRows',inspected,
    'observationBoundary','Current retained committed rows only; missing intermediate mutable-row transitions and suppression of both original and capture are unobservable');
END $$;
ALTER FUNCTION custody_lineage.committed_rows() STABLE;
ALTER FUNCTION custody_lineage.capture_status() STABLE;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA custody_lineage FROM PUBLIC;
RESET ROLE;
GRANT EXECUTE ON FUNCTION custody_lineage.capture_status() TO custody_lineage_inspector;
