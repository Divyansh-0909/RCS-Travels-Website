import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import http from 'node:http'
import { nativeClerkEnvironment } from './helpers/phase9NativeClerkEnvironment.js'
import { createNativeGateway } from './helpers/phase9NativeGateway.js'
import { bounded, providerRequest as fetch, installProviderTestBoundary, waitForProviderObservation } from './helpers/phase9ProviderTestBoundary.js'

async function fixture(t, acceptanceFault, beforeRequest) {
  const boundary = installProviderTestBoundary(t)
  const app = express(); app.use(express.json())
  const calls = [], booking = { status: 'confirmed', driverId: null }
  let effects = 0, rejectOnce = false, skipCommit = false
  app.use((req, res) => {
    calls.push({ path: req.path, method: req.method, authorization: req.headers.authorization, cookie: req.headers.cookie, contentType: req.headers['content-type'], body: req.body })
    if (req.path === '/plain' || req.path === '/api/plain') return res.type('text/plain').send('plain transport')
    if (req.path === '/empty' || req.path === '/api/empty') return res.end()
    if (req.path === '/redirect') return res.redirect('/api/driver/me')
    if (req.path === '/hanging') return
    if (req.path === '/api/driver/me' && req.query.reject) return res.status(403).json({ error: 'Denied synthetic actor' })
    if (req.path === '/api/write' || req.path === '/outside/write') return res.status(201).json({ protectedWrite: true })
    if (req.path.endsWith('/accept')) {
      if (rejectOnce) { rejectOnce = false; return res.status(409).json({ error: 'Synthetic ineligible offer' }) }
      if (!skipCommit && !booking.driverId) { effects++; booking.driverId = 'captain'; booking.status = 'assigned' }
      return res.json({ bookingId: 'synthetic-booking', status: booking.status })
    }
    if (req.path === '/api/driver/me') return res.json({ id: 'captain' })
    if (req.path === '/fixture-auth/v1/environment') return res.json({ response: { commerce_settings: {} } })
    return res.json({ fixture: true })
  })
  const server = await new Promise(done => { const listener = app.listen(0, '127.0.0.1', () => done(listener)) })
  t.after(async () => { server.closeAllConnections(); await new Promise(done => server.close(done)) })
  const harness = { apiUrl: 'http://127.0.0.1:' + server.address().port,
    actors: { captain: { id: 'captain' }, replacement: { id: 'replacement' } },
    lifecycle: { booking: async () => booking }, db: { driver: { findUniqueOrThrow: async query => {
      assert.deepEqual(query, { where: { id: 'captain' } }); return { walletBalance: 1000 }
    } } } }
  const gateway = await bounded(createNativeGateway(harness, { acceptanceFault, beforeRequest }))
  assert.ok(gateway && typeof gateway.close === 'function')
  assert.match(gateway.url, /^http:\/\/127\.0\.0\.1:\d+$/)
  boundary.assertLoopback()
  t.after(() => bounded(gateway.close()))
  const accept = () => fetch(gateway.url + '/api/driver/offers/synthetic/accept', { method: 'PATCH',
    headers: { authorization: 'Bearer synthetic-native-token', 'content-type': 'application/json' }, body: JSON.stringify({ fixture: true }) })
  return { gateway, harness, accept, calls, booking, effects: () => effects, rejectNext: () => { rejectOnce = true }, skipCommit: () => { skipCommit = true } }
}

test('native race barrier precedes server delivery and exposes no authorization material', async t => {
  let release, entered
  const arrived = new Promise(done => { entered = done })
  const held = new Promise(done => { release = done })
  const observed = []
  const context = await fixture(t, false, async request => {
    observed.push(request); entered(); await held
  })
  t.after(() => release())
  const pending = context.accept()
  await bounded(arrived)
  assert.deepEqual(observed, [{ method: 'PATCH', path: '/api/driver/offers/synthetic/accept', actor: 'captain' }])
  assert.equal(context.calls.length, 0)
  assert.equal(context.effects(), 0)
  release()
  assert.equal((await bounded(pending)).status, 200)
  assert.equal(context.effects(), 1)
})

test('a failed native external-event barrier cannot deliver or commit an action', async t => {
  const context = await fixture(t, false, async () => { throw new Error('private synthetic barrier failure') })
  const response = await context.accept()
  assert.equal(response.status, 502)
  assert.deepEqual(await response.json(), { error: 'Isolated native transport failed' })
  assert.equal(context.calls.length, 0)
  assert.equal(context.effects(), 0)
})

