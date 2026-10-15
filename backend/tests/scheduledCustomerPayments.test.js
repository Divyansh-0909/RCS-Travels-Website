import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  scheduledPaymentAmounts,
  createScheduledAdvanceIntent,
  createScheduledFinalIntent,
  applyCapturedPaymentEffect,
  applyRefundedPaymentEffect,
} from '../services/scheduledPayments.js'
import { walletEvent } from '../services/walletKeys.js'

describe('scheduled customer advance arithmetic uses whole-rupee instalments', () => {
  test('₹1,000 fare produces ₹100 advance', () => {
    assert.deepEqual(scheduledPaymentAmounts({ fare: 1000 }), {
      originalFare: 100000, coupon: 0, compensation: 0, obligation: 100000, finalFare: 100000, advancePercentage: 10, advance: 10000, remaining: 90000,
    })
  })
  test('₹1,000 less ₹100 coupon produces ₹90 advance', () => {
    const amounts = scheduledPaymentAmounts({ fare: 1000, couponAmount: 100 })
    assert.equal(amounts.finalFare, 90000); assert.equal(amounts.advance, 9000); assert.equal(amounts.remaining, 81000)
  })
  test('₹1,200 less ₹500 coupon produces ₹70 advance', () => {
    const amounts = scheduledPaymentAmounts({ fare: 1200, couponAmount: 500 })
    assert.equal(amounts.finalFare, 70000); assert.equal(amounts.advance, 7000); assert.equal(amounts.remaining, 63000)
  })
  test('a 195 rupee fare rounds the 19.50 advance to 20 and leaves 175', () => {
    const amounts = scheduledPaymentAmounts({ fare: 195 })
    assert.equal(amounts.advance, 2000); assert.equal(amounts.remaining, 17500)
  })
  test('advance plus final payment always equals post-coupon fare', () => {
    for (const input of [{ fare: 190 }, { fare: 1000 }, { fare: 1000, couponAmount: 100 }, { fare: 1200, couponAmount: 500 }]) {
      const a = scheduledPaymentAmounts(input)
      assert.equal(a.advance + a.remaining, a.finalFare)
      assert.equal(a.advance % 100, 0)
      assert.equal(a.remaining % 100, 0)
    }
  })
})

describe('scheduled payment intents retain their server-owned terms', () => {
  const paymentIntentTx = ({ payoutUpiId = 'captain@upi', payoutUpiVerifiedAt = new Date() } = {}) => {
    let payment = null
    const creates = []
    return {
      tx: {
        driver: { findUnique: async () => ({ payoutUpiId, payoutUpiVerifiedAt }) },
        payment: {
          createMany: async (input) => {
            creates.push(input)
            if (!payment) payment = { id: 'p1', ...input.data[0] }
            return { count: payment.idempotencyKey === input.data[0].idempotencyKey ? 1 : 0 }
          },
          findUniqueOrThrow: async ({ where }) => {
            if (!payment || payment.idempotencyKey !== where.idempotencyKey) throw new Error('missing payment')
            return { ...payment }
          },
        },
      },
      creates: () => creates,
      payment: () => ({ ...payment }),
    }
  }

  test('advance intent uses a stable key and freezes its calculated snapshot', async () => {
    const h = paymentIntentTx()
    const booking = { id: 'b1', userId: 'u1', fare: 1000, couponAmount: 100 }
    const payment = await createScheduledAdvanceIntent(h.tx, booking)
    assert.equal(payment.idempotencyKey, 'scheduled-advance:b1')
    assert.equal(payment.amount, 9000)
    assert.deepEqual(h.payment(), {
      id: 'p1', userId: 'u1', bookingId: 'b1', purpose: 'scheduled_ride_advance', amount: 9000,
      currency: 'INR', idempotencyKey: 'scheduled-advance:b1', originalFareAmount: 100000,
      couponAmount: 10000, finalFareAmount: 90000, advancePercentage: 10, remainingAmount: 81000,
    })

    booking.fare = 2000
    await assert.rejects(createScheduledAdvanceIntent(h.tx, booking), error => error.code === 'IDEMPOTENCY_CONFLICT')
    assert.equal(h.creates().length, 2)
    assert.equal(h.payment().finalFareAmount, 90000)
  })

  test('final intent rejects non-scheduled rides and requires a verified driver UPI', async () => {
    const booking = { id: 'b1', userId: 'u1', driverId: 'd1', fare: 1000, couponAmount: 100,
      customerPayment: 900, scheduledAdvancePct: 10, scheduledRemainingAmount: 81000 }
    const nonScheduled = paymentIntentTx()
    await assert.rejects(createScheduledFinalIntent(nonScheduled.tx, booking), /Scheduled final payment requires a scheduled booking/)
    assert.equal(nonScheduled.creates().length, 0)

    const unverified = paymentIntentTx({ payoutUpiVerifiedAt: null })
    await assert.rejects(createScheduledFinalIntent(unverified.tx, { ...booking, scheduledAt: new Date() }),
      error => error.code === 'DRIVER_PAYOUT_UPI_UNAVAILABLE')
    assert.equal(unverified.creates().length, 0)
  })

  test('final intent stores the scheduled balance snapshot under its stable key', async () => {
    const h = paymentIntentTx()
    const payment = await createScheduledFinalIntent(h.tx, { id: 'b1', userId: 'u1', driverId: 'd1', scheduledAt: new Date(),
      fare: 1000, couponAmount: 100, customerPayment: 900, scheduledAdvancePct: 10, scheduledRemainingAmount: 81000 })
    assert.equal(payment.idempotencyKey, 'scheduled-final:b1')
    assert.deepEqual(h.payment(), {
      id: 'p1', userId: 'u1', bookingId: 'b1', purpose: 'scheduled_ride_final', amount: 81000,
      currency: 'INR', idempotencyKey: 'scheduled-final:b1', originalFareAmount: 100000,
      couponAmount: 10000, finalFareAmount: 90000, advancePercentage: 10, remainingAmount: 81000,
    })
  })
})

