import assert from 'node:assert/strict'
import { mock } from 'node:test'
import { createTestClock } from './testClock.js'
import * as routes from '../../services/googleRoutes.js'

let routeCalls = 0
mock.module(new URL('../../services/googleRoutes.js', import.meta.url), { namedExports: { ...routes,
  routeSequence: async stops => { routeCalls++; return { totalMin: (stops.length - 1) * 2,
    legs: stops.slice(1).map(() => ({ min: 2, km: 1 })) } },
} })
const { getDriver } = await import('../../services/driverAssignment.js')
const clock = createTestClock('2026-10-09T08:00:00Z'), writes = [], pushes = [], radii = []
const host = { id: 'host', status: 'assigned', sharing: true, pickupLat: 28.5272, pickupLng: 77.5755,
  dropLat: 28.545, dropLng: 77.35 }
const row = { ...host, id: 'joiner', status: 'pending', fare: 1000, vehicleClass: 'sedan',
  pickupAddress: 'synthetic pickup', dropAddress: 'synthetic drop' }
const driver = { id: 'driver', group: 'rcs', vehicleClass: 'sedan', vehicleCapacity: 4,
  bookings: [host], createdAt: new Date(0) }
const db = { booking: { findFirst: async args => { assert.deepEqual(args, { where: { id: row.id } }); return row },
  findUnique: async () => row }, reliabilityBlock: { findFirst: async () => null },
  driver: { findMany: async () => [driver], update: async args => { writes.push(args) } },
  rideOffer: { create: async args => { writes.push(args) } },
  $queryRaw: async (...args) => {
    radii.push(args[3])
    return writes.length ? [] : [{ driverId: driver.id, latitude: host.pickupLat, longitude: host.pickupLng, distanceKm: 1 }]
  } }
assert.equal(await getDriver(row.id, { db, clock, push: async (...args) => { pushes.push(args) } }), 'offered')
assert.deepEqual(radii, [20_000], 'a real compatible host offer ends the search before the idle pass')
assert.ok(routeCalls > 1)
assert.deepEqual(writes[0], { where: { id: driver.id }, data: { lastOfferedAt: clock.now() } })
assert.equal(writes[1].data.poolHostBookingId, host.id)
assert.equal(pushes.length, 1)
