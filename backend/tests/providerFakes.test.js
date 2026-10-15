import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createOrderForPayment,
  processRazorpayWebhook,
  refundScheduledCancellationAdvance,
} from '../services/payments.js'
import { createTestClock } from './helpers/testClock.js'
import { createRazorpayFake, providerOutcome, razorpayState } from './helpers/razorpayFake.js'
import { createRazorpayXFake, payoutProviderState } from './helpers/razorpayXFake.js'
import {
  directCashSettlement,
  platformControlledSettlement,
  settlementControl,
} from './helpers/settlementBoundary.js'

const internalPayment = (overrides = {}) => ({
  id: '11111111-1111-4111-8111-111111111111',
  userId: 'customer-1',
  driverId: null,
  bookingId: null,
  purpose: 'verification_probe',
  amount: 40000,
  currency: 'INR',
  status: 'created',
  razorpayOrderId: null,
  razorpayPaymentId: null,
  orderCreationStartedAt: null,
  ...overrides,
})

const matchesPayment = (row, where) => {
  const required = ['id', 'userId', 'driverId', 'status']
  if (required.some(key => where[key] && row[key] !== where[key])) return false
  const exact = [
    'razorpayOrderId', 'refundRequestKey', 'razorpayRefundId', 'cancellationRefundAmount',
  ]
  if (exact.some(key => Object.hasOwn(where, key) && row[key] !== where[key])) return false
  if (Object.hasOwn(where, 'orderCreationStartedAt')) {
    const expected = where.orderCreationStartedAt?.getTime?.()
    const actual = row.orderCreationStartedAt?.getTime?.()
    if (expected !== actual) return false
  }
  if (where.OR) return where.OR.some(condition => Object.entries(condition).every(([key, value]) => row[key] === value))
  return true
}

function applicationPaymentDb(initial = internalPayment()) {
  let row = { ...initial }
  let advanceDisposition = 'partial_refund_pending'
  const events = new Map()
  const tx = {
    $queryRaw: async () => [],
    payment: {
      findUniqueOrThrow: async () => ({ ...row }),
      findFirst: async ({ where }) => matchesPayment(row, where) ? { ...row } : null,
      findUnique: async ({ where }) => where.id === row.id ? { ...row } : null,
      updateMany: async ({ where, data }) => {
        if (!matchesPayment(row, where)) return { count: 0 }
        row = { ...row, ...data }
        return { count: 1 }
      },
      update: async ({ where, data }) => {
        if (where.id !== row.id) throw new Error('Payment not found')
        row = { ...row, ...data }
        return { ...row }
      },
    },
    razorpayWebhookEvent: {
      createMany: async ({ data }) => {
        const event = data[0]
        if (events.has(event.eventId)) return { count: 0 }
        events.set(event.eventId, { ...event })
        return { count: 1 }
      },
      update: async ({ where, data }) => {
        events.set(where.eventId, { ...events.get(where.eventId), ...data })
        return events.get(where.eventId)
      },
    },
    booking: {
      updateMany: async ({ data }) => {
        advanceDisposition = data.scheduledAdvanceDisposition
        return { count: 1 }
      },
    },
  }
  return {
    ...tx,
    $transaction: work => work(tx),
    row: () => ({ ...row }),
    advanceDisposition: () => advanceDisposition,
    events,
  }
}

const paymentRequest = {
  amount: 40000,
  currency: 'INR',
  receipt: 'verification-receipt',
  notes: { internal_payment_id: '11111111-1111-4111-8111-111111111111' },
}

async function scheduledRefundHarness() {
  const provider = createRazorpayFake()
  const order = await provider.gateway.createOrder(paymentRequest)
  const external = provider.createPayment({ orderId: order.id, status: razorpayState.PAYMENT_CAPTURED })
  const db = applicationPaymentDb(internalPayment({
    purpose: 'scheduled_ride_advance',
    status: 'captured',
    razorpayOrderId: order.id,
    razorpayPaymentId: external.id,
    cancellationRefundAmount: null,
    razorpayRefundId: null,
    refundRequestKey: null,
    refundRequestedAmount: null,
    refundOperationStatus: null,
    bookingId: 'scheduled-booking-1',
  }))
  return { provider, db }
}

