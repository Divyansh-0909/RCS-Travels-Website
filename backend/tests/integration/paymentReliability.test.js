import test from 'node:test'
import assert from 'node:assert/strict'
import { createOrderForPayment, refundScheduledCancellationAdvance } from '../../services/payments.js'
import { createTestDatabase } from '../helpers/database.js'
import { createRazorpayFake, razorpayState } from '../helpers/razorpayFake.js'
import { createScheduledScenario } from '../helpers/scheduledScenario.js'

async function persistedPayment(t) {
  const database = await createTestDatabase()
  t.after(() => database.close())
  const scenario = createScheduledScenario({ payment: {
    status: 'created',
    razorpayOrderId: null,
    razorpayPaymentId: null,
    capturedAt: null,
  } })
  await scenario.persist(database.client)
  return { database, scenario, paymentId: scenario.payments[0].id }
}

test('real database atomically claims one concurrent order creation', async t => {
  const { database, scenario, paymentId } = await persistedPayment(t)
  const provider = createRazorpayFake()
  const secondClient = database.connect()
  const input = { paymentId, userId: scenario.customer.id, gateway: provider.gateway }

  const results = await Promise.allSettled([
    createOrderForPayment({ ...input, db: database.client }),
    createOrderForPayment({ ...input, db: secondClient }),
  ])
  const saved = await database.client.payment.findUniqueOrThrow({ where: { id: paymentId } })

  const fulfilled = results.filter(result => result.status === 'fulfilled')
  const rejected = results.filter(result => result.status === 'rejected')
  assert.ok(fulfilled.length >= 1)
  assert.ok(fulfilled.every(result => result.value.orderId === saved.razorpayOrderId))
  assert.ok(rejected.every(result => result.reason.code === 'PAYMENT_BUSY'))
  assert.equal(provider.snapshot().orders.length, 1)
  assert.equal(saved.razorpayOrderId, 'order_0001')
  assert.equal(saved.status, 'order_created')
})

test('real database and provider identity prevent excess concurrent partial refunds', async t => {
  const { database, paymentId } = await persistedPayment(t)
  const provider = createRazorpayFake()
  const internal = await database.client.payment.findUniqueOrThrow({ where: { id: paymentId } })
  const order = await provider.gateway.createOrder({
    amount: internal.amount,
    currency: internal.currency,
    receipt: paymentId.slice(0, 40),
    notes: { internal_payment_id: paymentId },
  })
  const external = provider.createPayment({ orderId: order.id, status: razorpayState.PAYMENT_CAPTURED })
  await database.client.payment.update({
    where: { id: paymentId },
    data: {
      status: 'captured',
      razorpayOrderId: order.id,
      razorpayPaymentId: external.id,
      capturedAt: new Date(),
    },
  })
  const secondClient = database.connect()
  const refundAmount = Math.floor(internal.amount / 2)
  const input = { paymentId, amount: refundAmount, gateway: provider.gateway }

  const results = await Promise.allSettled([
    refundScheduledCancellationAdvance({ ...input, db: database.client }),
    refundScheduledCancellationAdvance({ ...input, db: secondClient }),
  ])
  const saved = await database.client.payment.findUniqueOrThrow({ where: { id: paymentId } })

  assert.equal(results.filter(result => result.status === 'fulfilled').length, 2)
  assert.equal(provider.snapshot().refunds.length, 1)
  assert.equal(saved.razorpayRefundId, 'rfnd_0001')
  assert.equal(saved.refundRequestedAmount, refundAmount)
  assert.equal(saved.refundOperationStatus, 'provider_identified')
})
