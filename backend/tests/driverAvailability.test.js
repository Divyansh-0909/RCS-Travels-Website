import test from 'node:test'
import assert from 'node:assert/strict'
import { LOCATION_STALE_AFTER_MS } from '../constants/dispatch.js'
import { isDriverDispatchReady, restoreIdleDriverCapacity } from '../services/driverAvailability.ts'
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

test('going online repairs a stale empty-car capacity with a live-ride guard', async () => {
  let update
  const db = {
    driver: {
      async updateMany(args) {
        update = args
        return { count: 1 }
      },
    },
  }

  const repaired = await restoreIdleDriverCapacity({
    id: 'driver-1',
    vehicleClass: 'hatchback',
  }, db)

  assert.equal(repaired, true)
  assert.equal(update.where.id, 'driver-1')
  assert.deepEqual(update.where.vehicleCapacity, { not: 4 })
  assert.deepEqual(update.where.bookings.none.status.in, ['assigned', 'en_route', 'reached', 'started'])
  assert.deepEqual(update.data, { vehicleCapacity: 4 })
})

test('capacity repair refuses an unknown vehicle class without touching the database', async () => {
  let called = false
  const db = {
    driver: {
      async updateMany() {
        called = true
        return { count: 1 }
      },
    },
  }

  assert.equal(await restoreIdleDriverCapacity({ id: 'driver-1', vehicleClass: 'unknown' }, db), false)
  assert.equal(called, false)
})
