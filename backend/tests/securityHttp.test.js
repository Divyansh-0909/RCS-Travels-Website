// Real HTTP + Clerk signature verification + production route handlers.
// All identities, signing keys and database rows are disposable local fixtures.
import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import express from 'express'
import http from 'node:http'
import https from 'node:https'
import { fileURLToPath } from 'node:url'
import { clerkMiddleware, clerkClient } from '@clerk/express'

process.env.DOTENV_CONFIG_PATH = fileURLToPath(new URL('../../tools/dev/empty.env', import.meta.url))
process.env.NODE_ENV = 'test'
process.env.RAZORPAY_KEY_ID = 'rzp_test_local_fixture'
process.env.RAZORPAY_KEY_SECRET = 'local-fixture-only'
process.env.RAZORPAY_WEBHOOK_SECRET = 'local-webhook-fixture-only'
process.env.OPENAI_API_KEY = 'local-fixture-only'
delete process.env.DATABASE_URL
delete process.env.DIRECT_URL
delete process.env.CLERK_SECRET_KEY
delete process.env.CLERK_JWT_KEY

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const issuer = 'https://local-security.clerk.accounts.dev'
const publishableKey = `pk_test_${Buffer.from('local-security.clerk.accounts.dev$').toString('base64')}`
process.env.CLERK_SECRET_KEY = 'sk_test_local_fixture_only'
process.env.CLERK_PUBLISHABLE_KEY = publishableKey
const paymentA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const paymentB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const responsibilityCaseId = 'case-other-driver'
const rows = [
  { id: paymentA, userId: 'rider-a', amount: 10000, currency: 'INR', status: 'created' },
  { id: paymentB, userId: 'rider-b', amount: 20000, currency: 'INR', status: 'created' },
]
let reads = 0
globalThis.prisma = {
  $transaction: async work => work(globalThis.prisma),
  $queryRawUnsafe: async (_query, caseId) => caseId === responsibilityCaseId ? [{ id: caseId }] : [],
  user: { findUnique: async ({ where }) => {
    reads++
    return ['user_a', 'user_b'].includes(where.clerkId)
      ? { id: where.clerkId === 'user_a' ? 'rider-a' : 'rider-b' } : null
  } },
  payment: { findFirst: async ({ where }) => {
    reads++
    const row = rows.find(item => item.id === where.id &&
      (where.userId === undefined || item.userId === where.userId))
    return row ? { ...row } : null
  } },
  driver: { findUnique: async ({ where }) => where.clerkId === 'user_a'
    ? { id: 'driver-a', clerkId: 'user_a', suspendedAt: null, suspensionExpiresAt: null }
    : null },
  responsibilityCase: { findUnique: async ({ where }) => where.id === responsibilityCaseId
    ? { id: responsibilityCaseId, bookingId: 'booking-other-driver', state: 'APPEAL_WINDOW' }
    : null },
  booking: { findUnique: async ({ where }) => where.id === 'booking-other-driver'
    ? { id: where.id, reference: 'RCS-OTHER', driverId: 'driver-b', driver: { id: 'driver-b', name: 'Other Driver', phone: '0000000002', fcmToken: null } }
    : null },
}
const { default: paymentRoutes, razorpayWebhookHandler } = await import('../routes/payments.js')
const { protect, protectAdmin } = await import('../middleware/auth.js')
const { default: driverRoutes } = await import('../routes/driver.ts')
const { default: responsibilityAdminRoutes } = await import('../routes/responsibilityAdmin.ts')

function token(claims = {}) {
  const now = Math.floor(Date.now() / 1000)
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'local-fixture' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ iss: issuer, sub: 'user_a', sid: 'sess_fixture',
    iat: now, nbf: now - 5, exp: now + 300, azp: 'http://localhost', ...claims })).toString('base64url')
  return `${header}.${payload}.${sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), privateKey).toString('base64url')}`
}

