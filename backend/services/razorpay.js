import { createHmac, timingSafeEqual } from 'node:crypto'
import axios from 'axios'
import Razorpay from 'razorpay'
import { getRazorpayConfig, getRazorpayWebhookSecret } from '../config/razorpay.js'

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
  // The bundled Razorpay SDK does not forward X-Refund-Idempotency. Refund
  // retries must carry this stable key because a network timeout can happen
  // after Razorpay has accepted the original request.
  const refundClient = axios.create({
    baseURL: 'https://api.razorpay.com/v1',
    timeout: 10000,
    auth: { username: config.keyId, password: config.keySecret },
  })
  return {
    keyId: config.keyId,
    createOrder: (options) => sdk.orders.create(options),
    fetchPayment: (paymentId) => sdk.payments.fetch(paymentId),
    createRefund: async (paymentId, { idempotencyKey, ...options }) => {
      try {
        const response = await refundClient.post(`/payments/${encodeURIComponent(paymentId)}/refund`, options, {
          headers: { 'X-Refund-Idempotency': idempotencyKey },
        })
        return response.data
      } catch {
        // Axios errors retain the request's Basic-auth credentials. Never let
        // that object reach the route logger or persisted failure description.
        const error = new Error('Payment refund request failed; retry with the same idempotency key')
        error.code = 'REFUND_GATEWAY_ERROR'
        throw error
      }
    },
    verifyPaymentSignature: (input) => verifyPaymentSignature({ ...input, secret: config.keySecret }),
  }
}

// Incoming webhooks use a separate Dashboard secret and do not call Razorpay's
// API. Keeping this verifier independent means the webhook endpoint never needs
// Checkout credentials merely to authenticate a delivery.
export function createRazorpayWebhookVerifier({ secret = getRazorpayWebhookSecret() } = {}) {
  return {
    verifyWebhookSignature: (rawBody, signature) => verifyWebhookSignature({ rawBody, signature, secret }),
  }
}
