import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import {
  createOrderForPayment,
  processRazorpayWebhook,
  refundScheduledCancellationAdvance,
  verifyCheckoutPayment,
} from '../services/payments.js'
import { basePayment, paymentDb } from './helpers/paymentDb.js'

const execFileAsync = promisify(execFile)

test('a definite order failure can be retried immediately with its previous attempt time', async () => {
  const now = new Date('2026-09-24T10:00:00Z')
  const db = paymentDb(basePayment({ status: 'created', orderCreationStartedAt: now }))
  const gateway = {
    keyId: 'test_public',
    createOrder: async request => ({ id: 'order_retry', amount: request.amount, currency: request.currency }),
  }

  const checkout = await createOrderForPayment({
    paymentId: db.row.id, userId: 'u1', gateway, db, clock: { now: () => now },
  })

  assert.equal(checkout.orderId, 'order_retry')
  assert.equal(db.row.status, 'order_created')
})

test('a captured non-scheduled payment does not send a scheduled booking notice', async () => {
  const db = paymentDb(basePayment({ status: 'order_created', razorpayOrderId: 'order_1' }))
  let notifications = 0
  const result = await verifyCheckoutPayment({
    paymentId: db.row.id, userId: 'u1', razorpayOrderId: 'order_1',
    razorpayPaymentId: 'pay_1', signature: 'valid', db,
    gateway: {
      verifyPaymentSignature: () => true,
      fetchPayment: async () => ({ order_id: 'order_1', amount: db.row.amount, currency: 'INR', status: 'captured' }),
    },
    notifyPayment: async () => { notifications++ },
  })

  assert.equal(result.status, 'captured')
  assert.equal(notifications, 0)
})

test('webhook uses the default driver-debt excess refund handler when none is injected', async () => {
  const previousKeyId = process.env.RAZORPAY_KEY_ID
  const previousKeySecret = process.env.RAZORPAY_KEY_SECRET
  process.env.RAZORPAY_KEY_ID = 'test_public'
  process.env.RAZORPAY_KEY_SECRET = 'test_secret'
  try {
    const db = {
      $transaction: async () => ({
        effect: { type: 'driver_debt_excess_refund', paymentId: 'missing', amount: 100 },
      }),
      payment: { findUnique: async () => { throw new Error('default debt refund reached database') } },
    }
    await assert.rejects(processRazorpayWebhook({
      rawBody: Buffer.from('{"event":"payment.captured"}'),
      signature: 'valid', eventId: 'evt_debt_default',
      gateway: { verifyWebhookSignature: () => true }, db,
    }), /default debt refund reached database/)
  } finally {
    if (previousKeyId === undefined) delete process.env.RAZORPAY_KEY_ID
    else process.env.RAZORPAY_KEY_ID = previousKeyId
    if (previousKeySecret === undefined) delete process.env.RAZORPAY_KEY_SECRET
    else process.env.RAZORPAY_KEY_SECRET = previousKeySecret
  }
})

test('default scheduled notification is limited to the production database identity', async () => {
  const probe = fileURLToPath(new URL('./helpers/paymentDefaultNotificationProbe.mjs', import.meta.url))
  const { stdout } = await execFileAsync(process.execPath, [
    '--experimental-test-module-mocks', probe,
  ])
  assert.deepEqual(JSON.parse(stdout), {
    afterProduction: ['b1'],
    afterIsolated: ['b1'],
    afterWebhook: ['b1', 'b1'],
  })
})

test('an already identified scheduled refund keeps its customer-visible pending status', async () => {
  const db = paymentDb(basePayment({
    purpose: 'scheduled_ride_advance', status: 'captured', amount: 15000,
    razorpayPaymentId: 'pay_advance', cancellationRefundAmount: 5000,
    razorpayRefundId: 'rfnd_existing',
  }))
  const result = await refundScheduledCancellationAdvance({
    paymentId: db.row.id, amount: 5000, db, gateway: {},
  })

  assert.deepEqual(result, {
    paymentId: db.row.id, status: 'partial_refund_pending', refundId: 'rfnd_existing', alreadyApplied: true,
  })
})
