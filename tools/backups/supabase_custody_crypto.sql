-- Test bootstrap only, after custody-store.sql in an explicitly owned empty project.
-- Delegate to the provider's existing pgcrypto; never relocate or replace it.
GRANT USAGE ON SCHEMA extensions TO custody_owner;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_extension e
    JOIN pg_catalog.pg_namespace n ON n.oid=e.extnamespace
    JOIN pg_catalog.pg_depend d ON d.refobjid=e.oid AND d.deptype='e'
    WHERE e.extname='pgcrypto' AND n.nspname='extensions'
      AND d.classid='pg_catalog.pg_proc'::pg_catalog.regclass
      AND d.objid='extensions.hmac(text,text,text)'::pg_catalog.regprocedure
  ) THEN RAISE EXCEPTION 'EXPECTED_PROVIDER_PGCRYPTO_REQUIRED'; END IF;
  IF NOT pg_catalog.has_schema_privilege('custody_owner','extensions','USAGE') OR
     NOT pg_catalog.has_function_privilege('custody_owner','extensions.hmac(text,text,text)','EXECUTE')
  THEN RAISE EXCEPTION 'PROVIDER_CRYPTO_ACCESS_NOT_AVAILABLE'; END IF;
END $$;
SET ROLE custody_owner;
CREATE FUNCTION custody.hmac(message text,secret text,algorithm text) RETURNS bytea
LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog,extensions,pg_temp
AS $$ SELECT extensions.hmac(message,secret,algorithm) $$;
REVOKE ALL ON FUNCTION custody.hmac(text,text,text) FROM PUBLIC;
RESET ROLE;
