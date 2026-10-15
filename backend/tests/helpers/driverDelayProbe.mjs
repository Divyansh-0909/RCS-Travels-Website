// Runs in a separate Node process so module mocks cannot leak into other tests.
import assert from 'node:assert/strict'
import { mock } from 'node:test'
import { createTestClock } from './testClock.js'

let location = null
let routing = async () => 7
mock.module('../../db/prisma.js', { namedExports: {
  prisma: { driverLocation: { findUnique: async () => location } },
} })
mock.module('../../services/rideEstimate.js', { namedExports: {
  getNavigationEtaMinutes: (...args) => routing(...args),
} })
const { expectedPickupAtForAssignment, isDriverDelayed } = await import('../../services/driverDelay.js')
const clock = createTestClock('2026-09-23T10:00:00Z')
const booking = { id: 'clock-probe', pickupLat: 28.6, pickupLng: 77.2 }
const pickupMinutes = async (ride = booking) =>
  ((await expectedPickupAtForAssignment(ride, 'fixture-driver', undefined, clock)) - clock.now()) / 60000

// Current fallback behavior is legacy: these assertions do not approve a new policy.
assert.equal(await pickupMinutes(), 10)
location = { latitude: 28.6, longitude: 77.2 }
assert.equal(await pickupMinutes({ ...booking, scheduledAt: '2026-09-23T09:00:00Z' }), 7)
routing = async () => null
assert.equal(await pickupMinutes(), 3)
location = { latitude: 0, longitude: 0 }
assert.equal(await pickupMinutes(), 90)
routing = async () => { throw new Error('Synthetic routing outage') }
assert.equal(await pickupMinutes(), 90)
// The existing optional error-message access must also tolerate non-Error rejections.
routing = async () => Promise.reject(null)
assert.equal(await pickupMinutes(), 90)
assert.equal(isDriverDelayed({ status: 'completed' }, undefined, clock), false)
assert.equal(isDriverDelayed({ status: 'assigned' }, undefined, clock), false)

const before = Date.now()
const defaultResult = await expectedPickupAtForAssignment(booking, 'fixture-driver')
assert.ok(defaultResult.getTime() >= before + 90 * 60000)
assert.ok(defaultResult.getTime() <= Date.now() + 90 * 60000)
assert.equal(isDriverDelayed({ status: 'assigned', expectedPickupAt: new Date(0) }), true)
mock.restoreAll()
