import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { createTestClock } from './helpers/testClock.js'
import {
  createProviderPlan,
  failAfterCommit,
  failBeforeCommit,
  providerFailure,
  providerOutcome,
} from './helpers/providerPlan.js'
import { createRazorpayFake, razorpayState } from './helpers/razorpayFake.js'
import { createRazorpayXFake, payoutProviderState } from './helpers/razorpayXFake.js'
import {
  directCashSettlement,
  platformControlledSettlement,
  settlementControl,
} from './helpers/settlementBoundary.js'

const orderRequest = (overrides = {}) => ({
  amount: 40000,
  currency: 'INR',
  receipt: 'edge-receipt',
  notes: { source: 'edge-test' },
  ...overrides,
})

const payoutRequest = (overrides = {}) => ({
  amount: 50000,
  upiId: 'captain@upi',
  name: 'Captain Edge',
  reference: 'edge-payout',
  idempotencyKey: 'edge:key',
  ...overrides,
})

test('provider plan preserves ordered failures, diagnostics, and reset behavior', () => {
  assert.deepEqual(providerOutcome, {
    ERROR: 'error', TIMEOUT: 'timeout', LOST_RESPONSE: 'lost_response', OMIT_ID: 'omit_id',
  })
  const failure = providerFailure('SYNTHETIC', 'synthetic failure', 418)
  assert.equal(failure.message, 'synthetic failure')
  assert.deepEqual({ code: failure.code, status: failure.status, description: failure.description }, {
    code: 'SYNTHETIC', status: 418, description: 'synthetic failure',
  })
  const plan = createProviderPlan()
  plan.enqueue('operation', providerOutcome.ERROR, failure)
  plan.enqueue('operation', providerOutcome.TIMEOUT)
  assert.throws(() => failBeforeCommit(plan.take('operation'), 'FALLBACK'), error => error === failure)
  assert.throws(() => failBeforeCommit(plan.take('operation'), 'FALLBACK'), error => (
    error.code === 'PROVIDER_TIMEOUT' && error.status === 504 && error.message === 'Provider request timed out'
  ))
  assert.equal(plan.take('operation'), null)
  plan.enqueue('operation', providerOutcome.ERROR)
  assert.throws(() => failBeforeCommit(plan.take('operation'), 'FALLBACK'), error => (
    error.code === 'FALLBACK' && error.message === 'Provider rejected the request'
  ))
  assert.doesNotThrow(() => failBeforeCommit(null, 'FALLBACK'))
  assert.doesNotThrow(() => failBeforeCommit({ outcome: providerOutcome.LOST_RESPONSE }, 'FALLBACK'))
  assert.doesNotThrow(() => failBeforeCommit({ outcome: providerOutcome.OMIT_ID }, 'FALLBACK'))
  assert.doesNotThrow(() => failAfterCommit(null))
  assert.throws(() => failAfterCommit({ outcome: providerOutcome.LOST_RESPONSE }), error => (
    error.code === 'PROVIDER_RESPONSE_LOST'
    && error.status === 504
    && error.message === 'Provider completed the operation but the response was lost'
  ))
  plan.enqueue('operation', providerOutcome.ERROR)
  plan.reset()
  assert.equal(plan.take('operation'), null)
})

