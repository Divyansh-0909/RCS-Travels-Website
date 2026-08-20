import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cancellationWindowStart,
  DRIVER_CANCELLATION_BENEFIT_THRESHOLD,
  DRIVER_CANCELLATION_SUSPEND_THRESHOLD,
  DRIVER_CANCELLATION_WINDOW_DAYS,
  applyDriverCancellationConsequences,
} from '../services/driverCancellations.js'

test('driver cancellation thresholds are ordered and explicit', () => {
  assert.equal(DRIVER_CANCELLATION_WINDOW_DAYS, 30)
  assert.equal(DRIVER_CANCELLATION_BENEFIT_THRESHOLD, 3)
  assert.equal(DRIVER_CANCELLATION_SUSPEND_THRESHOLD, 5)
})

test('the rolling window begins exactly 30 days earlier', () => {
  const now = new Date('2026-08-20T12:00:00.000Z')
  assert.equal(cancellationWindowStart(now).toISOString(), '2026-07-21T12:00:00.000Z')
})

const fakeTx = (count) => {
  const writes = { driver: [], offers: [] }
  return {
    writes,
    tx: {
      driverCancellation: { create: async () => ({}), count: async () => count },
      driver: {
        update: async (args) => { writes.driver.push(args); return {} },
        updateMany: async (args) => { writes.driver.push(args); return { count: 1 } },
      },
      rideOffer: { updateMany: async (args) => { writes.offers.push(args); return { count: 1 } } },
    },
  }
}

test('third cancellation removes loyalty benefits without suspending', async () => {
  const { tx, writes } = fakeTx(3)
  const result = await applyDriverCancellationConsequences(tx, 'driver', {
    bookingId: 'booking', fromStatus: 'en_route', now: new Date('2026-08-20T12:00:00Z'),
  })
  assert.equal(result.benefitsRestricted, true)
  assert.equal(result.suspended, false)
  assert.equal(writes.driver[0].data.commissionFreeRidesRemaining, 0)
  assert.equal(writes.offers.length, 0)
})

test('fifth cancellation suspends and withdraws pending offers', async () => {
  const { tx, writes } = fakeTx(5)
  const result = await applyDriverCancellationConsequences(tx, 'driver', {
    bookingId: 'booking', fromStatus: 'assigned', now: new Date('2026-08-20T12:00:00Z'),
  })
  assert.equal(result.suspended, true)
  assert.equal(writes.driver.length, 2)
  assert.equal(writes.offers.length, 1)
})
