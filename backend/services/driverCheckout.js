import { createHmac, timingSafeEqual } from 'node:crypto'
import { PaymentError } from './paymentErrors.js'

const TOKEN_TTL_MS = 10 * 60 * 1000

const secret = () => {
  const value = process.env.DRIVER_CHECKOUT_TOKEN_SECRET || process.env.RAZORPAY_KEY_SECRET
  if (!value) throw new PaymentError('CHECKOUT_NOT_CONFIGURED', 'Captain payment checkout is not configured', 503)
  return value
}

const encode = (value) => Buffer.from(value, 'utf8').toString('base64url')
const signatureFor = (payload) => createHmac('sha256', secret()).update(payload).digest('base64url')

export function createDriverCheckoutToken(checkout, { now = Date.now() } = {}) {
  const body = encode(JSON.stringify({
    v: 1,
    paymentId: checkout.paymentId,
    orderId: checkout.orderId,
    amount: checkout.amount,
    currency: checkout.currency,
    keyId: checkout.keyId,
    exp: now + TOKEN_TTL_MS,
  }))
  return `${body}.${signatureFor(body)}`
}

export function verifyDriverCheckoutToken(token, { now = Date.now() } = {}) {
  const [body, supplied] = String(token ?? '').split('.')
  if (!body || !supplied) throw new PaymentError('INVALID_CHECKOUT_TOKEN', 'Payment link is invalid', 400)
  const expected = signatureFor(body)
  const a = Buffer.from(supplied)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new PaymentError('INVALID_CHECKOUT_TOKEN', 'Payment link is invalid', 400)
  }
  let payload
  try { payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) }
  catch { throw new PaymentError('INVALID_CHECKOUT_TOKEN', 'Payment link is invalid', 400) }
  if (payload?.v !== 1 || !payload.paymentId || !payload.orderId || !Number.isInteger(payload.amount)
    || !payload.currency || !payload.keyId || !Number.isFinite(payload.exp)) {
    throw new PaymentError('INVALID_CHECKOUT_TOKEN', 'Payment link is invalid', 400)
  }
  if (payload.exp < now) throw new PaymentError('CHECKOUT_TOKEN_EXPIRED', 'Payment link has expired. Return to the app and try again.', 410)
  return payload
}

export function driverCheckoutUrl(req, checkout) {
  const token = createDriverCheckoutToken(checkout)
  return `${req.protocol}://${req.get('host')}/captain-payment/checkout?token=${encodeURIComponent(token)}`
}