test('Razorpay fake records exact values, defaults, timestamps, events, and lookups', async () => {
  assert.deepEqual(razorpayState, {
    ORDER_CREATED: 'created',
    PAYMENT_PENDING: 'pending',
    PAYMENT_AUTHORIZED: 'authorized',
    PAYMENT_CAPTURED: 'captured',
    PAYMENT_FAILED: 'failed',
    REFUND_PENDING: 'pending',
    REFUND_SUCCEEDED: 'processed',
    REFUND_FAILED: 'failed',
  })
  const clock = createTestClock('2026-09-24T08:00:00Z')
  const provider = createRazorpayFake({ clock })
  assert.equal(provider.keyId, 'rzp_test_verification')
  assert.equal(provider.webhookSecret, 'verification-webhook-secret')
  const order = await provider.gateway.createOrder(orderRequest())
  assert.deepEqual(order, {
    id: 'order_0001', amount: 40000, currency: 'INR', receipt: 'edge-receipt',
    notes: { source: 'edge-test' }, status: 'created', created_at: 1790236800,
  })
  assert.deepEqual(provider.history.orders, [{ request: orderRequest(), at: new Date('2026-09-24T08:00:00Z') }])
  const payment = provider.createPayment({ orderId: order.id })
  assert.deepEqual(payment, {
    id: 'pay_0001', order_id: order.id, amount: 40000, currency: 'INR',
    status: 'pending', created_at: 1790236800,
  })
  assert.deepEqual(await provider.gateway.fetchPayment(payment.id), payment)
  assert.deepEqual(provider.history.paymentFetches, [{ paymentId: payment.id, at: new Date('2026-09-24T08:00:00Z') }])
  provider.planNext('paymentFetch', providerOutcome.ERROR)
  await assert.rejects(provider.gateway.fetchPayment(payment.id), error => (
    error.code === 'PAYMENT_FETCH_ERROR' && error.message === 'Provider rejected the request'
  ))
  const eventId = provider.queuePaymentEvent('payment.authorized', payment.id)
  assert.equal(eventId, 'evt_0001')
  assert.deepEqual(provider.snapshot().queuedWebhookIds, ['evt_0001'])
  assert.deepEqual(provider.snapshot().payments, [payment])
  let delivered
  await provider.deliverWebhook(eventId, event => { delivered = event })
  assert.equal(JSON.parse(delivered.rawBody).payload.payment.entity.id, payment.id)
  assert.deepEqual(provider.history.webhookDeliveries, [{
    eventId, validSignature: true, at: new Date('2026-09-24T08:00:00Z'),
  }])
  await assert.rejects(provider.deliverWebhook('evt_missing', () => {}), error => (
    error.code === 'WEBHOOK_NOT_FOUND' && error.message === 'webhook evt_missing was not found'
  ))
  const signature = provider.paymentSignature(order.id, payment.id)
  const expectedSignature = createHmac('sha256', 'verification-payment-secret')
    .update(`${order.id}|${payment.id}`).digest('hex')
  assert.equal(signature, expectedSignature)
  const invalidEvent = provider.queuePaymentEvent('payment.authorized', payment.id, 'evt_invalid_signature')
  let invalidSignature
  await provider.deliverWebhook(invalidEvent, event => { invalidSignature = event.signature }, { validSignature: false })
  assert.equal(invalidSignature, '0'.repeat(64))
})

test('Razorpay refund accounting separates payments, excludes failures, and validates every amount edge', async () => {
  const provider = createRazorpayFake()
  const firstOrder = await provider.gateway.createOrder(orderRequest())
  const secondOrder = await provider.gateway.createOrder(orderRequest({ receipt: 'other' }))
  const firstPayment = provider.createPayment({ orderId: firstOrder.id, status: razorpayState.PAYMENT_CAPTURED })
  const secondPayment = provider.createPayment({ orderId: secondOrder.id, status: razorpayState.PAYMENT_CAPTURED })
  const failed = await provider.gateway.createRefund(firstPayment.id, {
    amount: 30000, idempotencyKey: 'failed', notes: {},
  })
  provider.setRefundState(failed.id, razorpayState.REFUND_FAILED)
  await provider.gateway.createRefund(secondPayment.id, {
    amount: 30000, idempotencyKey: 'other-payment', notes: {},
  })
  const full = await provider.gateway.createRefund(firstPayment.id, { idempotencyKey: 'full-after-failure' })
  assert.deepEqual({ amount: full.amount, notes: full.notes, status: full.status }, {
    amount: 40000, notes: {}, status: 'pending',
  })
  assert.deepEqual(provider.history.refunds[2], {
    paymentId: firstPayment.id,
    request: { idempotencyKey: 'full-after-failure' },
    at: provider.history.refunds[2].at,
  })
  await assert.rejects(provider.gateway.createRefund('pay_missing', {
    amount: 1, idempotencyKey: 'missing-payment', notes: {},
  }), error => error.code === 'PAYMENT_NOT_FOUND' && error.message === 'payment pay_missing was not found')
  provider.planNext('refund', providerOutcome.ERROR)
  await assert.rejects(provider.gateway.createRefund(firstPayment.id, {
    amount: 1, idempotencyKey: 'provider-error', notes: {},
  }), error => error.code === 'REFUND_PROVIDER_ERROR' && error.message === 'Provider rejected the request')
  await assert.rejects(provider.gateway.createRefund(firstPayment.id, {
    amount: 1.5, idempotencyKey: 'fraction', notes: {},
  }), error => error.code === 'BAD_REQUEST_ERROR' && error.message === 'Refund amount exceeds the refundable amount')
  await assert.rejects(provider.gateway.createRefund(firstPayment.id, {
    amount: 0, idempotencyKey: 'zero', notes: {},
  }), error => error.code === 'BAD_REQUEST_ERROR')

  const thirdOrder = await provider.gateway.createOrder(orderRequest({ receipt: 'exact-remainder' }))
  const thirdPayment = provider.createPayment({ orderId: thirdOrder.id, status: razorpayState.PAYMENT_CAPTURED })
  await provider.gateway.createRefund(thirdPayment.id, { amount: 10000, idempotencyKey: 'part', notes: {} })
  const exact = await provider.gateway.createRefund(thirdPayment.id, { amount: 30000, idempotencyKey: 'remainder', notes: {} })
  assert.equal(exact.amount, 30000)
  const refundEvent = provider.queueRefundEvent('refund.failed', exact.id)
  let refundBody
  await provider.deliverWebhook(refundEvent, event => { refundBody = JSON.parse(event.rawBody) })
  assert.equal(refundBody.payload.refund.entity.id, exact.id)
  assert.throws(() => provider.queuePaymentEvent('payment.captured', 'pay_missing'), error => (
    error.code === 'PAYMENT_NOT_FOUND' && error.message === 'payment pay_missing was not found'
  ))
  assert.throws(() => provider.queueRefundEvent('refund.processed', 'rfnd_missing'), error => (
    error.code === 'REFUND_NOT_FOUND' && error.message === 'refund rfnd_missing was not found'
  ))
  assert.throws(() => provider.createPayment({ orderId: 'order_missing' }), error => (
    error.code === 'ORDER_NOT_FOUND' && error.message === 'order order_missing was not found'
  ))
  assert.throws(() => provider.setPaymentState('pay_missing', 'captured'), error => (
    error.code === 'PAYMENT_NOT_FOUND' && error.message === 'payment pay_missing was not found'
  ))
  assert.throws(() => provider.setRefundState('rfnd_missing', 'failed'), error => (
    error.code === 'REFUND_NOT_FOUND' && error.message === 'refund rfnd_missing was not found'
  ))
  assert.throws(() => provider.order('order_missing'), /order order_missing was not found/)
  assert.throws(() => provider.payment('pay_missing'), /payment pay_missing was not found/)
  assert.throws(() => provider.refund('rfnd_missing'), /refund rfnd_missing was not found/)
})