test('HTTP identity and payment abuse probes', async t => {
  t.mock.method(clerkClient.sessions, 'getSession', async id => ({ id, userId: 'user_a', status: 'active' }))
  // Also block SDK/Axios transports, so a failed ownership check cannot turn
  // this negative test into an actual gateway request.
  t.mock.method(http, 'request', () => { throw new Error('Unexpected SDK HTTP request') })
  t.mock.method(https, 'request', () => { throw new Error('Unexpected SDK HTTPS request') })
  const app = express()
  app.post('/api/payments/razorpay/webhook', express.raw({ type: 'application/json', limit: '1mb' }), razorpayWebhookHandler)
  app.use(express.json())
  app.use(clerkMiddleware({ publishableKey, jwtKey: publicKey.export({ type: 'spki', format: 'pem' }) }))
  app.use('/api/payments', paymentRoutes)
  app.use('/api/driver', driverRoutes)
  app.use('/api/admin/responsibility', responsibilityAdminRoutes)
  app.get('/admin-guard-probe', protect, protectAdmin, (_req, res) => res.json({ ok: true }))
  app.use((_error, _req, res, _next) => res.status(500).json({ error: 'Local probe failed' }))
  const server = await new Promise(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening))
  })
  const base = `http://127.0.0.1:${server.address().port}`
  const originalFetch = globalThis.fetch
  // Clerk must use the supplied public key; unexpected outbound HTTP is a test failure.
  t.mock.method(globalThis, 'fetch', (url, options) => {
    assert.equal(new URL(typeof url === 'string' || url instanceof URL ? url : url.url).origin, base, 'Unexpected external request')
    return originalFetch(url, options)
  })
  const request = (path, { jwt, headers = {}, body, method = 'GET' } = {}) => fetch(`${base}${path}`, {
    method, redirect: 'manual', signal: AbortSignal.timeout(3000),
    headers: { ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  })
  try {
    await t.test('forged identity headers do not authenticate a customer', async () => {
      const before = reads
      const res = await request(`/api/payments/${paymentB}`, { headers: { 'x-user-id': 'user_b', 'x-clerk-user-id': 'user_b' } })
      assert.equal(res.status, 401)
      assert.equal(reads, before)
    })
    await t.test('valid fixture session reads its own payment', async () => {
      const res = await request(`/api/payments/${paymentA}`, { jwt: token() })
      assert.equal(res.status, 200)
      assert.equal((await res.json()).id, paymentA)
    })
    await t.test('customer A cannot read or order customer B payment', async () => {
      for (const method of ['GET', 'POST']) {
        const res = await request(`/api/payments/${paymentB}${method === 'POST' ? '/order' : ''}`, { jwt: token(), method })
        assert.equal(res.status, 404)
      }
    })
    await t.test('client identity and price injection is rejected by verification schema', async () => {
      const res = await request(`/api/payments/${paymentA}/verify`, { jwt: token(), method: 'POST', body: {
        razorpay_order_id: 'order_fixture', razorpay_payment_id: 'pay_fixture', razorpay_signature: 'forged',
        userId: 'rider-b', amount: 1,
      } })
      assert.equal(res.status, 400)
    })
    await t.test('changing a signed token subject or admin role invalidates authentication', async () => {
      const parts = token().split('.')
      const forged = { ...JSON.parse(Buffer.from(parts[1], 'base64url')), sub: 'user_b', metadata: { role: 'admin' } }
      parts[1] = Buffer.from(JSON.stringify(forged)).toString('base64url')
      const res = await request('/admin-guard-probe', { jwt: parts.join('.') })
      assert.equal(res.status, 401)
    })
    await t.test('a genuine non-admin session cannot pass the admin guard', async () => {
      assert.equal((await request('/admin-guard-probe', { jwt: token() })).status, 403)
      assert.equal((await request('/admin-guard-probe', { jwt: token({ metadata: { role: 'admin' } }) })).status, 200)
    })
    await t.test('responsibility admin endpoints require authenticated admin identity', async () => {
      const probes = [
        { path: `/api/admin/responsibility/cases/${responsibilityCaseId}`, method: 'GET' },
        { path: `/api/admin/responsibility/cases/${responsibilityCaseId}/review`, method: 'POST', body: { decision: 'UPHOLD', reason: 'Reviewed evidence' } },
        { path: `/api/admin/responsibility/cases/${responsibilityCaseId}/appeal-review`, method: 'POST', body: { outcome: 'WAIVE', reason: 'Appeal evidence accepted' } },
        { path: '/api/admin/responsibility/drivers/driver-a/reliability', method: 'GET' },
        { path: '/api/admin/responsibility/drivers/driver-a/reliability-blocks/block-a/remove', method: 'POST', body: { reason: 'Reviewed reinstatement' } },
      ]
      for (const probe of probes) {
        assert.equal((await request(probe.path, { method: probe.method, body: probe.body })).status, 401)
        assert.equal((await request(probe.path, { jwt: token(), method: probe.method, body: probe.body })).status, 403)
      }
    })
    await t.test('responsibility admin bodies cannot spoof the authenticated reviewer identity', async () => {
      const admin = token({ metadata: { role: 'admin' } })
      assert.equal((await request(`/api/admin/responsibility/cases/${responsibilityCaseId}/review`, {
        jwt: admin,
        method: 'POST',
        body: { decision: 'UPHOLD', reason: 'Reviewed evidence', adminActorId: 'spoofed-admin' },
      })).status, 400)
      assert.equal((await request(`/api/admin/responsibility/cases/${responsibilityCaseId}/appeal-review`, {
        jwt: admin,
        method: 'POST',
        body: { outcome: 'UPHOLD', reason: 'Reviewed appeal', reviewerId: 'spoofed-reviewer' },
      })).status, 400)
      assert.equal((await request('/api/admin/responsibility/drivers/driver-a/reliability-blocks/block-a/remove', {
        jwt: admin,
        method: 'POST',
        body: { reason: 'Reviewed reinstatement', adminActorId: 'spoofed-admin' },
      })).status, 400)
    })
    await t.test('driver appeal derives driver identity from authentication and enforces case ownership', async () => {
      const path = `/api/driver/responsibility-cases/${responsibilityCaseId}/appeal`
      assert.equal((await request(path, { method: 'POST', body: { reason: 'Please review this case' } })).status, 401)
      assert.equal((await request(path, {
        jwt: token(), method: 'POST', body: { reason: 'Please review this case', driverId: 'driver-b' },
      })).status, 400)
      const forbidden = await request(path, { jwt: token(), method: 'POST', body: { reason: 'Please review this case' } })
      assert.equal(forbidden.status, 403)
      assert.equal((await forbidden.json()).code, 'APPEAL_FORBIDDEN')
    })
    await t.test('expired tokens cannot access payments', async () => {
      const now = Math.floor(Date.now() / 1000)
      assert.equal((await request(`/api/payments/${paymentA}`, { jwt: token({ iat: now - 600, nbf: now - 600, exp: now - 120 }) })).status, 401)
    })
    await t.test('unsigned payment capture webhook is rejected before database access', async () => {
      const before = reads
      const res = await request('/api/payments/razorpay/webhook', { method: 'POST', body: {
        event: 'payment.captured', payload: { payment: { entity: { id: 'pay_fixture', amount: 1 } } },
      } })
      assert.equal(res.status, 400)
      assert.equal(reads, before)
    })
    assert.deepEqual(rows.map(row => row.status), ['created', 'created'])
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
})
