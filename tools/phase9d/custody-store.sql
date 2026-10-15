-- Install on a separate, disposable PostgreSQL SERVER, never the receiver server.
CREATE ROLE custody_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
CREATE ROLE custody_ingest LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
CREATE ROLE custody_inspector LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
CREATE SCHEMA custody AUTHORIZATION custody_owner;
SET ROLE custody_owner;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
CREATE TABLE custody.sources(source uuid PRIMARY KEY,seq bigint NOT NULL DEFAULT 0,head text NOT NULL DEFAULT repeat('0',64));
CREATE TABLE custody.events(source uuid NOT NULL REFERENCES custody.sources,seq bigint NOT NULL,hash text NOT NULL,event jsonb NOT NULL,
  receipt uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),custody_seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  accepted timestamptz NOT NULL DEFAULT clock_timestamp(),key_id text NOT NULL,
  PRIMARY KEY(source,seq),UNIQUE(source,hash));
CREATE FUNCTION custody.accept(e jsonb,h text,k text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,custody,pg_temp AS $$
DECLARE s custody.sources; r custody.events;
BEGIN
  -- Authentication/closed protocol validation occurs in the independent ingress.
  SELECT * INTO s FROM custody.sources WHERE source=(e->>'source')::uuid FOR UPDATE;
  IF s.source IS NULL THEN RAISE EXCEPTION 'SOURCE_DENIED' USING ERRCODE='42501'; END IF;
  SELECT * INTO r FROM custody.events WHERE source=s.source AND seq=(e->>'sequence')::bigint;
  IF r.seq IS NOT NULL THEN
    IF r.hash<>h OR r.event<>e THEN RAISE EXCEPTION 'CONFLICT' USING ERRCODE='23514'; END IF;
  ELSE
    IF (e->>'sequence')::bigint<>s.seq+1 OR e->>'previous'<>s.head THEN RAISE EXCEPTION 'GAP' USING ERRCODE='23514'; END IF;
    INSERT INTO custody.events(source,seq,hash,event,key_id) VALUES(s.source,s.seq+1,h,e,k) RETURNING * INTO r;
    UPDATE custody.sources SET seq=r.seq,head=h WHERE source=s.source;
  END IF;
  RETURN jsonb_build_object('schema','custody-receipt-v1','custodian','isolated-custody-v1','source',r.source::text,
    'sequence',r.seq::text,'hash',r.hash,'custodySequence',r.custody_seq::text,'receipt',r.receipt::text,'keyId',r.key_id,'outcome','COMMITTED');
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA custody FROM PUBLIC;
RESET ROLE;
GRANT USAGE ON SCHEMA custody TO custody_ingest,custody_inspector;
GRANT EXECUTE ON FUNCTION custody.accept(jsonb,text,text) TO custody_ingest;
GRANT SELECT ON custody.sources,custody.events TO custody_inspector;
