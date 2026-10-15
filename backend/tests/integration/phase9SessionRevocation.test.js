import test from 'node:test'
import assert from 'node:assert/strict'
import { incidentWithReplacement } from '../helpers/phase9ReviewHttpFixture.js'

test('disposable PostGIS: customer, captain and admin exact-token revocation prevents real writes', async t => {
  const { harness, incident } = await incidentWithReplacement(t)
  const { phase9FinancialSnapshot } = await import('../helpers/phase9Lifecycle.js')
  const paths = {
    customer: { read: '/api/users/me', write: '/api/users/me/updateGender', method: 'POST', body: { gender: 'Female' } },
    captain: { read: '/api/driver/me/wallet', write: '/api/driver/online', method: 'PATCH', body: { isOnline: true } },
    admin: { read: '/api/admin/responsibility/cases/' + incident.id,
      write: '/api/admin/responsibility/cases/' + incident.id + '/review', method: 'POST', body: { decision: 'UPHOLD', reason: 'Must not execute' } },
  }
  for (const [actor, pathsForActor] of Object.entries(paths)) {
    await t.test(actor + ' active read then revoked read/write and unchanged persisted state', async () => {
      const jwt = harness.auth.token(harness.actors[actor], { exp: Math.floor(Date.now() / 1000) + 60 })
      const request = (path, method = 'GET', body) => fetch(harness.apiUrl + path, {
        method, headers: { authorization: 'Bearer ' + jwt, 'content-type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
      assert.equal((await request(pathsForActor.read)).status, 200)
      const before = { financial: await phase9FinancialSnapshot(harness.db),
        users: await harness.db.user.findMany({ orderBy: { id: 'asc' } }),
        drivers: await harness.db.driver.findMany({ orderBy: { id: 'asc' } }),
        incident: await harness.db.responsibilityCase.findUnique({ where: { id: incident.id } }) }
      harness.liveSessions.sessions.get('sess_' + harness.actors[actor].id).status = 'revoked'
      assert(JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url')).exp > Date.now() / 1000)
      const callCount = harness.liveSessions.calls.length
      assert.equal((await request(pathsForActor.read)).status, 401)
      assert.equal((await request(pathsForActor.write, pathsForActor.method, pathsForActor.body)).status, 401)
      assert.equal(harness.liveSessions.calls.length, callCount + 2)
      assert.deepEqual({ financial: await phase9FinancialSnapshot(harness.db),
        users: await harness.db.user.findMany({ orderBy: { id: 'asc' } }),
        drivers: await harness.db.driver.findMany({ orderBy: { id: 'asc' } }),
        incident: await harness.db.responsibilityCase.findUnique({ where: { id: incident.id } }) }, before)
    })
  }
  await t.test('active foreign customer is still forbidden from another customer booking', async () => {
    const before = await phase9FinancialSnapshot(harness.db)
    const jwt = harness.auth.token(harness.actors.foreign)
    const response = await fetch(harness.apiUrl + '/api/bookings/' + harness.lifecycle.bookingId + '/status', {
      headers: { authorization: 'Bearer ' + jwt },
    })
    assert.equal(response.status, 403)
    assert.deepEqual(await phase9FinancialSnapshot(harness.db), before)
  })
})
