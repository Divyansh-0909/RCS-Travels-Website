import test from 'node:test'
import assert from 'node:assert/strict'
import {
  completionGeofence,
  locationProblem,
  MAX_LOCATION_ACCURACY_M,
  MAX_LOCATION_AGE_MS,
  PICKUP_RADIUS_KM,
} from '../services/rideGeofence.ts'

test('fresh accurate locations are accepted', () => {
  const now = 1_800_000_000_000
  assert.equal(locationProblem({ lat: 28.6, lng: 77.2, accuracy: 25, capturedAt: now - 5_000 }, now), null)
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
