import { createPaymentIntent, toSubunits } from './paymentIntents.js'

export const SCHEDULED_CUSTOMER_ADVANCE_PCT = 15

export function scheduledPaymentAmounts({ fare, couponAmount = 0 }) {
  const originalFare = toSubunits(fare)
  const coupon = Math.min(originalFare, Math.max(0, Math.round(couponAmount * 100)))
  const finalFare = originalFare - coupon
  const advance = Math.round((finalFare * SCHEDULED_CUSTOMER_ADVANCE_PCT) / 100)
  return { originalFare, coupon, finalFare, advancePercentage: SCHEDULED_CUSTOMER_ADVANCE_PCT,
    advance, remaining: finalFare - advance }
}

const snapshotOf = (a) => ({ originalFareAmount: a.originalFare, couponAmount: a.coupon,
  finalFareAmount: a.finalFare, advancePercentage: a.advancePercentage, remainingAmount: a.remaining })

export function createScheduledAdvanceIntent(tx, booking, amounts = scheduledPaymentAmounts(booking)) {
  return createPaymentIntent(tx, { userId: booking.userId, bookingId: booking.id,
    purpose: 'scheduled_ride_advance', amount: amounts.advance,
    idempotencyKey: `scheduled-advance:${booking.id}`, snapshot: snapshotOf(amounts) })
}

export function createScheduledFinalIntent(tx, booking) {
  if (!booking.scheduledAt) throw new Error('Scheduled final payment requires a scheduled booking')
  return createPaymentIntent(tx, { userId: booking.userId, bookingId: booking.id,
    purpose: 'scheduled_ride_final', amount: booking.scheduledRemainingAmount,
    idempotencyKey: `scheduled-final:${booking.id}`, snapshot: {
      originalFareAmount: Math.round(booking.fare * 100), couponAmount: Math.round(booking.couponAmount * 100),
      finalFareAmount: Math.round(booking.customerPayment * 100), advancePercentage: booking.scheduledAdvancePct,
      remainingAmount: booking.scheduledRemainingAmount,
    } })
}

export async function applyCapturedPaymentEffect(tx, payment) {
  if (!payment.bookingId) return null
  if (payment.purpose === 'scheduled_ride_advance') {
    const result = await tx.booking.updateMany({ where: { id: payment.bookingId, status: 'payment_pending' }, data: {
      status: 'confirmed', confirmedAt: new Date(), scheduledAdvancePaidAmount: payment.amount,
      scheduledAdvanceDisposition: 'paid',
    } })
    return result?.count ? { type: 'scheduled_ride_advance', bookingId: payment.bookingId } : null
  } else if (payment.purpose === 'scheduled_ride_final') {
    const result = await tx.booking.updateMany({ where: { id: payment.bookingId, status: 'completed', scheduledFinalPaidAmount: 0 },
      data: { scheduledFinalPaidAmount: payment.amount } })
    return result?.count ? { type: 'scheduled_ride_final', bookingId: payment.bookingId } : null
  }
  return null
}

export async function applyRefundedPaymentEffect(tx, payment) {
  if (payment.bookingId && payment.purpose === 'scheduled_ride_advance') {
    await tx.booking.updateMany({ where: { id: payment.bookingId, scheduledAdvanceDisposition: 'refund_pending' },
      data: { scheduledAdvanceDisposition: 'refunded' } })
  }
}
