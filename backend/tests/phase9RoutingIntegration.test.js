import test from 'node:test'
import assert from 'node:assert/strict'
import { getNavigationRoute, getNavigationEtaMinutes, getCachedNavigationRoute, navigationRouteNeedsRefresh,
  clearNavigationRouteCacheForTests, fetchRoutes, routeSequence } from '../services/googleRoutes.js'
import { pickupPromiseForAssignment } from '../services/driverDelay.js'
import { offerPoolCandidates, offerIdleCandidates } from '../services/driverDispatchOffers.js'
import { candidatesWithin, rankCandidates, markOffered, offerRideNow } from '../services/driverDispatchCandidates.js'
import { getDriver } from '../services/driverAssignment.js'
import { createTestClock } from './helpers/testClock.js'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const clock = createTestClock('2026-10-09T08:00:00Z')
const args = { cacheKey: 'route', origin: { lat: 28.6, lng: 77.2 }, destination: { lat: 28.61, lng: 77.21 } }

test('route request preserves an empty safety-zone configuration and null invalid-coordinate provenance', () => {
  execFileSync(process.execPath, ['--import', './tests/helpers/phase9UnitIsolation.js', '--import', 'tsx',
    '--experimental-test-module-mocks', fileURLToPath(new URL('./helpers/phase9RoutesConfigurationProbe.mjs', import.meta.url))],
  { stdio: 'pipe', cwd: fileURLToPath(new URL('../', import.meta.url)) })
})

test('routing retains the established default-clock and ETA fallback behavior', () => {
  execFileSync(process.execPath, ['--import', './tests/helpers/phase9UnitIsolation.js', '--import', 'tsx',
    '--experimental-test-module-mocks', fileURLToPath(new URL('./helpers/driverDelayProbe.mjs', import.meta.url))],
  { stdio: 'pipe', cwd: fileURLToPath(new URL('../', import.meta.url)) })
})

test('actual dispatcher uses real pool geometry, constraints and offer persistence with an isolated route provider', () => {
  execFileSync(process.execPath, ['--import', './tests/helpers/phase9UnitIsolation.js', '--import', 'tsx',
    '--experimental-test-module-mocks', fileURLToPath(new URL('./helpers/phase9DispatchPoolProbe.mjs', import.meta.url))],
  { stdio: 'pipe', cwd: fileURLToPath(new URL('../', import.meta.url)), timeout: 20_000 })
})
function fixture(routes = [{ duration: '360s', staticDuration: '300s', distanceMeters: 1200 }]) {
  const reads = [], writes = [], requests = [], cache = new Map()
  const db = { apiUsage: { findUnique: async query => { reads.push(query); return null },
    upsert: async query => { writes.push(query); return query.create } } }
  const deps = { db, clock, cache, apiKey: 'offline', request: async (url, options) => {
    requests.push({ url, options }); return { ok: true, json: async () => ({ routes }) }
  } }
  return { deps, reads, writes, requests, cache }
}

test('navigation uses the real parser, usage boundary and independent calculation/receipt metadata', async () => {
  const f = fixture()
  const route = await getNavigationRoute(args, f.deps)
  assert.equal(route.minutes, 6); assert.equal(route.polyline, null)
  assert.deepEqual(route.provenance, { origin: args.origin, destination: args.destination,
    provider: 'google_routes', trafficMode: 'TRAFFIC_AWARE_OPTIMAL', providerRouteId: null,
    durationSeconds: 300, trafficDurationSeconds: 360, distanceMeters: 1200,
    calculatedAt: clock.now(), receivedAt: clock.now(), cache: { identity: 'route', hit: false, ageMs: 0 } })
  assert.equal(f.writes[0].create.service, 'google_routes')
  assert.equal(f.requests[0].options.headers['X-Goog-Api-Key'], 'offline')
  assert.equal(JSON.parse(f.requests[0].options.body).routingPreference, 'TRAFFIC_AWARE_OPTIMAL')
  assert.equal((await getNavigationRoute(args, f.deps)).provenance.cache.hit, true)
  assert.equal(f.requests.length, 1)
  assert.equal(getCachedNavigationRoute(args, f.deps).provenance.cache.hit, true)
  assert.equal(getCachedNavigationRoute({}, f.deps), null)
  assert.equal(await getNavigationEtaMinutes(args, f.deps), 6)
  assert.equal(await getNavigationEtaMinutes({}), null)
  clearNavigationRouteCacheForTests()
  assert.equal(getCachedNavigationRoute(args), null)
  clock.advance(60_000)
  assert.equal(getCachedNavigationRoute(args, f.deps), null)
  await getNavigationRoute(args, f.deps)
  assert.equal(f.requests.length, 2)
})

