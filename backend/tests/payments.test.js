import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { getRazorpayConfig, safeRazorpayConfig } from '../config/razorpay.js'
import { verifyPaymentSignature, verifyWebhookSignature } from '../services/razorpay.js'
import { createOrderForPayment, verifyCheckoutPayment, processRazorpayWebhook, refundPayment, statusAfterGatewayPayment } from '../services/payments.js'

const basePayment = (overrides = {}) => ({ id: '11111111-1111-4111-8111-111111111111', userId: 'u1', bookingId: 'b1',
  purpose: 'other_customer_payment', status: 'created', amount: 12345, currency: 'INR',
  razorpayOrderId: null, razorpayPaymentId: null, razorpayRefundId: null, ...overrides })

const paymentDb = (initial = basePayment()) => {
  let row = { ...initial }
  return { get row() { return row }, payment: {
    findFirst: async ({ where }) => row && row.id === where.id && (!where.userId || row.userId === where.userId) ? { ...row } : null,
    findUnique: async () => row && { ...row },
    updateMany: async ({ where, data }) => {
      if (!row || (where.status && row.status !== where.status) || (where.razorpayOrderId === null && row.razorpayOrderId !== null)) return { count: 0 }
      row = { ...row, ...data }; return { count: 1 }
    },
    update: async ({ data }) => { row = { ...row, ...data }; return { ...row } },
  } }
}

describe('Razorpay configuration', () => {
  test('missing credentials fail clearly', () => assert.throws(() => getRazorpayConfig({}), /RAZORPAY_KEY_ID.*RAZORPAY_KEY_SECRET.*RAZORPAY_WEBHOOK_SECRET/))
  test('only the public key is safe for Checkout', () => assert.deepEqual(safeRazorpayConfig({ keyId: 'public', keySecret: 'secret', webhookSecret: 'hook' }), { keyId: 'public' }))
})

describe('Razorpay signatures', () => {
  const secret = 'top-secret'
  test('accepts a valid Checkout signature', () => {
    const signature = createHmac('sha256', secret).update('order_1|pay_1').digest('hex')
    assert.equal(verifyPaymentSignature({ orderId: 'order_1', paymentId: 'pay_1', signature, secret }), true)
  })
  test('rejects invalid and malformed Checkout signatures', () => {
    assert.equal(verifyPaymentSignature({ orderId: 'order_1', paymentId: 'pay_1', signature: '0'.repeat(64), secret }), false)
    assert.equal(verifyPaymentSignature({ orderId: 'order_1', paymentId: 'pay_1', signature: 'bad', secret }), false)
  })
  test('verifies the raw webhook bytes', () => {
    const rawBody = Buffer.from('{"event":"payment.captured"}')
    const signature = createHmac('sha256', secret).update(rawBody).digest('hex')
    assert.equal(verifyWebhookSignature({ rawBody, signature, secret }), true)
    assert.equal(verifyWebhookSignature({ rawBody: Buffer.from('{}'), signature, secret }), false)
  })
})

describe('server-authoritative order creation', () => {
  test('uses the stored amount/currency and never a client amount', async () => {
    const db = paymentDb(); let options
    const gateway = { keyId: 'rzp_public', createOrder: async (input) => (options = input, { id: 'order_1', amount: input.amount, currency: input.currency }) }
    const result = await createOrderForPayment({ paymentId: db.row.id, userId: 'u1', gateway, db })
    assert.equal(options.amount, 12345); assert.equal(options.currency, 'INR')
    assert.equal(result.orderId, 'order_1'); assert.equal(result.keyId, 'rzp_public')
    assert.equal(db.row.status, 'order_created')
    assert.equal('keySecret' in result, false)
  })
  test('order creation is not payment capture and retries reuse the order', async () => {
    const db = paymentDb(); let calls = 0
    const gateway = { keyId: 'public', createOrder: async (o) => { calls++; return { id: 'order_1', amount: o.amount, currency: o.currency } } }
    await createOrderForPayment({ paymentId: db.row.id, userId: 'u1', gateway, db })
    const again = await createOrderForPayment({ paymentId: db.row.id, userId: 'u1', gateway, db })
    assert.equal(calls, 1); assert.equal(again.status, 'order_created')
  })
})

