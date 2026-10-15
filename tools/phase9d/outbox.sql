-- Inactive isolated installation; bootstrap must verify its owned database.
-- Existing Phase 7 journals remain authoritative. No application migration/caller.
CREATE ROLE shadow9d_exporter LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
CREATE SCHEMA outbox9d AUTHORIZATION shadow9d_owner;
CREATE EXTENSION pgcrypto WITH SCHEMA outbox9d;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA outbox9d FROM PUBLIC;
GRANT EXECUTE ON FUNCTION outbox9d.hmac(text,text,text) TO shadow9d_owner;
GRANT USAGE ON SCHEMA public TO shadow9d_owner;
GRANT SELECT(id,case_id,evidence_version_id,contract_version,analyst_config_version,policy_version,created_at) ON public.responsibility_adjudication_work TO shadow9d_owner;
GRANT SELECT(id,case_id,evidence_version,evidence_hash,snapshot,generated_at) ON public.responsibility_evidence_versions TO shadow9d_owner;
GRANT SELECT(id,source_key,booking_id,case_type,occurred_at) ON public.responsibility_cases TO shadow9d_owner;
GRANT SELECT(id,user_id) ON public.bookings TO shadow9d_owner;
GRANT SELECT(id,booking_id,driver_id,created_at) ON public.driver_cancellations TO shadow9d_owner;
-- Rehearsal-only SELECT policies: the application denies all ordinary roles.
-- The non-login owner still has only the explicit column grants above.
CREATE POLICY shadow9d_export_source_booking ON public.bookings FOR SELECT TO shadow9d_owner USING(true);
CREATE POLICY shadow9d_export_source_cancellation ON public.driver_cancellations FOR SELECT TO shadow9d_owner USING(true);
SET ROLE shadow9d_owner;
CREATE TABLE outbox9d.configuration (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  enabled boolean NOT NULL DEFAULT false,
  privacy_key text CHECK(privacy_key IS NULL OR length(privacy_key)>=32),
  version text NOT NULL DEFAULT 'inactive-isolated-export-v1' CHECK(version='inactive-isolated-export-v1')
);
INSERT INTO outbox9d.configuration DEFAULT VALUES;
CREATE TABLE outbox9d.deliveries (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_work_id text UNIQUE NOT NULL,
  source_binding text,
  status text NOT NULL CHECK(status IN ('PENDING','PROCESSING','RETRYABLE','ACKED','MANUAL_REVIEW','REJECTED')),
  attempts int NOT NULL DEFAULT 0,
  token uuid, lease_owner text, lease_until timestamptz, epoch bigint,
  retry_at timestamptz, payload jsonb, receiver_id bigint,
  failure text, created_at timestamptz NOT NULL,
  CHECK(payload IS NULL OR octet_length(payload::text)<=65536)
);
CREATE FUNCTION outbox9d.entries(s jsonb) RETURNS jsonb
LANGUAGE sql SET search_path=pg_catalog,outbox9d,pg_temp AS $$
  SELECT CASE WHEN jsonb_typeof(s->'timeline')='array' THEN s->'timeline' ELSE '[]'::jsonb END