test('navigation rejects invalid inputs and provider failure, clears failed cache and coalesces in-flight requests', async () => {
  for (const bad of [{}, { ...args, cacheKey: null }, { ...args, origin: null }, { ...args, origin: { lat: null, lng: 1 } },
    { ...args, origin: { lat: 1, lng: null } }, { ...args, destination: null }, { ...args, destination: { lat: null, lng: 1 } },
    { ...args, destination: { lat: 1, lng: null } }]) assert.equal(await getNavigationRoute(bad), null)
  const f = fixture()
  f.deps.request = async () => ({ ok: false, status: 503 })
  await assert.rejects(getNavigationRoute(args, f.deps), /GOOGLE_ROUTES_503/)
  assert.equal(f.cache.size, 0)
  f.deps.db.apiUsage.findUnique = async () => ({ count: 10000 })
  await assert.rejects(getNavigationRoute(args, f.deps), /MONTHLY|LIMIT/)
  const pending = fixture()
  const releases = []
  pending.deps.request = async () => new Promise(resolve => { releases.push(() => resolve({ ok: true,
    json: async () => ({ routes: [{ duration: '60s' }] }) })) })
  const first = getNavigationRoute(args, pending.deps)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(getCachedNavigationRoute(args, pending.deps), null)
  const second = getNavigationRoute(args, pending.deps)
  await new Promise(resolve => setImmediate(resolve))
  const requestCount = releases.length
  for (const release of releases) release()
  await Promise.allSettled([first, second])
  assert.equal(requestCount, 1, 'a cached pending route must not start another provider operation')
  assert.deepEqual(await first, await second)
  assert.equal(pending.writes.length, 1)
  for (const routes of [[], [{}], [{ polyline: { encodedPolyline: '' }, distanceMeters: null }],
    [{ duration: 'invalid', polyline: { encodedPolyline: 'x' } }]]) {
    const input = fixture(routes)
    const result = await getNavigationRoute(args, input.deps)
    if (routes[0]?.polyline?.encodedPolyline) assert.equal(result.minutes, null)
    else assert.equal(result, null)
  }
})

