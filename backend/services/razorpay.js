import { createHmac, timingSafeEqual } from 'node:crypto'
import Razorpay from 'razorpay'
import { getRazorpayConfig } from '../config/razorpay.js'

const validHexSignature = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value)
const verifyHmac = (payload, signature, secret) => {
  if (!validHexSignature(signature) || (typeof payload !== 'string' && !Buffer.isBuffer(payload))) return false
  const expected = createHmac('sha256', secret).update(payload).digest('hex')
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'))
}

export function verifyPaymentSignature({ orderId, paymentId, signature, secret }) {
  if (!orderId || !paymentId) return false
  return verifyHmac(`${orderId}|${paymentId}`, signature, secret)
}

export function verifyWebhookSignature({ rawBody, signature, secret }) {
  if (!Buffer.isBuffer(rawBody)) return false
  return verifyHmac(rawBody, signature, secret)
}

export function createRazorpayGateway({ config = getRazorpayConfig(), client } = {}) {
  const sdk = client ?? new Razorpay({ key_id: config.keyId, key_secret: config.keySecret })
  return {
    keyId: config.keyId,
    createOrder: (options) => sdk.orders.create(options),
    fetchPayment: (paymentId) => sdk.payments.fetch(paymentId),
    createRefund: (paymentId, options) => sdk.payments.refund(paymentId, options),
    verifyPaymentSignature: (input) => verifyPaymentSignature({ ...input, secret: config.keySecret }),
    verifyWebhookSignature: (rawBody, signature) => verifyWebhookSignature({ rawBody, signature, secret: config.webhookSecret }),
  }
}
