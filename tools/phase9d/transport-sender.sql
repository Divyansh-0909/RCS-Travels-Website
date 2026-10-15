-- Optional separate-service adapter in the owned SOURCE database only.
-- The original outbox installer/path remains unchanged and independently usable.
SET ROLE shadow9d_owner;
CREATE TABLE outbox9d.transport_configuration (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  service_id uuid NOT NULL, receipt_key text NOT NULL CHECK(length(receipt_key)>=32)
);
CREATE TABLE outbox9d.remote_receipts (
  delivery_id bigint PRIMARY KEY REFERENCES outbox9d.deliveries(id), receipt jsonb NOT NULL
);
CREATE FUNCTION outbox9d.remote_payload(id bigint,token uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,outbox9d,pg_temp AS $$
DECLARE c shadow9d.control; d outbox9d.deliveries;
BEGIN
  SELECT * INTO c FROM shadow9d.control FOR UPDATE;
  SELECT * INTO d FROM outbox9d.deliveries WHERE deliveries.id=remote_payload.id FOR UPDATE;
  IF c.stopped OR d.id IS NULL OR d.status<>'PROCESSING' OR d.lease_owner<>session_user OR
    d.token IS DISTINCT FROM token OR d.epoch<>c.epoch OR d.lease_until<=c.now_at OR d.payload IS NULL OR
    outbox9d.binding(outbox9d.source(d.source_work_id)) IS DISTINCT FROM d.source_binding THEN RETURN NULL; END IF;
  RETURN d.payload;
END $$;
CREATE FUNCTION outbox9d.valid_remote_receipt(payload jsonb,receipt jsonb) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,outbox9d,pg_temp AS $$
  SELECT COALESCE(jsonb_typeof(receipt)='object' AND (receipt-ARRAY['body','mac'])='{}'::jsonb AND
    jsonb_typeof(receipt->'body')='object' AND
    ((receipt->'body')-ARRAY['schema','service','key','payloadBinding','receipt','workId','status'])='{}'::jsonb AND
    receipt#>>'{body,schema}'='shadow-receipt-v1' AND
    receipt#>>'{body,service}'=cfg.service_id::text AND receipt#>>'{body,key}'=payload->>'key' AND
    receipt#>>'{body,payloadBinding}'=outbox9d.binding(payload) AND
    receipt#>>'{body,receipt}' ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' AND
    receipt#>>'{body,workId}' ~ '^[1-9][0-9]{0,18}$' AND
    receipt#>>'{body,status}' IN ('PENDING','PROCESSING','RETRYABLE','COMPLETED','MANUAL_REVIEW') AND
    receipt->>'mac'=encode(outbox9d.hmac((receipt->'body')::text,cfg.receipt_key,'sha256'),'hex'),false)
  FROM outbox9d.transport_configuration cfg
$$;
CREATE FUNCTION outbox9d.remote_ack(id bigint,token uuid,receipt jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,outbox9d,pg_temp AS $$
DECLARE payload jsonb;
BEGIN
  -- This function holds locks only across local SQL. No HTTP call occurs here.
  payload=outbox9d.remote_payload(id,token);
  IF payload IS NULL OR outbox9d.valid_remote_receipt(payload,receipt) IS NOT TRUE THEN RETURN false; END IF;
  INSERT INTO outbox9d.remote_receipts(delivery_id,receipt) VALUES(id,receipt);
  UPDATE outbox9d.deliveries SET status='ACKED',lease_until=NULL WHERE deliveries.id=remote_ack.id;
  PERFORM audit9d.append('REMOTE_EXPORT_ACKED',NULL,jsonb_build_object('delivery',id,'binding',outbox9d.binding(payload)));
  RETURN true;
END $$;
CREATE FUNCTION outbox9d.remote_delete_payload(id bigint,receipt jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,outbox9d,pg_temp AS $$
DECLARE d outbox9d.deliveries; saved jsonb;
BEGIN
  SELECT * INTO d FROM outbox9d.deliveries WHERE deliveries.id=remote_delete_payload.id FOR UPDATE;
  SELECT r.receipt INTO saved FROM outbox9d.remote_receipts r WHERE delivery_id=id;
  IF d.id IS NULL OR d.status<>'ACKED' OR d.payload IS NULL OR
    outbox9d.valid_remote_receipt(d.payload,receipt) IS NOT TRUE OR
    receipt#>>'{body,status}' NOT IN ('COMPLETED','MANUAL_REVIEW') OR
    ((receipt->'body')-'status') IS DISTINCT FROM ((saved->'body')-'status') THEN RETURN false; END IF;
  UPDATE outbox9d.deliveries SET payload=NULL WHERE deliveries.id=remote_delete_payload.id;
  RETURN true;
END $$;
RESET ROLE;
REVOKE ALL ON ALL TABLES IN SCHEMA outbox9d FROM PUBLIC;
REVOKE ALL ON FUNCTION outbox9d.remote_payload(bigint,uuid),outbox9d.valid_remote_receipt(jsonb,jsonb),
  outbox9d.remote_ack(bigint,uuid,jsonb),outbox9d.remote_delete_payload(bigint,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION outbox9d.remote_payload(bigint,uuid),outbox9d.remote_ack(bigint,uuid,jsonb) TO shadow9d_exporter;
GRANT EXECUTE ON FUNCTION outbox9d.remote_delete_payload(bigint,jsonb) TO shadow9d_ops;
GRANT SELECT ON outbox9d.remote_receipts TO shadow9d_inspector;
-- Installing this optional path switches the exporter to HTTP; a fresh original
-- outbox fixture still uses the unchanged shared-database adapter.
REVOKE EXECUTE ON FUNCTION outbox9d.deliver(bigint,uuid) FROM shadow9d_exporter;
