import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { clerkClient } from '@clerk/express'
import { fileURLToPath } from 'node:url'
import { createBrowserAuth, browserPublishableKey } from './helpers/phase9BrowserAuth.js'
import { installLiveSessionFake } from './helpers/liveSessionFake.js'

process.env.DOTENV_CONFIG_PATH = fileURLToPath(new URL('../../tools/dev/empty.env', import.meta.url))
process.env.NODE_ENV = 'test'
process.env.CLERK_SECRET_KEY = 'sk_test_session_fixture_only'
process.env.CLERK_PUBLISHABLE_KEY = browserPublishableKey
process.env.OPENAI_API_KEY = 'session-fixture-only'
process.env.RAZORPAY_KEY_ID = 'rzp_test_session_fixture'
process.env.RAZORPAY_KEY_SECRET = 'session-fixture-only'
delete process.env.DATABASE_URL
delete process.env.DIRECT_URL

let reads = 0, writes = 0
const stored = { gender: 'unset' }
globalThis.prisma = {
  user: { findUnique: async () => { reads++; return { id: 'customer', ...stored } },
    update: async ({ data }) => { writes++; Object.assign(stored, data); return stored } },
}
const { protect, protectAdmin, protectCoupon, createHumanClerkAuth } = await import('../middleware/auth.js')
const { default: users } = await import('../routes/users.js')
const { default: bookings } = await import('../routes/bookings.js')
const { default: driver } = await import('../routes/driver.ts')
const { default: admin } = await import('../routes/admin.ts')
const { default: responsibility } = await import('../routes/responsibilityAdmin.ts')
const { default: payments } = await import('../routes/payments.js')

const actors = Object.fromEntries(['customer', 'captain', 'admin'].map(role => [role, { id: role, clerkId: 'user_' + role, role }]))
const auth = createBrowserAuth(actors)

test('registered human routes use the shared guard and every admin route also checks role', () => {
  for (const [router, needsAdmin] of [[users, false], [bookings, false], [driver, false], [admin, true], [responsibility, true], [payments, false]]) {
    for (const layer of router.stack.filter(item => item.route)) {
      assert(layer.route.stack.some(item => item.handle === protect), layer.route.path)
      if (needsAdmin) assert(layer.route.stack.some(item => item.handle === protectAdmin), layer.route.path)
    }
  }
})

