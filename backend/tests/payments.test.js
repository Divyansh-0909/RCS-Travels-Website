import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createOrderForPayment, verifyCheckoutPayment, processRazorpayWebhook, statusAfterGatewayPayment } from '../services/payments.js'

import { basePayment, paymentDb } from './helpers/paymentDb.js'

describe('server-authoritative order creation', () => {
  test('rejects stored amounts below Razorpay minimum before calling the gateway', async () => {
    const db = paymentDb(basePayment({ amount: 99 })); let calls = 0
    await assert.rejects(createOrderForPayment({ paymentId: db.row.id, userId: 'u1',
      gateway: { createOrder: async () => { calls++ } }, db }),
    error => error.code === 'INVALID_AMOUNT' && error.message === 'Payment amount must be at least 100 subunits')
    assert.equal(calls, 0)
  })
  test('uses the stored amount/currency and never a client amount', async () => {
    const db = paymentDb(); let options
    const gateway = { keyId: 'rzp_public', createOrder: async (input) => (options = input, { id: 'order_1', amount: input.amount, currency: input.currency }) }
    const result = await createOrderForPayment({ paymentId: db.row.id, userId: 'u1', gateway, db })
    assert.equal(options.amount, 12345); assert.equal(options.currency, 'INR')
    assert.equal(result.orderId, 'order_1'); assert.equal(result.keyId, 'rzp_public')
    assert.equal(db.row.status, 'order_created')
    assert.equal('keySecret' in result, false)
    assert.deepEqual(db.calls.updateMany[0].where, {
      id: db.row.id, razorpayOrderId: null, status: 'created',
    })
    assert.deepEqual(db.calls.updateMany[1].where, { id: db.row.id, razorpayOrderId: null })
  })
  test('order ownership is enforced for both customer and driver payments', async () => {
    const userOwned = paymentDb()
    await assert.rejects(createOrderForPayment({
      paymentId: userOwned.row.id, userId: 'wrong', gateway: {}, db: userOwned,
    }), error => error.code === 'PAYMENT_NOT_FOUND' && error.message === 'Payment not found')

    const driverOwned = paymentDb(basePayment({ userId: null, driverId: 'driver-1' }))
    const gateway = { keyId: 'public', createOrder: async input => ({ id: 'order_driver', ...input }) }
    assert.equal((await createOrderForPayment({
      paymentId: driverOwned.row.id, driverId: 'driver-1', gateway, db: driverOwned,
    })).orderId, 'order_driver')
    await assert.rejects(createOrderForPayment({
      paymentId: basePayment().id, driverId: 'wrong', gateway: {}, db: paymentDb(basePayment({
        userId: null, driverId: 'driver-1',
      })),
    }), error => error.code === 'PAYMENT_NOT_FOUND')
  })
  test('rejects missing payments and mismatched provider orders without persisting them', async () => {
    const missing = paymentDb()
    await assert.rejects(createOrderForPayment({ paymentId: 'missing', userId: 'u1', gateway: {}, db: missing }),
      error => error.code === 'PAYMENT_NOT_FOUND' && error.message === 'Payment not found')
    const mismatched = paymentDb()
    await assert.rejects(createOrderForPayment({
      paymentId: mismatched.row.id,
      userId: 'u1',
      gateway: { createOrder: async input => ({ id: 'order_bad', ...input, amount: input.amount + 1 }) },
      db: mismatched,
    }), error => error.code === 'GATEWAY_ORDER_MISMATCH' && error.message === 'Gateway returned mismatched order values')
    assert.equal(mismatched.row.status, 'created')
    assert.equal(mismatched.row.razorpayOrderId, null)

    for (const providerOrder of [null, { id: 'order_bad', amount: 12345, currency: 'USD' }]) {
      const db = paymentDb()
      await assert.rejects(createOrderForPayment({
        paymentId: db.row.id, userId: 'u1', gateway: { createOrder: async () => providerOrder }, db,
      }), error => error.code === 'GATEWAY_ORDER_MISMATCH')
    }
  })
  test('fails closed if an order cannot be attached after provider creation', async () => {
    const db = paymentDb()
    const updateMany = db.payment.updateMany
    let calls = 0
    db.payment.updateMany = async input => {
      calls++
      if (calls === 2) return { count: 0 }
      return updateMany(input)
    }
    await assert.rejects(createOrderForPayment({
      paymentId: db.row.id, userId: 'u1',
      gateway: { createOrder: async input => ({ id: 'order_unattached', ...input }) }, db,
    }), error => error.code === 'PAYMENT_BUSY' && error.message === 'Payment order is already being created')

    const missingAfterSave = paymentDb()
    missingAfterSave.payment.findUnique = async () => null
    await assert.rejects(createOrderForPayment({
      paymentId: missingAfterSave.row.id, userId: 'u1',
      gateway: { createOrder: async input => ({ id: 'order_missing', ...input }) },
      db: missingAfterSave,
    }), error => error.code === 'PAYMENT_BUSY')
  })
  test('order creation is not payment capture and retries reuse the order', async () => {
    const db = paymentDb(); let calls = 0
    const gateway = { keyId: 'public', createOrder: async (o) => { calls++; return { id: 'order_1', amount: o.amount, currency: o.currency } } }
    await createOrderForPayment({ paymentId: db.row.id, userId: 'u1', gateway, db })
    const again = await createOrderForPayment({ paymentId: db.row.id, userId: 'u1', gateway, db })
    assert.equal(calls, 1); assert.equal(again.status, 'order_created')
  })
  test('maps Razorpay authentication failures to 401 without leaking details', async () => {
    const db = paymentDb()
    await assert.rejects(createOrderForPayment({ paymentId: db.row.id, userId: 'u1',
      gateway: { createOrder: async () => { throw { statusCode: 401, error: { description: 'sensitive' } } } }, db }),
    (error) => error.status === 401 && error.code === 'RAZORPAY_AUTH_FAILED' && !error.message.includes('sensitive'))
    assert.equal(db.calls.updateMany.at(-1).where.id, db.row.id)
    assert.equal(db.calls.updateMany.at(-1).where.status, 'order_creating')
    assert.equal(db.calls.updateMany.at(-1).where.orderCreationStartedAt instanceof Date, true)
  })
  test('maps other Razorpay order errors to a safe 500', async () => {
    const db = paymentDb()
    await assert.rejects(createOrderForPayment({ paymentId: db.row.id, userId: 'u1',
      gateway: { createOrder: async () => { throw new Error('provider detail') } }, db }),
    (error) => error.status === 500 && error.code === 'RAZORPAY_ORDER_FAILED' && !error.message.includes('provider detail'))
  })
  test('rejects order creation from a payment state that cannot create an order', async () => {
    const db = paymentDb(basePayment({ status: 'captured' }))
    await assert.rejects(createOrderForPayment({ paymentId: db.row.id, userId: 'u1', gateway: {}, db }),
      error => error.code === 'ORDER_NOT_ALLOWED' && error.message === 'Payment is not eligible for order creation')
  })
  test('fresh order lease stays busy while an expired lease can be reclaimed', async () => {
    const now = new Date('2026-09-24T10:00:00Z')
    const fresh = paymentDb(basePayment({ status: 'order_creating', orderCreationStartedAt: now }))
    const clock = { now: () => new Date(now) }
    await assert.rejects(createOrderForPayment({
      paymentId: fresh.row.id, userId: 'u1', gateway: {}, db: fresh, clock,
    }), error => error.code === 'PAYMENT_BUSY' && error.message === 'Payment order is already being created')

    const stale = paymentDb(basePayment({
      status: 'order_creating', orderCreationStartedAt: new Date(now.getTime() - 31_000),
    }))
    const gateway = { keyId: 'public', createOrder: async input => ({ id: 'order_reclaimed', ...input }) }
    const result = await createOrderForPayment({ paymentId: stale.row.id, userId: 'u1', gateway, db: stale, clock })
    assert.equal(result.orderId, 'order_reclaimed')
    assert.deepEqual(stale.calls.updateMany[0].where, {
      id: stale.row.id,
      razorpayOrderId: null,
      status: 'order_creating',
      orderCreationStartedAt: new Date(now.getTime() - 31_000),
    })

    const exactBoundary = paymentDb(basePayment({
      status: 'order_creating', orderCreationStartedAt: new Date(now.getTime() - 30_000),
    }))
    assert.equal((await createOrderForPayment({
      paymentId: exactBoundary.row.id, userId: 'u1', gateway, db: exactBoundary, clock,
    })).orderId, 'order_reclaimed')

    const missingTimestamp = paymentDb(basePayment({ status: 'order_creating', orderCreationStartedAt: null }))
    assert.equal((await createOrderForPayment({
      paymentId: missingTimestamp.row.id, userId: 'u1', gateway, db: missingTimestamp, clock,
    })).orderId, 'order_reclaimed')
  })
  test('the minimum valid amount and reconciliation failures have deterministic outcomes', async () => {
    const minimum = paymentDb(basePayment({ amount: 100 }))
    const gateway = { keyId: 'public', createOrder: async input => ({ id: 'order_minimum', ...input }) }
    assert.equal((await createOrderForPayment({
      paymentId: minimum.row.id, userId: 'u1', gateway, db: minimum,
    })).amount, 100)

    const uncertain = paymentDb(basePayment({
      status: 'order_creating', orderCreationStartedAt: new Date(0),
    }))
    await assert.rejects(createOrderForPayment({
      paymentId: uncertain.row.id, userId: 'u1',
      gateway: { findOrdersByReceipt: async () => { throw new Error('provider unavailable') } },
      db: uncertain,
    }), error => error.code === 'ORDER_OUTCOME_UNKNOWN' && error.status === 503
      && error.message === 'Payment order is awaiting provider reconciliation')
  })
  test('an unresolved provider outcome cannot create a replacement order', async () => {
    const db = paymentDb(basePayment({
      status: 'order_creating',
      orderCreationStartedAt: new Date('2026-09-24T09:00:00Z'),
      failureCode: 'ORDER_OUTCOME_UNKNOWN',
    }))
    let creates = 0
    await assert.rejects(createOrderForPayment({
      paymentId: db.row.id,
      userId: 'u1',
      gateway: { findOrdersByReceipt: async () => [], createOrder: async () => { creates++ } },
      db,
    }), error => error.code === 'ORDER_OUTCOME_UNKNOWN'
      && error.message === 'Payment order is awaiting provider reconciliation')
    assert.equal(creates, 0)
  })
})

