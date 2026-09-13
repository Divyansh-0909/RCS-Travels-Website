// Metadata only: never selects application rows or prints connection credentials.
import 'dotenv/config'
import pg from 'pg'
import { secureDatabaseUrl } from '../db/connection.js'

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL is required')
let client
try {
  client = new pg.Client({ connectionString: secureDatabaseUrl(connectionString), connectionTimeoutMillis: 10000,
    application_name: 'rcs-security-metadata-audit' })
  const hostname = new URL(connectionString).hostname
  const provider = hostname.includes('supabase.') ? 'supabase'
    : hostname.endsWith('.neon.tech') ? 'neon' : 'other'
  await client.connect()
  const clientTransport = { tls: client.connection.stream.encrypted === true,
    certificateVerified: client.connection.stream.authorized === true }
  await client.query('BEGIN READ ONLY')
  await client.query("SET LOCAL statement_timeout = '10s'")
  const { rows: identity } = await client.query(`SELECT rolsuper AS superuser,
    rolbypassrls AS bypass_rls, rolcreaterole AS create_roles, rolcreatedb AS create_databases
    FROM pg_roles WHERE rolname = current_user`)
  const { rows: transport } = await client.query('SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()')
  const { rows: relations } = await client.query(`
    SELECT c.relname AS name, c.relkind AS kind, c.relrowsecurity AS rls,
      c.relforcerowsecurity AS force_rls, pg_get_userbyid(c.relowner)=current_user AS owned_by_runtime,
      (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid = c.oid) AS policies,
      ARRAY(SELECT r.rolname::text FROM pg_roles r WHERE r.rolname IN ('anon','authenticated')
        AND has_schema_privilege(r.oid, n.oid, 'USAGE')
        AND (has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
          OR has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))) AS client_roles_with_access
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m') ORDER BY c.relname`)
  const { rows: functions } = await client.query(`
    SELECT p.proname AS name, p.prosecdef AS security_definer,
      ARRAY(SELECT r.rolname::text FROM pg_roles r WHERE r.rolname IN ('anon','authenticated')
        AND has_schema_privilege(r.oid,n.oid,'USAGE')
        AND has_function_privilege(r.oid,p.oid,'EXECUTE')) AS client_roles_with_access
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' ORDER BY p.proname`)
  const { rows: defaults } = await client.query(`
    SELECT pg_get_userbyid(d.defaclrole) AS creator_role,
      COALESCE(n.nspname,'(global)') AS schema, d.defaclobjtype AS object_type,
      COALESCE(r.rolname,'PUBLIC') AS grantee, a.privilege_type
    FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a LEFT JOIN pg_roles r ON r.oid=a.grantee
    WHERE (n.nspname='public' OR d.defaclnamespace=0)
      AND (a.grantee=0 OR r.rolname IN ('anon','authenticated'))`)
  await client.query('ROLLBACK')
  console.log(JSON.stringify({ provider, runtimeRole: identity[0], clientTransport,
    databaseHopTransport: transport[0], relations, functions, defaults }, null, 2))
} catch (error) {
  // Database errors can contain hostnames, credentials or query parameters.
  console.error(JSON.stringify({ audit: 'failed', code: error.code ?? 'CONNECTION_OR_QUERY_FAILED' }))
  process.exitCode = 1
} finally {
  await client?.end()
}