test('payment fake drives order, capture, signed webhook, and duplicate delivery through production boundaries', async () => {
  const clock = createTestClock('2026-09-24T10:00:00+05:30')
  const provider = createRazorpayFake({ clock })
  const db = applicationPaymentDb()
  const checkout = await createOrderForPayment({
    paymentId: db.row().id,
    userId: db.row().userId,
    gateway: provider.gateway,
    db,
  })
  const external = provider.createPayment({ orderId: checkout.orderId })
  provider.setPaymentState(external.id, razorpayState.PAYMENT_CAPTURED)
  const eventId = provider.queuePaymentEvent('payment.captured', external.id, 'evt_capture_1')
  const deliver = args => processRazorpayWebhook({ ...args, gateway: provider.webhookGateway, db })

  assert.deepEqual(await provider.deliverWebhook(eventId, deliver), { processed: true })
  assert.equal(db.row().status, 'captured')
  assert.equal(db.row().razorpayPaymentId, external.id)
  assert.deepEqual(await provider.deliverWebhook(eventId, deliver), { duplicate: true })
  assert.equal(db.events.size, 1)
  assert.equal(provider.history.webhookDeliveries.length, 2)
  assert.equal(provider.history.orders.length, 1)
})

test('payment fake exposes provider errors, invalid signatures, malformed and unknown events', async () => {
  const provider = createRazorpayFake()
  provider.planNext('order', providerOutcome.ERROR)
  await assert.rejects(provider.gateway.createOrder(paymentRequest), error => error.code === 'ORDER_PROVIDER_ERROR')
  provider.planNext('order', providerOutcome.TIMEOUT)
  await assert.rejects(provider.gateway.createOrder(paymentRequest), error => error.code === 'PROVIDER_TIMEOUT')
  const order = await provider.gateway.createOrder(paymentRequest)
  const payment = provider.createPayment({ orderId: order.id })
  const eventId = provider.queuePaymentEvent('payment.authorized', payment.id)
  await assert.rejects(
    provider.deliverWebhook(eventId, args => processRazorpayWebhook({
      ...args, gateway: provider.webhookGateway, db: applicationPaymentDb(),
    }), { validSignature: false }),
    error => error.code === 'INVALID_WEBHOOK_SIGNATURE',
  )
  const malformedId = provider.queueRawWebhook('{broken-json')
  await assert.rejects(
    provider.deliverWebhook(malformedId, args => processRazorpayWebhook({
      ...args, gateway: provider.webhookGateway, db: applicationPaymentDb(),
    })),
    error => error.code === 'MALFORMED_WEBHOOK',
  )
  await assert.rejects(provider.gateway.fetchPayment('pay_missing'), error => error.code === 'PAYMENT_NOT_FOUND')
})

test('lost order response is reconciled without creating a duplicate provider order', async () => {
  const provider = createRazorpayFake()
  const db = applicationPaymentDb()
  provider.planNext('order', providerOutcome.LOST_RESPONSE)
  const recovered = await createOrderForPayment({
    paymentId: db.row().id, userId: db.row().userId, gateway: provider.gateway, db,
  })
  const retry = await createOrderForPayment({
    paymentId: db.row().id, userId: db.row().userId, gateway: provider.gateway, db,
  })
  assert.equal(recovered.orderId, 'order_0001')
  assert.equal(retry.orderId, recovered.orderId)
  assert.equal(provider.history.orders.length, 1)
  assert.equal(provider.snapshot().orders.length, 1)
})

test('late order result is recovered on retry after reconciliation also times out', async () => {
  const provider = createRazorpayFake()
  const db = applicationPaymentDb()
  provider.planNext('order', providerOutcome.LOST_RESPONSE)
  provider.planNext('orderFetch', providerOutcome.TIMEOUT)
  provider.planNext('orderFetch', providerOutcome.TIMEOUT)
  await assert.rejects(createOrderForPayment({
    paymentId: db.row().id, userId: db.row().userId, gateway: provider.gateway, db,
  }), error => error.code === 'RAZORPAY_ORDER_FAILED')
  assert.equal(db.row().status, 'order_creating')
  assert.equal(db.row().failureCode, 'ORDER_OUTCOME_UNKNOWN')

  await assert.rejects(createOrderForPayment({
    paymentId: db.row().id, userId: db.row().userId, gateway: provider.gateway, db,
  }), error => error.code === 'ORDER_OUTCOME_UNKNOWN')
  assert.equal(provider.history.orders.length, 1)

  const lateResult = await createOrderForPayment({
    paymentId: db.row().id, userId: db.row().userId, gateway: provider.gateway, db,
  })
  assert.equal(lateResult.orderId, 'order_0001')
  assert.equal(provider.history.orders.length, 1)
})