describe('Checkout verification', () => {
  test('valid signature plus fetched captured payment advances state', async () => {
    const db = paymentDb(basePayment({ status: 'order_created', razorpayOrderId: 'order_1' }))
    db.$transaction = work => work(db)
    const gateway = { verifyPaymentSignature: () => true, fetchPayment: async () => ({ order_id: 'order_1', amount: 12345, currency: 'INR', status: 'captured' }) }
    let notifications = 0
    const result = await verifyCheckoutPayment({ paymentId: db.row.id, userId: 'u1', razorpayOrderId: 'order_1', razorpayPaymentId: 'pay_1', signature: 'sig', gateway, db,
      notifyPayment: async () => { notifications++ } })
    assert.equal(result.status, 'captured'); assert.equal(db.row.razorpayPaymentId, 'pay_1')
    assert.equal(db.row.capturedAt instanceof Date, true)
    assert.equal(notifications, 0)
    assert.deepEqual(db.calls.update[0].where, { id: db.row.id })
  })
  test('checkout handles missing payments and authorized provider state without capture effects', async () => {
    const gateway = { verifyPaymentSignature: () => true, fetchPayment: async () => ({
      order_id: 'order_1', amount: 12345, currency: 'INR', status: 'authorized',
    }) }
    await assert.rejects(verifyCheckoutPayment({
      paymentId: 'missing', userId: 'u1', razorpayOrderId: 'order_1', razorpayPaymentId: 'pay_1',
      signature: 'sig', gateway, db: paymentDb(),
    }), error => error.code === 'PAYMENT_NOT_FOUND')

    const db = paymentDb(basePayment({ status: 'order_created', razorpayOrderId: 'order_1' }))
    const result = await verifyCheckoutPayment({
      paymentId: db.row.id, userId: 'u1', razorpayOrderId: 'order_1', razorpayPaymentId: 'pay_1',
      signature: 'sig', gateway, db,
    })
    assert.equal(result.status, 'authorized')
    assert.equal(Object.hasOwn(db.row, 'capturedAt'), false)

    const scheduled = paymentDb(basePayment({
      purpose: 'scheduled_ride_advance', status: 'order_created', razorpayOrderId: 'order_1',
    }))
    let bookingWrites = 0
    scheduled.booking.updateMany = async () => { bookingWrites++; return { count: 1 } }
    await verifyCheckoutPayment({
      paymentId: scheduled.row.id, userId: 'u1', razorpayOrderId: 'order_1',
      razorpayPaymentId: 'pay_1', signature: 'sig', gateway, db: scheduled,
    })
    assert.equal(bookingWrites, 0)
  })
  test('invalid signature cannot change state', async () => {
    const db = paymentDb(basePayment({ status: 'order_created', razorpayOrderId: 'order_1' }))
    await assert.rejects(verifyCheckoutPayment({ paymentId: db.row.id, userId: 'u1', razorpayOrderId: 'order_1', razorpayPaymentId: 'pay_1', signature: 'bad',
      gateway: { verifyPaymentSignature: () => false }, db }), /Invalid payment signature/)
    assert.equal(db.row.status, 'order_created')
  })
  test('checkout rejects order, provider-value, and provider-status mismatches', async () => {
    const internal = basePayment({ status: 'order_created', razorpayOrderId: 'order_1' })
    const call = (db, gateway, overrides = {}) => verifyCheckoutPayment({
      paymentId: db.row.id, userId: 'u1', razorpayOrderId: 'order_1',
      razorpayPaymentId: 'pay_1', signature: 'sig', gateway, db, ...overrides,
    })
    await assert.rejects(call(paymentDb(internal), {}, { razorpayOrderId: 'order_wrong' }),
      error => error.code === 'ORDER_MISMATCH')
    const gateway = external => ({ verifyPaymentSignature: () => true, fetchPayment: async () => external })
    await assert.rejects(call(paymentDb(internal), gateway({
      order_id: 'order_wrong', amount: 12345, currency: 'INR', status: 'captured',
    })), error => error.code === 'PAYMENT_MISMATCH')
    await assert.rejects(call(paymentDb(internal), gateway({
      order_id: 'order_1', amount: 1, currency: 'INR', status: 'captured',
    })), error => error.code === 'PAYMENT_MISMATCH')
    await assert.rejects(call(paymentDb(internal), gateway({
      order_id: 'order_1', amount: 12345, currency: 'USD', status: 'captured',
    })), error => error.code === 'PAYMENT_MISMATCH')
    await assert.rejects(call(paymentDb(internal), gateway({
      order_id: 'order_1', amount: 12345, currency: 'INR', status: 'failed',
    })), error => error.code === 'PAYMENT_NOT_VERIFIED')
  })
  test('a captured advance cancelled during checkout reports its refund-pending state', async () => {
    const db = paymentDb(basePayment({
      purpose: 'scheduled_ride_advance', status: 'order_created', razorpayOrderId: 'order_1',
    }))
    db.booking = { updateMany: async ({ where }) => ({ count: where.status === 'cancelled' ? 1 : 0 }) }
    let notifiedBooking = null
    const result = await verifyCheckoutPayment({
      paymentId: db.row.id, userId: 'u1', razorpayOrderId: 'order_1', razorpayPaymentId: 'pay_1', signature: 'sig', db,
      gateway: { verifyPaymentSignature: () => true, fetchPayment: async () => ({
        order_id: 'order_1', amount: 12345, currency: 'INR', status: 'captured',
      }) },
      refundPaymentFn: async () => ({ status: 'refund_pending' }),
      notifyPayment: async bookingId => { notifiedBooking = bookingId },
    })
    assert.equal(result.status, 'refund_pending')
    assert.equal(notifiedBooking, null)
  })
  test('a confirmed scheduled advance sends its injected confirmation notification', async () => {
    const db = paymentDb(basePayment({
      purpose: 'scheduled_ride_advance', status: 'order_created', razorpayOrderId: 'order_1',
    }))
    let notifiedBooking = null
    const result = await verifyCheckoutPayment({
      paymentId: db.row.id, userId: 'u1', razorpayOrderId: 'order_1',
      razorpayPaymentId: 'pay_1', signature: 'sig', db,
      gateway: { verifyPaymentSignature: () => true, fetchPayment: async () => ({
        order_id: 'order_1', amount: 12345, currency: 'INR', status: 'captured',
      }) },
      notifyPayment: async bookingId => { notifiedBooking = bookingId },
    })
    assert.equal(result.status, 'captured')
    assert.equal(notifiedBooking, 'b1')
  })
  test('a late Ride Now capture after cash settlement is refunded during checkout verification', async () => {
    const db = paymentDb(basePayment({
      purpose: 'ride_now_final', status: 'order_created', razorpayOrderId: 'order_1',
    }))
    db.booking = {
      updateMany: async () => ({ count: 0 }),
      findUnique: async () => ({
        id: 'b1',
        status: 'completed',
        scheduledAt: null,
        customerPayment: 123.45,
        rideNowPaidAmount: 12345,
        rideNowPaymentMethod: 'cash',
        rideNowPaidAt: new Date(),
      }),
    }
    let refundedPaymentId = null
    const result = await verifyCheckoutPayment({
      paymentId: db.row.id,
      userId: 'u1',
      razorpayOrderId: 'order_1',
      razorpayPaymentId: 'pay_1',
      signature: 'sig',
      db,
      gateway: {
        verifyPaymentSignature: () => true,
        fetchPayment: async () => ({ order_id: 'order_1', amount: 12345, currency: 'INR', status: 'captured' }),
      },
      refundPaymentFn: async ({ paymentId }) => {
        refundedPaymentId = paymentId
        return { status: 'refund_pending' }
      },
    })
    assert.equal(refundedPaymentId, db.row.id)
    assert.equal(result.status, 'refund_pending')
  })
  test('delayed gateway messages cannot regress capture/refund states', () => {
    assert.equal(statusAfterGatewayPayment('captured', 'authorized'), 'captured')
    assert.equal(statusAfterGatewayPayment('refund_pending', 'captured'), 'refund_pending')
    assert.equal(statusAfterGatewayPayment('refunded', 'captured'), 'refunded')
  })
})

