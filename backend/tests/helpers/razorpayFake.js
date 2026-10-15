import { createHmac } from 'node:crypto'
import { createRazorpayWebhookVerifier, verifyPaymentSignature } from '../../services/razorpay.js'
import { systemClock } from '../../lib/clock.js'
import {
  createProviderPlan,
  failAfterCommit,
  failBeforeCommit,
  providerFailure,
  providerOutcome,
} from './providerPlan.js'

export const razorpayState = Object.freeze({
  ORDER_CREATED: 'created',
  PAYMENT_PENDING: 'pending',
  PAYMENT_AUTHORIZED: 'authorized',
  PAYMENT_CAPTURED: 'captured',
  PAYMENT_FAILED: 'failed',
  REFUND_PENDING: 'pending',
  REFUND_SUCCEEDED: 'processed',
  REFUND_FAILED: 'failed',
})

const clone = (value) => structuredClone(value)
const timestamp = (clock) => Math.floor(clock.now().getTime() / 1000)
const identifier = (prefix, value) => `${prefix}_${String(value).padStart(4, '0')}`

function requireEntity(collection, id, label) {
  const entity = collection.get(id)
  if (!entity) throw providerFailure(`${label.toUpperCase()}_NOT_FOUND`, `${label} ${id} was not found`, 404)
  return entity
}

