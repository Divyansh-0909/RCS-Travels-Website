import test from 'node:test'
import assert from 'node:assert/strict'
import { createTestClock } from './helpers/testClock.js'
import { createRoutingEvidence } from './helpers/routingEvidence.js'
import { createLocationEvidence, pickupProgress } from './helpers/locationEvidence.js'
import { createConnectivityEvidence, connectivityState } from './helpers/connectivityEvidence.js'
import { createNotificationSink } from './helpers/notificationSink.js'
import { sendPush, sendWhatsAppTemplate } from '../services/notification.js'

const start = '2026-09-23T19:00:00+05:30'
const pointA = { lat: 28.6, lng: 77.2 }
const pointB = { lat: 28.7, lng: 77.3 }

test('routing fake returns a traffic-aware route with source, timing and distance', () => {
  const clock = createTestClock(start)
  const fake = createRoutingEvidence({ clock })
  fake.setRoute({ origin: pointA, destination: pointB, distanceKm: 15,
    normalMinutes: 17, trafficMinutes: 20, routeId: 'route-1' })
  const { observation, failure, cacheAgeMs } = fake.query({ origin: pointA, destination: pointB })
  assert.equal(failure, null)
  assert.equal(observation.trafficMinutes, 20)
  assert.equal(observation.distanceKm, 15)
  assert.equal(observation.trafficMode, 'TRAFFIC_AWARE_OPTIMAL')
  assert.equal(observation.routeId, 'route-1')
  assert.equal(observation.provider, 'google_routes')
  assert.equal(observation.receivedAt.getTime(), clock.now().getTime())
  assert.equal(cacheAgeMs, 0)
  assert.equal(fake.history[0].failure, null)
  assert.deepEqual(fake.history[0].origin, pointA)
  assert.equal(fake.history[0].cached, null)
  assert.deepEqual(observation.origin, pointA)
  assert.deepEqual(observation.destination, pointB)
})

test('routing fake evolves ETA with controlled time and resets cleanly', () => {
  const clock = createTestClock(start)
  const fake = createRoutingEvidence({ clock })
  const observed = []
  for (const eta of [20, 24, 27]) {
    fake.setRoute({ origin: pointA, destination: pointB, distanceKm: 15,
      normalMinutes: 17, trafficMinutes: eta })
    observed.push(fake.query({ origin: pointA, destination: pointB }).observation.trafficMinutes)
    clock.advance(5 * 60_000)
  }
  assert.deepEqual(observed, [20, 24, 27])
  assert.equal(fake.history.length, 3)
  fake.reset()
  assert.equal(fake.query({ origin: pointA, destination: pointB }).failure, 'NO_ROUTE')
})

test('routing timeout leaves aged cached evidence visible without classifying feasibility', () => {
  const clock = createTestClock(start)
  const fake = createRoutingEvidence({ clock })
  fake.setRoute({ origin: pointA, destination: pointB, distanceKm: 15,
    normalMinutes: 18, trafficMinutes: 20 })
  clock.advance(90_000)
  fake.failNext(pointA, pointB, 'TIMEOUT')
  const result = fake.query({ origin: pointA, destination: pointB })
  assert.equal(result.failure, 'TIMEOUT')
  assert.equal(result.observation, null)
  assert.equal(result.cached.trafficMinutes, 20)
  assert.equal(result.cacheAgeMs, 90_000)
  assert.equal(fake.query({ origin: pointA, destination: pointB }).failure, null)
})

test('routing fake preserves no-cache failure, queued failures and reset', () => {
  const fake = createRoutingEvidence({ clock: createTestClock(start) })
  fake.failNext(pointA, pointB, 'RATE_LIMIT')
  fake.failNext(pointA, pointB, 'UNAVAILABLE')
  assert.equal(fake.query({ origin: pointA, destination: pointB }).failure, 'RATE_LIMIT')
  assert.equal(fake.query({ origin: pointA, destination: pointB }).failure, 'UNAVAILABLE')
  assert.equal(fake.query({ origin: pointA, destination: pointB }).cached, null)
  fake.reset()
  assert.equal(fake.history.length, 0)
})

test('routing evidence is keyed by both endpoints and clears queued failures on reset', () => {
  const fake = createRoutingEvidence({ clock: createTestClock(start) })
  const other = { lat: 28.8, lng: 77.4 }
  fake.setRoute({ origin: pointA, destination: pointB, distanceKm: 15,
    normalMinutes: 17, trafficMinutes: 20 })
  fake.setRoute({ origin: pointA, destination: other, distanceKm: 25,
    normalMinutes: 30, trafficMinutes: 35 })
  assert.equal(fake.query({ origin: pointA, destination: pointB }).observation.distanceKm, 15)
  assert.equal(fake.query({ origin: pointA, destination: other }).observation.distanceKm, 25)
  fake.failNext(pointA, other, 'TIMEOUT')
  fake.reset()
  assert.equal(fake.query({ origin: pointA, destination: other }).failure, 'NO_ROUTE')
  assert.equal(fake.query({ origin: pointA, destination: pointB }).failure, 'NO_ROUTE')
})