const webhookDb = ({ duplicate = false, payment = null, capturedAfterCancellation = false, confirmedAdvance = false, booking = null } = {}) => {
  let eventStatus = null; let row = payment
  const tx = {
    $queryRaw: async () => [],
    razorpayWebhookEvent: {
      createMany: async () => ({ count: duplicate ? 0 : 1 }),
      update: async ({ data }) => { eventStatus = data.status; return data },
    },
    payment: {
      findFirst: async () => row,
      findUniqueOrThrow: async () => row,
      update: async ({ data }) => { row = { ...row, ...data }; return row },
      updateMany: async ({ data }) => { row = { ...row, ...data }; return { count: 1 } },
    },
    booking: {
      updateMany: async ({ where }) => ({ count: (capturedAfterCancellation && where.status === 'cancelled')
        || (confirmedAdvance && where.status === 'payment_pending') ? 1 : 0 }),
      findUnique: async () => booking,
    },
  }
  return { $transaction: (fn) => fn(tx), get eventStatus() { return eventStatus }, get payment() { return row } }
}
const webhookGateway = { verifyWebhookSignature: () => true }

test('webhook malformed input, amount/currency mismatch, authorization and duplicate branches preserve money', async () => {
  for (const text of ['null', '{}', '{"event":4}', '{broken']) {
    await assert.rejects(processRazorpayWebhook({ rawBody: Buffer.from(text), signature: 'sig',
      gateway: webhookGateway, db: {} }), { code: 'MALFORMED_WEBHOOK' })
  }
  for (const entity of [{ amount: 1, currency: 'INR' }, { amount: 12345, currency: 'USD' }]) {
    const db = webhookDb({ payment: basePayment() })
    assert.deepEqual(await processRazorpayWebhook({ rawBody: Buffer.from(JSON.stringify({ event: 'payment.captured',
      payload: { payment: { entity } } })), signature: 'sig', gateway: webhookGateway, db }), { ignored: true })
    assert.equal(db.payment.status, 'created'); assert.equal(db.eventStatus, 'failed')
  }
  const duplicate = webhookDb({ duplicate: true })
  assert.deepEqual(await processRazorpayWebhook({ rawBody: Buffer.from('{"event":"refund.processed"}'), signature: 'sig',
    gateway: webhookGateway, db: duplicate }), { duplicate: true })
  const db = webhookDb({ payment: basePayment({ status: 'order_created' }) })
  const rawBody = Buffer.from(JSON.stringify({ event: 'payment.authorized', payload: { payment: { entity: {
    id: 'pay_authorized', order_id: 'order_1', amount: 12345, currency: 'INR',
  } } } }))
  assert.deepEqual(await processRazorpayWebhook({ rawBody, signature: 'sig', gateway: webhookGateway, db }), { processed: true })
  assert.equal(db.payment.status, 'authorized')
  assert.equal(statusAfterGatewayPayment('created', 'authorized'), 'created')
  assert.equal(statusAfterGatewayPayment('order_created', 'failed'), 'order_created')
})

