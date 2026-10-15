import test from 'node:test'
import assert from 'node:assert/strict'
import { pickupPromiseForAssignment, driverDelayEligibleAt, isDriverDelayed, DRIVER_PICKUP_GRACE_MS } from '../services/driverDelay.js'
import { candidatesWithin, rankCandidates, markOffered, offerRideNow } from '../services/driverDispatchCandidates.js'
import { offerPoolCandidates } from '../services/driverDispatchOffers.js'
import { LOCATION_STALE_AFTER_MS } from '../constants/dispatch.js'
import { HOST_ACTIVE_STATUSES, POOL_RADIUS_KM } from '../services/ridePooling.js'
import { createTestClock } from './helpers/testClock.js'
import { getNavigationRoute, getCachedNavigationRoute, clearNavigationRouteCacheForTests, fetchRoutes, routeSequence,
  navigationRouteNeedsRefresh } from '../services/googleRoutes.js'
import { projectOntoPath } from '../services/geo.js'
import { decodePolyline } from '../services/safeRoute.js'

const clock = createTestClock('2026-10-09T08:00:00Z')

test('pickup promises retain explicit time, equality-at-schedule routing and exact fallback economics', async t => {
  const warning = t.mock.method(console, 'warn', () => {})
  const booking = { id: 'booking', pickupLat: 0, pickupLng: 0 }
  const location = { latitude: 0.01, longitude: 0 }
  const reads = [], requests = []
  const db = { driverLocation: { findUnique: async args => { reads.push(args); return location } } }
  const route = { minutes: 7 }
  const navigation = { getNavigationRoute: async args => { requests.push(args); return route } }
  const supplied = new Date(clock.now().getTime() + 120_000)
  const result = await pickupPromiseForAssignment({ ...booking, scheduledAt: supplied }, 'driver', supplied, clock, { db, navigation })
  assert.equal(result.expectedPickupAt.getTime(), supplied.getTime() + 7 * 60_000)
  assert.deepEqual(reads, [{ where: { driverId: 'driver' } }])
  assert.deepEqual(requests, [{ cacheKey: 'booking:assignment-pickup', origin: { lat: 0.01, lng: 0 }, destination: { lat: 0, lng: 0 } }])
  const fallback = await pickupPromiseForAssignment(booking, 'driver', supplied, clock, { db,
    navigation: { getNavigationRoute: async () => { throw new Error('offline failure') } } })
  assert.equal(fallback.expectedPickupAt.getTime(), supplied.getTime() + 7 * 60_000)
  assert.deepEqual(warning.mock.calls[0].arguments, ['Could not freeze pickup ETA for booking:', 'offline failure'])
  warning.mock.resetCalls()
  const absent = await pickupPromiseForAssignment(booking, 'driver', supplied, clock,
    { db: { driverLocation: { findUnique: async () => null } }, navigation })
  assert.equal(absent.expectedPickupAt.getTime(), supplied.getTime() + 10 * 60_000)
  assert.equal(warning.mock.callCount(), 0, 'absent GPS is not a provider exception')
  assert.equal(DRIVER_PICKUP_GRACE_MS, 600_000)
  const expectedPickupAt = clock.now(), eligible = expectedPickupAt.getTime() + 600_000
  assert.equal(driverDelayEligibleAt({ expectedPickupAt }).getTime(), eligible)
  for (const status of ['assigned', 'en_route']) {
    assert.equal(isDriverDelayed({ status, expectedPickupAt }, eligible - 1, clock), false)
    assert.equal(isDriverDelayed({ status, expectedPickupAt }, eligible, clock), true)
    assert.equal(isDriverDelayed({ status, expectedPickupAt }, 0, clock), false)
  }
  assert.equal(isDriverDelayed({ status: 'completed', expectedPickupAt }, eligible + 1, clock), false)
})