describe('Checkout verification', () => {
  test('valid signature plus fetched captured payment advances state', async () => {
    const db = paymentDb(basePayment({ status: 'order_created', razorpayOrderId: 'order_1' }))
    const gateway = { verifyPaymentSignature: () => true, fetchPayment: async () => ({ order_id: 'order_1', amount: 12345, currency: 'INR', status: 'captured' }) }
    const result = await verifyCheckoutPayment({ paymentId: db.row.id, userId: 'u1', razorpayOrderId: 'order_1', razorpayPaymentId: 'pay_1', signature: 'sig', gateway, db })
    assert.equal(result.status, 'captured'); assert.equal(db.row.razorpayPaymentId, 'pay_1')
  })
  test('invalid signature cannot change state', async () => {
    const db = paymentDb(basePayment({ status: 'order_created', razorpayOrderId: 'order_1' }))
    await assert.rejects(verifyCheckoutPayment({ paymentId: db.row.id, userId: 'u1', razorpayOrderId: 'order_1', razorpayPaymentId: 'pay_1', signature: 'bad',
      gateway: { verifyPaymentSignature: () => false }, db }), /Invalid payment signature/)
    assert.equal(db.row.status, 'order_created')
  })
  test('delayed gateway messages cannot regress capture/refund states', () => {
    assert.equal(statusAfterGatewayPayment('captured', 'authorized'), 'captured')
    assert.equal(statusAfterGatewayPayment('refund_pending', 'captured'), 'refund_pending')
    assert.equal(statusAfterGatewayPayment('refunded', 'captured'), 'refunded')
  })
})

const webhookDb = ({ duplicate = false, payment = null } = {}) => {
  let eventStatus = null; let row = payment
  const tx = {
    razorpayWebhookEvent: {
      createMany: async () => ({ count: duplicate ? 0 : 1 }),
      update: async ({ data }) => { eventStatus = data.status; return data },
    },
    payment: {
      findFirst: async () => row,
      update: async ({ data }) => { row = { ...row, ...data }; return row },
      updateMany: async ({ data }) => { row = { ...row, ...data }; return { count: 1 } },
    },
  }
  return { $transaction: (fn) => fn(tx), get eventStatus() { return eventStatus }, get payment() { return row } }
}
const webhookGateway = { verifyWebhookSignature: () => true }

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

describe('refund foundation', () => {
  test('only captured payments can be refunded', async () => {
    const db = paymentDb(basePayment({ status: 'authorized', razorpayPaymentId: 'pay_1' }))
    await assert.rejects(refundPayment({ paymentId: db.row.id, gateway: {}, db }), /Only a captured payment/)
  })
  test('refund creation is idempotent', async () => {
    const db = paymentDb(basePayment({ status: 'captured', razorpayPaymentId: 'pay_1' })); let calls = 0
    const gateway = { createRefund: async () => { calls++; return { id: 'rfnd_1' } } }
    await refundPayment({ paymentId: db.row.id, gateway, db })
    await refundPayment({ paymentId: db.row.id, gateway, db })
    assert.equal(calls, 1); assert.equal(db.row.razorpayRefundId, 'rfnd_1')
  })
  test('an in-progress refund never calls the gateway again', async () => {
    const db = paymentDb(basePayment({ status: 'refund_pending', razorpayPaymentId: 'pay_1' })); let calls = 0
    const result = await refundPayment({ paymentId: db.row.id, gateway: { createRefund: async () => { calls++ } }, db })
    assert.equal(calls, 0); assert.equal(result.alreadyApplied, true)
  })
})

test('webhook is wired with raw middleware before JSON parsing', async () => {
  const source = await readFile(new URL('../index.js', import.meta.url), 'utf8')
  assert.ok(source.indexOf("express.raw({ type: 'application/json'") < source.indexOf('app.use(express.json())'))
})
