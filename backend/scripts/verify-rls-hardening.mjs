// Run only against a disposable local database. Never loads the project's .env.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import pg from 'pg'

const url = new URL(process.env.SECURITY_TEST_DATABASE_URL)
assert(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Local database required')
assert.equal(url.pathname, '/rcs_security_test', 'Disposable test database required')
const client = new pg.Client({ connectionString: url.toString() })
await client.connect()
try {
  await client.query('BEGIN')
  await client.query('CREATE ROLE anon; CREATE ROLE authenticated')
  const schema = await readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8')
  const tables = [...schema.matchAll(/@@map\("([a-z_]+)"\)/g)].map(match => match[1])
  for (const name of tables) await client.query(`CREATE TABLE public."${name}" (id text)`)
  for (const migration of ['20260726033438_revoke_data_api_roles', '20260913120000_complete_backend_table_rls']) {
    await client.query(await readFile(new URL(`../prisma/migrations/${migration}/migration.sql`, import.meta.url), 'utf8'))
  }
  const { rows } = await client.query(`SELECT relname, relrowsecurity FROM pg_class
    WHERE relnamespace='public'::regnamespace AND relkind='r'`)
  assert.equal(rows.length, tables.length)
  assert(rows.every(row => row.relrowsecurity), 'Every application table must have RLS')
  // The trusted owner must retain its existing access.
  for (const name of tables) await client.query(`INSERT INTO public."${name}" VALUES ('synthetic-test')`)
  for (const role of ['anon', 'authenticated']) {
    const { rows: grants } = await client.query(`SELECT relname FROM pg_class
      WHERE relnamespace='public'::regnamespace AND relkind='r'
      AND has_table_privilege($1, oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')`, [role])
    assert.equal(grants.length, 0, `${role} must have no table grants`)
    // Simulate accidental future SELECT/INSERT/UPDATE/DELETE grants. RLS must
    // still hide the owner's rows and reject client inserts.
    await client.query('SAVEPOINT accidental_grants')
    await client.query(`GRANT USAGE ON SCHEMA public TO ${role}; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${role}`)
    await client.query(`SET LOCAL ROLE ${role}`)
    for (const name of tables) {
      assert.equal((await client.query(`SELECT * FROM public."${name}"`)).rowCount, 0)
      assert.equal((await client.query(`UPDATE public."${name}" SET id='changed'`)).rowCount, 0)
      assert.equal((await client.query(`DELETE FROM public."${name}"`)).rowCount, 0)
      await client.query('SAVEPOINT denied_insert')
      await assert.rejects(client.query(`INSERT INTO public."${name}" VALUES ('blocked')`), { code: '42501' })
      await client.query('ROLLBACK TO SAVEPOINT denied_insert')
    }
    await client.query('RESET ROLE; ROLLBACK TO SAVEPOINT accidental_grants')
  }
  console.log(`Verified RLS and revoked grants for ${tables.length} application tables; both client roles denied, backend owner allowed.`)
} finally {
  await client.query('ROLLBACK')
  await client.end()
}
