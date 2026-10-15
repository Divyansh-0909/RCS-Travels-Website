-- Optional isolated custody extension. Install after custody-store.sql only.
CREATE ROLE custody_signer LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
SET ROLE custody_owner;
CREATE TABLE custody.keys(key_id text PRIMARY KEY CHECK(key_id~'^[a-f0-9]{64}$'),public_key text NOT NULL,
  epoch bigint UNIQUE NOT NULL CHECK(epoch>0),status text NOT NULL CHECK(status IN('ACTIVE','RETIRED','COMPROMISED')));
CREATE UNIQUE INDEX custody_one_active_key ON custody.keys(status) WHERE status='ACTIVE';
CREATE TABLE custody.signatures(receipt uuid PRIMARY KEY REFERENCES custody.events(receipt),signature text NOT NULL CHECK(signature~'^[A-Za-z0-9+/]{86}==$'));
CREATE TABLE custody.key_operations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),previous_key text NOT NULL,next_key text NOT NULL,epoch bigint NOT NULL UNIQUE,at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE FUNCTION custody.rotate(next_id text,public_material text,expected_epoch bigint) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,custody,pg_temp AS $$
DECLARE current_key custody.keys;
BEGIN
  SELECT * INTO current_key FROM custody.keys ORDER BY epoch DESC LIMIT 1 FOR UPDATE;
  IF current_key.epoch IS DISTINCT FROM expected_epoch OR current_key.status NOT IN('ACTIVE','COMPROMISED') OR
    next_id=current_key.key_id OR EXISTS(SELECT 1 FROM custody.keys WHERE key_id=next_id) OR
    public_material IS NULL OR length(public_material)>1024 OR public_material NOT LIKE '-----BEGIN PUBLIC KEY-----%-----END PUBLIC KEY-----%' THEN RETURN false; END IF;
  -- Bind the identifier to the actual SPKI bytes, including direct owner routine calls.
  IF next_id<>encode(sha256(decode(replace(replace(public_material,'-----BEGIN PUBLIC KEY-----',''),'-----END PUBLIC KEY-----',''),'base64')),'hex') THEN RETURN false; END IF;
  -- Never retire a signer before every already-committed receipt has its durable signature.
  IF current_key.status='ACTIVE' AND EXISTS(SELECT 1 FROM custody.events e LEFT JOIN custody.signatures s ON s.receipt=e.receipt WHERE e.key_id=current_key.key_id AND s.receipt IS NULL) THEN RETURN false; END IF;
  UPDATE custody.keys SET status='RETIRED' WHERE key_id=current_key.key_id AND status='ACTIVE';
  INSERT INTO custody.keys VALUES(next_id,public_material,expected_epoch+1,'ACTIVE');
  INSERT INTO custody.key_operations(previous_key,next_key,epoch) VALUES(current_key.key_id,next_id,expected_epoch+1);
  RETURN true;
END $$;
CREATE FUNCTION custody.active_key() RETURNS text LANGUAGE sql SECURITY DEFINER
SET search_path=pg_catalog,custody,pg_temp AS $$ SELECT key_id FROM custody.keys WHERE status='ACTIVE' $$;
CREATE OR REPLACE FUNCTION custody.accept(e jsonb,h text,k text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,custody,pg_temp AS $$
DECLARE s custody.sources; r custody.events;
BEGIN
  SELECT * INTO s FROM custody.sources WHERE source=(e->>'source')::uuid FOR UPDATE;
  IF s.source IS NULL THEN RAISE EXCEPTION 'SOURCE_DENIED' USING ERRCODE='42501'; END IF;
  SELECT * INTO r FROM custody.events WHERE source=s.source AND seq=(e->>'sequence')::bigint;
  IF r.seq IS NOT NULL THEN
    IF r.hash<>h OR r.event<>e THEN RAISE EXCEPTION 'CONFLICT' USING ERRCODE='23514'; END IF;
  ELSE
    -- Serialize key selection with rotation. Ingress cannot choose an unknown or retired key.
    PERFORM 1 FROM custody.keys WHERE key_id=k AND status='ACTIVE' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'KEY_EPOCH_CHANGED' USING ERRCODE='23514'; END IF;
    IF (e->>'sequence')::bigint<>s.seq+1 OR e->>'previous'<>s.head THEN RAISE EXCEPTION 'GAP' USING ERRCODE='23514'; END IF;
    INSERT INTO custody.events(source,seq,hash,event,key_id) VALUES(s.source,s.seq+1,h,e,k) RETURNING * INTO r;
    UPDATE custody.sources SET seq=r.seq,head=h WHERE source=s.source;
  END IF;
  RETURN jsonb_build_object('schema','custody-receipt-v1','custodian','isolated-custody-v1','source',r.source::text,
    'sequence',r.seq::text,'hash',r.hash,'custodySequence',r.custody_seq::text,'receipt',r.receipt::text,'keyId',r.key_id,'outcome','COMMITTED');
END $$;
CREATE FUNCTION custody.signable(id uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path=pg_catalog,custody,pg_temp AS $$
  SELECT jsonb_build_object('body',jsonb_build_object('schema','custody-receipt-v1','custodian','isolated-custody-v1','source',e.source::text,
    'sequence',e.seq::text,'hash',e.hash,'custodySequence',e.custody_seq::text,'receipt',e.receipt::text,'keyId',e.key_id,'outcome','COMMITTED'),
    'signature',s.signature,'signerStatus',k.status) FROM custody.events e JOIN custody.keys k ON k.key_id=e.key_id LEFT JOIN custody.signatures s ON s.receipt=e.receipt WHERE e.receipt=id
$$;
CREATE FUNCTION custody.store_signature(id uuid,sig text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,custody,pg_temp AS $$
DECLARE stored text;
BEGIN
  PERFORM 1 FROM custody.events WHERE receipt=id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'UNCOMMITTED_RECEIPT' USING ERRCODE='23514'; END IF;
  INSERT INTO custody.signatures VALUES(id,sig) ON CONFLICT(receipt) DO NOTHING;
  SELECT signature INTO stored FROM custody.signatures WHERE receipt=id;
  IF stored<>sig THEN RAISE EXCEPTION 'SIGNATURE_CONFLICT' USING ERRCODE='23514'; END IF;
  RETURN stored;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA custody FROM PUBLIC;
RESET ROLE;
GRANT USAGE ON SCHEMA custody TO custody_signer;
GRANT EXECUTE ON FUNCTION custody.signable(uuid),custody.store_signature(uuid,text) TO custody_signer;
GRANT EXECUTE ON FUNCTION custody.active_key() TO custody_ingest;
GRANT SELECT ON custody.keys,custody.signatures,custody.key_operations TO custody_inspector;