test('routing fake fits the navigation route and ETA service return shape', async () => {
  const fake = createRoutingEvidence({ clock: createTestClock(start) })
  const args = { origin: pointA, destination: pointB, cacheKey: 'driver-1:pickup' }
  assert.equal(await fake.getNavigationRoute(args), null)
  assert.equal(await fake.getNavigationEtaMinutes(args), null)
  fake.setRoute({ origin: pointA, destination: pointB, distanceKm: 15,
    normalMinutes: 17, trafficMinutes: 20, polyline: 'route-polyline' })
  assert.deepEqual(await fake.getNavigationRoute(args), { minutes: 20, polyline: 'route-polyline' })
  assert.equal(await fake.getNavigationEtaMinutes(args), 20)
  fake.failNext(pointA, pointB, 'TIMEOUT')
  await assert.rejects(fake.getNavigationRoute(args), /TIMEOUT/)
})

test('location evidence keeps exact age, accuracy, ordered history and reset', () => {
  const clock = createTestClock(start)
  const locations = createLocationEvidence({ clock })
  assert.deepEqual(locations.history('driver-1'), [])
  assert.deepEqual(locations.history(undefined), [])
  const now = clock.now().getTime()
  for (const [seconds, accuracy] of [[30, 20], [90, 100], [180, 180]]) {
    locations.add({ driverId: 'driver-1', latitude: 28.6, longitude: 77.2,
      accuracyMeters: accuracy, observedAt: new Date(now - seconds * 1000) })
  }
  const history = locations.history('driver-1')
  assert.deepEqual(history.map(sample => locations.ageMs(sample)), [180_000, 90_000, 30_000])
  assert.deepEqual(history.map(sample => sample.accuracyMeters), [180, 100, 20])
  assert.equal(locations.latest('driver-1').accuracyMeters, 20)
  assert.equal(locations.latest('driver-1').source, 'device_gps')
  assert.equal(locations.latest('other-driver'), null)
  locations.reset()
  assert.deepEqual(locations.history('driver-1'), [])
})

test('buffered GPS retains observation and later upload time', () => {
  const locations = createLocationEvidence({ clock: createTestClock(start) })
  const sample = locations.add({ driverId: 'driver-1', latitude: 28.6, longitude: 77.2,
    accuracyMeters: 60, observedAt: '2026-09-23T19:05:00+05:30',
    receivedAt: '2026-09-23T19:12:00+05:30', deviceId: 'device-1' })
  assert.equal(sample.receivedAt.getTime() - sample.observedAt.getTime(), 7 * 60_000)
  assert.equal(locations.history('driver-1')[0].deviceId, 'device-1')
})

test('pickup progress exposes ETA and route distance independently', () => {
  for (const initial of [5, 10, 20, 30, 60, 90]) {
    const progress = pickupProgress({ originalEtaMinutes: initial,
      currentEtaMinutes: initial - 2, originalDistanceKm: 10, currentDistanceKm: 9 })
    assert.equal(progress.etaProgressMinutes, 2)
    assert.equal(progress.routeDistanceProgressKm, 1)
    assert.equal(progress.originalEtaMinutes, initial)
  }
})

test('ordered driver samples and route observations expose pickup approach progress', () => {
  const clock = createTestClock(start)
  const locations = createLocationEvidence({ clock })
  const routing = createRoutingEvidence({ clock })
  locations.add({ driverId: 'driver-1', latitude: pointA.lat, longitude: pointA.lng,
    accuracyMeters: 20 })
  routing.setRoute({ origin: pointA, destination: pointB, distanceKm: 15,
    normalMinutes: 15, trafficMinutes: 20 })
  const initial = routing.query({ origin: pointA, destination: pointB }).observation
  clock.advance(5 * 60_000)
  const closer = { lat: 28.65, lng: 77.25 }
  locations.add({ driverId: 'driver-1', latitude: closer.lat, longitude: closer.lng,
    accuracyMeters: 25 })
  routing.setRoute({ origin: closer, destination: pointB, distanceKm: 9,
    normalMinutes: 9, trafficMinutes: 12 })
  const current = routing.query({ origin: closer, destination: pointB }).observation
  const progress = pickupProgress({ originalEtaMinutes: initial.trafficMinutes,
    currentEtaMinutes: current.trafficMinutes, originalDistanceKm: initial.distanceKm,
    currentDistanceKm: current.distanceKm })
  assert.equal(locations.history('driver-1').length, 2)
  assert.equal(locations.history('driver-1')[1].observedAt - locations.history('driver-1')[0].observedAt,
    5 * 60_000)
  assert.equal(progress.etaProgressMinutes, 8)
  assert.equal(progress.routeDistanceProgressKm, 6)
})

