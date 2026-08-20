import { PaymentError } from './paymentErrors.js'

export const toSubunits = (rupees) => {
  if (!Number.isFinite(rupees) || rupees <= 0) throw new PaymentError('INVALID_AMOUNT', 'Payment amount must be positive')
  return Math.round(rupees * 100)
}

export async function createPaymentIntent(tx, { userId, bookingId = null, purpose, amount, currency = 'INR', idempotencyKey, snapshot = {} }) {
  if (!Number.isInteger(amount) || amount <= 0) throw new PaymentError('INVALID_AMOUNT', 'Payment amount must be positive subunits')
  await tx.payment.createMany({ data: [{ userId, bookingId, purpose, amount, currency, idempotencyKey, ...snapshot }], skipDuplicates: true })
  const payment = await tx.payment.findUniqueOrThrow({ where: { idempotencyKey } })
  if (payment.userId !== userId || payment.bookingId !== bookingId || payment.purpose !== purpose ||
      payment.amount !== amount || payment.currency !== currency)
    throw new PaymentError('IDEMPOTENCY_CONFLICT', 'Payment idempotency key was already used for different terms')
  return payment
}
