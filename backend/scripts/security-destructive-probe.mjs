// Destructive SQL attempts against disposable synthetic tables only.
// Does not read .env; cannot target a remote host or an ordinary app database.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import pg from 'pg'

const url = new URL(process.env.SECURITY_TEST_DATABASE_URL)
assert.equal(url.hostname, '127.0.0.1', 'Only explicit IPv4 loopback is allowed')
assert.equal(url.pathname, '/rcs_security_test', 'Only the disposable security database is allowed')
assert.equal(url.search, '', 'Connection override parameters are not allowed')
const owner = new pg.Client({ connectionString: url.toString(), connectionTimeoutMillis: 3000 })
await owner.connect()
const attackers = []
let attempts = 0
try {
  // Require an empty database, so this cannot replace an existing test fixture.
  const existing = await owner.query("SELECT count(*)::int AS count FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN ('r','p')")
  assert.equal(existing.rows[0].count, 0, 'Disposable database must be empty')
  await owner.query('CREATE ROLE anon LOGIN; CREATE ROLE authenticated LOGIN')
  const schema = await readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8')
  const tables = [...schema.matchAll(/@@map\("([a-z_]+)"\)/g)].map(match => match[1])
  for (const name of tables) {
    await owner.query(`CREATE TABLE public."${name}" (id text)`)
    await owner.query(`INSERT INTO public."${name}" VALUES ('synthetic-sentinel')`)
  }
  for (const migration of ['20260726033438_revoke_data_api_roles', '20260913120000_complete_backend_table_rls']) {
    await owner.query(await readFile(new URL(`../prisma/migrations/${migration}/migration.sql`, import.meta.url), 'utf8'))
  }
  for (const role of ['anon', 'authenticated']) {
    const attackerUrl = new URL(url)
    attackerUrl.username = role
    attackerUrl.password = ''
    const attacker = new pg.Client({ connectionString: attackerUrl.toString(), connectionTimeoutMillis: 3000 })
    attackers.push(attacker)
    await attacker.connect()
    await attacker.query("SET statement_timeout='3s'")
    for (const name of tables) {
      for (const sql of [`DELETE FROM public."${name}"`, `UPDATE public."${name}" SET id='corrupted'`,
        `TRUNCATE TABLE public."${name}"`, `DROP TABLE public."${name}"`]) {
        attempts++
        await assert.rejects(attacker.query(sql), { code: '42501' })
      }
    }
    for (const sql of ['SET ROLE postgres', `ALTER ROLE ${role} SUPERUSER`]) {
      attempts++
      await assert.rejects(attacker.query(sql), { code: '42501' })
    }
  }
  for (const name of tables) {
    assert.deepEqual((await owner.query(`SELECT id FROM public."${name}"`)).rows, [{ id: 'synthetic-sentinel' }])
  }
  console.log(JSON.stringify({ scope: 'disposable-loopback-postgres', tables: tables.length,
    destructiveAndEscalationAttempts: attempts, blocked: attempts, sentinelsIntact: true, pass: true }))
} finally {
  await Promise.allSettled(attackers.map(client => client.end()))
  await owner.end()
}
