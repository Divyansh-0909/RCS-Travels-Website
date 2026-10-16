-- OPTIONAL DISPOSABLE RECEIVER EXTENSION. Does not alter application migrations.
CREATE ROLE custody_source_inspector LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
GRANT SELECT ON broker9d.control TO custody_source_owner;
SET ROLE custody_source_owner;
CREATE TABLE custody_export.keys(key_id text PRIMARY KEY CHECK(key_id~'^[a-f0-9]{64}$'),public_key text NOT NULL,
  epoch bigint UNIQUE NOT NULL CHECK(epoch>0),status text NOT NULL CHECK(status IN('ACTIVE','RETIRED','COMPROMISED')));
CREATE TABLE custody_export.limits(singleton boolean PRIMARY KEY CHECK(singleton),
  max_unacknowledged bigint NOT NULL CHECK(max_unacknowledged BETWEEN 1 AND 10000),
  max_payload_bytes bigint NOT NULL CHECK(max_payload_bytes BETWEEN 1024 AND 104857600),
  max_review bigint NOT NULL CHECK(max_review BETWEEN 1 AND 10000),
  max_review_age_seconds bigint NOT NULL CHECK(max_review_age_seconds BETWEEN 1 AND 31536000),
  max_storage_bytes bigint NOT NULL CHECK(max_storage_bytes BETWEEN 1048576 AND 1073741824));
INSERT INTO custody_export.limits VALUES(true,100,131072,25,86400,10485760);
CREATE FUNCTION custody_export.pressure() RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path=pg_catalog,custody_export,pg_temp AS $$
  SELECT jsonb_build_object('pendingCount',count(*) FILTER(WHERE status='PENDING'),
    'unacknowledgedCount',count(*) FILTER(WHERE status<>'ACKED'),
    'pendingBytes',COALESCE(sum(pg_column_size(event)) FILTER(WHERE status<>'ACKED'),0),
    'reviewCount',count(*) FILTER(WHERE status='REVIEW'),
    'reviewAgeSeconds',COALESCE(max(GREATEST(0,extract(epoch FROM ((SELECT now_at FROM broker9d.control)-(event->>'observed')::timestamptz)))) FILTER(WHERE status='REVIEW'),0),
    'storageBytes',pg_total_relation_size('custody_export.events'::regclass),'retainedCount',count(*))
  FROM custody_export.events
$$;
CREATE FUNCTION custody_export.admit_analysis() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,custody_export,pg_temp AS $$
DECLARE limits custody_export.limits; pressure jsonb;
BEGIN
  -- Original broker admission already holds its control lock. Gate new analysis only.
  -- Existing response/usage persistence and operator STOP are never vetoed here.
  SELECT * INTO STRICT limits FROM custody_export.limits FOR SHARE;
  SELECT custody_export.pressure() INTO pressure;
  IF (pressure->>'unacknowledgedCount')::bigint>=limits.max_unacknowledged OR
    (pressure->>'pendingBytes')::bigint>=limits.max_payload_bytes OR
    (pressure->>'reviewCount')::bigint>=limits.max_review OR
    (pressure->>'reviewAgeSeconds')::numeric>=limits.max_review_age_seconds OR
    (pressure->>'storageBytes')::bigint>=limits.max_storage_bytes THEN
    RAISE EXCEPTION 'AUDIT_BACKPRESSURE' USING ERRCODE='54000';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION custody_export.ack(n bigint,h text,r jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,custody_export,pg_temp AS $$
DECLARE e custody_export.events;
BEGIN
  SELECT * INTO e FROM custody_export.events WHERE seq=n FOR UPDATE;
  -- Shape and immutable identity fencing do not claim SQL Ed25519 verification.
  IF e.seq IS NULL OR e.hash IS DISTINCT FROM h OR jsonb_typeof(r) IS DISTINCT FROM 'object' OR
    r-ARRAY['body','signature']<>'{}'::jsonb OR jsonb_typeof(r->'body') IS DISTINCT FROM 'object' OR
    (r->'body')-ARRAY['schema','custodian','source','sequence','hash','custodySequence','receipt','keyId','outcome']<>'{}'::jsonb OR
    r#>>'{body,schema}' IS DISTINCT FROM 'custody-receipt-v1' OR
    r#>>'{body,custodian}' IS DISTINCT FROM 'isolated-custody-v1' OR
    r#>>'{body,outcome}' IS DISTINCT FROM 'COMMITTED' OR
    r#>>'{body,source}' IS DISTINCT FROM e.event->>'source' OR
    r#>>'{body,sequence}' IS DISTINCT FROM n::text OR r#>>'{body,hash}' IS DISTINCT FROM h OR
    COALESCE(r#>>'{body,custodySequence}','')!~'^[1-9][0-9]{0,14}$' OR
    COALESCE(r#>>'{body,receipt}','')!~'^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$' OR
    COALESCE(r->>'signature','')!~'^[A-Za-z0-9+/]{86}==$' OR
    NOT EXISTS(SELECT 1 FROM custody_export.keys WHERE key_id=r#>>'{body,keyId}' AND status IN('ACTIVE','RETIRED')) THEN RETURN false; END IF;
  UPDATE custody_export.events SET status='ACKED',receipt=r WHERE seq=n AND (receipt IS NULL OR receipt=r);
  RETURN FOUND;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA custody_export FROM PUBLIC;
RESET ROLE;
CREATE TRIGGER custody_analysis_reservation BEFORE INSERT ON broker9d.attempts FOR EACH ROW EXECUTE FUNCTION custody_export.admit_analysis();
-- Registration also creates retained audit history. Closing only reservation
-- left an unbounded registration path during a custodian outage.
CREATE TRIGGER custody_analysis_registration BEFORE INSERT ON broker9d.requests FOR EACH ROW EXECUTE FUNCTION custody_export.admit_analysis();
CREATE TRIGGER custody_analysis_dispatch BEFORE UPDATE OF status ON broker9d.requests FOR EACH ROW
  WHEN(NEW.status='DISPATCH_ADMITTED' AND OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION custody_export.admit_analysis();
CREATE TRIGGER custody_analysis_send BEFORE UPDATE OF send_at ON broker9d.attempts FOR EACH ROW
  WHEN(OLD.send_at IS NULL AND NEW.send_at IS NOT NULL) EXECUTE FUNCTION custody_export.admit_analysis();
GRANT USAGE ON SCHEMA custody_export,broker9d TO custody_source_inspector;
GRANT SELECT ON custody_export.events,custody_export.keys,broker9d.events TO custody_source_inspector;
GRANT SELECT(source,seq,head,max_pending) ON custody_export.control TO custody_source_inspector;
GRANT EXECUTE ON FUNCTION custody_export.pressure() TO custody_source_inspector,custody_operator;