test('real signature verification, all actors, unchanged state after exact-token revocation and fail-closed outages', async t => {
  const fake = installLiveSessionFake(actors)
  t.after(() => fake.restore())
  const app = express()
  app.use(express.json())
  app.get('/unavailable', createHumanClerkAuth({ publishableKey: 'invalid-key' }), (_req, res) => res.json({ unexpected: true }))
  app.use(createHumanClerkAuth({ publishableKey: browserPublishableKey, jwtKey: auth.jwtKey,
    authorizedParties: ['https://allowed.example'], audience: 'rcs' }))
  app.use('/api/users', protect, users)
  app.post('/actor-action', protect, (_req, res) => { writes++; res.json({ ok: true }) })
  app.get('/admin', protectAdmin, (_req, res) => res.json({ ok: true }))
  app.post('/coupon', protectCoupon, (_req, res) => res.json({ ok: true }))
  app.get('/public', (_req, res) => res.json({ ok: true }))
  const server = await new Promise(done => { const listener = app.listen(0, '127.0.0.1', () => done(listener)) })
  t.after(() => { server.closeAllConnections(); return new Promise(done => server.close(done)) })
  const base = 'http://127.0.0.1:' + server.address().port
  const request = (path, jwt, body) => fetch(base + path, { method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', ...(jwt ? { authorization: 'Bearer ' + jwt } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) })
  const make = (actor, overrides) => auth.token(actors[actor], { exp: Math.floor(Date.now() / 1000) + 60, aud: 'rcs', azp: 'https://allowed.example', ...overrides })
  await t.test('SDK verification configuration failure is a controlled unavailable response', async () => {
    const response = await request('/unavailable', make('customer'))
    assert.equal(response.status, 503)
    assert.equal(response.headers.get('retry-after'), '1')
    assert.deepEqual(await response.json(), { error: 'Authentication temporarily unavailable. Please retry.', code: 'AUTH_UNAVAILABLE' })
  })
  for (const actor of Object.keys(actors)) {
    await t.test(actor + ' exact 60-second JWT fails immediately after confirmed revocation', async () => {
      const jwt = make(actor)
      const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url'))
      assert.equal((await request('/actor-action', jwt, {})).status, 200)
      const before = { stored: { ...stored }, writes, reads }
      fake.sessions.get('sess_' + actor).status = 'revoked'
      assert(payload.exp > Date.now() / 1000)
      assert.equal((await request('/actor-action', jwt, {})).status, 401)
      assert.deepEqual({ stored, writes, reads }, before)
      fake.sessions.get('sess_' + actor).status = 'active'
    })
  }
  await t.test('actual customer handler writes once; revoked duplicate cannot write', async () => {
    const jwt = make('customer')
    assert.equal((await request('/api/users/me/updateGender', jwt, { gender: 'test' })).status, 200)
    const before = writes
    fake.sessions.get('sess_customer').status = 'ended'
    assert.equal((await request('/api/users/me/updateGender', jwt, { gender: 'changed' })).status, 401)
    assert.equal(writes, before)
    assert.equal(stored.gender, 'test')
    fake.sessions.get('sess_customer').status = 'active'
  })
  await t.test('invalid signature, expiry, issuer, audience, party and missing session fail before provider', async () => {
    const jwt = make('customer')
    for (const invalid of [jwt.slice(0, -12) + 'tampered', 'malformed',
      make('customer', { exp: 1 }), make('customer', { iss: 'https://foreign.clerk.accounts.dev' }),
      make('customer', { aud: 'foreign' }), make('customer', { azp: 'https://evil.example' }), make('customer', { sid: undefined })]) {
      const count = fake.calls.length
      const response = await request('/actor-action', invalid, {})
      assert.equal(response.status, 401, JSON.stringify(await response.json()))
      assert.equal(fake.calls.length, count)
    }
  })
  await t.test('role denial and anonymous/public fare distinction; duplicate guards share one request check', async () => {
    assert.equal((await request('/admin', make('customer'))).status, 403)
    assert.equal((await request('/admin', make('admin'))).status, 200)
    assert.equal((await request('/admin')).status, 401)
    assert.equal((await request('/coupon', undefined, {})).status, 200)
    assert.equal((await request('/coupon', undefined, { couponId: 'private' })).status, 401)
    assert.equal((await request('/coupon', make('customer'), { couponId: 'private' })).status, 200)
    const before = fake.calls.length
    assert.equal((await request('/api/users/me', make('customer'))).status, 200)
    assert.equal(fake.calls.length, before + 1)
    assert.equal((await request('/public')).status, 200)
  })
  await t.test('provider 404/mismatch/inactive are 401; 429/5xx/network/timeout are 503 without leakage', async () => {
    const original = clerkClient.sessions.getSession
    try {
      for (const result of [null, { id: 'sess_customer', userId: 'foreign', status: 'active' },
        { id: 'other', userId: 'user_customer', status: 'active' },
        ...['ended', 'expired', 'replaced', 'pending', 'removed'].map(status => ({ id: 'sess_customer', userId: 'user_customer', status }))]) {
        clerkClient.sessions.getSession = async () => result
        assert.equal((await request('/actor-action', make('customer'), {})).status, 401)
      }
      for (const status of [404, 429, 500, undefined]) {
        clerkClient.sessions.getSession = async () => { throw Object.assign(new Error('secret-provider-detail'), { status }) }
        const response = await request('/actor-action', make('customer'), {})
        assert.equal(response.status, status === 404 ? 401 : 503)
        assert(!JSON.stringify(await response.json()).includes('secret-provider-detail'))
      }
      let release
      clerkClient.sessions.getSession = () => new Promise(done => { release = done })
      const started = Date.now()
      const response = await request('/actor-action', make('customer'), {})
      assert.equal(response.status, 503)
      assert.equal(response.headers.get('retry-after'), '1')
      assert(Date.now() - started < 4000)
      release({ id: 'sess_customer', userId: 'user_customer', status: 'active' })
    } finally { clerkClient.sessions.getSession = original }
  })
  await t.test('concurrent requests each check; replacement/new session works while old session stays ended', async () => {
    const jwt = make('captain')
    const count = fake.calls.length
    assert.deepEqual((await Promise.all(Array.from({ length: 10 }, () => request('/actor-action', jwt, {})))).map(row => row.status), Array(10).fill(200))
    assert.equal(fake.calls.length, count + 10)
    fake.sessions.get('sess_captain').status = 'replaced'
    fake.sessions.set('sess_new', { id: 'sess_new', userId: actors.captain.clerkId, status: 'active' })
    assert.equal((await request('/actor-action', jwt, {})).status, 401)
    assert.equal((await request('/actor-action', make('captain', { sid: 'sess_new' }), {})).status, 200)
  })
})