test('native acknowledgement loss occurs after commit and a retry preserves one authoritative effect', async t => {
  const context = await fixture(t, 'after')
  const first = await context.accept()
  assert.equal(first.status, 503)
  assert.deepEqual(await first.json(), { error: 'Controlled acknowledgement loss. Refresh before retrying.' })
  assert.equal(context.effects(), 1)
  assert.equal(context.booking.status, 'assigned')
  assert.equal(context.gateway.requests[0].authoritativeStatus, 200)
  assert.equal(context.gateway.requests[0].status, 503)
  assert.equal(context.gateway.requests[0].response.status, 'assigned')
  assert.equal(context.gateway.faults[0].actor, 'captain')
  assert.equal(context.gateway.faults[0].kind, 'acceptance-acknowledgement-lost')
  assert.equal(context.gateway.faults[0].bookingStatus, 'assigned')
  assert.equal(context.gateway.faults[0].driverAssigned, true)
  assert.equal((await context.accept()).status, 200)
  assert.equal(context.effects(), 1)
  assert.equal(context.gateway.faults.length, 1)
  assert.equal(context.calls[0].authorization, 'Bearer synthetic-native-token')
  assert.equal(JSON.stringify(context.gateway.requests).includes('synthetic-native-token'), false)
})

test('native after-commit injection cannot turn an upstream rejection into a successful assignment', async t => {
  const context = await fixture(t, 'after'); context.rejectNext()
  assert.equal((await context.accept()).status, 409)
  assert.equal(context.effects(), 0)
  assert.equal(context.gateway.faults.length, 0)
  assert.equal((await context.accept()).status, 503)
  assert.equal(context.effects(), 1)
})

test('isolated native session selection changes only fixture authentication and never API authorization', async t => {
  const context = await fixture(t, false)
  for (const actor of ['captain', 'replacement']) {
    context.gateway.selectActor(actor)
    await fetch(context.gateway.url + '/fixture-auth/profile', { headers: { cookie: 'fixture_actor=foreign' } })
    assert.equal(context.calls.at(-1).cookie, 'fixture_actor=' + actor)
  }
  await fetch(context.gateway.url + '/api/driver/me', { headers: { authorization: 'Bearer synthetic-native-token' } })
  assert.equal(context.calls.at(-1).authorization, 'Bearer synthetic-native-token')
  assert.equal(context.gateway.requests.at(-1).actorId, 'captain')
  assert.equal(context.calls.at(-1).cookie, undefined); assert.equal(context.calls.at(-1).contentType, undefined)
  assert.equal((await context.accept()).status, 200)
  assert.equal(context.gateway.faults.length, 0)
  assert.throws(() => context.gateway.selectActor('customer'), { message: 'Unknown native actor' })
  delete context.harness.actors.replacement
  assert.throws(() => context.gateway.selectActor('replacement'), { message: 'Unknown native actor' })
  for (const acceptanceFault of [true, 'unknown', null]) {
    await assert.rejects(bounded(createNativeGateway(context.harness, { acceptanceFault })), { message: 'Unknown acceptance fault' })
  }
})

test('before-commit outage preserves booking and wallet; native health and environment remain isolated', async t => {
  const context = await fixture(t, undefined)
  const health = await fetch(context.gateway.url + '/phase9-health')
  assert.equal(health.status, 200); assert.deepEqual(await health.json(), { mode: 'isolated-phase9', production: false })
  const environment = await fetch(context.gateway.url + '/fixture-auth/v1/environment')
  assert.equal(environment.status, 200)
  assert.deepEqual(await environment.json(), nativeClerkEnvironment({ response: { commerce_settings: {} } }))
  const rejection = await context.accept()
  assert.equal(rejection.status, 503); assert.deepEqual(await rejection.json(), { error: 'Controlled acceptance outage. Please retry.' })
  assert.deepEqual(context.gateway.requests.at(-1), { method: 'PATCH', path: '/api/driver/offers/synthetic/accept', status: 503, injected: true })
  assert.equal(context.gateway.faults[0].kind, 'acceptance-503')
  assert.equal(context.gateway.faults[0].bookingStatus, 'confirmed')
  assert.equal(context.effects(), 0)
  assert.equal(context.gateway.faults[0].walletBalance, 1000)
  assert.equal(context.gateway.faults[0].driverAssigned, false)
  assert.equal(context.booking.status, 'confirmed')
  assert.equal((await context.accept()).status, 200)
  assert.equal(context.effects(), 1)
})

test('native proxy records an unreachable isolated backend without a fabricated application response', async t => {
  const context = await fixture(t, false)
  context.harness.apiUrl = 'http://127.0.0.1:1'
  const response = await context.accept()
  assert.equal(response.status, 502)
  assert.deepEqual(await response.json(), { error: 'Isolated native transport failed' })
  assert.equal(context.gateway.requests.at(-1).transportFailure, true)
  assert.equal(context.effects(), 0)
})