test('connectivity records offline recovery without inferring fault from missing GPS', () => {
  assert.deepEqual(connectivityState, {
    ONLINE: 'online', OFFLINE: 'offline', DEGRADED: 'degraded', UNKNOWN: 'unknown',
  })
  const clock = createTestClock(start)
  const evidence = createConnectivityEvidence({ clock })
  evidence.record('onlineSelection', connectivityState.ONLINE)
  evidence.record('gpsObserved', 'fix-1', clock.now(), 'device')
  evidence.record('heartbeat', 'ok')
  clock.advance(60_000)
  evidence.record('network', connectivityState.OFFLINE, clock.now(), 'device')
  clock.advance(120_000)
  evidence.record('network', connectivityState.ONLINE, clock.now(), 'device')
  assert.equal(evidence.history().length, 5)
  assert.equal(evidence.latest('network').value, connectivityState.ONLINE)
  assert.equal(evidence.latest('gpsObserved').value, 'fix-1')
  assert.equal(evidence.latest('heartbeat').source, 'server')
  evidence.reset()
  assert.equal(evidence.latest('network'), null)
})

test('late-arriving connectivity evidence is ordered by observation time', () => {
  const clock = createTestClock(start)
  const evidence = createConnectivityEvidence({ clock })
  const earlier = new Date(clock.now().getTime() - 30_000)
  evidence.record('network', connectivityState.ONLINE)
  evidence.record('network', connectivityState.DEGRADED, earlier, 'device')
  assert.deepEqual(evidence.history().map(entry => entry.value),
    [connectivityState.DEGRADED, connectivityState.ONLINE])
  assert.equal(evidence.history()[0].source, 'device')
})

test('connectivity records beyond three minutes offline as evidence only', () => {
  const clock = createTestClock(start)
  const evidence = createConnectivityEvidence({ clock })
  evidence.record('network', connectivityState.OFFLINE)
  clock.advance(181_000)
  evidence.record('apiActivity', 'none')
  assert.equal(evidence.history()[1].at - evidence.history()[0].at, 181_000)
  assert.equal(evidence.latest('network').value, connectivityState.OFFLINE)
})

test('push provider accepts then delivery sink confirms at a later time', async () => {
  const clock = createTestClock(start)
  const sink = createNotificationSink({ clock })
  const accepted = await sendPush({ id: 'driver-1', fcmToken: 'token-1' },
    { title: 'Warning', body: 'Check pickup', data: { bookingId: 'ride-1' } }, sink.messaging)
  assert.equal(accepted, true)
  assert.equal(sink.history()[0].state, 'pending')
  clock.advance(10_000)
  const delivered = sink.deliver('msg_0001')
  assert.equal(delivered.state, 'delivered')
  assert.equal(delivered.channel, 'push')
  assert.equal(delivered.type, 'Warning')
  assert.equal(delivered.providerMessageId, 'msg_0001')
  assert.equal(delivered.deliveredAt.getTime() - delivered.attemptedAt.getTime(), 10_000)
})

test('notification failure and timeout preserve attempted versus delivered', async () => {
  const sink = createNotificationSink({ clock: createTestClock(start) })
  sink.next('failed', 'PROVIDER_REJECTED')
  const failed = await sink.send({ channel: 'whatsapp', recipient: '911234567890', type: 'warning' })
  assert.equal(failed.deliveredAt, null)
  assert.equal(failed.providerMessageId, null)
  sink.next('timeout', 'NETWORK_TIMEOUT')
  await assert.rejects(sink.send({ channel: 'push', recipient: 'token', type: 'warning' }),
    /NOTIFICATION_TIMEOUT/)
  assert.equal(sink.history()[1].state, 'timeout')
  assert.equal(sink.history()[1].deliveredAt, null)
  assert.equal(sink.history()[1].providerMessageId, null)
})

test('push rejection remains a failed attempt at the existing push boundary', async () => {
  const sink = createNotificationSink({ clock: createTestClock(start) })
  sink.next('failed', 'PROVIDER_REJECTED')
  const originalError = console.error
  console.error = () => {}
  try {
    assert.equal(await sendPush({ id: 'driver-1', fcmToken: 'token-1' },
      { title: 'Warning', body: 'Check pickup' }, sink.messaging), false)
  } finally {
    console.error = originalError
  }
  assert.equal(sink.history()[0].failureCategory, 'PROVIDER_REJECTED')
  assert.equal(sink.history()[0].deliveredAt, null)
})

