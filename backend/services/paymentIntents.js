import { PaymentError } from './paymentErrors.js'

export const MIN_PAYMENT_SUBUNITS = 100

export const toSubunits = (rupees) => {
  const amount = Math.round(rupees * 100)
  if (!Number.isFinite(rupees) || amount < MIN_PAYMENT_SUBUNITS)
    throw new PaymentError('INVALID_AMOUNT', 'Payment amount must be at least ₹1')
  return amount
}

export async function createPaymentIntent(tx, { userId, bookingId = null, purpose, amount, currency = 'INR', idempotencyKey, snapshot = {} }) {
  if (!Number.isInteger(amount) || amount < MIN_PAYMENT_SUBUNITS)
    throw new PaymentError('INVALID_AMOUNT', 'Payment amount must be at least 100 subunits')
  await tx.payment.createMany({ data: [{ userId, bookingId, purpose, amount, currency, idempotencyKey, ...snapshot }], skipDuplicates: true })
  const payment = await tx.payment.findUniqueOrThrow({ where: { idempotencyKey } })
  if (payment.userId !== userId || payment.bookingId !== bookingId || payment.purpose !== purpose ||
      payment.amount !== amount || payment.currency !== currency)
    throw new PaymentError('IDEMPOTENCY_CONFLICT', 'Payment idempotency key was already used for different terms')
  return payment
}