test('PostGIS query binds geography, radius, receipt cutoff, suspension time, exclusions and exact hydration', async () => {
  const row = { pickupLat: 28.5272, pickupLng: 77.5755, vehicleClass: 'sedan' }
  let query, hydration
  const driver = { id: 'driver', isActive: true, verificationStatus: 'approved' }
  const db = { $queryRaw: async (...args) => { query = args; return [{ driverId: 'driver', distanceKm: 1 }] },
    driver: { findMany: async args => { hydration = args; return [driver] } }, reliabilityBlock: { findFirst: async () => null } }
  const result = await candidatesWithin(row, 20, new Set(['previous']), { db, clock })
  assert.equal(result.length, 1)
  assert.deepEqual(query.slice(1).map(value => Array.isArray(value?.values) ? value.values : value), [
    [77.5755, 28.5272], [77.5755, 28.5272], 20_000,
    new Date(clock.now().getTime() - LOCATION_STALE_AFTER_MS), clock.now(), 'sedan', ['previous'],
  ])
  assert.equal(query[1].strings.join('?'), 'extensions.ST_SetSRID(extensions.ST_MakePoint(?::float8, ?::float8), 4326)::extensions.geography')
  assert.match(query[0].join('?'), /ST_Distance[\s\S]*ST_DWithin[\s\S]*"is_online"[\s\S]*"is_active"[\s\S]*"suspension_expires_at"[\s\S]*'approved'[\s\S]*"vehicle_class"[\s\S]*ANY/)
  assert.deepEqual(hydration, { where: { id: { in: ['driver'] } }, include: { bookings: {
    where: { status: { in: HOST_ACTIVE_STATUSES } }, select: { id: true, status: true, sharing: true,
      pickupLat: true, pickupLng: true, dropLat: true, dropLng: true, routePolyline: true },
  } } })
  await candidatesWithin(row, 20, new Set(), { db: { $queryRaw: async () => [] }, clock })
  let instants = 0
  const stepped = { now: () => new Date(clock.now().getTime() + instants++) }
  await candidatesWithin(row, 20, new Set(), { clock: stepped, db: { ...db,
    $queryRaw: async () => [{ driverId: 'missing' }, { driverId: 'driver' }] } })
  assert.equal(instants, 3, 'only a hydrated actor receives an eligibility timestamp')
})

test('fairness bands apply turns before distance and creation time resolves exact ties in either input order', () => {
  const candidate = (id, distanceKm, lastOfferedAt, createdAt = 0) => ({ id, distanceKm,
    driver: { group: 'rcs', lastOfferedAt: new Date(lastOfferedAt), createdAt: new Date(createdAt) } })
  const older = candidate('older', 2.9, 0), closer = candidate('closer', 1, 1000)
  for (const input of [[older, closer], [closer, older]]) assert.equal(rankCandidates([...input])[0].id, 'older')
  const oldCreation = candidate('old', 1, 1000, 0), newCreation = candidate('new', 1, 1000, 1000)
  for (const input of [[newCreation, oldCreation], [oldCreation, newCreation]]) assert.equal(rankCandidates([...input])[0].id, 'old')
})

test('offer journaling and warnings preserve actor, time, recipient, display text and booking navigation', async t => {
  const errors = t.mock.method(console, 'error', () => {})
  let update, sent
  const at = clock.now()
  await markOffered('driver', at, { db: { driver: { update: async args => { update = args } } } })
  assert.deepEqual(update, { where: { id: 'driver' }, data: { lastOfferedAt: at } })
  const failure = new Error('write failure')
  await markOffered('driver', at, { db: { driver: { update: async () => { throw failure } } } })
  assert.deepEqual(errors.mock.calls[0].arguments, ['could not mark driver driver as offered:', failure])
  const driver = { id: 'driver', group: 'rcs' }, row = { id: 'booking', sharing: false, pickupAddress: 'pickup', dropAddress: 'drop', fare: 1000 }
  const db = { rideOffer: { create: async () => ({}) } }, push = async (...args) => { sent = args }
  await offerRideNow(row, { driver }, null, { db, push })
  assert.deepEqual(sent, [driver, { title: 'New ride', body: 'pickup → drop · ₹1000', data: { screen: 'notifications', bookingId: 'booking' } }])
})