test('Razorpay reset clears entities, plans, idempotency state, events, histories, and sequences', async () => {
  const provider = createRazorpayFake()
  const order = await provider.gateway.createOrder(orderRequest())
  const payment = provider.createPayment({ orderId: order.id, status: razorpayState.PAYMENT_CAPTURED })
  const refund = await provider.gateway.createRefund(payment.id, { amount: 1000, idempotencyKey: 'reset-key', notes: {} })
  const eventId = provider.queueRefundEvent('refund.processed', refund.id)
  assert.equal(provider.queueRawWebhook('{}'), 'evt_0002')
  assert.equal(provider.queueRawWebhook('{}'), 'evt_0003')
  provider.planNext('order', providerOutcome.ERROR)
  provider.reset()
  await assert.rejects(provider.deliverWebhook(eventId, () => {}), error => error.code === 'WEBHOOK_NOT_FOUND')
  const resetOrder = await provider.gateway.createOrder(orderRequest({ notes: undefined }))
  const resetPayment = provider.createPayment({ orderId: resetOrder.id, amount: 1000, currency: 'USD' })
  const resetRefund = await provider.gateway.createRefund(resetPayment.id, { amount: 1000, idempotencyKey: 'reset-key' })
  assert.deepEqual({ order: resetOrder.id, payment: resetPayment.id, refund: resetRefund.id }, {
    order: 'order_0001', payment: 'pay_0001', refund: 'rfnd_0001',
  })
  assert.deepEqual(resetOrder.notes, {})
  assert.deepEqual(resetRefund.notes, {})
})

