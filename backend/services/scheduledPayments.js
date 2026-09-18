import { createPaymentIntent, toSubunits } from './paymentIntents.js'
import { postWalletEntry } from './wallet.js'
import { walletEvent } from './walletKeys.js'
import { applyRidePaymentCaptureEffect } from './ridePayments.ts'

export const SCHEDULED_CUSTOMER_ADVANCE_PCT = 15

export function scheduledPaymentAmounts({ fare, couponAmount = 0 }) {
  const originalFare = toSubunits(fare)
  const coupon = Math.min(originalFare, Math.max(0, Math.round(couponAmount * 100)))
  const finalFare = originalFare - coupon
  // Both scheduled instalments must be payable as whole rupees. Round the 15%
  // advance once, at the source of truth, then derive the balance so the two
  // orders still add up to the exact post-coupon fare.
  const advance = Math.min(finalFare,
    Math.max(0, Math.round((finalFare * SCHEDULED_CUSTOMER_ADVANCE_PCT) / 10_000) * 100))
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

const driverDebtCaptureEffect = (payment, refundAmount) => refundAmount > 0
  ? { type: 'driver_debt_excess_refund', paymentId: payment.id, amount: refundAmount }
  : { type: 'driver_debt_settlement', paymentId: payment.id, driverId: payment.driverId }

async function applyDriverDebtCapture(tx, payment) {
  if (payment.driverDebtAppliedAmount !== null && payment.driverDebtAppliedAmount !== undefined) {
    return driverDebtCaptureEffect(payment, payment.driverDebtRefundAmount ?? 0)
  }

  const driver = await tx.driver.findUniqueOrThrow({ where: { id: payment.driverId }, select: { walletBalance: true } })
  const liveDebtPaise = Math.max(0, Math.round(-driver.walletBalance * 100))
  const appliedAmount = Math.min(payment.amount, liveDebtPaise)
  const refundAmount = payment.amount - appliedAmount

  if (appliedAmount > 0) {
    await postWalletEntry(tx, {
      driverId: payment.driverId,
      amount: appliedAmount / 100,
      type: 'debt_payment',
      method: 'upi',
      eventKey: walletEvent.debtPayment(payment.id),
      note: 'Negative wallet balance cleared through Razorpay',
    })
  }
  await tx.payment.update({
    where: { id: payment.id },
    data: { driverDebtAppliedAmount: appliedAmount, driverDebtRefundAmount: refundAmount },
  })
  return driverDebtCaptureEffect(payment, refundAmount)
}

export async function applyCapturedPaymentEffect(tx, payment) {
  if (payment.purpose === 'driver_debt_settlement' && payment.driverId) {
    return applyDriverDebtCapture(tx, payment)
  }
  if (!payment.bookingId) return null
  if (payment.purpose === 'scheduled_ride_advance') {
    const result = await tx.booking.updateMany({ where: { id: payment.bookingId, status: 'payment_pending' }, data: {
      status: 'confirmed', confirmedAt: new Date(), scheduledAdvancePaidAmount: payment.amount,
      scheduledAdvanceDisposition: 'paid',
    } })
    if (result?.count) return { type: 'scheduled_ride_advance', bookingId: payment.bookingId }

    // A gateway capture can arrive after the rider cancelled while checkout was
    // still pending. The cancellation could not refund an uncaptured payment,
    // so turn that now-captured advance into the same durable refund state.
    const refund = await tx.booking.updateMany({ where: {
      id: payment.bookingId,
      status: 'cancelled',
      scheduledAdvanceDisposition: { in: ['awaiting_payment', 'refund_pending'] },
    }, data: { scheduledAdvanceDisposition: 'refund_pending' } })
    return refund?.count
      ? { type: 'scheduled_ride_advance_refund', bookingId: payment.bookingId, paymentId: payment.id }
      : null
  }
  const ridePaymentEffect = await applyRidePaymentCaptureEffect(tx, payment)
  return ridePaymentEffect === undefined ? null : ridePaymentEffect
}

export async function applyRefundedPaymentEffect(tx, payment) {
  if (payment.bookingId && payment.purpose === 'scheduled_ride_advance') {
    await tx.booking.updateMany({ where: { id: payment.bookingId, scheduledAdvanceDisposition: 'refund_pending' },
      data: { scheduledAdvanceDisposition: 'refunded' } })
  }
}
