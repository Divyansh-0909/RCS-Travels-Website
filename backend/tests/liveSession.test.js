import test from 'node:test'
import assert from 'node:assert/strict'
import { verifyLiveSession } from '../middleware/liveSession.js'

process.env.CLERK_PUBLISHABLE_KEY = `pk_test_${Buffer.from('local.clerk.accounts.dev$').toString('base64')}`
const identity = { userId: 'user_a', sessionId: 'sess_a', sessionClaims: { sub: 'user_a', sid: 'sess_a', iss: 'https://local.clerk.accounts.dev' } }
const active = { id: 'sess_a', userId: 'user_a', status: 'active' }

test('every identity component must match the verified session claims and configured issuer', async () => {
  for (const change of [ { userId: null }, { userId: ' ' }, { sessionId: undefined }, { sessionId: 'invalid' },
    { userId: ' ', sessionClaims: { ...identity.sessionClaims, sub: ' ' } },
    { sessionId: 'invalid', sessionClaims: { ...identity.sessionClaims, sid: 'invalid' } },
    { sessionClaims: null }, { sessionClaims: { ...identity.sessionClaims, sub: 'user_b' } },
    { sessionClaims: { ...identity.sessionClaims, sid: 'sess_b' } },
    { sessionClaims: { ...identity.sessionClaims, iss: 'https://foreign.clerk.accounts.dev' } } ]) {
    assert.equal(await verifyLiveSession({ ...identity, ...change }, () => assert.fail('invalid identity queried provider')), 'invalid')
  }
  const key = process.env.CLERK_PUBLISHABLE_KEY
  delete process.env.CLERK_PUBLISHABLE_KEY
  assert.equal(await verifyLiveSession(identity, () => assert.fail()), 'invalid')
  process.env.CLERK_PUBLISHABLE_KEY = key
})

test('only an active session with both matching identifiers is accepted', async () => {
  assert.equal(await verifyLiveSession(identity, async () => active), 'active')
  for (const status of ['revoked', 'ended', 'expired', 'removed', 'replaced', 'pending', 'abandoned', undefined]) {
    assert.equal(await verifyLiveSession(identity, async () => ({ ...active, status })), 'invalid')
  }
  for (const session of [null, { ...active, id: 'sess_b' }, { ...active, userId: 'user_b' }]) {
    assert.equal(await verifyLiveSession(identity, async () => session), 'invalid')
  }
})

test('404 is invalid; timeout, rate limits, network, server and credential failures are unavailable', async () => {
  for (const status of [404, 429, 500, 503, 401, undefined]) {
    assert.equal(await verifyLiveSession(identity, () => { throw Object.assign(new Error('private provider detail'), { status }) }),
      status === 404 ? 'invalid' : 'unavailable')
  }
  assert.equal(await verifyLiveSession(identity, () => Promise.reject(null)), 'unavailable')
  assert.equal(await verifyLiveSession(identity, () => Promise.reject(undefined)), 'unavailable')
  let release
  assert.equal(await verifyLiveSession(identity, () => new Promise(done => { release = done }), 5), 'unavailable')
  release(active)
  await new Promise(done => setImmediate(done))
  assert.equal(await verifyLiveSession(identity, async () => active), 'active')
})

test('concurrent requests each query provider, stalled work is bounded and released after settlement', async () => {
  const releases = []
  const requests = Array.from({ length: 100 }, () => verifyLiveSession(identity, () => new Promise(done => releases.push(done)), 10))
  let excessCalls = 0
  assert.equal(await verifyLiveSession(identity, () => { excessCalls++; throw new Error('capacity exceeded') }), 'unavailable')
  assert.equal(excessCalls, 0)
  assert.deepEqual(await Promise.all(requests), Array(100).fill('unavailable'))
  assert.equal(releases.length, 100)
  releases.forEach(done => done(active))
  await new Promise(done => setImmediate(done))
  assert.equal(await verifyLiveSession(identity, async () => active), 'active')
})

test('successful and failed SDK settlements cancel their deadline timers', async t => {
  const timers = []
  t.mock.method(globalThis, 'setTimeout', (_callback, delay) => { const timer = { delay }; timers.push(timer); return timer })
  const clear = t.mock.method(globalThis, 'clearTimeout', () => {})
  assert.equal(await verifyLiveSession(identity, async () => active), 'active')
  assert.equal(await verifyLiveSession(identity, async () => { throw new Error('network') }), 'unavailable')
  assert.equal(timers[0].delay, 2500)
  assert.equal(clear.mock.calls.length, 2)
  assert.deepEqual(clear.mock.calls.map(call => call.arguments[0]), timers)
})