test('late payment failure cannot erase an in-progress refund or authoritative capture', async () => {
  for (const status of ['captured', 'refund_pending', 'refunded', 'authorized']) {
    const db = webhookDb({ payment: basePayment({ status, razorpayPaymentId: 'pay_failed' }) })
    const rawBody = Buffer.from(JSON.stringify({ event: 'payment.failed', payload: { payment: { entity: {
      id: 'pay_failed', amount: 12345, currency: 'INR', error_code: 'LATE_FAILURE',
    } } } }))
    assert.deepEqual(await processRazorpayWebhook({ rawBody, signature: 'sig', eventId: 'failure-late', gateway: webhookGateway, db }), { processed: true })
    assert.equal(db.payment.status, status === 'authorized' ? 'failed' : status)
  }
  const db = webhookDb({ payment: basePayment({ status: 'authorized' }) })
  await processRazorpayWebhook({ rawBody: Buffer.from('{"event":"payment.failed","payload":{"payment":{"entity":{"id":"pay_no_details"}}}}'),
    signature: 'sig', gateway: webhookGateway, db })
  assert.equal(db.payment.failureCode, null); assert.equal(db.payment.failureDescription, null)
})

test('signed capture confirmation survives notification failure without rolling back payment', async () => {
  const db = webhookDb({ confirmedAdvance: true, payment: basePayment({ purpose: 'scheduled_ride_advance' }) })
  const rawBody = Buffer.from(JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: {
    id: 'pay_confirmed', order_id: 'order_1', amount: 12345, currency: 'INR',
  } } } }))
  let calls = 0
  assert.deepEqual(await processRazorpayWebhook({ rawBody, signature: 'sig', gateway: webhookGateway, db,
    notifyPayment: async id => { assert.equal(id, 'b1'); calls++; throw new Error('Synthetic notification unavailable') },
  }), { processed: true })
  assert.equal(calls, 1); assert.equal(db.payment.status, 'captured')
})

