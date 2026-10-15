import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { clerkClient } from '@clerk/express'
import { createBrowserAuth, browserPublishableKey } from './helpers/phase9BrowserAuth.js'

process.env.NODE_ENV = 'test'
process.env.CLERK_SECRET_KEY = 'sk_test_middleware_fixture'
process.env.CLERK_PUBLISHABLE_KEY = browserPublishableKey
const actor = { id: 'customer', clerkId: 'user_customer', role: 'customer' }
const auth = createBrowserAuth({ customer: actor })
process.env.CLERK_JWT_KEY = auth.jwtKey
process.env.CLERK_AUTHORIZED_PARTIES = ' https://allowed.example '
process.env.CLERK_AUDIENCE = 'rcs'
const { protect, protectAdmin, protectCoupon, clerkAuth, createHumanClerkAuth } = await import('../middleware/auth.js')
const identity = { userId: actor.clerkId, sessionId: 'sess_customer', sessionClaims: {
  sub: actor.clerkId, sid: 'sess_customer', iss: 'https://phase9.clerk.accounts.dev', metadata: { role: 'customer' } }, tokenType: 'session_token' }
const response = () => ({ statusCode: 200, headers: {}, setHeader(name, value) { this.headers[name] = value },
  status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } })

test('middleware exact contracts, request-local reuse, stand-alone admin and coupon guards', async t => {
  const lookup = t.mock.method(clerkClient.sessions, 'getSession', async id => ({ id, userId: actor.clerkId, status: 'active' }))
  const req = { auth: () => identity }
  let continued = 0
  await protect(req, response(), () => { continued++ })
  await protect(req, response(), () => { continued++ })
  assert.equal(continued, 2); assert.equal(lookup.mock.calls.length, 1)
  for (const value of [identity, { ...identity, sessionClaims: { ...identity.sessionClaims, metadata: undefined } },
    { ...identity, sessionClaims: {} }]) {
    const res = response()
    await protectAdmin({ auth: () => value }, res, () => assert.fail('role bypass'))
    assert.equal(res.statusCode, value.sessionClaims.sub ? 403 : 401)
    assert.deepEqual(res.body, value.sessionClaims.sub ? { error: 'Admin access required' } : { error: 'Sign in to continue', code: 'AUTH_REQUIRED' })
  }
  await protectAdmin({ auth: () => ({ ...identity, sessionClaims: { ...identity.sessionClaims, metadata: { role: 'admin' } } }) }, response(), () => { continued++ })
  assert.equal(continued, 3)
  await protectCoupon({ auth: () => identity, body: { couponId: 'owned' } }, response(), () => { continued++ })
  protectCoupon({}, response(), () => { continued++ })
  protectCoupon({ body: {} }, response(), () => { continued++ })
  assert.equal(continued, 6)
  const count = lookup.mock.calls.length
  const res = response()
  await protect({ auth: () => ({ ...identity, userId: null, sessionId: null }) }, res, () => assert.fail())
  assert.equal(lookup.mock.calls.length, count); assert.equal(res.statusCode, 401)
  assert.deepEqual(res.body, { error: 'Sign in to continue', code: 'AUTH_REQUIRED' })
  for (const request of [{}, { auth: () => null }]) {
    const missing = response()
    await protect(request, missing, () => assert.fail('missing verified identity'))
    assert.equal(missing.statusCode, 401)
    assert.deepEqual(missing.body, { error: 'Sign in to continue', code: 'AUTH_REQUIRED' })
  }
})

test('every request rejects revoked state; upstream outage is retryable without fallback or secret leakage', async t => {
  for (const outcome of ['revoked', 'unavailable']) {
    t.mock.method(clerkClient.sessions, 'getSession', async id => {
      if (outcome === 'unavailable') throw Object.assign(new Error('secret'), { status: 429 })
      return { id, userId: actor.clerkId, status: outcome }
    })
    const res = response()
    await protect({ auth: () => identity }, res, () => assert.fail('must not authorize'))
    assert.equal(res.statusCode, outcome === 'revoked' ? 401 : 503)
    assert.deepEqual(res.body, outcome === 'revoked' ? { error: 'Sign in to continue', code: 'AUTH_REQUIRED' }
      : { error: 'Authentication temporarily unavailable. Please retry.', code: 'AUTH_UNAVAILABLE' })
    if (outcome === 'unavailable') assert.equal(res.headers['Retry-After'], '1')
  }
})

