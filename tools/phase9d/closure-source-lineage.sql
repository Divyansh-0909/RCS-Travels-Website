-- Deferred observation of committed Phase 7 records. No trigger in booking/payment transactions.
SET ROLE shadow9d_owner;
CREATE FUNCTION custody_lineage.capture_committed() RETURNS int LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,custody_lineage,outbox9d,pg_temp AS $$
DECLARE work record; source jsonb; captured int=0;
BEGIN
  FOR work IN SELECT id FROM public.responsibility_adjudication_work ORDER BY created_at,id LOOP
    SELECT outbox9d.source(work.id) INTO source;
    IF source->>'lineageValid'='true' AND source->>'caseType' IN('DRIVER_CANCELLATION','RIDER_CANCELLATION','DRIVER_LATE') THEN
      PERFORM custody_lineage.emit('SOURCE_LINEAGE','source:'||(source->>'workId')||':'||(source->>'evidenceHash'),source->>'actorId',source,'application_transaction');
      captured=captured+1;
    END IF;
  END LOOP;
  RETURN captured;
END $$;
CREATE FUNCTION custody_lineage.expected_sources() RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path=pg_catalog,custody_lineage,outbox9d,pg_temp AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('identityHash',encode(outbox9d.hmac('source:'||(s->>'workId')||':'||(s->>'evidenceHash'),c.secret,'sha256'),'hex'),
    'evidenceHash',s->>'evidenceHash','evidenceVersion',s->>'evidenceVersion') ORDER BY s->>'workId'),'[]'::jsonb)
  FROM public.responsibility_adjudication_work w CROSS JOIN custody_lineage.control c CROSS JOIN LATERAL outbox9d.source(w.id) s
  WHERE s->>'lineageValid'='true' AND s->>'caseType' IN('DRIVER_CANCELLATION','RIDER_CANCELLATION','DRIVER_LATE')
$$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA custody_lineage FROM PUBLIC;
RESET ROLE;
GRANT USAGE ON SCHEMA custody_lineage TO shadow9d_exporter;
GRANT EXECUTE ON FUNCTION custody_lineage.capture_committed() TO shadow9d_exporter;