$$;
CREATE FUNCTION outbox9d.source(work_id text) RETURNS jsonb
LANGUAGE sql SET search_path=pg_catalog,outbox9d,pg_temp AS $$
  SELECT jsonb_build_object('workId',w.id,'caseId',c.id,'bookingId',b.id,'caseType',c.case_type,
    'actorId',CASE WHEN c.case_type='RIDER_CANCELLATION' THEN b.user_id ELSE COALESCE(d.driver_id,a.value->>'driverId') END,
    'userId',b.user_id,'sourceEvent',CASE WHEN d.id IS NOT NULL THEN 'driver_cancellation:'||d.id ELSE c.source_key END,
    'sourceKey',c.source_key,'evidenceId',e.id,'evidenceVersion',e.evidence_version,
    'evidenceHash',e.evidence_hash,'snapshot',e.snapshot,'generatedAt',to_char(e.generated_at,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'occurredAt',to_char(c.occurred_at,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'eventAt',to_char(d.created_at,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'contractVersion',w.contract_version,
    'analystConfigVersion',w.analyst_config_version,'policyVersion',w.policy_version,
    'lineageValid',w.case_id=e.case_id AND e.snapshot->>'caseId'=c.id AND e.snapshot->>'bookingId'=b.id
      AND e.snapshot->>'caseType'=c.case_type AND e.snapshot->>'evidenceVersion'=e.evidence_version
      AND EXISTS(SELECT 1 FROM jsonb_array_elements(outbox9d.entries(e.snapshot)) x
        WHERE x->>'category'='booking' AND x#>>'{value,bookingId}'=b.id AND x#>>'{value,userId}'=b.user_id)
      AND CASE c.case_type
        WHEN 'DRIVER_CANCELLATION' THEN d.id IS NOT NULL AND c.source_key='driver-cancellation:'||b.id||':'||d.driver_id
          AND a.value->>'driverId'=d.driver_id
        WHEN 'RIDER_CANCELLATION' THEN c.source_key='rider-cancellation:'||b.id AND EXISTS(
          SELECT 1 FROM jsonb_array_elements(outbox9d.entries(e.snapshot)) x WHERE x->>'kind'='committed_customer_transition'
            AND x#>>'{value,initiator}'='rider' AND x#>>'{value,transition}'='cancelled')
        WHEN 'DRIVER_LATE' THEN c.source_key='late-driver-recovery:'||b.id||':'||(a.value->>'driverId')||':'||(a.value->>'expectedPickupAt') AND EXISTS(
          SELECT 1 FROM jsonb_array_elements(outbox9d.entries(e.snapshot)) x WHERE x->>'kind'='committed_customer_transition'
            AND x#>>'{value,previousDriverId}'=a.value->>'driverId' AND x#>>'{value,transition}'='late_driver_recovery'
            AND x#>>'{value,fault}'='UNDETERMINED')
        ELSE false END)
  FROM public.responsibility_adjudication_work w
  JOIN public.responsibility_evidence_versions e ON e.id=w.evidence_version_id
  JOIN public.responsibility_cases c ON c.id=w.case_id
  JOIN public.bookings b ON b.id=c.booking_id
  LEFT JOIN LATERAL (SELECT x->'value' value FROM jsonb_array_elements(outbox9d.entries(e.snapshot)) x
    WHERE x->>'category'='assignment' ORDER BY x->>'id' LIMIT 1) a ON true
  LEFT JOIN public.driver_cancellations d ON d.booking_id=b.id AND EXISTS(
    SELECT 1 FROM jsonb_array_elements(outbox9d.entries(e.snapshot)) x
      WHERE x->>'kind'='driver_cancellation_recorded' AND x#>>'{value,cancellationId}'=d.id
        AND x->>'source'='driver_cancellation:'||d.id)
  WHERE w.id=work_id
$$;
CREATE FUNCTION outbox9d.pseudonym(v text) RETURNS text
LANGUAGE sql SET search_path=pg_catalog,outbox9d,pg_temp AS $$
  SELECT encode(outbox9d.hmac(v,privacy_key,'sha256'),'hex') FROM outbox9d.configuration
$$;
CREATE FUNCTION outbox9d.projection(s jsonb) RETURNS jsonb
LANGUAGE sql SET search_path=pg_catalog,outbox9d,pg_temp AS $$
  SELECT (s-ARRAY['caseId','bookingId','timeline','completeness','contradictions'])||jsonb_build_object(
    'caseId',outbox9d.pseudonym(s->>'caseId'),'bookingId',outbox9d.pseudonym(s->>'bookingId'),
    'timeline',COALESCE((SELECT jsonb_agg((x-ARRAY['id','kind','value','source','derivedFrom','availability','claimKey','quality'])||jsonb_build_object(
      'id',outbox9d.pseudonym(x->>'id'),'kind','minimized_observation','value',jsonb_build_object('redacted',true),
      'source','isolated-minimized-v1','derivedFrom',COALESCE((SELECT jsonb_agg(outbox9d.pseudonym(v#>>'{}') ORDER BY i)
        FROM jsonb_array_elements(x->'derivedFrom') WITH ORDINALITY t(v,i)),'[]'::jsonb),
      'availability','unknown','claimKey',NULL,'quality',jsonb_build_object('redacted',true)) ORDER BY n)
      FROM jsonb_array_elements(outbox9d.entries(s)) WITH ORDINALITY t(x,n)),'[]'::jsonb),
    'completeness',jsonb_build_object('requiredCategories',s#>'{completeness,requiredCategories}','complete',false,
      'missing',s#>'{completeness,requiredCategories}','unavailable','[]'::jsonb),
    'contradictions',COALESCE((SELECT jsonb_agg(jsonb_build_object('claimKey',outbox9d.pseudonym(x->>'claimKey'),
      'observations',(SELECT jsonb_agg(jsonb_build_object('value',jsonb_build_object('redacted',true),
        'evidenceIds',(SELECT COALESCE(jsonb_agg(outbox9d.pseudonym(v#>>'{}') ORDER BY k),'[]'::jsonb)
          FROM jsonb_array_elements(o->'evidenceIds') WITH ORDINALITY t(v,k))) ORDER BY j)
        FROM jsonb_array_elements(x->'observations') WITH ORDINALITY t(o,j))) ORDER BY i)
      FROM jsonb_array_elements(s->'contradictions') WITH ORDINALITY t(x,i)),'[]'::jsonb))
$$;
CREATE FUNCTION outbox9d.binding(s jsonb) RETURNS text
LANGUAGE sql SET search_path=pg_catalog,outbox9d,pg_temp AS $$ SELECT encode(sha256(convert_to(s::text,'UTF8')),'hex') $$;
-- Canonical serializer only certifies the ASCII-key, redacted projection.
-- Original evidence hashing is still performed by the frozen JS contract.
CREATE FUNCTION outbox9d.serialize(v jsonb) RETURNS text
LANGUAGE plpgsql SET search_path=pg_catalog,outbox9d,pg_temp AS $$
BEGIN
  IF jsonb_typeof(v)='object' THEN RETURN '{'||COALESCE((SELECT string_agg(to_jsonb(key)::text||':'||outbox9d.serialize(value),',' ORDER BY key COLLATE "C") FROM jsonb_each(v)),'')||'}'; END IF;
  IF jsonb_typeof(v)='array' THEN RETURN '['||COALESCE((SELECT string_agg(outbox9d.serialize(value),',' ORDER BY n) FROM jsonb_array_elements(v) WITH ORDINALITY t(value,n)),'')||']'; END IF;
  RETURN v::text;
END $$;
CREATE FUNCTION outbox9d.scan() RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,outbox9d,pg_temp AS $$
DECLARE c shadow9d.control; cfg outbox9d.configuration; w record; s jsonb; total int=0; reason text;
BEGIN
  SELECT * INTO c FROM shadow9d.control FOR UPDATE;
  SELECT * INTO cfg FROM outbox9d.configuration;
  IF c.stopped OR NOT cfg.enabled OR cfg.privacy_key IS NULL THEN RETURN 0; END IF;
  FOR w IN SELECT id FROM public.responsibility_adjudication_work a WHERE NOT EXISTS(
    SELECT 1 FROM outbox9d.deliveries d WHERE d.source_work_id=a.id) ORDER BY a.created_at,a.id LIMIT 32 LOOP
    IF (SELECT count(*) FROM outbox9d.deliveries WHERE status IN ('PENDING','PROCESSING','RETRYABLE'))>=c.queue_limit THEN EXIT; END IF;
    s=outbox9d.source(w.id);
    reason=CASE WHEN s IS NULL THEN 'SOURCE_UNAVAILABLE' WHEN s->>'caseType' NOT IN ('DRIVER_CANCELLATION','RIDER_CANCELLATION','DRIVER_LATE') THEN 'UNSUPPORTED_FAMILY'
      WHEN (s->>'lineageValid')::boolean IS NOT TRUE THEN 'SOURCE_LINEAGE' WHEN octet_length((s->'snapshot')::text)>65536 THEN 'SOURCE_OVERSIZE'
      WHEN s->>'contractVersion' IS DISTINCT FROM 'responsibility-analysis-v1' OR s->>'analystConfigVersion' IS DISTINCT FROM 'responsibility-analyst-config-v1'
        OR s->>'policyVersion' IS DISTINCT FROM 'scheduled-responsibility-policy-v1' THEN 'SOURCE_CONFIG' ELSE NULL END;
    INSERT INTO outbox9d.deliveries(source_work_id,source_binding,status,failure,created_at)
      VALUES(w.id,outbox9d.binding(s),CASE WHEN reason IS NULL THEN 'PENDING' ELSE 'REJECTED' END,reason,c.now_at) ON CONFLICT DO NOTHING;
    total=total+1;
  END LOOP;
  RETURN total;
END $$;
CREATE FUNCTION outbox9d.claim() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,outbox9d,pg_temp AS $$
DECLARE c shadow9d.control; d outbox9d.deliveries; s jsonb;
BEGIN
  SELECT * INTO c FROM shadow9d.control FOR UPDATE;
  IF c.stopped OR NOT (SELECT enabled FROM outbox9d.configuration) THEN RETURN NULL; END IF;
  UPDATE outbox9d.deliveries SET status='MANUAL_REVIEW',failure='RETRY_EXHAUSTED',lease_until=NULL
    WHERE status='PROCESSING' AND lease_until<=c.now_at AND attempts>=4;
  IF (SELECT count(*) FROM outbox9d.deliveries WHERE status='PROCESSING' AND lease_until>c.now_at)>=c.max_concurrent THEN RETURN NULL; END IF;
  SELECT * INTO d FROM outbox9d.deliveries WHERE attempts<4 AND (status='PENDING' OR (status='RETRYABLE' AND retry_at<=c.now_at)
    OR (status='PROCESSING' AND lease_until<=c.now_at)) ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1;
  IF d.id IS NULL THEN RETURN NULL; END IF;
  s=outbox9d.source(d.source_work_id);
  IF s IS NULL OR outbox9d.binding(s) IS DISTINCT FROM d.source_binding THEN
    UPDATE outbox9d.deliveries SET status='MANUAL_REVIEW',failure='SOURCE_CHANGED' WHERE id=d.id; RETURN NULL;
  END IF;
  UPDATE outbox9d.deliveries SET status='PROCESSING',attempts=attempts+1,token=gen_random_uuid(),lease_owner=session_user,
    epoch=c.epoch,lease_until=c.now_at+interval '2 minutes' WHERE id=d.id RETURNING * INTO d;
  RETURN to_jsonb(d)||jsonb_build_object('source',s);
END $$;
CREATE FUNCTION outbox9d.stage(id bigint,token uuid,payload jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,outbox9d,pg_temp AS $$
DECLARE c shadow9d.control; d outbox9d.deliveries; s jsonb;
BEGIN
  SELECT * INTO c FROM shadow9d.control FOR UPDATE;
  SELECT * INTO d FROM outbox9d.deliveries WHERE deliveries.id=stage.id FOR UPDATE;
  IF c.stopped OR d.id IS NULL OR d.status<>'PROCESSING' OR d.lease_owner<>session_user OR d.token IS DISTINCT FROM token
    OR d.epoch<>c.epoch OR d.lease_until<=c.now_at THEN RETURN false; END IF;
  s=outbox9d.source(d.source_work_id);
  IF s IS NULL OR (s->>'lineageValid')::boolean IS NOT TRUE OR outbox9d.binding(s) IS DISTINCT FROM d.source_binding THEN RETURN false; END IF;
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' OR jsonb_typeof(payload->'snapshot') IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  IF octet_length(payload::text)>65536 OR (payload-ARRAY['schema','projection','config','collector','frozenV5','key','lineage','snapshot','evidenceHash','originalCommitment'])<>'{}'::jsonb
    OR payload->>'schema' IS DISTINCT FROM 'shadow-export-v1' OR payload->>'projection' IS DISTINCT FROM 'shadow-minimized-v1'
    OR payload->>'config' IS DISTINCT FROM 'inactive-isolated-export-v1' OR payload->>'collector' IS DISTINCT FROM 'phase7-committed-journal-v1'
    OR payload->>'frozenV5' IS DISTINCT FROM 'e484afc4c7fa724ea29af6edd962c48b814dc73a10e4f4a5e33833ad26afbe75'
    OR payload->>'key' IS DISTINCT FROM outbox9d.pseudonym('export-v1:'||d.source_work_id)
    OR payload->'lineage' IS DISTINCT FROM jsonb_build_object('caseId',outbox9d.pseudonym(s->>'caseId'),'bookingId',outbox9d.pseudonym(s->>'bookingId'),
      'actorId',outbox9d.pseudonym(s->>'actorId'),'sourceEvent',outbox9d.pseudonym(s->>'sourceEvent'),'evidenceId',outbox9d.pseudonym(s->>'evidenceId'),
      'evidenceVersion',s->>'evidenceVersion','sourceWorkId',outbox9d.pseudonym(s->>'workId'))
    OR payload->'snapshot' IS DISTINCT FROM outbox9d.projection(s->'snapshot') OR shadow9d.valid_snapshot(payload->'snapshot') IS NOT TRUE
    OR payload->>'originalCommitment' IS DISTINCT FROM outbox9d.pseudonym(s->>'evidenceHash')
    OR payload->>'evidenceHash' IS DISTINCT FROM encode(sha256(convert_to(outbox9d.serialize((payload->'snapshot')-'generatedAt'),'UTF8')),'hex') THEN RETURN false; END IF;
  IF d.payload IS NOT NULL AND d.payload IS DISTINCT FROM payload THEN RETURN false; END IF;
  UPDATE outbox9d.deliveries SET payload=stage.payload WHERE deliveries.id=stage.id;
  RETURN true;
END $$;
CREATE FUNCTION outbox9d.deliver(id bigint,token uuid) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,outbox9d,pg_temp AS $$
DECLARE c shadow9d.control; d outbox9d.deliveries; receipt bigint;
BEGIN
  SELECT * INTO c FROM shadow9d.control FOR UPDATE;
  SELECT * INTO d FROM outbox9d.deliveries WHERE deliveries.id=deliver.id FOR UPDATE;
  IF d.status='ACKED' THEN RETURN d.receiver_id; END IF;
  IF c.stopped OR d.id IS NULL OR d.status<>'PROCESSING' OR d.lease_owner<>session_user OR d.token IS DISTINCT FROM token
    OR d.epoch<>c.epoch OR d.lease_until<=c.now_at OR d.payload IS NULL THEN RETURN NULL; END IF;
  IF outbox9d.binding(outbox9d.source(d.source_work_id)) IS DISTINCT FROM d.source_binding THEN RETURN NULL; END IF;
  receipt=shadow9d.enqueue(d.payload->>'key',d.payload->'snapshot',d.payload->>'evidenceHash',d.payload->>'originalCommitment');
  IF receipt IS NULL THEN RETURN NULL; END IF;
  UPDATE outbox9d.deliveries SET status='ACKED',receiver_id=receipt,lease_until=NULL WHERE deliveries.id=deliver.id;
  PERFORM audit9d.append('SOURCE_EXPORT_ACKED',receipt,jsonb_build_object('source',d.source_binding,'payload',outbox9d.binding(d.payload)));
  RETURN receipt;
END $$;
CREATE FUNCTION outbox9d.fail(id bigint,token uuid,retryable boolean,category text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,outbox9d,pg_temp AS $$
DECLARE c shadow9d.control; d outbox9d.deliveries;
BEGIN
  SELECT * INTO c FROM shadow9d.control FOR UPDATE;
  SELECT * INTO d FROM outbox9d.deliveries WHERE deliveries.id=fail.id FOR UPDATE;
  IF d.id IS NULL OR d.status<>'PROCESSING' OR d.lease_owner<>session_user OR d.token IS DISTINCT FROM token THEN RETURN false; END IF;
  UPDATE outbox9d.deliveries SET status=CASE WHEN retryable AND attempts<4 THEN 'RETRYABLE' ELSE 'MANUAL_REVIEW' END,
    failure=CASE WHEN category IN ('SOURCE_INVALID','STAGE_DENIED','DELIVERY_UNAVAILABLE') THEN category ELSE 'BOUNDED_FAILURE' END,
    retry_at=c.now_at+interval '30 seconds',lease_until=NULL WHERE deliveries.id=fail.id;
  RETURN true;
END $$;
CREATE FUNCTION outbox9d.delete_payload(id bigint) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,outbox9d,pg_temp AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM outbox9d.deliveries d JOIN shadow9d.work w ON w.id=d.receiver_id
    WHERE d.id=delete_payload.id AND d.status='ACKED' AND w.status IN ('COMPLETED','MANUAL_REVIEW')) THEN RETURN false; END IF;
  UPDATE outbox9d.deliveries SET payload=NULL WHERE deliveries.id=delete_payload.id;
  RETURN true;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA outbox9d FROM PUBLIC;
RESET ROLE;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA outbox9d FROM PUBLIC;
GRANT USAGE ON SCHEMA outbox9d TO shadow9d_exporter,shadow9d_inspector;
GRANT EXECUTE ON FUNCTION outbox9d.scan(),outbox9d.claim(),outbox9d.stage(bigint,uuid,jsonb),outbox9d.deliver(bigint,uuid),outbox9d.fail(bigint,uuid,boolean,text) TO shadow9d_exporter;
GRANT SELECT ON outbox9d.deliveries TO shadow9d_inspector;
GRANT USAGE ON SCHEMA outbox9d TO shadow9d_ops;
GRANT EXECUTE ON FUNCTION outbox9d.delete_payload(bigint) TO shadow9d_ops;