test('WhatsApp provider adapter preserves rejection and its response body', async () => {
  const sink = createNotificationSink({ clock: createTestClock(start) })
  sink.next('failed', 'META_REJECTED')
  const failed = await sink.whatsappRequest('https://example.invalid',
    { body: JSON.stringify({ to: '911234567890', type: 'template', template: { name: 'warning' } }) })
  assert.equal(failed.ok, false)
  assert.equal(failed.status, 503)
  assert.equal(await failed.text(), 'META_REJECTED')
  const pending = await sink.whatsappRequest('https://example.invalid',
    { body: JSON.stringify({ to: '911234567890', type: 'text' }) })
  assert.equal(pending.ok, true)
  assert.equal(pending.status, 200)
  assert.equal(await pending.text(), '')
  assert.deepEqual(await pending.json(), { messages: [{ id: 'msg_0001' }] })
  assert.equal(sink.history()[1].type, 'text')
})

test('push adapter preserves fallback type and fallback provider rejection', async () => {
  const sink = createNotificationSink({ clock: createTestClock(start) })
  const messaging = sink.messaging()
  assert.equal(await messaging.send({ token: 'token-1' }), 'msg_0001')
  assert.equal(sink.history()[0].type, 'push')
  sink.next('failed')
  await assert.rejects(messaging.send({ token: 'token-1' }), /PUSH_REJECTED/)
  assert.equal(sink.history()[1].failureCategory, null)
})

test('retries with the same logical notification remain distinct attempts', async () => {
  const sink = createNotificationSink({ clock: createTestClock(start) })
  sink.next('delayed')
  await sink.send({ channel: 'push', recipient: 'token', type: 'warning', idempotencyKey: 'ride-1-warning' })
  await sink.send({ channel: 'push', recipient: 'token', type: 'warning', idempotencyKey: 'ride-1-warning' })
  assert.deepEqual(sink.history().map(entry => entry.retryCount), [0, 1])
  assert.notEqual(sink.history()[0].providerMessageId, sink.history()[1].providerMessageId)
  assert.throws(() => sink.deliver('missing'), /Unknown notification/)
  sink.reset()
  assert.deepEqual(sink.history(), [])
  assert.equal((await sink.send({ channel: 'push', recipient: 'token', type: 'warning' })).providerMessageId,
    'msg_0001')
})

test('notification keys, payloads and planned outcomes remain inspectable', async () => {
  const sink = createNotificationSink({ clock: createTestClock(start) })
  assert.deepEqual(sink.history(), [])
  const payload = { reason: 'pickup' }
  await sink.send({ channel: 'push', recipient: 'a', type: 'warning', payload })
  await sink.send({ channel: 'push', recipient: 'b', type: 'warning' })
  await sink.send({ channel: 'push', recipient: 'c', type: 'warning', idempotencyKey: 'key-c' })
  await sink.send({ channel: 'push', recipient: 'd', type: 'warning', idempotencyKey: 'key-d' })
  payload.reason = 'changed'
  assert.deepEqual(sink.history().map(entry => entry.retryCount), [0, 0, 0, 0])
  assert.equal(sink.history()[0].payload.reason, 'pickup')
  assert.equal(sink.history()[0].state, 'pending')
  sink.next('failed', 'REJECTED')
  sink.reset()
  const fresh = await sink.send({ channel: 'push', recipient: 'a', type: 'warning' })
  assert.equal(fresh.state, 'pending')
})

test('WhatsApp template can use the existing injected request boundary', async () => {
  const sink = createNotificationSink({ clock: createTestClock(start) })
  const beforeId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const beforeToken = process.env.WHATSAPP_ACCESS_TOKEN
  process.env.WHATSAPP_PHONE_NUMBER_ID = 'test-phone-id'
  process.env.WHATSAPP_ACCESS_TOKEN = 'test-token'
  try {
    assert.equal(await sendWhatsAppTemplate('1234567890', 'ride_warning',
      { body: ['ride-1'] }, sink.whatsappRequest), true)
    assert.equal(sink.history()[0].channel, 'whatsapp')
    assert.equal(sink.history()[0].recipient, '911234567890')
    assert.equal(sink.history()[0].state, 'pending')
    const delivered = sink.deliver(sink.history()[0].providerMessageId)
    assert.equal(delivered.state, 'delivered')
    assert.equal(delivered.deliveredAt.getTime(), sink.history()[0].attemptedAt.getTime())
  } finally {
    if (beforeId === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID
    else process.env.WHATSAPP_PHONE_NUMBER_ID = beforeId
    if (beforeToken === undefined) delete process.env.WHATSAPP_ACCESS_TOKEN
    else process.env.WHATSAPP_ACCESS_TOKEN = beforeToken
  }
})
