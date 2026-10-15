import test from 'node:test'
import assert from 'node:assert/strict'
import {
  persistRouteObservation,
  persistRouteObservationData,
  routeObservationData,
  ROUTE_OBSERVATION_EVENT,
} from '../services/routeProvenance.js'

const route = ({ hit = false, ageMs = 0, calculatedAt = '2026-09-25T10:00:00.000Z' } = {}) => ({
  minutes: 14,
  provenance: {
    origin: { lat: 28.6139, lng: 77.209 },
    destination: { lat: 28.5562, lng: 77.1 },
    provider: 'google_routes',
    trafficMode: 'TRAFFIC_AWARE_OPTIMAL',
    durationSeconds: 780,
    trafficDurationSeconds: 840,
    distanceMeters: 12_450,
    calculatedAt,
    receivedAt: '2026-09-25T10:00:01.000Z',
    cache: { identity: 'booking-1:pickup', hit, ageMs },
    providerRouteId: null,
  },
})

test('assignment acceptance persists the exact route fact used for its frozen ETA', () => {
  const data = routeObservationData({
    bookingId: 'booking-1',
    event: ROUTE_OBSERVATION_EVENT.ASSIGNMENT_ACCEPTED,
    route: route(),
  })

  assert.deepEqual(data, {
    bookingId: 'booking-1',
    event: 'assignment_accepted',
    originLat: 28.6139,
    originLng: 77.209,
    destinationLat: 28.5562,
    destinationLng: 77.1,
    provider: 'google_routes',
    trafficMode: 'TRAFFIC_AWARE_OPTIMAL',
    durationSeconds: 780,
    trafficDurationSeconds: 840,
    distanceMeters: 12_450,
    calculatedAt: new Date('2026-09-25T10:00:00.000Z'),
    receivedAt: new Date('2026-09-25T10:00:01.000Z'),
    cacheIdentity: 'booking-1:pickup',
    cacheHit: false,
    cacheAgeMs: 0,
    providerRouteId: null,
  })
})

test('a cancellation cache hit preserves its original observation time and age', () => {
  const data = routeObservationData({
    bookingId: 'booking-1',
    event: ROUTE_OBSERVATION_EVENT.RIDER_CANCELLED,
    route: route({ hit: true, ageMs: 42_000 }),
  })

  assert.equal(data.event, 'rider_cancelled')
  assert.equal(data.cacheHit, true)
  assert.equal(data.cacheAgeMs, 42_000)
  assert.equal(data.calculatedAt.toISOString(), '2026-09-25T10:00:00.000Z')
  assert.equal(data.receivedAt.toISOString(), '2026-09-25T10:00:01.000Z')
})

test('a captured cancellation route is written through the caller transaction', async () => {
  const data = routeObservationData({
    bookingId: 'booking-1',
    event: ROUTE_OBSERVATION_EVENT.RIDER_CANCELLED,
    route: route({ hit: true, ageMs: 42_000 }),
  })
  const writes = []
  const tx = { routeObservation: { create: async ({ data }) => { writes.push(data); return data } } }

  await persistRouteObservationData(tx, data)

  assert.equal(writes.length, 1)
  assert.equal(writes[0], data)
  assert.equal(writes[0].event, ROUTE_OBSERVATION_EVENT.RIDER_CANCELLED)
})

test('route observation rejects incomplete identity and invalid timestamps', () => {
  assert.equal(routeObservationData({ bookingId: null, event: 'assignment_accepted', route: route() }), null)
  assert.equal(routeObservationData({ bookingId: 'booking-1', event: null, route: route() }), null)
  assert.equal(routeObservationData({ bookingId: 'booking-1', event: 'assignment_accepted', route: {} }), null)
  assert.equal(routeObservationData({ bookingId: 'booking-1', event: 'assignment_accepted', route: undefined }), null)

  const badCalculated = route()
  badCalculated.provenance.calculatedAt = 'not-a-date'
  assert.equal(routeObservationData({ bookingId: 'booking-1', event: 'assignment_accepted', route: badCalculated }), null)

  const badReceived = route()
  badReceived.provenance.receivedAt = 'not-a-date'
  assert.equal(routeObservationData({ bookingId: 'booking-1', event: 'assignment_accepted', route: badReceived }), null)
})

test('route observation keeps unavailable provider fields explicitly unknown', () => {
  const sparse = route()
  sparse.provenance.origin = undefined
  sparse.provenance.destination = undefined
  sparse.provenance.durationSeconds = Number.NaN
  sparse.provenance.trafficDurationSeconds = undefined
  sparse.provenance.distanceMeters = Number.POSITIVE_INFINITY
  sparse.provenance.cache = undefined
  sparse.provenance.providerRouteId = 'route-provider-1'

  const data = routeObservationData({
    bookingId: 'booking-1',
    event: ROUTE_OBSERVATION_EVENT.ASSIGNMENT_ACCEPTED,
    route: sparse,
  })

  assert.equal(data.originLat, null)
  assert.equal(data.originLng, null)
  assert.equal(data.destinationLat, null)
  assert.equal(data.destinationLng, null)
  assert.equal(data.durationSeconds, null)
  assert.equal(data.trafficDurationSeconds, null)
  assert.equal(data.distanceMeters, null)
  assert.equal(data.cacheIdentity, null)
  assert.equal(data.cacheHit, false)
  assert.equal(data.cacheAgeMs, null)
  assert.equal(data.providerRouteId, 'route-provider-1')
})

test('route persistence converts input and skips absent evidence', async () => {
  const writes = []
  const client = { routeObservation: { create: async ({ data }) => { writes.push(data); return data } } }
  const input = {
    bookingId: 'booking-1',
    event: ROUTE_OBSERVATION_EVENT.ASSIGNMENT_ACCEPTED,
    route: route(),
  }

  const stored = await persistRouteObservation(client, input)
  assert.equal(stored.bookingId, 'booking-1')
  assert.equal(writes.length, 1)

  assert.equal(await persistRouteObservation(client, { bookingId: null, event: 'assignment_accepted', route: route() }), null)
  const writesBeforeAbsentData = writes.length
  assert.equal(await persistRouteObservationData(client, null), null)
  assert.equal(writes.length, writesBeforeAbsentData)
})
