import test from 'node:test'
import assert from 'node:assert/strict'
import {
  completionGeofence,
  locationProblem,
  MAX_LOCATION_ACCURACY_M,
  MAX_LOCATION_AGE_MS,
  PICKUP_RADIUS_KM,
  freshLocationWithinPickup,
  haversineDistanceKm, COMPLETION_OVERRIDE_REASONS, MAX_LOCATION_FUTURE_SKEW_MS,
} from '../services/rideGeofence.ts'

test('fresh accurate locations are accepted', () => {
  const now = 1_800_000_000_000
  assert.equal(locationProblem({ lat: 28.6, lng: 77.2, accuracy: 25, capturedAt: now - 5_000 }, now), null)
})

test('location domain, observation age and accuracy use their exact inclusive boundaries', () => {
  const now = 1_800_000_000_000
  const valid = { lat: 28.6, lng: 77.2, accuracy: 5, capturedAt: now }
  for (const key of ['lat', 'lng', 'accuracy', 'capturedAt']) {
    const missing = { ...valid }; delete missing[key]
    assert.equal(locationProblem(missing, now), 'A current GPS location is required for this action.')
  }
  for (const [key, values] of Object.entries({ lat: [NaN, Infinity, -90.001, 90.001],
    lng: [NaN, Infinity, -180.001, 180.001], accuracy: [NaN, Infinity, -0.001], capturedAt: [NaN, Infinity] })) {
    for (const value of values) assert.equal(locationProblem({ ...valid, [key]: value }, now), 'A valid GPS location is required for this action.')
  }
  for (const [key, value] of [['lat', -90], ['lat', 90], ['lng', -180], ['lng', 180], ['accuracy', 0], ['accuracy', 100]]) {
    assert.equal(locationProblem({ ...valid, [key]: value }, now), null)
  }
  assert.equal(locationProblem({ ...valid, capturedAt: now - MAX_LOCATION_AGE_MS }, now), null)
  assert.equal(locationProblem({ ...valid, capturedAt: now + MAX_LOCATION_FUTURE_SKEW_MS }, now), null)
  assert.equal(locationProblem({ ...valid, capturedAt: now + MAX_LOCATION_FUTURE_SKEW_MS + 1 }, now), 'The device location time is invalid. Check the phone clock and try again.')
  const pickup = { lat: 28.6, lng: 77.2 }
  const fix = { latitude: pickup.lat, longitude: pickup.lng, observedAt: new Date(now), updatedAt: new Date(now), accuracyMeters: 5 }
  assert.equal(freshLocationWithinPickup({ ...fix, accuracyMeters: -1 }, pickup, now), false)
  assert.equal(freshLocationWithinPickup({ ...fix, observedAt: new Date('invalid') }, pickup, now), false)
  assert.equal(freshLocationWithinPickup({ ...fix, accuracyMeters: null }, pickup, now), false)
  assert.equal(freshLocationWithinPickup({ ...fix, latitude: 29 }, pickup, now), false)
  // The next representable latitude above the closed-form value produces exactly 0.5 km.
  const boundaryLat = 0.004496608029593653
  assert.equal(haversineDistanceKm(0, 0, boundaryLat, 0), 0.5)
  assert.equal(freshLocationWithinPickup({ ...fix, latitude: boundaryLat, longitude: 0 }, { lat: 0, lng: 0 }, now), true)
  assert.equal(freshLocationWithinPickup(null, pickup), false)
  assert.equal(locationProblem({ ...valid, capturedAt: Date.now() }), null)
})

test('spherical distance preserves both coordinate axes against an independent cosine-law witness', () => {
  for (const [lat1, lng1, lat2, lng2] of [[0, 0, 0, 1], [30, 0, 30, 1], [28.6, 77.2, 28.604, 77.201], [-20, 40, 10, -70]]) {
    const radians = Math.PI / 180
    const cosine = Math.sin(lat1 * radians) * Math.sin(lat2 * radians)
      + Math.cos(lat1 * radians) * Math.cos(lat2 * radians) * Math.cos((lng2 - lng1) * radians)
    assert.ok(Math.abs(haversineDistanceKm(lat1, lng1, lat2, lng2) - 6371 * Math.acos(cosine)) < 0.000001)
  }
  assert.deepEqual(COMPLETION_OVERRIDE_REASONS, ['customer_requested_early_drop', 'drop_inaccessible',
    'road_or_security_restriction', 'incorrect_drop_pin'])
})

test('missing, inaccurate and stale locations fail closed', () => {
  const now = 1_800_000_000_000
  assert.match(locationProblem({}, now), /required/i)
  assert.match(locationProblem({ lat: 28.6, lng: 77.2, accuracy: MAX_LOCATION_ACCURACY_M + 1, capturedAt: now }, now), /accuracy/i)
  assert.match(locationProblem({ lat: 28.6, lng: 77.2, accuracy: 20, capturedAt: now - MAX_LOCATION_AGE_MS - 1 }, now), /out of date/i)
  assert.match(locationProblem({ lat: 28.6, lng: 77.2, accuracy: 20, capturedAt: now, mocked: true }, now), /mock/i)
})

test('drop bands use inclusive 500 m and 2 km boundaries', () => {
  assert.equal(completionGeofence(0.5), 'normal')
  assert.equal(completionGeofence(0.50001), 'customer_confirmation')
  assert.equal(completionGeofence(2), 'customer_confirmation')
  assert.equal(completionGeofence(2.00001), 'support')
})

test('pickup arrival and ride start use a 500 m boundary', () => {
  assert.equal(PICKUP_RADIUS_KM, 0.5)
})

test('customer cancellation uses a fresh driver position within 500 m', () => {
  const now = 1_800_000_000_000
  const pickup = { lat: 28.6, lng: 77.2 }
  assert.equal(freshLocationWithinPickup({ latitude: 28.604, longitude: 77.2, updatedAt: new Date(now), observedAt: new Date(now), accuracyMeters: 5 }, pickup, now), true)
  assert.equal(freshLocationWithinPickup({ latitude: 28.606, longitude: 77.2, updatedAt: new Date(now) }, pickup, now), false)
  assert.equal(freshLocationWithinPickup({ latitude: 28.6, longitude: 77.2, updatedAt: new Date(now - MAX_LOCATION_AGE_MS - 1) }, pickup, now), false)
})