test('pool offers include the radius boundary, actual driver position, spent turn and shared database context', async t => {
  const error = t.mock.method(console, 'error', () => {})
  const writes = [], tried = new Set(), at = clock.now()
  const host = { id: 'host', status: 'assigned', sharing: true, pickupLat: 28.5272, pickupLng: 77.5755, dropLat: 28.545, dropLng: 77.35 }
  const joiner = { ...host, id: 'joiner', pickupAddress: 'pickup', dropAddress: 'drop', fare: 1000 }
  const driver = { id: 'driver', group: 'rcs', vehicleCapacity: 4, vehicleClass: 'sedan', bookings: [host] }
  const candidate = { driverId: driver.id, driver, latitude: 28.5272, longitude: 77.5755, distanceKm: POOL_RADIUS_KM }
  const db = { driver: { update: async args => { writes.push(args) } }, rideOffer: { create: async args => { writes.push(args) } } }
  const route = async stops => { assert.deepEqual(stops[0], { lat: candidate.latitude, lng: candidate.longitude });
    return { totalMin: (stops.length - 1) * 2, legs: stops.slice(1).map(() => ({ min: 2, km: 1 })) } }
  assert.equal(await offerPoolCandidates(joiner, [candidate], tried, { db, clock, push: async () => {}, route }), 1)
  assert.equal(tried.has('driver'), true)
  assert.deepEqual(writes[0], { where: { id: 'driver' }, data: { lastOfferedAt: at } })
  await offerPoolCandidates(joiner, [candidate], new Set(), { db, clock, push: async () => {},
    route: async () => { throw new Error('route failure') } })
  assert.deepEqual(error.mock.calls[0].arguments, ['pool evaluation failed for driver driver:', 'route failure'])
})

function routeFixture(routes = [{ duration: '360s', staticDuration: '300s', distanceMeters: 1200 }]) {
  const calls = [], reads = [], writes = [], cache = new Map()
  const db = { apiUsage: { findUnique: async args => { reads.push(args); return { count: 1 } },
    upsert: async args => { writes.push(args) } } }
  const options = { db, clock, cache, apiKey: 'offline', request: async (...args) => {
    calls.push(args); return { ok: true, json: async () => ({ routes }) }
  } }
  return { calls, reads, writes, options }
}
const endpoints = { cacheKey: 'mutation-route', origin: { lat: 28.6, lng: 77.2 }, destination: { lat: 28.61, lng: 77.21 } }
const fieldMask = 'routes.distanceMeters,routes.duration,routes.staticDuration,routes.polyline.encodedPolyline'
const waypoint = coords => ({ location: { latLng: { latitude: coords.lat, longitude: coords.lng } } })
const googleUrl = 'https://routes.googleapis.com/directions/v2:computeRoutes'

test('navigation quota identity, request contract, positive cache age and malformed durations remain exact', async () => {
  const f = routeFixture()
  const month = new Date().toISOString().slice(0, 7)
  const result = await getNavigationRoute(endpoints, f.options)
  assert.deepEqual(f.reads, [{ where: { service_month: { service: 'google_routes', month } } }])
  assert.deepEqual(f.writes, [{ where: { service_month: { service: 'google_routes', month } }, update: { count: { increment: 1 } },
    create: { service: 'google_routes', month, count: 1 } }])
  assert.deepEqual(f.calls[0], [googleUrl, { method: 'POST', headers: { 'Content-Type': 'application/json',
    'X-Goog-Api-Key': 'offline', 'X-Goog-FieldMask': fieldMask }, body: JSON.stringify({ origin: waypoint(endpoints.origin),
    destination: waypoint(endpoints.destination), travelMode: 'DRIVE', routingPreference: 'TRAFFIC_AWARE_OPTIMAL', polylineQuality: 'HIGH_QUALITY' }) }])
  const ageClock = { now: () => new Date(clock.now().getTime() + 30_000) }
  assert.equal(getCachedNavigationRoute(endpoints, { ...f.options, clock: ageClock }).provenance.cache.ageMs, 30_000)
  assert.equal(getCachedNavigationRoute(endpoints, { ...f.options, clock: { now: () => new Date(clock.now().getTime() - 1) } }).provenance.cache.ageMs, 0)
  assert.equal(result.provenance.cache.hit, false)
  const malformedCache = routeFixture()
  malformedCache.options.cache.set(endpoints.cacheKey, { value: null, expiresAt: clock.now().getTime() + 60_000 })
  assert.equal(getCachedNavigationRoute(endpoints, malformedCache.options), null)
  assert.equal(await getNavigationRoute(endpoints, malformedCache.options), null)
  for (const duration of ['s360s', 'Stryker was here!360s']) {
    const bad = await getNavigationRoute(endpoints, routeFixture([{ duration, polyline: { encodedPolyline: 'x' } }]).options)
    assert.equal(bad.minutes, null); assert.equal(bad.provenance.trafficDurationSeconds, null)
  }
  const empty = routeFixture(); empty.options.request = async () => ({ ok: true, json: async () => ({}) })
  assert.equal(await getNavigationRoute(endpoints, empty.options), null)
  const { cache: _private, ...globalOptions } = f.options
  await getNavigationRoute(endpoints, globalOptions)
  assert.ok(getCachedNavigationRoute(endpoints, { clock }))
  clearNavigationRouteCacheForTests()
  assert.equal(getCachedNavigationRoute(endpoints, { clock }), null)
})

