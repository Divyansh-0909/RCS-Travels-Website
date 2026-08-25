import test from 'node:test'
import assert from 'node:assert/strict'
import { LOCATION_STALE_AFTER_MS } from '../constants/dispatch.js'
import { isDriverDispatchReady } from '../services/driverAvailability.ts'
import { locationSchema } from '../types.ts'

const now = new Date('2026-08-23T10:00:00.000Z')

test('an online intent is not dispatch-ready without a location', () => {
  assert.equal(isDriverDispatchReady(true, null, now), false)
  assert.equal(isDriverDispatchReady(false, { updatedAt: now }, now), false)
})

test('dispatch readiness uses the same strict freshness boundary as matching', () => {
  const fresh = new Date(now.getTime() - LOCATION_STALE_AFTER_MS + 1)
  const boundary = new Date(now.getTime() - LOCATION_STALE_AFTER_MS)

  assert.equal(isDriverDispatchReady(true, { updatedAt: fresh }, now), true)
  assert.equal(isDriverDispatchReady(true, { updatedAt: boundary }, now), false)
})

test('location writes reject impossible coordinate pairs', () => {
  assert.equal(locationSchema.safeParse({ lat: 28.6139, lng: 77.209 }).success, true)
  assert.equal(locationSchema.safeParse({ lat: 91, lng: 77.209 }).success, false)
  assert.equal(locationSchema.safeParse({ lat: 28.6139, lng: 181 }).success, false)
})
