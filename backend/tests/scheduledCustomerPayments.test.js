import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { scheduledPaymentAmounts, applyCapturedPaymentEffect, applyRefundedPaymentEffect } from '../services/scheduledPayments.js'
import { walletEvent } from '../services/walletKeys.js'

describe('scheduled customer advance arithmetic uses integer paise', () => {
  test('₹1,000 fare produces ₹150 advance', () => {
    assert.deepEqual(scheduledPaymentAmounts({ fare: 1000 }), {
      originalFare: 100000, coupon: 0, finalFare: 100000, advancePercentage: 15, advance: 15000, remaining: 85000,
    })
  })
  test('₹1,000 less ₹100 coupon produces ₹135 advance', () => {
    const amounts = scheduledPaymentAmounts({ fare: 1000, couponAmount: 100 })
    assert.equal(amounts.finalFare, 90000); assert.equal(amounts.advance, 13500); assert.equal(amounts.remaining, 76500)
  })
  test('₹1,200 less ₹500 coupon produces ₹105 advance', () => {
    const amounts = scheduledPaymentAmounts({ fare: 1200, couponAmount: 500 })
    assert.equal(amounts.finalFare, 70000); assert.equal(amounts.advance, 10500); assert.equal(amounts.remaining, 59500)
  })
  test('advance plus final payment always equals post-coupon fare', () => {
    for (const input of [{ fare: 1000 }, { fare: 1000, couponAmount: 100 }, { fare: 1200, couponAmount: 500 }]) {
      const a = scheduledPaymentAmounts(input)
      assert.equal(a.advance + a.remaining, a.finalFare)
    }
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
  test('failed/uncaptured payment invokes no confirmation effect', async () => {
    let writes = 0
    await applyCapturedPaymentEffect({ booking: { updateMany: async () => { writes++ } } }, { bookingId: 'b1', purpose: 'other_customer_payment', amount: 1 })
    assert.equal(writes, 0)
  })
  test('final capture records only one final payment amount', async () => {
    let query
    await applyCapturedPaymentEffect({ booking: { updateMany: async (q) => { query = q } } },
      { bookingId: 'b1', purpose: 'scheduled_ride_final', amount: 76500 })
    assert.deepEqual(query.where, { id: 'b1', status: 'completed', scheduledFinalPaidAmount: 0 })
    assert.equal(query.data.scheduledFinalPaidAmount, 76500)
  })
  test('refund completion changes only refund-pending advances', async () => {
    let query
    await applyRefundedPaymentEffect({ booking: { updateMany: async (q) => { query = q } } },
      { bookingId: 'b1', purpose: 'scheduled_ride_advance' })
    assert.equal(query.where.scheduledAdvanceDisposition, 'refund_pending')
    assert.equal(query.data.scheduledAdvanceDisposition, 'refunded')
  })
})

test('late-cancellation driver compensation has one stable wallet event', () => {
  assert.equal(walletEvent.scheduledCancellationCompensation('b1'), walletEvent.scheduledCancellationCompensation('b1'))
  assert.notEqual(walletEvent.scheduledCancellationCompensation('b1'), walletEvent.depositHold('b1'))
})