test('navigation refresh preserves cached origin and refuses malformed or departed paths', async () => {
  const f = fixture([{ duration: '60s', polyline: { encodedPolyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@' } }])
  await getNavigationRoute(args, f.deps)
  assert.equal(getCachedNavigationRoute(args, f.deps), null)
  await getNavigationRoute(args, f.deps)
  assert.equal(f.requests.length, 2)
  assert.equal(navigationRouteNeedsRefresh(null, args.origin), false)
  assert.equal(navigationRouteNeedsRefresh({ polyline: 'x' }, null), false)
  assert.equal(navigationRouteNeedsRefresh({ polyline: 'x' }, { lat: 1 }), false)
  assert.equal(navigationRouteNeedsRefresh({ polyline: 'x' }, args.origin), true)
  assert.equal(navigationRouteNeedsRefresh({ polyline: { length: 1 } }, args.origin), true)
})

test('quote and commitment route services parse actual controlled provider payloads and explicit unknowns', async () => {
  const f = fixture([{ distanceMeters: 1200, duration: '360s', polyline: { encodedPolyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@' } },
    { distanceMeters: 2400 }])
  const routes = await fetchRoutes('pickup', 'drop', args.origin, args.destination, args.origin, f.deps)
  assert.equal(routes[0].durationMin, 6); assert.equal(routes[0].points.length, 3)
  assert.equal(routes[1].durationMin, null); assert.equal(routes[1].polyline, null)
  assert.equal(routes[0].provenance.trafficDurationSeconds, null)
  assert.ok(JSON.parse(f.requests[0].options.body).intermediates)
  await fetchRoutes(undefined, undefined, null, null, undefined, f.deps)
  assert.deepEqual(JSON.parse(f.requests[1].options.body).origin, {})
  assert.equal(routes[0].provenance.cache.identity, null)
  await assert.rejects(fetchRoutes('p', 'd', null, null, null, fixture([]).deps), /No route/)
  const seq = fixture([{ duration: '480s', legs: [{ duration: '360s', distanceMeters: 1200 }, {}] }])
  const result = await routeSequence([args.origin, args.origin, args.destination], seq.deps)
  assert.deepEqual(result.legs, [{ min: 6, km: 1.2 }, { min: 0, km: 0 }])
  assert.equal(result.totalMin, 6)
  await routeSequence([args.origin, args.destination], seq.deps)
  for (const input of [null, [], [args.origin]]) await assert.rejects(routeSequence(input), /at least/)
  await assert.rejects(routeSequence([args.origin, args.destination], fixture([]).deps), /No route/)
  await assert.rejects(routeSequence([args.origin, args.destination], fixture([{}]).deps), /No route/)
})

test('pickup promise uses the actual scheduled rule, provider result and established fallback without assigning fault', async () => {
  const db = { driverLocation: { findUnique: async () => ({ latitude: 28.6, longitude: 77.2 }) } }
  const booking = { id: 'b', pickupLat: 28.61, pickupLng: 77.21 }
  assert.deepEqual(await pickupPromiseForAssignment({ ...booking, scheduledAt: new Date(clock.now().getTime() + 60_000) }, 'd', undefined, clock),
    { expectedPickupAt: new Date(clock.now().getTime() + 60_000), route: null })
  const route = { minutes: 15 }
  const actual = await pickupPromiseForAssignment(booking, 'd', undefined, clock, { db, navigation: { getNavigationRoute: async () => route } })
  assert.equal(actual.route, route); assert.equal(actual.expectedPickupAt.getTime() - clock.now().getTime(), 15 * 60_000)
  for (const location of [null, { latitude: 28.6, longitude: 77.2 }, { latitude: 10, longitude: 10 }]) {
    const fallback = await pickupPromiseForAssignment(booking, 'd', undefined, clock, {
      db: { driverLocation: { findUnique: async () => location } }, navigation: { getNavigationRoute: async () => { throw new Error('offline-route-failure') } },
    })
    assert.ok(fallback.expectedPickupAt > clock.now()); assert.equal(fallback.route, null)
  }
})

test('regular redispatch stops on a terminal booking and does not call providers', async () => {
  for (const row of [null, { status: 'cancelled' }, { status: 'completed' }, { status: 'started' }]) {
    assert.equal(await getDriver('b', { db: { booking: { findFirst: async () => row } } }), null)
  }
})

function dispatchFixture() {
  const updates = [], offers = [], pushes = [], queries = []
  const db = { driver: { update: async query => { updates.push(query); return query.data }, findMany: async () => [] },
    rideOffer: { create: async query => { offers.push(query); return query.data } },
    reliabilityBlock: { findFirst: async () => null }, $queryRaw: async (...query) => { queries.push(query); return [] } }
  const context = { db, clock, push: async (...args) => { pushes.push(args) } }
  const driver = { id: 'd', group: 'rcs', vehicleCapacity: 4, vehicleClass: 'sedan', createdAt: new Date(0) }
  const candidate = { driverId: 'd', driver, latitude: 28.5272, longitude: 77.5755, distanceKm: 1 }
  const row = { id: 'b', sharing: false, pickupLat: 28.5272, pickupLng: 77.5755, dropLat: 28.545, dropLng: 77.35,
    pickupAddress: 'synthetic pickup', dropAddress: 'synthetic drop', fare: 1000 }
  return { db, context, candidate, row, updates, offers, pushes, queries }
}

test('regular dispatcher retains actual idle-capacity checks, durable offers and notification failure fallback', async () => {
  const f = dispatchFixture(), tried = new Set()
  assert.equal(await offerIdleCandidates(f.row, [f.candidate], tried, f.context), 1)
  assert.equal(tried.has('d'), true); assert.equal(f.updates[0].data.lastOfferedAt.getTime(), clock.now().getTime())
  assert.deepEqual(f.offers[0].data, { bookingId: 'b', driverId: 'd', group: 'rcs', poolHostBookingId: null })
  assert.equal(f.pushes[0][1].title, 'New ride')
  for (const [sharing, capacity] of [[false, 0], [true, 0], [true, 1]]) {
    const fixture = dispatchFixture(); fixture.candidate.driver.vehicleCapacity = capacity
    assert.equal(await offerIdleCandidates({ ...fixture.row, sharing }, [fixture.candidate], new Set(), fixture.context), Number(capacity > 0))
    if (capacity > 0) assert.equal(fixture.pushes[0][1].title, 'New sharing ride')
  }
  const busy = dispatchFixture(); busy.candidate.driver.bookings = [{ id: 'another' }]
  assert.equal(await offerIdleCandidates(busy.row, [busy.candidate], new Set(), busy.context), 0)
  const rejected = dispatchFixture(); rejected.db.rideOffer.create = async () => { throw new Error('duplicate') }
  await offerRideNow(rejected.row, rejected.candidate, null, rejected.context)
  assert.equal(rejected.pushes.length, 0)
  await offerRideNow(f.row, f.candidate, 'host', { db: f.db, push: async () => { throw new Error('offline push') } })
  const broken = dispatchFixture(); broken.db.driver.update = async () => { throw new Error('offline db') }
  await markOffered('d', clock.now(), { db: broken.db })
})

test('pool dispatch invokes the actual geometry and route constraint service with controlled route responses', async t => {
  const errors = t.mock.method(console, 'error', () => {})
  const f = dispatchFixture()
  const host = { ...f.row, id: 'host', status: 'assigned', sharing: true }
  f.candidate.driver.bookings = [host]
  const route = async stops => ({ totalMin: (stops.length - 1) * 2, legs: stops.slice(1).map(() => ({ min: 2, km: 1 })) })
  const context = { ...f.context, route }
  assert.equal(await offerPoolCandidates({ ...f.row, sharing: true }, [f.candidate], new Set(), context), 1)
  assert.equal(f.offers[0].data.poolHostBookingId, 'host')
  assert.equal(f.pushes[0][1].title, 'New shared pickup on your route')
  assert.equal(await offerPoolCandidates(f.row, [f.candidate], new Set(), context), 0)
  assert.equal(await offerPoolCandidates({ ...f.row, sharing: true }, [{ ...f.candidate, distanceKm: 100 }], new Set(), context), 0)
  assert.equal(await offerPoolCandidates({ ...f.row, sharing: true }, [{ ...f.candidate, driver: { ...f.candidate.driver, bookings: [] } }], new Set(), context), 0)
  assert.equal(errors.mock.calls.length, 0, 'a driver without a host is excluded before evaluation')
  f.candidate.driver.vehicleCapacity = 0
  assert.equal(await offerPoolCandidates({ ...f.row, sharing: true }, [f.candidate], new Set(), context), 0)
  f.candidate.driver.vehicleCapacity = 4
  assert.equal(await offerPoolCandidates({ ...f.row, sharing: true }, [f.candidate], new Set(),
    { ...context, route: async () => { throw new Error('controlled route outage') } }), 0)
  assert.equal(await offerPoolCandidates({ ...f.row, sharing: true }, [f.candidate], new Set(),
    { ...context, route: async () => ({ totalMin: 0, legs: [] }) }), 0)
})

test('actual dispatcher widens the ring, binds database/clock/push and journals one real idle offer', async () => {
  const f = dispatchFixture(), row = { ...f.row, status: 'pending' }, radii = [], reads = []
  f.db.booking = { findFirst: async args => { reads.push(args); return row },
    findUnique: async args => { assert.deepEqual(args, { where: { id: 'b' }, select: { status: true } }); return row } }
  f.db.$queryRaw = async (...args) => {
    const radius = args[3]; radii.push(radius)
    return radius < 30_000 ? [] : [{ ...f.candidate, driver: undefined }]
  }
  f.db.driver.findMany = async () => [f.candidate.driver]
  assert.equal(await getDriver('b', f.context), 'offered')
  assert.deepEqual(reads, [{ where: { id: 'b' } }])
  assert.deepEqual(radii, [20_000, 30_000])
  assert.equal(f.offers.length, 1)
  assert.equal(f.offers[0].data.poolHostBookingId, null)
  assert.equal(f.pushes.length, 1)
  assert.deepEqual(f.updates[0], { where: { id: 'd' }, data: { lastOfferedAt: clock.now() } })
})

test('actual PostGIS candidate query, hydration, reliability filtering and priority ranking remain independent of fault', async () => {
  const f = dispatchFixture()
  assert.deepEqual(await candidatesWithin(f.row, 20, new Set(['old']), f.context), [])
  f.db.$queryRaw = async (...query) => { f.queries.push(query); return [{ driverId: 'd', distanceKm: 1 }, { driverId: 'missing' }] }
  f.db.driver.findMany = async query => { f.queries.push(query); return [f.candidate.driver] }
  assert.equal((await candidatesWithin(f.row, 20, new Set(), f.context)).length, 1)
  assert.ok(f.queries[0][0].join('').includes('ST_DWithin'))
  f.db.reliabilityBlock.findFirst = async () => ({ id: 'blocked' })
  assert.deepEqual(await candidatesWithin(f.row, 20, new Set(), f.context), [])
  const row = (group, distanceKm, lastOfferedAt = null, createdAt = new Date(0)) => ({ distanceKm,
    driver: { group, lastOfferedAt, createdAt } })
  const samples = [row('partner', 1), row('rcs', 7), row('rcs', 2), row('admin', 20),
    row('rcs', 2.1, new Date(1)), row('rcs', 2.1, new Date(1), new Date(2)), row('unknown', 1)]
  const ranked = rankCandidates(samples)
  assert.equal(ranked[0].driver.group, 'admin'); assert.equal(ranked[1].distanceKm, 2)
  assert.equal(ranked[4].distanceKm, 7)
  assert.ok(ranked[2].driver.createdAt < ranked[3].driver.createdAt)
  assert.deepEqual(rankCandidates([row('rcs', 2), row('rcs', 1)]).map(item => item.distanceKm), [1, 2])
})