describe('scheduled payment capture effects are guarded and idempotent', () => {
  test('advance capture confirms only a payment-pending booking', async () => {
    const calls = []
    const tx = { booking: { updateMany: async (query) => { calls.push(query); return { count: 1 } } } }
    await applyCapturedPaymentEffect(tx, { bookingId: 'b1', purpose: 'scheduled_ride_advance', amount: 13500 })
    assert.deepEqual(calls[0].where, { id: 'b1', status: 'payment_pending' })
    assert.equal(calls[0].data.status, 'confirmed'); assert.equal(calls[0].data.scheduledAdvancePaidAmount, 13500)
  })
  test('a delayed advance capture after cancellation becomes refund-pending', async () => {
    const calls = []
    const tx = { booking: { updateMany: async (query) => {
      calls.push(query)
      return { count: query.where.status === 'cancelled' ? 1 : 0 }
    } } }
    const effect = await applyCapturedPaymentEffect(tx, {
      id: 'p1', bookingId: 'b1', purpose: 'scheduled_ride_advance', amount: 13500,
    })
    assert.deepEqual(calls[1].where, {
      id: 'b1', status: 'cancelled', scheduledAdvanceDisposition: { in: ['awaiting_payment', 'refund_pending'] },
    })
    assert.equal(calls[1].data.scheduledAdvanceDisposition, 'refund_pending')
    assert.deepEqual(effect, { type: 'scheduled_ride_advance_refund', bookingId: 'b1', paymentId: 'p1' })
  })
  test('an unmatched late advance capture has no effect', async () => {
    const tx = { booking: { updateMany: async () => ({ count: 0 }) } }
    assert.equal(await applyCapturedPaymentEffect(tx, {
      id: 'p1', bookingId: 'b1', purpose: 'scheduled_ride_advance', amount: 9000,
    }), null)
  })
  test('failed/uncaptured payment invokes no confirmation effect', async () => {
    let writes = 0
    await applyCapturedPaymentEffect({ booking: { updateMany: async () => { writes++ } } }, { bookingId: 'b1', purpose: 'other_customer_payment', amount: 1 })
    assert.equal(writes, 0)
  })
  test('compensation is applied after the coupon before calculating the advance', () => {
    const amounts = scheduledPaymentAmounts({ fare: 1000, couponAmount: 100, compensationAmount: 100 })
    assert.equal(amounts.coupon, 10000); assert.equal(amounts.compensation, 10000)
    assert.equal(amounts.obligation, 80000); assert.equal(amounts.finalFare, 80000)
    assert.equal(amounts.advance, 8000); assert.equal(amounts.remaining, 72000)
  })
  test('final capture records only one final payment amount', async () => {
    let query
    let postedEarning
    const booking = {
      id: 'b1', driverId: 'd1', status: 'completed', scheduledAt: new Date(), customerPayment: 850,
      scheduledRemainingAmount: 76500, scheduledFinalPaidAmount: 0, scheduledFinalPaymentMethod: null,
      scheduledFinalPaidAt: null, rideNowPaidAmount: 0, rideNowPaymentMethod: null, rideNowPaidAt: null,
    }
    const tx = {
      driver: {
        findUnique: async () => ({ payoutUpiId: 'captain@upi', payoutUpiVerifiedAt: new Date() }),
        update: async () => ({}),
      },
      walletEntry: {
        createMany: async ({ data }) => { postedEarning = data[0]; return { count: 1 } },
        findUnique: async () => postedEarning,
      },
      responsibilityLiability: { findMany: async () => [] },
      $queryRaw: async () => [],
      booking: {
        findUnique: async () => booking,
        updateMany: async (q) => { query = q; return { count: 1 } },
      },
    }
    await applyCapturedPaymentEffect(tx,
      { id: 'p1', bookingId: 'b1', purpose: 'scheduled_ride_final', amount: 76500 })
    assert.deepEqual(query.where, {
      id: 'b1', status: 'completed', scheduledFinalPaidAmount: 0, scheduledFinalPaymentMethod: null,
    })
    assert.equal(query.data.scheduledFinalPaidAmount, 76500)
    assert.equal(query.data.scheduledFinalPaymentMethod, 'upi')
  })
  test('refund completion changes only refund-pending advances', async () => {
    let query
    await applyRefundedPaymentEffect({ booking: { updateMany: async (q) => { query = q } } },
      { bookingId: 'b1', purpose: 'scheduled_ride_advance' })
    assert.equal(query.where.scheduledAdvanceDisposition, 'refund_pending')
    assert.equal(query.data.scheduledAdvanceDisposition, 'refunded')
  })

  test('driver debt capture applies live debt once and reports its partial excess for refund', async () => {
    const entries = []
    const updates = []
    const tx = {
      driver: {
        findUniqueOrThrow: async () => ({ walletBalance: -70 }),
        update: async (input) => { updates.push(input) },
      },
      walletEntry: { createMany: async ({ data }) => { entries.push(data[0]); return { count: 1 } } },
      payment: { update: async (input) => { updates.push(input) } },
    }
    const payment = { id: 'p1', driverId: 'd1', purpose: 'driver_debt_settlement', amount: 10000,
      driverDebtAppliedAmount: null, driverDebtRefundAmount: null }
    assert.deepEqual(await applyCapturedPaymentEffect(tx, payment), {
      type: 'driver_debt_excess_refund', paymentId: 'p1', amount: 3000,
    })
    assert.deepEqual(entries, [{ driverId: 'd1', amount: 70, type: 'debt_payment', method: 'upi', bookingId: null,
      eventKey: walletEvent.debtPayment('p1'), note: 'Negative wallet balance cleared through Razorpay' }])
    assert.deepEqual(updates.at(-1), { where: { id: 'p1' }, data: { driverDebtAppliedAmount: 7000, driverDebtRefundAmount: 3000 } })

    const replay = { ...payment, driverDebtAppliedAmount: 7000, driverDebtRefundAmount: 3000 }
    assert.deepEqual(await applyCapturedPaymentEffect(tx, replay), {
      type: 'driver_debt_excess_refund', paymentId: 'p1', amount: 3000,
    })
    assert.equal(entries.length, 1)
    assert.equal(updates.length, 2)
  })

  test('driver debt capture refunds the whole payment when no live debt remains', async () => {
    let walletWrites = 0
    let paymentUpdate
    const tx = {
      driver: { findUniqueOrThrow: async () => ({ walletBalance: 0 }), update: async () => { walletWrites++ } },
      walletEntry: { createMany: async () => { walletWrites++; return { count: 1 } } },
      payment: { update: async (input) => { paymentUpdate = input } },
    }
    assert.deepEqual(await applyCapturedPaymentEffect(tx, {
      id: 'p1', driverId: 'd1', purpose: 'driver_debt_settlement', amount: 10000,
      driverDebtAppliedAmount: null, driverDebtRefundAmount: null,
    }), { type: 'driver_debt_excess_refund', paymentId: 'p1', amount: 10000 })
    assert.equal(walletWrites, 0)
    assert.deepEqual(paymentUpdate.data, { driverDebtAppliedAmount: 0, driverDebtRefundAmount: 10000 })
  })

  test('driver debt capture reports settlement when the payment exactly clears live debt and replays a null refund as zero', async () => {
    const entries = []
    let paymentUpdate
    const tx = {
      driver: {
        findUniqueOrThrow: async () => ({ walletBalance: -100 }),
        update: async () => ({}),
      },
      walletEntry: {
        createMany: async ({ data }) => { entries.push(data[0]); return { count: 1 } },
      },
      payment: { update: async (input) => { paymentUpdate = input } },
    }
    const payment = {
      id: 'p1', driverId: 'd1', purpose: 'driver_debt_settlement', amount: 10000,
      driverDebtAppliedAmount: null, driverDebtRefundAmount: null,
    }

    assert.deepEqual(await applyCapturedPaymentEffect(tx, payment), {
      type: 'driver_debt_settlement', paymentId: 'p1', driverId: 'd1',
    })
    assert.equal(entries.length, 1)
    assert.deepEqual(paymentUpdate.data, { driverDebtAppliedAmount: 10000, driverDebtRefundAmount: 0 })

    assert.deepEqual(await applyCapturedPaymentEffect(tx, {
      ...payment,
      driverDebtAppliedAmount: 10000,
      driverDebtRefundAmount: null,
    }), {
      type: 'driver_debt_settlement', paymentId: 'p1', driverId: 'd1',
    })
    assert.equal(entries.length, 1)
  })

  test('captured non-driver payment without a booking has no effect', async () => {
    assert.equal(await applyCapturedPaymentEffect({}, {
      id: 'p1', purpose: 'other_customer_payment', amount: 100,
    }), null)
  })
})

test('late-cancellation driver compensation has one stable wallet event', () => {
  assert.equal(walletEvent.scheduledCancellationCompensation('b1'), walletEvent.scheduledCancellationCompensation('b1'))
  assert.notEqual(walletEvent.scheduledCancellationCompensation('b1'), walletEvent.depositHold('b1'))
})