test('quote requests bind via versus alternatives and retain address, distance and missing geometry provenance', async () => {
  const f = routeFixture()
  const quoted = await fetchRoutes('pickup', 'drop', endpoints.origin, endpoints.destination, endpoints.origin, f.options)
  assert.deepEqual(f.calls[0], [googleUrl, { method: 'POST', headers: { 'Content-Type': 'application/json',
    'X-Goog-Api-Key': 'offline', 'X-Goog-FieldMask': fieldMask }, body: JSON.stringify({ origin: waypoint(endpoints.origin),
    destination: waypoint(endpoints.destination), intermediates: [{ ...waypoint(endpoints.origin), via: true }], travelMode: 'DRIVE' }) }])
  assert.equal(quoted[0].distanceKm, 1.2); assert.deepEqual(quoted[0].points, [])
  const addresses = await fetchRoutes('pickup', 'drop', null, null, null, f.options)
  assert.deepEqual(addresses[0].provenance.origin, { address: 'pickup' })
  assert.deepEqual(addresses[0].provenance.destination, { address: 'drop' })
  assert.deepEqual(JSON.parse(f.calls[1][1].body), { origin: { address: 'pickup' }, destination: { address: 'drop' },
    computeAlternativeRoutes: true, travelMode: 'DRIVE' })
  f.options.request = async () => ({ json: async () => ({}) })
  await assert.rejects(fetchRoutes('pickup', 'drop', null, null, null, f.options), /No route/)
})

test('stop sequence sends only interior waypoints and retains exact route endpoints and timing provenance', async () => {
  const middle = { lat: 28.605, lng: 77.205 }
  const stops = [endpoints.origin, middle, endpoints.destination]
  const f = routeFixture([{ duration: '360s', staticDuration: '300s', distanceMeters: 1200, legs: [{ duration: '180s', distanceMeters: 600 }] }])
  const result = await routeSequence(stops, f.options)
  assert.deepEqual(f.calls[0], [googleUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': 'offline',
    'X-Goog-FieldMask': 'routes.duration,routes.staticDuration,routes.distanceMeters,routes.legs.duration,routes.legs.distanceMeters' },
  body: JSON.stringify({ origin: waypoint(endpoints.origin), destination: waypoint(endpoints.destination), intermediates: [waypoint(middle)], travelMode: 'DRIVE' }) }])
  assert.deepEqual(result.provenance, { origin: endpoints.origin, destination: endpoints.destination, provider: 'google_routes',
    trafficMode: 'UNSPECIFIED', providerRouteId: null, durationSeconds: 300, trafficDurationSeconds: null, distanceMeters: 1200,
    calculatedAt: clock.now(), receivedAt: clock.now(), cache: { identity: null, hit: false, ageMs: 0 } })
  f.options.request = async () => ({ json: async () => ({}) })
  await assert.rejects(routeSequence(stops, f.options), /No route/)
})

test('route refresh uses the strict deviation boundary while retaining malformed-path fallback', () => {
  const route = { polyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@' }, origin = { lat: 28.6, lng: 77.2 }
  const exact = projectOntoPath(origin, decodePolyline(route.polyline)).offRouteKm
  assert.equal(navigationRouteNeedsRefresh(route, origin, exact), false)
  assert.equal(navigationRouteNeedsRefresh(route, origin, exact - 1), true)
  assert.equal(navigationRouteNeedsRefresh({ polyline: 'x' }, { lng: 77.2 }), false)
})