test('production Clerk configuration validates real signatures, audience and parties and maps SDK errors safely', async t => {
  t.mock.method(clerkClient.sessions, 'getSession', async id => ({ id, userId: actor.clerkId, status: 'active' }))
  const app = express()
  app.get('/unavailable', createHumanClerkAuth({ publishableKey: 'invalid' }), protect, (_req, res) => res.json({ ok: true }))
  app.use(clerkAuth)
  app.get('/protected', protect, (_req, res) => res.json({ ok: true }))
  const server = await new Promise(done => { const listener = app.listen(0, '127.0.0.1', () => done(listener)) })
  t.after(() => { server.closeAllConnections(); return new Promise(done => server.close(done)) })
  const request = (jwt, path = '/protected') => fetch('http://127.0.0.1:' + server.address().port + path, { headers: { authorization: 'Bearer ' + jwt } })
  const originalFetch = globalThis.fetch
  const origin = 'http://127.0.0.1:' + server.address().port
  t.mock.method(globalThis, 'fetch', (url, options) => {
    assert.equal(new URL(typeof url === 'string' || url instanceof URL ? url : url.url).origin, origin, 'No external authentication requests in unit tests')
    return originalFetch(url, options)
  })
  const token = overrides => auth.token(actor, { aud: 'rcs', azp: 'https://allowed.example', ...overrides })
  assert.equal((await request(token())).status, 200)
  for (const jwt of ['malformed', token().slice(0, -12) + 'tampered', token({ aud: 'foreign' }), token({ azp: 'https://evil.example' }), token({ exp: 1 })]) {
    const res = await request(jwt)
    assert.equal(res.status, 401)
    assert.deepEqual(await res.json(), { error: 'Sign in to continue', code: 'AUTH_REQUIRED' })
  }
  const unavailable = await request(token(), '/unavailable')
  assert.equal(unavailable.status, 503); assert.equal(unavailable.headers.get('retry-after'), '1')
  assert.deepEqual(await unavailable.json(), { error: 'Authentication temporarily unavailable. Please retry.', code: 'AUTH_UNAVAILABLE' })
  const cookie = await fetch(origin + '/protected', { redirect: 'manual', headers: {
    cookie: '__session=' + token({ exp: 1 }) + '; __client_uat=' + Math.floor(Date.now() / 1000),
    accept: 'text/html', 'sec-fetch-dest': 'document', 'sec-fetch-mode': 'navigate',
  } })
  const cookieBody = await cookie.json()
  assert.equal(cookie.status, 401, JSON.stringify(cookieBody))
  assert.deepEqual(cookieBody, { error: 'Sign in to continue', code: 'AUTH_REQUIRED' })
})

test('default browser party allowlist and CORS fallback remain restrictive', async t => {
  const prior = { parties: process.env.CLERK_AUTHORIZED_PARTIES, cors: process.env.CORS_ORIGINS }
  t.after(() => {
    if (prior.parties === undefined) delete process.env.CLERK_AUTHORIZED_PARTIES; else process.env.CLERK_AUTHORIZED_PARTIES = prior.parties
    if (prior.cors === undefined) delete process.env.CORS_ORIGINS; else process.env.CORS_ORIGINS = prior.cors
  })
  t.mock.method(clerkClient.sessions, 'getSession', async id => ({ id, userId: actor.clerkId, status: 'active' }))
  delete process.env.CLERK_AUTHORIZED_PARTIES; delete process.env.CORS_ORIGINS
  const fallback = await import('../middleware/auth.js?default-party-fixture')
  process.env.CORS_ORIGINS = 'https://cors.example'
  const cors = await import('../middleware/auth.js?cors-party-fixture')
  const app = express()
  app.get('/default', fallback.clerkAuth, fallback.protect, (_req, res) => res.json({ ok: true }))
  app.get('/cors', cors.clerkAuth, cors.protect, (_req, res) => res.json({ ok: true }))
  const server = await new Promise(done => { const listener = app.listen(0, '127.0.0.1', () => done(listener)) })
  t.after(() => { server.closeAllConnections(); return new Promise(done => server.close(done)) })
  const request = (path, azp) => fetch('http://127.0.0.1:' + server.address().port + path, {
    headers: { authorization: 'Bearer ' + auth.token(actor, { aud: 'rcs', azp }) } })
  for (const party of ['http://localhost:1574', 'http://127.0.0.1:1574', 'http://localhost:5173', 'http://127.0.0.1:5173']) {
    assert.equal((await request('/default', party)).status, 200)
  }
  assert.equal((await request('/default', 'https://evil.example')).status, 401)
  assert.equal((await request('/cors', 'https://cors.example')).status, 200)
  assert.equal((await request('/cors', 'http://localhost:5173')).status, 401)
})
