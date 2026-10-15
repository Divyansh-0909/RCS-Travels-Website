import test from 'node:test'
import assert from 'node:assert/strict'
import { driverPaymentView } from '../services/driverPaymentView.ts'

const booking = (overrides = {}) => ({
  status: 'completed',
  scheduledAt: new Date('2026-09-07T10:00:00Z'),
  customerPayment: 1000,
  scheduledAdvanceAmount: 15000,
  scheduledAdvancePaidAmount: 15000,
  scheduledRemainingAmount: 85000,
  scheduledFinalPaidAmount: 0,
  scheduledFinalPaymentMethod: null,
  scheduledFinalPaidAt: null,
  scheduledAdvanceDisposition: 'paid',
  rideNowPaidAmount: 0,
  rideNowPaymentMethod: null,
  rideNowPaidAt: null,
  ...overrides,
})

test('scheduled completion stays due until the final payment settles', () => {
  const due = driverPaymentView(booking())
  assert.equal(due.paymentState, 'due')
  assert.deepEqual(due.ridePayment, {
    state: 'pending', method: null, amount: 85000, paidAmount: 0, paidAt: null,
  })
  assert.equal(due.scheduledPayment.finalPaymentMethod, null)

  const paidAt = new Date('2026-09-07T11:00:00Z')
  const paid = driverPaymentView(booking({
    scheduledFinalPaidAmount: 85000,
    scheduledFinalPaymentMethod: 'upi',
    scheduledFinalPaidAt: paidAt,
  }))
  assert.equal(paid.paymentState, 'paid')
  assert.equal(paid.ridePayment.method, 'upi')
  assert.equal(paid.scheduledPayment.finalPaidAt, paidAt)
})

test('a cancellation fee is compensation even when the rest of the advance is refunded', () => {
  assert.equal(driverPaymentView(booking({
    status: 'cancelled', scheduledAdvanceDisposition: 'partial_refund_pending', cancellationCharge: 100,
  })).paymentState, 'retained')
  assert.equal(driverPaymentView(booking({
    status: 'cancelled', scheduledAdvanceDisposition: 'partially_refunded', cancellationCharge: 100,
  })).paymentState, 'retained')
  assert.equal(driverPaymentView(booking({
    status: 'cancelled', scheduledAdvanceDisposition: 'refunded', cancellationCharge: 0,
  })).paymentState, 'void')
  assert.equal(driverPaymentView(booking({
    status: 'cancelled', scheduledAt: null, scheduledAdvanceDisposition: 'not_applicable',
  })).paymentState, 'void')
})

test('Ride Now becomes paid from the customer-controlled cash or UPI settlement', () => {
  const active = driverPaymentView(booking({
    status: 'started', scheduledAt: null, scheduledAdvanceDisposition: 'not_applicable',
  }))
  assert.equal(active.paymentState, 'due')
  assert.equal(active.scheduledPayment, null)
  assert.equal(active.ridePayment.amount, 100000)

  const cash = driverPaymentView(booking({
    scheduledAt: null,
    scheduledAdvanceDisposition: 'not_applicable',
    rideNowPaidAmount: 100000,
    rideNowPaymentMethod: 'cash',
    rideNowPaidAt: new Date('2026-09-17T10:02:00Z'),
  }))
  assert.equal(cash.paymentState, 'paid')
  assert.equal(cash.ridePayment.method, 'cash')
})

test('a completed ride fully covered by compensation has no remaining payment due', () => {
  const covered = driverPaymentView(booking({
    scheduledAt: null, scheduledAdvanceDisposition: 'not_applicable', customerPayment: 0,
  }))
  assert.equal(covered.paymentState, 'paid')
  assert.equal(covered.ridePayment.amount, 0)
  assert.equal(covered.ridePayment.method, null)
})
