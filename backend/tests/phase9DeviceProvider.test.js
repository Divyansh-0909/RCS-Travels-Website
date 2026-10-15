import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import http from 'node:http'
import { createPhase9DeviceProvider } from './helpers/phase9DeviceProvider.js'
import { bounded, providerRequest as fetch, installProviderTestBoundary, waitForProviderObservation } from './helpers/phase9ProviderTestBoundary.js'

const url = 'https://www.google.com/maps/dir/?api=1&destination=28.6129%2C77.2295&travelmode=driving&dir_action=navigate'
async function fixture(t) {
  const boundary = installProviderTestBoundary(t)
  const app = express(), requests = []
  app.use(express.raw({ type: () => true }))
  app.use((req, res) => { requests.push({ path: req.path, authorization: req.headers.authorization, cookie: req.headers.cookie, contentType: req.headers['content-type'], body: req.body?.toString() });
    if (req.path === '/hanging') return
    if (req.path === '/redirect') return res.redirect('https://example.com')
    if (req.path === '/empty') return res.end()
    if (req.path === '/plain') return res.type('text/plain').send('unchanged bytes')
    if (req.path === '/raw') return res.status(202).end('no content type')
    res.status(req.method === 'POST' ? 201 : 200).json({ realProtectedTransport: true }) })
  const server = await new Promise(done => { const listener = app.listen(0, '127.0.0.1', () => done(listener)); })
  t.after(async () => { server.closeAllConnections(); await new Promise(done => server.close(done)) })
  const gateway = { url: 'http://127.0.0.1:' + server.address().port }
  const gps = { schema: 'phase9-synthetic-location-v1', source: 'synthetic-delhi', fix: { timestamp: 1, coords: { latitude: 28.6, longitude: 77.2, accuracy: 8 } } }
  const provider = await bounded(createPhase9DeviceProvider(gateway, async () => gps))
  assert.ok(provider && typeof provider.close === 'function')
  assert.match(provider.url, /^http:\/\/127\.0\.0\.1:\d+$/)
  boundary.assertLoopback()
  t.after(() => bounded(provider.close()))
  const navigate = body => fetch(provider.url + '/phase9-navigation-intent', { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) })
  return { provider, gateway, gps, requests, navigate }
}
test('device provider records immutable synthetic observations and never opens navigation applications', async t => {
  const { provider, gps, navigate, requests } = await fixture(t)
  assert.deepEqual(await (await fetch(provider.url + '/phase9-synthetic-location')).json(), gps)
  gps.fix.timestamp = 2
  assert.equal(provider.observations[0].value.fix.timestamp, 1)
  for (const destination of ['28.5%2C77.1', '28.8%2C77.4', '28.6129%2C77.2295']) {
    const navigation = url.replace('28.6129%2C77.2295', destination)
    const result = await navigate({ url: navigation })
    assert.equal(result.status, 200); assert.deepEqual(await result.json(), { recorded: true, externalAppOpened: false })
    assert.equal((await navigate({ url: navigation + '&waypoints=28.6%2C77.2' })).status, 200)
  }
  assert.equal(requests.length, 0)
  assert.ok(provider.observations.filter(x => x.kind === 'synthetic-navigation-intent').every(x => x.externalAppOpened === false))
  assert.deepEqual(provider.observations[0], { kind: 'synthetic-gps', value: { ...gps, fix: { ...gps.fix, timestamp: 1 } } })
  assert.equal(provider.observations.filter(x => x.kind === 'synthetic-navigation-intent').length, 6)
  assert.equal(provider.observations[1].url, url.replace('28.6129%2C77.2295', '28.5%2C77.1'))
})
test('device provider rejects malformed, foreign, duplicate and out-of-area navigation inputs', async t => {
  const { navigate, requests, provider } = await fixture(t)
  const invalid = [null, {}, { url: null }, { url: 'not a URL' }, { url: url.replace('https:', 'http:') },
    { url: url.replace('www.google.com', 'example.com') }, { url: url.replace('/maps/dir/', '/other/') },
    { url: url.replace('www.google.com', 'user:pass@www.google.com') }, { url: url + '#fragment' },
    { url: url.replace('www.google.com', 'user@www.google.com') }, { url: url.replace('www.google.com', ':pass@www.google.com') },
    { url: url.replace('api=1', 'api=2') }, { url: url.replace('driving', 'walking') },
    { url: url.replace('navigate', 'preview') }, { url: url + '&api=1' }, { url: url + '&key=private-unexpected' },
    { url: url.replace('destination=28.6129%2C77.2295&', '') },
    { url: url + '&waypoints=29.1%2C77.2' }, { url: url.replace('28.6129%2C77.2295', '29.1%2C77.2') + '&waypoints=28.6%2C77.2' },
    ...['bad', '28.49,77.2', '28.81,77.2', '28.6,77.09', '28.6,77.41', ' 28.6,77.2', '28.6,77.2 ', '2.86e1,77.2', '28.6,0x4d'].map(value => ({ url: url.replace('28.6129%2C77.2295', encodeURIComponent(value)) }))]
  for (const body of invalid) { const response = await navigate(body); assert.equal(response.status, 400); assert.deepEqual(await response.json(), { error: 'Navigation outside synthetic fixture' }) }
  const malformed = await navigate('malformed JSON')
  assert.equal(malformed.status, 400); assert.deepEqual(await malformed.json(), { error: 'Malformed synthetic navigation' })
  assert.equal(provider.observations.length, 0); assert.equal(requests.length, 0)
})
test('device provider preserves protected API identity/status and refuses unreachable or redirecting upstreams', async t => {
  const { provider, gateway, requests } = await fixture(t)
  const result = await fetch(provider.url + '/api/driver/me', { headers: { authorization: 'Bearer synthetic-token' } })
  assert.equal(result.status, 200); assert.equal(requests[0].authorization, 'Bearer synthetic-token')
  assert.equal(requests[0].cookie, undefined); assert.equal(requests[0].contentType, undefined)
  assert.equal((await fetch(provider.url + '/api/write', { method: 'POST', body: 'synthetic-body' })).status, 201)
  assert.equal(requests.at(-1).body, 'synthetic-body')
  await fetch(provider.url + '/api/json', { method: 'PATCH', headers: { cookie: 'unchanged-cookie', 'content-type': 'application/json' }, body: '{"synthetic":true}' })
  assert.equal(requests.at(-1).cookie, 'unchanged-cookie'); assert.equal(requests.at(-1).contentType, 'application/json')
  assert.equal(requests.at(-1).body, '{"synthetic":true}')
  assert.equal((await fetch(provider.url + '/empty', { method: 'HEAD' })).status, 200)
  for (const method of ['GET', 'HEAD']) assert.equal((await fetch(provider.url + '/empty', { method })).status, 200)
  assert.equal(requests.at(-1).authorization, undefined)
  for (const method of ['GET', 'HEAD']) {
    const status = await bounded(new Promise((resolve, reject) => {
      const request = http.request(provider.url + '/empty', { method, headers: { 'content-type': 'application/json', 'content-length': 2 } }, response => {
        response.resume(); response.on('end', () => resolve(response.statusCode))
      })
      request.on('error', reject); request.end('{}')
    }))
    assert.equal(status, 200); assert.equal(requests.at(-1).body, undefined)
  }
  const plain = await fetch(provider.url + '/plain'); assert.match(plain.headers.get('content-type'), /^text\/plain/); assert.equal(await plain.text(), 'unchanged bytes')
  const raw = await fetch(provider.url + '/raw'); assert.equal(raw.status, 202); assert.equal(await raw.text(), 'no content type')
  assert.equal(raw.headers.get('content-type'), 'application/octet-stream')
  assert.equal((await fetch(provider.url + '/redirect')).status, 502)
  gateway.url = 'http://127.0.0.1:1'; const unreachable = await fetch(provider.url + '/unreachable')
  assert.equal(unreachable.status, 502); assert.deepEqual(await unreachable.json(), { error: 'Isolated device provider transport failed' })
  for (const url of ['https://127.0.0.1:123', 'http://example.com:123', 'http://127.0.0.1']) await assert.rejects(bounded(createPhase9DeviceProvider({ url }, async () => ({}))), { message: 'Device provider requires an owned loopback gateway' })
})

test('device provider shutdown closes active owned connections and settles its acknowledgement', async t => {
  const { provider, requests } = await fixture(t)
  const pending = globalThis.fetch(provider.url + '/hanging').then(() => 'unexpected response', () => 'closed')
  await waitForProviderObservation(() => requests.some(x => x.path === '/hanging'))
  await bounded(provider.close())
  assert.equal(await pending, 'closed')
})