test('concurrent application order requests create one provider order', async () => {
  const provider = createRazorpayFake()
  const db = applicationPaymentDb()
  const input = { paymentId: db.row().id, userId: db.row().userId, gateway: provider.gateway, db }
  const settled = await Promise.allSettled([
    createOrderForPayment(input),
    createOrderForPayment(input),
  ])

  assert.equal(settled.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(settled.filter(result => result.status === 'rejected').length, 1)
  assert.equal(provider.snapshot().orders.length, 1)
  assert.equal(db.row().razorpayOrderId, 'order_0001')
})

test('refund fake supports delayed callbacks, partial refunds, idempotent ambiguous retry, and limits', async () => {
  const clock = createTestClock('2026-09-24T05:00:00Z')
  const provider = createRazorpayFake({ clock })
  const order = await provider.gateway.createOrder(paymentRequest)
  const payment = provider.createPayment({ orderId: order.id, status: razorpayState.PAYMENT_CAPTURED })
  const first = await provider.gateway.createRefund(payment.id, {
    amount: 8000, idempotencyKey: 'refund:first', notes: { reason: 'partial' },
  })
  provider.setRefundState(first.id, razorpayState.REFUND_SUCCEEDED)
  const eventId = provider.queueRefundEvent('refund.processed', first.id)
  assert.equal(provider.history.webhookDeliveries.length, 0, 'callback remains delayed until explicitly delivered')
  let callback
  await provider.deliverWebhook(eventId, args => { callback = args })
  assert.equal(callback.eventId, eventId)

  provider.planNext('refund', providerOutcome.LOST_RESPONSE)
  await assert.rejects(provider.gateway.createRefund(payment.id, {
    amount: 7000, idempotencyKey: 'refund:ambiguous', notes: {},
  }), error => error.code === 'PROVIDER_RESPONSE_LOST')
  const retry = await provider.gateway.createRefund(payment.id, {
    amount: 7000, idempotencyKey: 'refund:ambiguous', notes: {},
  })
  assert.equal(retry.amount, 7000)
  assert.equal(provider.snapshot().refunds.length, 2)
  assert.equal(provider.history.refunds.length, 3)
  await assert.rejects(provider.gateway.createRefund(payment.id, {
    amount: 40000, idempotencyKey: 'refund:too-much', notes: {},
  }), error => error.code === 'BAD_REQUEST_ERROR')

  provider.planNext('refund', providerOutcome.OMIT_ID)
  const missingId = await provider.gateway.createRefund(payment.id, {
    amount: 1000, idempotencyKey: 'refund:missing-id', notes: {},
  })
  assert.equal(missingId.id, undefined)
  assert.equal(provider.refund(first.id).status, razorpayState.REFUND_SUCCEEDED)
})

test('refund fake reconciles immediately after an ambiguous scheduled-refund response', async () => {
  const { provider, db } = await scheduledRefundHarness()
  provider.planNext('refund', providerOutcome.LOST_RESPONSE)
  const recovered = await refundScheduledCancellationAdvance({
    paymentId: db.row().id, amount: 8000, gateway: provider.gateway, db,
  })
  const retry = await refundScheduledCancellationAdvance({
    paymentId: db.row().id, amount: 8000, gateway: provider.gateway, db,
  })
  assert.equal(recovered.refundId, 'rfnd_0001')
  assert.equal(retry.refundId, 'rfnd_0001')
  assert.equal(provider.snapshot().refunds.length, 1)
  assert.equal(provider.history.refunds.length, 1)
})

test('refund lost response survives restart and reconciles the original provider refund', async () => {
  const { provider, db } = await scheduledRefundHarness()
  provider.planNext('refund', providerOutcome.LOST_RESPONSE)
  provider.planNext('refundFetch', providerOutcome.TIMEOUT)
  await assert.rejects(refundScheduledCancellationAdvance({
    paymentId: db.row().id, amount: 8000, gateway: provider.gateway, db,
  }), error => error.code === 'PROVIDER_RESPONSE_LOST')
  assert.equal(db.row().refundOperationStatus, 'outcome_unknown')
  assert.equal(db.row().razorpayRefundId, null)

  const afterRestart = await refundScheduledCancellationAdvance({
    paymentId: db.row().id, amount: 8000, gateway: provider.gateway, db,
  })
  assert.equal(afterRestart.refundId, 'rfnd_0001')
  assert.equal(db.row().refundOperationStatus, 'provider_identified')
  assert.equal(provider.history.refunds.length, 1)

  provider.setRefundState(afterRestart.refundId, razorpayState.REFUND_SUCCEEDED)
  const eventId = provider.queueRefundEvent('refund.processed', afterRestart.refundId)
  await provider.deliverWebhook(eventId, args => processRazorpayWebhook({
    ...args, gateway: provider.webhookGateway, db,
  }))
  assert.equal(db.row().refundOperationStatus, 'succeeded')
  assert.equal(db.advanceDisposition(), 'partially_refunded')
})

test('concurrent refund retries discover one provider refund and cannot over-refund', async () => {
  const { provider, db } = await scheduledRefundHarness()
  const requestKey = `scheduled-cancellation:${db.row().id}:8000`
  const existing = await provider.gateway.createRefund(db.row().razorpayPaymentId, {
    amount: 8000,
    idempotencyKey: requestKey,
    notes: { internal_payment_id: db.row().id, refund_request_key: requestKey },
  })
  await db.payment.update({ where: { id: db.row().id }, data: {
    cancellationRefundAmount: 8000,
    refundOperationStatus: 'outcome_unknown',
    refundRequestKey: requestKey,
    refundRequestedAmount: 8000,
  } })

  const settled = await Promise.all([
    refundScheduledCancellationAdvance({ paymentId: db.row().id, amount: 8000, gateway: provider.gateway, db }),
    refundScheduledCancellationAdvance({ paymentId: db.row().id, amount: 8000, gateway: provider.gateway, db }),
  ])
  assert.equal(settled[0].refundId, existing.id)
  assert.equal(settled[1].refundId, existing.id)
  assert.equal(provider.snapshot().refunds.length, 1)
  assert.equal(provider.history.refunds.length, 1)
})

test('missing refund ID is recovered from provider reconciliation', async () => {
  const { provider, db } = await scheduledRefundHarness()
  provider.planNext('refund', providerOutcome.OMIT_ID)
  const first = await refundScheduledCancellationAdvance({
    paymentId: db.row().id, amount: 8000, gateway: provider.gateway, db,
  })
  const retry = await refundScheduledCancellationAdvance({
    paymentId: db.row().id, amount: 8000, gateway: provider.gateway, db,
  })
  assert.equal(first.refundId, 'rfnd_0001')
  assert.equal(retry.refundId, first.refundId)
  assert.equal(retry.alreadyApplied, true)
  assert.equal(provider.history.refunds.length, 1, 'application cannot reconcile the provider refund ID')
  assert.equal(provider.history.refundFetches.length, 1)
})

test('payment signatures, state reset, and payment failure remain deterministic', async () => {
  const provider = createRazorpayFake()
  const order = await provider.gateway.createOrder(paymentRequest)
  const payment = provider.createPayment({ orderId: order.id })
  const signature = provider.paymentSignature(order.id, payment.id)
  assert.equal(provider.gateway.verifyPaymentSignature({ orderId: order.id, paymentId: payment.id, signature }), true)
  assert.equal(provider.gateway.verifyPaymentSignature({ orderId: order.id, paymentId: payment.id, signature: '0'.repeat(64) }), false)
  provider.setPaymentState(payment.id, razorpayState.PAYMENT_FAILED)
  assert.equal(provider.payment(payment.id).status, razorpayState.PAYMENT_FAILED)
  assert.equal(provider.order(order.id).status, razorpayState.ORDER_CREATED)
  provider.reset()
  assert.deepEqual(provider.snapshot(), { orders: [], payments: [], refunds: [], queuedWebhookIds: [] })
})

const payoutRequest = (overrides = {}) => ({
  amount: 50000,
  currency: 'INR',
  upiId: 'captain@upi',
  name: 'Captain Test',
  reference: 'driver-payout-1',
  idempotencyKey: 'payout:driver-1',
  ...overrides,
})

test('payout fake supports pending, delayed success callback, status fetch and duplicate idempotency', async () => {
  const clock = createTestClock('2026-09-24T06:00:00Z')
  const provider = createRazorpayXFake({ clock })
  const payout = await provider.gateway.createPayout(payoutRequest())
  assert.equal(payout.status, payoutProviderState.PENDING)
  provider.setState(payout.id, payoutProviderState.SUCCEEDED)
  const callbackId = provider.queueCallback(payout.id)
  let callback
  await provider.deliverCallback(callbackId, event => { callback = event })
  assert.equal(callback.payout.status, payoutProviderState.SUCCEEDED)
  assert.equal((await provider.gateway.fetchPayout(payout.id)).status, payoutProviderState.SUCCEEDED)
  const duplicate = await provider.gateway.createPayout(payoutRequest())
  assert.equal(duplicate.id, payout.id)
  assert.equal(provider.history.creates.length, 2)
  assert.equal(provider.snapshot().payouts.length, 1)
})

test('payout fake exposes lost responses, duplicate application requests, failures and destination changes', async () => {
  const provider = createRazorpayXFake()
  provider.planNext('payout', providerOutcome.LOST_RESPONSE)
  await assert.rejects(provider.gateway.createPayout(payoutRequest()), error => error.code === 'PROVIDER_RESPONSE_LOST')
  const retry = await provider.gateway.createPayout(payoutRequest())
  assert.equal(retry.id, 'pout_0001')
  const accidentalDuplicate = await provider.gateway.createPayout(payoutRequest({ idempotencyKey: 'payout:driver-1:wrong-retry' }))
  assert.notEqual(accidentalDuplicate.id, retry.id)
  provider.invalidateDestination('invalid@upi')
  await assert.rejects(
    provider.gateway.createPayout(payoutRequest({ upiId: 'invalid@upi', idempotencyKey: 'payout:invalid' })),
    error => error.code === 'BAD_REQUEST_ERROR',
  )
  provider.setState(retry.id, payoutProviderState.REJECTED, { failure_reason: 'destination_invalid' })
  assert.equal(provider.payout(retry.id).failure_reason, 'destination_invalid')
  provider.planNext('payoutFetch', providerOutcome.TIMEOUT)
  await assert.rejects(provider.gateway.fetchPayout(retry.id), error => error.code === 'PROVIDER_TIMEOUT')
  await assert.rejects(provider.gateway.fetchPayout('pout_missing'), error => error.code === 'PAYOUT_NOT_FOUND')
  await assert.rejects(provider.deliverCallback('missing', () => {}), error => error.code === 'CALLBACK_NOT_FOUND')
  provider.reset()
  assert.deepEqual(provider.snapshot(), { payouts: [], queuedCallbackIds: [] })
})

test('cash settlement remains outside the payout provider while platform settlement is explicit', async () => {
  const provider = createRazorpayXFake()
  const cash = directCashSettlement({ rideId: 'ride-cash', grossDriverEarning: 50000 })
  assert.equal(cash.control, settlementControl.DIRECT_CASH_SETTLEMENT)
  assert.equal(cash.platformPayoutAmount, 0)
  assert.equal(provider.history.creates.length, 0)

  const payout = await provider.gateway.createPayout(payoutRequest())
  const platform = platformControlledSettlement({
    rideId: 'ride-upi', grossDriverEarning: 50000, platformPayoutAmount: 50000, providerPayoutId: payout.id,
  })
  assert.equal(platform.control, settlementControl.PLATFORM_CONTROLLED_SETTLEMENT)
  assert.equal(platform.providerPayoutId, payout.id)
  assert.throws(() => directCashSettlement({ rideId: 'bad', grossDriverEarning: -1 }), /nonnegative integer/)
  assert.throws(() => platformControlledSettlement({
    rideId: 'bad', grossDriverEarning: 1, platformPayoutAmount: 1, providerPayoutId: '',
  }), /provider payout ID/)
})
