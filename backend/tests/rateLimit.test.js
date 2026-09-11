import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import {
  createApiLimiters,
  createOtpLimiters,
  createPaymentWriteLimiter,
  normalizedPhone,
  phoneKey,
} from '../middleware/rateLimit.js'

async function withServer(app, run) {
  const server = await new Promise(resolve => {
    const listening = app.listen(0, () => resolve(listening))
  })
  try {
    return await run(`http://127.0.0.1:${server.address().port}`)
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
}

function apiApp(limits) {
  const app = express()
  app.set('trust proxy', 1)
  app.use((req, _res, next) => { req.auth = { userId: req.get('x-user') || null }; next() })
  app.use('/api', limits.read, limits.write, limits.location)
  app.get('/api/bookings', (_req, res) => res.json({ ok: true }))
  app.post('/api/bookings', (_req, res) => res.json({ ok: true }))
  app.post('/api/driver/location', (_req, res) => res.json({ ok: true }))
  return app
}

async function request(url, path, { method = 'GET', user, ip, body } = {}) {
  const headers = {}
  if (user) headers['x-user'] = user
  if (ip) headers['x-forwarded-for'] = ip
  if (body) headers['content-type'] = 'application/json'
  return fetch(`${url}${path}`, { method, headers, body: body && JSON.stringify(body) })
}

test('API limits return unified draft-7 429 responses and isolate Clerk identities', async () => {
  const limits = createApiLimiters({ getUserId: req => req.auth.userId, readLimit: 2 })
  await withServer(apiApp(limits), async url => {
    assert.equal((await request(url, '/api/bookings', { user: 'rider-a' })).status, 200)
    assert.equal((await request(url, '/api/bookings', { user: 'rider-a' })).status, 200)
    const blocked = await request(url, '/api/bookings', { user: 'rider-a' })
    assert.equal(blocked.status, 429)
    assert.equal(blocked.headers.get('cache-control'), 'no-store')
    assert.ok(blocked.headers.get('ratelimit'))
    assert.ok(blocked.headers.get('ratelimit-policy'))
    assert.equal(blocked.headers.get('x-ratelimit-limit'), null)
    assert.equal(blocked.headers.get('retry-after') !== null, true)
    assert.deepEqual(await blocked.json(), {
      error: 'Too many requests. Please slow down and try again in a few minutes.',
      code: 'RATE_LIMITED', policy: 'api-read',
    })
    assert.equal((await request(url, '/api/bookings', { user: 'rider-b' })).status, 200)
  })
})

test('driver location has its own write budget rather than consuming generic writes', async () => {
  const limits = createApiLimiters({ getUserId: req => req.auth.userId, writeLimit: 1, locationLimit: 2 })
  await withServer(apiApp(limits), async url => {
    assert.equal((await request(url, '/api/driver/location?heartbeat=1', { method: 'POST', user: 'captain' })).status, 200)
    assert.equal((await request(url, '/api/driver/location', { method: 'POST', user: 'captain' })).status, 200)
    const locationBlocked = await request(url, '/api/driver/location', { method: 'POST', user: 'captain' })
    assert.equal(locationBlocked.status, 429)
    assert.equal((await locationBlocked.json()).policy, 'driver-location')
    assert.equal((await request(url, '/api/bookings', { method: 'POST', user: 'captain' })).status, 200)
    assert.equal((await request(url, '/api/bookings', { method: 'POST', user: 'captain' })).status, 429)
  })
})

test('payment writes are limited without consuming the payment status-read budget', async () => {
  const app = express()
  app.use((req, _res, next) => { req.auth = { userId: req.get('x-user') || null }; next() })
  const paymentWrites = createPaymentWriteLimiter({ getUserId: req => req.auth.userId, limit: 1 })
  app.use('/api/payments', paymentWrites)
  app.get('/api/payments/payment-id', (_req, res) => res.json({ ok: true }))
  app.post('/api/payments/payment-id/order', (_req, res) => res.json({ ok: true }))

  await withServer(app, async url => {
    assert.equal((await request(url, '/api/payments/payment-id', { user: 'rider' })).status, 200)
    assert.equal((await request(url, '/api/payments/payment-id', { user: 'rider' })).status, 200)
    assert.equal((await request(url, '/api/payments/payment-id/order', { method: 'POST', user: 'rider' })).status, 200)
    const blocked = await request(url, '/api/payments/payment-id/order', { method: 'POST', user: 'rider' })
    assert.equal(blocked.status, 429)
    assert.equal((await blocked.json()).policy, 'payment-write')
  })
})

test('OTP keys normalize valid phones, share across IPs, and fall back safely for invalid phones', async () => {
  assert.equal(normalizedPhone(' 98765-43210 '), '9876543210')
  const app = express()
  app.set('trust proxy', 1)
  app.use(express.json())
  const otp = createOtpLimiters({ sendLimit: 2 })
  app.post('/send', otp.send, (_req, res) => res.json({ ok: true }))
  await withServer(app, async url => {
    const body = { phone: '98765-43210' }
    assert.equal((await request(url, '/send', { method: 'POST', ip: '2001:db8::1', body })).status, 200)
    assert.equal((await request(url, '/send', { method: 'POST', ip: '2001:db8::2', body })).status, 200)
    assert.equal((await request(url, '/send', { method: 'POST', ip: '2001:db8::3', body })).status, 429)
    assert.equal(phoneKey({ body: { phone: 'invalid' }, ip: '2001:db8::1' }), phoneKey({ body: { phone: 'invalid' }, ip: '2001:db8::1' }))
    assert.notEqual(phoneKey({ body: { phone: 'invalid' }, ip: '2001:db8::1' }), phoneKey({ body: { phone: 'invalid' }, ip: '2001:db9::1' }))
  })
})

test('successful OTP verification is skipped while failed attempts are limited', async () => {
  const app = express()
  app.set('trust proxy', 1)
  app.use(express.json())
  const otp = createOtpLimiters({ verifyLimit: 2 })
  app.post('/verify', otp.verify, (req, res) => res.sendStatus(req.body.ok ? 200 : 400))
  await withServer(app, async url => {
    const phone = '9876543210'
    assert.equal((await request(url, '/verify', { method: 'POST', body: { phone, ok: true } })).status, 200)
    assert.equal((await request(url, '/verify', { method: 'POST', body: { phone, ok: true } })).status, 200)
    assert.equal((await request(url, '/verify', { method: 'POST', body: { phone } })).status, 400)
    assert.equal((await request(url, '/verify', { method: 'POST', body: { phone } })).status, 400)
    assert.equal((await request(url, '/verify', { method: 'POST', body: { phone } })).status, 429)
  })
})