export function createRazorpayFake({
  clock = systemClock,
  keyId = 'rzp_test_verification',
  keySecret = 'verification-payment-secret',
  webhookSecret = 'verification-webhook-secret',
} = {}) {
  const orders = new Map()
  const payments = new Map()
  const refunds = new Map()
  const refundByKey = new Map()
  const webhooks = new Map()
  const plan = createProviderPlan()
  const history = { orders: [], orderFetches: [], paymentFetches: [], refunds: [], refundFetches: [], webhookDeliveries: [] }
  let orderSequence = 0
  let paymentSequence = 0
  let refundSequence = 0
  let eventSequence = 0

  const createOrder = async (request) => {
    history.orders.push({ request: clone(request), at: clock.now() })
    const operation = plan.take('order')
    failBeforeCommit(operation, 'ORDER_PROVIDER_ERROR')
    const order = {
      id: identifier('order', ++orderSequence),
      amount: request.amount,
      currency: request.currency,
      receipt: request.receipt,
      notes: clone(request.notes ?? {}),
      status: 'created',
      created_at: timestamp(clock),
    }
    orders.set(order.id, order)
    failAfterCommit(operation)
    return clone(order)
  }

  const fetchPayment = async (paymentId) => {
    history.paymentFetches.push({ paymentId, at: clock.now() })
    failBeforeCommit(plan.take('paymentFetch'), 'PAYMENT_FETCH_ERROR')
    return clone(requireEntity(payments, paymentId, 'payment'))
  }

  const findOrdersByReceipt = async (receipt) => {
    history.orderFetches.push({ receipt, at: clock.now() })
    failBeforeCommit(plan.take('orderFetch'), 'ORDER_FETCH_ERROR')
    return clone([...orders.values()].filter(order => order.receipt === receipt))
  }

  const createRefund = async (paymentId, request) => {
    history.refunds.push({ paymentId, request: clone(request), at: clock.now() })
    const operation = plan.take('refund')
    failBeforeCommit(operation, 'REFUND_PROVIDER_ERROR')
    const previousId = refundByKey.get(request.idempotencyKey)
    if (previousId) return clone(refunds.get(previousId))
    const payment = requireEntity(payments, paymentId, 'payment')
    const amount = request.amount ?? payment.amount
    const refunded = [...refunds.values()]
      .filter(refund => refund.payment_id === paymentId && refund.status !== razorpayState.REFUND_FAILED)
      .reduce((sum, refund) => sum + refund.amount, 0)
    if (!Number.isInteger(amount) || amount <= 0 || amount > payment.amount - refunded) {
      throw providerFailure('BAD_REQUEST_ERROR', 'Refund amount exceeds the refundable amount', 400)
    }
    const refund = {
      id: identifier('rfnd', ++refundSequence),
      payment_id: paymentId,
      amount,
      currency: payment.currency,
      status: razorpayState.REFUND_PENDING,
      notes: clone(request.notes ?? {}),
      created_at: timestamp(clock),
    }
    refunds.set(refund.id, refund)
    refundByKey.set(request.idempotencyKey, refund.id)
    failAfterCommit(operation)
    if (operation?.outcome === providerOutcome.OMIT_ID) {
      const withoutId = clone(refund)
      delete withoutId.id
      return withoutId
    }
    return clone(refund)
  }

  const findRefundsByPayment = async (paymentId) => {
    history.refundFetches.push({ paymentId, at: clock.now() })
    failBeforeCommit(plan.take('refundFetch'), 'REFUND_FETCH_ERROR')
    return clone([...refunds.values()].filter(refund => refund.payment_id === paymentId))
  }

  const queueWebhook = (event, eventId = identifier('evt', ++eventSequence)) => {
    const rawBody = Buffer.from(JSON.stringify(event))
    webhooks.set(eventId, { eventId, rawBody })
    return eventId
  }

  const paymentEvent = (eventType, paymentId, eventId) => {
    const payment = requireEntity(payments, paymentId, 'payment')
    return queueWebhook({ event: eventType, payload: { payment: { entity: clone(payment) } } }, eventId)
  }

  const refundEvent = (eventType, refundId, eventId) => {
    const refund = requireEntity(refunds, refundId, 'refund')
    return queueWebhook({ event: eventType, payload: { refund: { entity: clone(refund) } } }, eventId)
  }

  const deliverWebhook = async (eventId, deliver, { validSignature = true } = {}) => {
    const delivery = requireEntity(webhooks, eventId, 'webhook')
    const signature = validSignature
      ? createHmac('sha256', webhookSecret).update(delivery.rawBody).digest('hex')
      : '0'.repeat(64)
    history.webhookDeliveries.push({ eventId, validSignature, at: clock.now() })
    return deliver({ rawBody: Buffer.from(delivery.rawBody), signature, eventId })
  }

  const fake = {
    keyId,
    webhookSecret,
    gateway: {
      keyId,
      createOrder,
      findOrdersByReceipt,
      fetchPayment,
      createRefund,
      findRefundsByPayment,
      verifyPaymentSignature: input => verifyPaymentSignature({ ...input, secret: keySecret }),
    },
    webhookGateway: createRazorpayWebhookVerifier({ secret: webhookSecret }),
    history,
    planNext: (operation, outcome, error = null) => plan.enqueue(operation, outcome, error),
    createPayment({ orderId, amount, currency = 'INR', status = razorpayState.PAYMENT_PENDING } = {}) {
      const order = requireEntity(orders, orderId, 'order')
      const payment = {
        id: identifier('pay', ++paymentSequence),
        order_id: orderId,
        amount: amount ?? order.amount,
        currency,
        status,
        created_at: timestamp(clock),
      }
      payments.set(payment.id, payment)
      return clone(payment)
    },
    setPaymentState(paymentId, status) {
      const payment = requireEntity(payments, paymentId, 'payment')
      payment.status = status
      return clone(payment)
    },
    setRefundState(refundId, status, details = {}) {
      const refund = requireEntity(refunds, refundId, 'refund')
      Object.assign(refund, details, { status })
      return clone(refund)
    },
    paymentSignature(orderId, paymentId) {
      return createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex')
    },
    queuePaymentEvent: paymentEvent,
    queueRefundEvent: refundEvent,
    queueRawWebhook(rawBody, eventId = identifier('evt', ++eventSequence)) {
      webhooks.set(eventId, { eventId, rawBody: Buffer.from(rawBody) })
      return eventId
    },
    deliverWebhook,
    snapshot: () => ({
      orders: clone([...orders.values()]),
      payments: clone([...payments.values()]),
      refunds: clone([...refunds.values()]),
      queuedWebhookIds: [...webhooks.keys()],
    }),
    order: id => clone(requireEntity(orders, id, 'order')),
    payment: id => clone(requireEntity(payments, id, 'payment')),
    refund: id => clone(requireEntity(refunds, id, 'refund')),
    reset() {
      orders.clear(); payments.clear(); refunds.clear(); refundByKey.clear(); webhooks.clear(); plan.reset()
      history.orders.length = 0; history.orderFetches.length = 0; history.paymentFetches.length = 0
      history.refunds.length = 0; history.refundFetches.length = 0; history.webhookDeliveries.length = 0
      orderSequence = 0; paymentSequence = 0; refundSequence = 0; eventSequence = 0
    },
  }
  return fake
}

export { providerOutcome }