test('RazorpayX fake records exact payout data, callback IDs, failures, defaults, and reset isolation', async () => {
  assert.deepEqual(payoutProviderState, {
    PENDING: 'pending', PROCESSING: 'processing', SUCCEEDED: 'processed', FAILED: 'failed',
    REJECTED: 'rejected', CANCELLED: 'cancelled', REVERSED: 'reversed',
  })
  const clock = createTestClock('2026-09-24T09:00:00Z')
  const provider = createRazorpayXFake({ clock })
  const payout = await provider.gateway.createPayout(payoutRequest())
  assert.deepEqual(payout, {
    id: 'pout_0001', amount: 50000, currency: 'INR', status: 'pending',
    destination: 'captain@upi', reference_id: 'edge-payout', idempotency_key: 'edge:key',
    created_at: 1790240400,
  })
  assert.deepEqual(provider.history.creates, [{
    request: payoutRequest(), at: new Date('2026-09-24T09:00:00Z'),
  }])
  assert.deepEqual(await provider.gateway.fetchPayout(payout.id), payout)
  assert.deepEqual(provider.history.fetches, [{ payoutId: payout.id, at: new Date('2026-09-24T09:00:00Z') }])
  const callbackId = provider.queueCallback(payout.id)
  assert.equal(callbackId, 'payout_event_0001')
  assert.deepEqual(provider.snapshot().queuedCallbackIds, [callbackId])
  await provider.deliverCallback(callbackId, () => 'delivered')
  assert.deepEqual(provider.history.callbackDeliveries, [{
    eventId: callbackId, validSignature: true, at: new Date('2026-09-24T09:00:00Z'),
  }])

  provider.planNext('payout', providerOutcome.ERROR)
  await assert.rejects(provider.gateway.createPayout(payoutRequest({ idempotencyKey: 'error' })), error => (
    error.code === 'PAYOUT_GATEWAY_ERROR' && error.message === 'Provider rejected the request'
  ))
  await assert.rejects(provider.gateway.createPayout(payoutRequest({ upiId: undefined, idempotencyKey: 'missing' })), error => (
    error.code === 'BAD_REQUEST_ERROR' && error.message === 'Invalid payout destination'
  ))
  await assert.rejects(provider.gateway.createPayout(payoutRequest({ upiId: 'not-a-vpa', idempotencyKey: 'no-at' })), error => (
    error.code === 'BAD_REQUEST_ERROR'
  ))
  assert.throws(() => provider.payout('pout_missing'), error => (
    error.code === 'PAYOUT_NOT_FOUND' && error.message === 'Payout pout_missing was not found'
  ))
  provider.planNext('payoutFetch', providerOutcome.ERROR)
  await assert.rejects(provider.gateway.fetchPayout(payout.id), error => (
    error.code === 'PAYOUT_FETCH_ERROR' && error.message === 'Provider rejected the request'
  ))
  await assert.rejects(provider.deliverCallback('missing-callback', () => {}), error => (
    error.code === 'CALLBACK_NOT_FOUND' && error.message === 'Payout callback missing-callback was not found'
  ))

  provider.invalidateDestination('blocked@upi')
  provider.planNext('payout', providerOutcome.ERROR)
  provider.reset()
  await assert.rejects(provider.deliverCallback(callbackId, () => {}), error => error.code === 'CALLBACK_NOT_FOUND')
  const reset = await provider.gateway.createPayout(payoutRequest({
    upiId: 'blocked@upi', currency: undefined, idempotencyKey: 'edge:key',
  }))
  assert.deepEqual({ id: reset.id, currency: reset.currency }, { id: 'pout_0001', currency: 'INR' })
  assert.deepEqual(provider.history, { creates: [{
    request: payoutRequest({ upiId: 'blocked@upi', currency: undefined, idempotencyKey: 'edge:key' }),
    at: new Date('2026-09-24T09:00:00Z'),
  }], fetches: [], callbackDeliveries: [] })
})

test('settlement descriptors preserve zero amounts, labels, controls, and provider ownership', () => {
  assert.deepEqual(settlementControl, {
    DIRECT_CASH_SETTLEMENT: 'DIRECT_CASH_SETTLEMENT',
    PLATFORM_CONTROLLED_SETTLEMENT: 'PLATFORM_CONTROLLED_SETTLEMENT',
  })
  assert.deepEqual(directCashSettlement({ rideId: 'cash-zero', grossDriverEarning: 0 }), {
    rideId: 'cash-zero', control: 'DIRECT_CASH_SETTLEMENT', grossDriverEarning: 0,
    platformPayoutAmount: 0, providerPayoutId: null,
  })
  assert.deepEqual(platformControlledSettlement({
    rideId: 'platform-zero', grossDriverEarning: 0, platformPayoutAmount: 0, providerPayoutId: 'pout_1',
  }), {
    rideId: 'platform-zero', control: 'PLATFORM_CONTROLLED_SETTLEMENT', grossDriverEarning: 0,
    platformPayoutAmount: 0, providerPayoutId: 'pout_1',
  })
  assert.throws(() => directCashSettlement({ rideId: 'bad', grossDriverEarning: 1.5 }), {
    name: 'TypeError', message: 'Gross driver earning must be nonnegative integer paise',
  })
  assert.throws(() => platformControlledSettlement({
    rideId: 'bad', grossDriverEarning: 1, platformPayoutAmount: -1, providerPayoutId: 'pout_1',
  }), { name: 'TypeError', message: 'Platform payout amount must be nonnegative integer paise' })
  assert.throws(() => platformControlledSettlement({
    rideId: 'bad', grossDriverEarning: 1.5, platformPayoutAmount: 1, providerPayoutId: 'pout_1',
  }), { name: 'TypeError', message: 'Gross driver earning must be nonnegative integer paise' })
})
