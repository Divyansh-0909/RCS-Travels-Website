import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cancellationLocationDecision,
  persistCancellationLocationEvidence,
} from '../services/cancellationLocationEvidence.js'

const NOW = Date.parse('2026-09-25T06:00:00.000Z')

const booking = overrides => ({
  id: 'booking-1',
  driverId: 'driver-1',
  status: 'assigned',
  pickupLat: 28.55,
  pickupLng: 77.30,
  driver: {
    id: 'driver-1',
    location: {
      latitude: 28.551,
      longitude: 77.30,
      observedAt: new Date('2026-09-25T05:59:54.000Z'),
      receivedAt: new Date('2026-09-25T05:59:55.000Z'),
      updatedAt: new Date('2026-09-25T05:59:56.000Z'),
      accuracyMeters: 8,
    },
  },
  ...overrides,
})

test('captures the exact fresh live-location fact used for an at-pickup decision', () => {
  const data = cancellationLocationDecision(booking(), NOW)

  assert.equal(data.bookingId, 'booking-1')
  assert.equal(data.driverId, 'driver-1')
  assert.equal(data.bookingStatus, 'assigned')
  assert.equal(data.decisionAt.toISOString(), '2026-09-25T06:00:00.000Z')
  assert.equal(data.locationObservedAt.toISOString(), '2026-09-25T05:59:54.000Z')
  assert.equal(data.locationReceivedAt.toISOString(), '2026-09-25T05:59:55.000Z')
  assert.equal(data.locationUpdatedAt.toISOString(), '2026-09-25T05:59:56.000Z')
  assert.equal(data.accuracyMeters, 8)
  assert.equal(data.locationFresh, true)
  assert.equal(data.pickupRadiusKm, 0.5)
  assert.ok(data.distanceKm > 0 && data.distanceKm < 0.5)
  assert.equal(data.driverAtPickup, true)
})

test('stale or missing location metadata remains explicit and does not fabricate provenance', () => {
  const stale = booking({
    driver: {
      id: 'driver-1',
      location: {
        latitude: 28.551,
        longitude: 77.30,
        observedAt: null,
        receivedAt: null,
        updatedAt: new Date('2026-09-25T05:58:00.000Z'),
        accuracyMeters: null,
      },
    },
  })
  const data = cancellationLocationDecision(stale, NOW)

  assert.equal(data.locationObservedAt, null)
  assert.equal(data.locationReceivedAt, null)
  assert.equal(data.accuracyMeters, null)
  assert.equal(data.locationFresh, false)
  assert.equal(data.driverAtPickup, false)

  const missing = cancellationLocationDecision(booking({ driverId: null, driver: null }), NOW)
  assert.equal(missing.driverId, null)
  assert.equal(missing.locationLat, null)
  assert.equal(missing.locationLng, null)
  assert.equal(missing.locationUpdatedAt, null)
  assert.equal(missing.distanceKm, null)
  assert.equal(missing.locationFresh, false)
  assert.equal(missing.driverAtPickup, false)
})

test('reached status preserves the status-based at-pickup decision even without a live fix', () => {
  const data = cancellationLocationDecision(booking({ status: 'reached', driver: { id: 'driver-1', location: null } }), NOW)

  assert.equal(data.bookingStatus, 'reached')
  assert.equal(data.driverAtPickup, true)
  assert.equal(data.locationFresh, false)
  assert.equal(data.distanceKm, null)
})

test('invalid optional values are stored as unknown rather than invented facts', () => {
  const data = cancellationLocationDecision(booking({
    pickupLat: Number.NaN,
    driver: {
      id: 'driver-1',
      location: {
        latitude: Number.NaN,
        longitude: 77.30,
        observedAt: 'invalid',
        receivedAt: 'invalid',
        updatedAt: 'invalid',
        accuracyMeters: Number.NaN,
      },
    },
  }), NOW)

  assert.equal(data.pickupLat, null)
  assert.equal(data.locationLat, null)
  assert.equal(data.locationObservedAt, null)
  assert.equal(data.locationReceivedAt, null)
  assert.equal(data.locationUpdatedAt, null)
  assert.equal(data.accuracyMeters, null)
  assert.equal(data.distanceKm, null)
  assert.equal(data.locationFresh, false)
})

test('persists through the caller transaction and treats absent data as no write', async () => {
  const writes = []
  const tx = {
    cancellationLocationEvidence: {
      create: async ({ data }) => {
        writes.push(data)
        return data
      },
    },
  }
  const data = cancellationLocationDecision(booking(), NOW)

  assert.equal(await persistCancellationLocationEvidence(tx, null), null)
  const result = await persistCancellationLocationEvidence(tx, data)
  assert.equal(result, data)
  assert.deepEqual(writes, [data])
})

test('driver identity falls back to the assigned driver relation when scalar id is absent', () => {
  const data = cancellationLocationDecision(booking({ driverId: null }), NOW)

  assert.equal(data.driverId, 'driver-1')
})

test('location freshness includes the exact maximum-age boundary', () => {
  const data = cancellationLocationDecision(booking({
    driver: {
      id: 'driver-1',
      location: {
        latitude: 28.551,
        longitude: 77.30,
        updatedAt: new Date(NOW - 30_000),
        observedAt: new Date(NOW - 30_000),
      },
    },
  }), NOW)

  assert.equal(data.locationFresh, true)
})

test('a delayed receipt, unknown observation, future fix or inaccurate GPS cannot prove arrival', () => {
  for (const metadata of [
    { observedAt: new Date(NOW - 30_001), accuracyMeters: 5 },
    { observedAt: null, accuracyMeters: 5 },
    { observedAt: new Date(NOW + 5_001), accuracyMeters: 5 },
    { observedAt: new Date(NOW), accuracyMeters: 101 },
    { observedAt: new Date(NOW), accuracyMeters: null },
  ]) {
    const candidate = booking()
    Object.assign(candidate.driver.location, metadata, { receivedAt: new Date(NOW), updatedAt: new Date(NOW) })
    assert.equal(cancellationLocationDecision(candidate, NOW).driverAtPickup, false)
  }
})

test('distance remains unknown when any required coordinate is unavailable', () => {
  const cases = [
    booking({ driver: { id: 'driver-1', location: { latitude: Number.NaN, longitude: 77.30, updatedAt: new Date(NOW) } } }),
    booking({ driver: { id: 'driver-1', location: { latitude: 28.551, longitude: Number.NaN, updatedAt: new Date(NOW) } } }),
    booking({ pickupLat: Number.NaN }),
    booking({ pickupLng: Number.NaN }),
  ]

  for (const candidate of cases) {
    assert.equal(cancellationLocationDecision(candidate, NOW).distanceKm, null)
  }
})

test('cancellation observation freshness includes both skew and age boundaries without using receipt time', () => {
  for (const ageMs of [-5001, -5000, -1, 0, 30000, 30001]) {
    const candidate = booking()
    Object.assign(candidate.driver.location, { observedAt: new Date(NOW - ageMs), receivedAt: new Date(NOW), updatedAt: new Date(NOW) })
    assert.equal(cancellationLocationDecision(candidate, NOW).locationFresh, ageMs >= -5000 && ageMs <= 30000)
  }
})
