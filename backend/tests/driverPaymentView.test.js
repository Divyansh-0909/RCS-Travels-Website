import test from 'node:test'
import assert from 'node:assert/strict'
import { driverPaymentView } from '../services/driverPaymentView.ts'

const booking = (overrides = {}) => ({
  status: 'completed',
  scheduledAt: new Date('2026-09-07T10:00:00Z'),
  scheduledAdvanceAmount: 15000,
  scheduledAdvancePaidAmount: 15000,
  scheduledRemainingAmount: 85000,
  scheduledFinalPaidAmount: 0,
  scheduledAdvanceDisposition: 'paid',
  ...overrides,
})

test('scheduled completion stays due until the final payment is captured', () => {
  assert.deepEqual(driverPaymentView(booking()), {
    paymentState: 'due',
    collectionMode: 'online',
    scheduledPayment: {
      advanceAmount: 15000,
      advancePaidAmount: 15000,
      remainingAmount: 85000,
      finalPaidAmount: 0,
      advanceDisposition: 'paid',
    },
  })

  assert.equal(driverPaymentView(booking({ scheduledFinalPaidAmount: 85000 })).paymentState, 'paid')
})

test('a retained scheduled advance is compensation, never another collection', () => {
  const result = driverPaymentView(booking({
    status: 'cancelled',
    scheduledAdvanceDisposition: 'forfeited_to_driver',
  }))
  assert.equal(result.paymentState, 'retained')
  assert.equal(result.collectionMode, 'online')
})

test('refunded and free cancellations have no charge', () => {
  assert.equal(driverPaymentView(booking({ status: 'cancelled', scheduledAdvanceDisposition: 'refunded' })).paymentState, 'void')
  assert.equal(driverPaymentView(booking({ status: 'cancelled', scheduledAt: null,
    scheduledAdvanceDisposition: 'not_applicable' })).paymentState, 'void')
})

test('Ride Now keeps direct collection and uses the existing completion rule', () => {
  const active = driverPaymentView(booking({ status: 'started', scheduledAt: null,
    scheduledAdvanceDisposition: 'not_applicable' }))
  const completed = driverPaymentView(booking({ scheduledAt: null,
    scheduledAdvanceDisposition: 'not_applicable' }))
  assert.equal(active.collectionMode, 'direct')
  assert.equal(active.paymentState, 'due')
  assert.equal(active.scheduledPayment, null)
  assert.equal(completed.paymentState, 'paid')
})
