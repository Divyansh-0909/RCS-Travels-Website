import test from 'node:test'
import assert from 'node:assert/strict'
import { createTestDatabase, raceTransactions, withRollback } from '../helpers/database.js'

// npm run test:db must fail, not silently skip, when the test database is absent.
test('PostgreSQL harness: independent databases, rollback, real competing transactions and uniqueness', async t => {
  const first = await createTestDatabase({ migrations: false })
  t.after(() => first.close())
  const second = await createTestDatabase({ migrations: false })
  t.after(() => second.close())
  for (const database of [first, second]) {
    await database.client.$executeRawUnsafe('CREATE TABLE harness_probe (id integer PRIMARY KEY, owner text)')
  }
  await first.client.$executeRawUnsafe('INSERT INTO harness_probe (id) VALUES (1)')
  assert.deepEqual(await second.client.$queryRawUnsafe('SELECT * FROM harness_probe'), [])
  await withRollback(first.client, tx => tx.$executeRawUnsafe("INSERT INTO harness_probe VALUES (2, 'rolled-back')"))
  assert.equal((await first.client.$queryRawUnsafe('SELECT * FROM harness_probe')).length, 1)
  const pids = new Set()
  const results = await raceTransactions(first, ['driver-a', 'driver-b'].map(owner => async (tx, wait) => {
    const [{ pid }] = await tx.$queryRaw`SELECT pg_backend_pid() AS pid`
    pids.add(pid)
    await wait()
    return tx.$executeRaw`UPDATE harness_probe SET owner = ${owner} WHERE id = 1 AND owner IS NULL`
  }))
  assert.equal(pids.size, 2, 'workers use different database sessions')
  assert.ok(results.every(result => result.status === 'fulfilled'))
  assert.equal(results.reduce((sum, result) => sum + result.value, 0), 1)
  assert.ok(['driver-a', 'driver-b'].includes((await first.client.$queryRawUnsafe('SELECT owner FROM harness_probe WHERE id = 1'))[0].owner))
  const inserts = await raceTransactions(first, [0, 1].map(() => async (tx, wait) => {
    await wait()
    return tx.$executeRawUnsafe('INSERT INTO harness_probe (id) VALUES (3)')
  }))
  assert.equal(inserts.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(inserts.filter(result => result.status === 'rejected').length, 1)
  assert.equal((await first.client.$queryRawUnsafe('SELECT * FROM harness_probe WHERE id = 3')).length, 1)
})