test('native proxy preserves bodies, headers, response type and narrowly scopes acceptance faults and receipt fields', async t => {
  const context = await fixture(t, 'before')
  for (const [path, method] of [['/api/driver/offers/synthetic/accept', 'GET'], ['/prefix/api/driver/offers/synthetic/accept', 'PATCH'], ['/api/driver/offers/synthetic/accept-extra', 'PATCH']]) {
    assert.equal((await fetch(context.gateway.url + path, { method })).status, 200)
    assert.equal(context.gateway.faults.length, 0)
  }
  // The upstream fixture recognizes these suffixes; reset its synthetic state.
  context.booking.driverId = null; context.booking.status = 'confirmed'
  for (const method of ['GET', 'HEAD']) {
    assert.equal((await fetch(context.gateway.url + '/empty', { method })).status, 200)
    assert.equal(context.calls.at(-1).authorization, undefined)
    const status = await bounded(new Promise((resolve, reject) => {
      const request = http.request(context.gateway.url + '/empty', { method,
        headers: { 'content-type': 'application/json', 'content-length': 2 } }, response => {
        response.resume(); response.on('end', () => resolve(response.statusCode))
      })
      request.on('error', reject); request.end('{}')
    }))
    assert.equal(status, 200); assert.equal(context.calls.at(-1).body, undefined)
  }
  const plain = await fetch(context.gateway.url + '/plain')
  assert.match(plain.headers.get('content-type'), /^text\/plain/); assert.equal(await plain.text(), 'plain transport')
  const patchPlain = await fetch(context.gateway.url + '/plain', { method: 'PATCH' })
  assert.equal(await patchPlain.text(), 'plain transport'); assert.equal(Object.hasOwn(context.gateway.requests.at(-1), 'response'), false)
  const apiPlain = await fetch(context.gateway.url + '/api/plain', { method: 'PATCH' })
  assert.equal(apiPlain.status, 200); assert.equal(await apiPlain.text(), 'plain transport')
  assert.equal(Object.hasOwn(context.gateway.requests.at(-1), 'response'), false)
  const apiEmpty = await fetch(context.gateway.url + '/api/empty', { method: 'PATCH' })
  assert.equal(apiEmpty.status, 200); assert.equal(await apiEmpty.text(), '')
  assert.equal(apiEmpty.headers.get('content-type'), 'application/octet-stream')
  for (const [path, method] of [['/api/write', 'PATCH'], ['/api/write', 'POST'], ['/outside/write', 'PATCH']]) {
    const response = await fetch(context.gateway.url + path, { method,
      headers: { authorization: 'Bearer private-fixture', cookie: 'unmodified-cookie', 'content-type': 'application/json' }, body: '{"fixture":"payload"}' })
    assert.equal(response.status, 201); assert.deepEqual(await response.json(), { protectedWrite: true })
    assert.equal(context.calls.at(-1).cookie, 'unmodified-cookie'); assert.equal(context.calls.at(-1).contentType, 'application/json')
    assert.deepEqual(context.calls.at(-1).body, { fixture: 'payload' })
    const observed = context.gateway.requests.at(-1)
    assert.equal(Object.hasOwn(observed, 'response'), path === '/api/write' && method === 'PATCH')
    assert.equal(Object.hasOwn(observed, 'actorId'), false)
  }
  assert.equal((await fetch(context.gateway.url + '/api/driver/me?reject=1')).status, 403)
  assert.equal(Object.hasOwn(context.gateway.requests.at(-1), 'actorId'), false)
  assert.equal((await fetch(context.gateway.url + '/redirect')).status, 502)
  assert.equal((await context.accept()).status, 503)
  assert.equal((await context.accept()).status, 200)
  assert.equal(context.gateway.faults.length, 1)
  assert.equal(JSON.stringify(context.gateway.requests).includes('private-fixture'), false)
  assert.equal(JSON.stringify(context.gateway.requests).includes('unmodified-cookie'), false)
})

test('before-commit outage receipt preserves a preexisting assigned owner', async t => {
  const context = await fixture(t, 'before')
  context.booking.driverId = 'already-assigned'; context.booking.status = 'assigned'
  assert.equal((await context.accept()).status, 503)
  assert.equal(context.gateway.faults[0].driverAssigned, true)
  assert.equal(context.gateway.faults[0].bookingStatus, 'assigned')
  assert.equal(context.effects(), 0)
})

test('native fault receipts report actual owner state even when a successful fixture response lacks a commit', async t => {
  const context = await fixture(t, 'after')
  context.skipCommit()
  assert.equal((await context.accept()).status, 503)
  assert.equal(context.gateway.faults[0].driverAssigned, false)
  assert.equal(context.gateway.faults[0].bookingStatus, 'confirmed')
  assert.equal((await context.accept()).status, 200)
  assert.equal(context.gateway.faults.length, 1)
})

test('native gateway shutdown closes active owned connections and settles its acknowledgement', async t => {
  const context = await fixture(t, false)
  const pending = globalThis.fetch(context.gateway.url + '/hanging').then(() => 'unexpected response', () => 'closed')
  await waitForProviderObservation(() => context.calls.some(x => x.path === '/hanging'))
  await bounded(context.gateway.close())
  assert.equal(await pending, 'closed')
})
