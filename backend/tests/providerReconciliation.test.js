import test from 'node:test'
import assert from 'node:assert/strict'
import {
  orderReceiptFor,
  providerOutcomeIsUnknown,
  refundRequestKey,
  selectPaymentOrder,
  selectPaymentRefund,
} from '../services/providerReconciliation.js'

const payment = {
  id: '12345678-1234-4234-8234-123456789012-extra',
  purpose: 'scheduled_ride_advance',
  amount: 10000,
  currency: 'INR',
  razorpayPaymentId: 'pay_1',
}

test('order reconciliation selects the earliest exact payment-intent match', () => {
  const receipt = orderReceiptFor(payment.id)
  assert.equal(receipt.length, 40)
  const matching = id => ({
    id,
    receipt,
    amount: payment.amount,
    currency: payment.currency,
    notes: { internal_payment_id: payment.id },
    created_at: 2,
  })
  const selected = selectPaymentOrder(payment, [
    matching('order_b'),
    { ...matching('order_wrong_receipt'), receipt: 'wrong' },
    { ...matching('order_wrong_amount'), amount: 1 },
    { ...matching('order_wrong_currency'), currency: 'USD' },
    { ...matching('order_array_notes'), notes: [] },
    { ...matching('order_wrong_notes'), notes: { internal_payment_id: 'other' } },
    { ...matching('order_late'), created_at: 3 },
    matching('order_a'),
    null,
  ])
  assert.equal(selected.id, 'order_a')
  const withoutTimes = [matching('order_d'), matching('order_c')]
  for (const order of withoutTimes) delete order.created_at
  assert.equal(selectPaymentOrder(payment, withoutTimes).id, 'order_c')
  assert.equal(selectPaymentOrder(payment, []), null)
})

test('order reconciliation rejects every independently mismatched provider candidate', () => {
  const receipt = orderReceiptFor(payment.id)
  const matching = {
    id: 'order_1', receipt, amount: payment.amount, currency: payment.currency,
    notes: { internal_payment_id: payment.id },
  }
  const invalid = [
    null,
    { ...matching, receipt: 'wrong' },
    { ...matching, amount: 1 },
    { ...matching, currency: 'USD' },
    { ...matching, notes: null },
    { ...matching, notes: [] },
    { ...matching, notes: { internal_payment_id: 'wrong' } },
  ]
  for (const order of invalid) assert.equal(selectPaymentOrder(payment, [order]), null)

  const dated = { ...matching, id: 'order_a', created_at: 1 }
  const undated = { ...matching, id: 'order_z' }
  assert.equal(selectPaymentOrder(payment, [dated, undated]).id, 'order_z')
})

test('refund identities distinguish scheduled partial, debt excess, and full refunds', () => {
  assert.equal(refundRequestKey(payment, 5000), `scheduled-cancellation:${payment.id}:5000`)
  assert.equal(refundRequestKey({ ...payment, purpose: 'driver_debt_settlement' }, 5000),
    `driver-debt-excess:${payment.id}`)
  assert.equal(refundRequestKey(payment, payment.amount), payment.id)
  assert.equal(refundRequestKey({ ...payment, purpose: 'driver_debt_settlement' }, payment.amount), payment.id)
  assert.equal(refundRequestKey({ ...payment, purpose: 'ride_final' }, 5000), payment.id)
})

test('refund reconciliation selects only the earliest exact operation match', () => {
  const requestKey = refundRequestKey(payment, 5000)
  const matching = id => ({
    id,
    payment_id: payment.razorpayPaymentId,
    amount: 5000,
    currency: payment.currency,
    notes: { internal_payment_id: payment.id, refund_request_key: requestKey },
    created_at: 5,
  })
  const selected = selectPaymentRefund(payment, 5000, requestKey, [
    matching('rfnd_b'),
    { ...matching('rfnd_payment'), payment_id: 'other' },
    { ...matching('rfnd_amount'), amount: 1 },
    { ...matching('rfnd_currency'), currency: 'USD' },
    { ...matching('rfnd_notes'), notes: null },
    { ...matching('rfnd_request'), notes: {
      internal_payment_id: payment.id, refund_request_key: 'other',
    } },
    matching('rfnd_a'),
  ])
  assert.equal(selected.id, 'rfnd_a')
  const withoutTimes = [matching('rfnd_d'), matching('rfnd_c')]
  for (const providerRefund of withoutTimes) delete providerRefund.created_at
  assert.equal(selectPaymentRefund(payment, 5000, requestKey, withoutTimes).id, 'rfnd_c')
  assert.equal(selectPaymentRefund(payment, 5000, requestKey, []), null)
})

test('refund reconciliation rejects every independently mismatched operation candidate', () => {
  const amount = 5000
  const requestKey = refundRequestKey(payment, amount)
  const matching = {
    id: 'rfnd_1', payment_id: payment.razorpayPaymentId, amount, currency: payment.currency,
    notes: { internal_payment_id: payment.id, refund_request_key: requestKey },
  }
  const invalid = [
    null,
    { ...matching, payment_id: 'wrong' },
    { ...matching, amount: 1 },
    { ...matching, currency: 'USD' },
    { ...matching, notes: null },
    { ...matching, notes: [] },
    { ...matching, notes: { internal_payment_id: 'wrong', refund_request_key: requestKey } },
    { ...matching, notes: { internal_payment_id: payment.id, refund_request_key: 'wrong' } },
  ]
  for (const providerRefund of invalid) {
    assert.equal(selectPaymentRefund(payment, amount, requestKey, [providerRefund]), null)
  }

  const dated = { ...matching, id: 'rfnd_a', created_at: 1 }
  const undated = { ...matching, id: 'rfnd_z' }
  assert.equal(selectPaymentRefund(payment, amount, requestKey, [dated, undated]).id, 'rfnd_z')
})

test('provider outcome classification separates definite client errors from ambiguity', () => {
  assert.equal(providerOutcomeIsUnknown({ outcomeUnknown: true }), true)
  assert.equal(providerOutcomeIsUnknown({ outcomeUnknown: false }), false)
  assert.equal(providerOutcomeIsUnknown(new Error('network')), true)
  assert.equal(providerOutcomeIsUnknown({ statusCode: 200 }), true)
  assert.equal(providerOutcomeIsUnknown({ status: 408 }), true)
  assert.equal(providerOutcomeIsUnknown({ status: 409 }), true)
  assert.equal(providerOutcomeIsUnknown({ status: 429 }), true)
  assert.equal(providerOutcomeIsUnknown({ status: 500 }), true)
  assert.equal(providerOutcomeIsUnknown({ status: 400 }), false)
  assert.equal(providerOutcomeIsUnknown(null), true)
})