describe('Razorpay webhook idempotency and states', () => {
  test('duplicate event is processed zero additional times', async () => {
    const db = webhookDb({ duplicate: true })
    assert.deepEqual(await processRazorpayWebhook({ rawBody: Buffer.from('{"event":"payment.captured"}'), signature: 'sig', eventId: 'evt1', gateway: webhookGateway, db }), { duplicate: true })
  })
  test('captured payment transitions once from trusted payload', async () => {
    const db = webhookDb({ payment: basePayment({ status: 'order_created', razorpayOrderId: 'order_1' }) })
    const body = Buffer.from(JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_1', order_id: 'order_1', amount: 12345, currency: 'INR' } } } }))
    assert.deepEqual(await processRazorpayWebhook({ rawBody: body, signature: 'sig', eventId: 'evt1', gateway: webhookGateway, db }), { processed: true })
    assert.equal(db.payment.status, 'captured'); assert.equal(db.eventStatus, 'processed')
  })
  test('a delayed advance capture after cancellation immediately requests its refund', async () => {
    const db = webhookDb({ capturedAfterCancellation: true, payment: basePayment({
      purpose: 'scheduled_ride_advance', status: 'order_created', razorpayOrderId: 'order_1',
    }) })
    const body = Buffer.from(JSON.stringify({ event: 'payment.captured', payload: {
      payment: { entity: { id: 'pay_1', order_id: 'order_1', amount: 12345, currency: 'INR' } },
    } }))
    let refundedPaymentId = null
    assert.deepEqual(await processRazorpayWebhook({
      rawBody: body, signature: 'sig', eventId: 'evt-cancelled-capture', gateway: webhookGateway, db,
      refundPaymentFn: async ({ paymentId }) => { refundedPaymentId = paymentId },
    }), { processed: true })
    assert.equal(refundedPaymentId, db.payment.id)
  })
  test('a late scheduled-final capture after cash settlement is refunded through the webhook', async () => {
    const db = webhookDb({
      payment: basePayment({
        purpose: 'scheduled_ride_final', status: 'order_created', razorpayOrderId: 'order_1',
      }),
      booking: {
        id: 'b1',
        status: 'completed',
        scheduledAt: new Date('2026-09-20T08:00:00.000Z'),
        scheduledRemainingAmount: 12345,
        scheduledFinalPaidAmount: 12345,
        scheduledFinalPaymentMethod: 'cash',
        scheduledFinalPaidAt: new Date(),
      },
    })
    const body = Buffer.from(JSON.stringify({ event: 'payment.captured', payload: {
      payment: { entity: { id: 'pay_1', order_id: 'order_1', amount: 12345, currency: 'INR' } },
    } }))
    let refundedPaymentId = null
    assert.deepEqual(await processRazorpayWebhook({
      rawBody: body,
      signature: 'sig',
      eventId: 'evt-late-scheduled-final',
      gateway: webhookGateway,
      db,
      refundPaymentFn: async ({ paymentId }) => { refundedPaymentId = paymentId },
    }), { processed: true })
    assert.equal(refundedPaymentId, db.payment.id)
  })
  test('a duplicate capture delivery retries a failed late-cancellation refund', async () => {
    const db = webhookDb({ duplicate: true, capturedAfterCancellation: true, payment: basePayment({
      purpose: 'scheduled_ride_advance', status: 'captured', razorpayOrderId: 'order_1', razorpayPaymentId: 'pay_1',
    }) })
    const body = Buffer.from(JSON.stringify({ event: 'payment.captured', payload: {
      payment: { entity: { id: 'pay_1', order_id: 'order_1', amount: 12345, currency: 'INR' } },
    } }))
    let calls = 0
    await assert.rejects(processRazorpayWebhook({
      rawBody: body, signature: 'sig', eventId: 'evt-retry-refund', gateway: webhookGateway, db,
      refundPaymentFn: async () => { calls++; throw new Error('temporary gateway outage') },
    }), /temporary gateway outage/)
    assert.deepEqual(await processRazorpayWebhook({
      rawBody: body, signature: 'sig', eventId: 'evt-retry-refund', gateway: webhookGateway, db,
      refundPaymentFn: async () => { calls++ },
    }), { duplicate: true })
    assert.equal(calls, 2)
  })
  test('a full pending refund event settles the matching payment', async () => {
    const db = webhookDb({ payment: basePayment({
      status: 'refund_pending', razorpayPaymentId: 'pay_1', amount: 12345,
    }) })
    const body = Buffer.from(JSON.stringify({ event: 'refund.processed', payload: {
      refund: { entity: { id: 'rfnd_1', payment_id: 'pay_1', amount: 12345, currency: 'INR' } },
    } }))
    assert.deepEqual(await processRazorpayWebhook({ rawBody: body, signature: 'sig', eventId: 'evt-full-refund', gateway: webhookGateway, db }), { processed: true })
    assert.equal(db.payment.status, 'refunded')
    assert.equal(db.payment.razorpayRefundId, 'rfnd_1')
  })
  test('a partial refund event cannot settle a full pending refund', async () => {
    const db = webhookDb({ payment: basePayment({
      status: 'refund_pending', razorpayPaymentId: 'pay_1', amount: 12345,
    }) })
    const body = Buffer.from(JSON.stringify({ event: 'refund.processed', payload: {
      refund: { entity: { id: 'rfnd_1', payment_id: 'pay_1', amount: 100, currency: 'INR' } },
    } }))
    assert.deepEqual(await processRazorpayWebhook({ rawBody: body, signature: 'sig', eventId: 'evt-refund', gateway: webhookGateway, db }), { ignored: true })
    assert.equal(db.payment.status, 'refund_pending')
    assert.equal(db.payment.razorpayRefundId, null)
    assert.equal(db.eventStatus, 'ignored')
  })
  test('unknown payment and unsupported event are safely ignored', async () => {
    const unknown = webhookDb()
    const body = Buffer.from(JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_x', order_id: 'order_x' } } } }))
    assert.deepEqual(await processRazorpayWebhook({ rawBody: body, signature: 'sig', eventId: 'evt1', gateway: webhookGateway, db: unknown }), { ignored: true })
    assert.equal(unknown.eventStatus, 'ignored')
    const known = webhookDb({ payment: basePayment({ razorpayOrderId: 'order_1' }) })
    const unsupported = Buffer.from(JSON.stringify({ event: 'order.paid', payload: { payment: { entity: { id: 'pay_1', order_id: 'order_1' } } } }))
    await processRazorpayWebhook({ rawBody: unsupported, signature: 'sig', eventId: 'evt2', gateway: webhookGateway, db: known })
    assert.equal(known.payment.status, 'created'); assert.equal(known.eventStatus, 'ignored')
  })
  test('invalid webhook signature is rejected before database access', async () => {
    let touched = false
    await assert.rejects(processRazorpayWebhook({ rawBody: Buffer.from('{}'), signature: 'bad', gateway: { verifyWebhookSignature: () => false },
      db: { $transaction: () => { touched = true } } }), /Invalid webhook signature/)
    assert.equal(touched, false)
  })
})

test('webhook is wired with raw middleware before JSON parsing', async () => {
  const source = await readFile(new URL('../index.js', import.meta.url), 'utf8')
  assert.ok(source.indexOf("express.raw({ type: 'application/json'") < source.indexOf('app.use(express.json())'))
})
