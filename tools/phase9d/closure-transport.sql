-- Optional disposable custody adapter; preserve accepted transport source bytes.
-- A rejected attempt against a committed binding had no durable journal entry.
SET ROLE shadow9d_owner;
ALTER FUNCTION transport9d.receive(jsonb) RENAME TO receive_committed;
REVOKE EXECUTE ON FUNCTION transport9d.receive_committed(jsonb) FROM PUBLIC,shadow9d_capture;
CREATE FUNCTION transport9d.receive(payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,transport9d,pg_temp AS $$
DECLARE result jsonb; r transport9d.receipts; attempted text;
BEGIN
  result=transport9d.receive_committed(payload);
  IF result IS NULL AND jsonb_typeof(payload)='object' AND octet_length(payload::text)<=65536 AND COALESCE(payload->>'key','')~'^[a-f0-9]{64}$' THEN
    SELECT * INTO r FROM transport9d.receipts WHERE logical_key=payload->>'key';
    attempted=encode(sha256(convert_to(payload::text,'UTF8')),'hex');
    IF r.logical_key IS NOT NULL AND r.payload_binding<>attempted THEN
      PERFORM audit9d.append('TRANSPORT_BINDING_REJECTED',r.work_id,
        jsonb_build_object('existingBinding',r.payload_binding,'attemptedBinding',attempted,'classification','REJECTED_EXISTING_KEY'));
    END IF;
  END IF;
  RETURN result;
END $$;
REVOKE EXECUTE ON FUNCTION transport9d.receive(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION transport9d.receive(jsonb) TO shadow9d_capture;
RESET ROLE;
