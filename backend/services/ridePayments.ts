import type { Booking, Payment, Prisma } from '@prisma/client'
import { createPaymentIntent } from './paymentIntents.js'

export type RideSettlementMethod = 'cash' | 'upi'
export type RideSettlementState = 'pending' | 'paid'

type SettlementBooking = Pick<Booking,
  | 'id'
  | 'userId'
  | 'status'
  | 'scheduledAt'
  | 'fare'
  | 'couponAmount'
  | 'customerPayment'
  | 'scheduledAdvancePct'
  | 'scheduledAdvanceAmount'
  | 'scheduledAdvancePaidAmount'
  | 'scheduledRemainingAmount'
  | 'scheduledFinalPaidAmount'
  | 'scheduledFinalPaymentMethod'
  | 'scheduledFinalPaidAt'
  | 'rideNowPaidAmount'
  | 'rideNowPaymentMethod'
  | 'rideNowPaidAt'
>

type CapturedRidePayment = Pick<Payment, 'id' | 'bookingId' | 'purpose' | 'amount'>

export type RidePaymentView = {
  state: RideSettlementState
  method: RideSettlementMethod | null
  amount: number
  paidAmount: number
  paidAt: Date | null
}

export type RidePaymentCaptureEffect =
  | { type: 'ride_now_final'; bookingId: string }
  | { type: 'scheduled_ride_final'; bookingId: string }
  | { type: 'late_final_payment_refund'; bookingId: string; paymentId: string }
  | null
  | undefined

export class RidePaymentError extends Error {
  status: number
  code: string

  constructor(message: string, status = 409, code = 'RIDE_PAYMENT_CONFLICT') {
    super(message)
    this.status = status
    this.code = code
  }
}

const customerFareSubunits = (booking: SettlementBooking) =>
  Math.max(0, Math.round(booking.customerPayment * 100))

const settlementMethod = (method: string | null): RideSettlementMethod | null =>
  method === 'cash' || method === 'upi' ? method : null

export function ridePaymentView(booking: SettlementBooking): RidePaymentView {
  const scheduled = Boolean(booking.scheduledAt)
  const amount = scheduled ? booking.scheduledRemainingAmount : customerFareSubunits(booking)
  const paidAmount = scheduled ? booking.scheduledFinalPaidAmount : booking.rideNowPaidAmount
  const method = settlementMethod(scheduled ? booking.scheduledFinalPaymentMethod : booking.rideNowPaymentMethod)
  const paidAt = scheduled ? booking.scheduledFinalPaidAt : booking.rideNowPaidAt
  const state = method && paidAmount >= amount ? 'paid' : 'pending'
  return { state, method, amount, paidAmount, paidAt }
}

const requireCompletedRideNow = (booking: SettlementBooking) => {
  if (booking.scheduledAt) {
    throw new RidePaymentError('This payment action is only for Ride Now', 409, 'RIDE_NOW_REQUIRED')
  }
  if (booking.status !== 'completed') {
    throw new RidePaymentError('Payment is available after the ride is completed', 409, 'RIDE_NOT_COMPLETED')
  }
}

const requireCompletedScheduledRide = (booking: SettlementBooking) => {
  if (!booking.scheduledAt) {
    throw new RidePaymentError('This payment action is only for scheduled rides', 409, 'SCHEDULED_RIDE_REQUIRED')
  }
  if (booking.status !== 'completed') {
    throw new RidePaymentError('Final payment is available after the scheduled ride is completed', 409, 'RIDE_NOT_COMPLETED')
  }
  if (booking.scheduledAdvancePaidAmount !== booking.scheduledAdvanceAmount) {
    throw new RidePaymentError('Scheduled advance has not been paid', 409, 'ADVANCE_NOT_PAID')
  }
}

const cashRetryOrConflict = (view: RidePaymentView) => {
  if (view.state === 'paid' && view.method === 'cash') return view
  if (view.state === 'paid') {
    throw new RidePaymentError('This ride has already been paid by UPI', 409, 'PAYMENT_ALREADY_SETTLED')
  }
  throw new RidePaymentError('Payment state changed. Refresh and try again.', 409, 'PAYMENT_STATE_CHANGED')
}

export async function createRideNowFinalIntent(tx: Prisma.TransactionClient, booking: SettlementBooking) {
  requireCompletedRideNow(booking)
  if (ridePaymentView(booking).state === 'paid') {
    throw new RidePaymentError('This ride has already been paid', 409, 'PAYMENT_ALREADY_SETTLED')
  }
  const amount = customerFareSubunits(booking)
  return createPaymentIntent(tx, {
    userId: booking.userId,
    bookingId: booking.id,
    purpose: 'ride_now_final',
    amount,
    idempotencyKey: `ride-now-final:${booking.id}`,
    snapshot: {
      originalFareAmount: Math.round(booking.fare * 100),
      couponAmount: Math.round(booking.couponAmount * 100),
      finalFareAmount: amount,
      remainingAmount: amount,
    },
  })
}

export async function recordRideNowCashPayment(tx: Prisma.TransactionClient, bookingId: string) {
  const booking = await tx.booking.findUnique({ where: { id: bookingId } })
  if (!booking) throw new RidePaymentError('Booking not found', 404, 'BOOKING_NOT_FOUND')
  requireCompletedRideNow(booking)

  const current = ridePaymentView(booking)
  if (current.state === 'paid') return cashRetryOrConflict(current)

  const now = new Date()
  const claimed = await tx.booking.updateMany({
    where: { id: booking.id, status: 'completed', rideNowPaidAmount: 0, rideNowPaymentMethod: null },
    data: { rideNowPaidAmount: current.amount, rideNowPaymentMethod: 'cash', rideNowPaidAt: now },
  })
  if (claimed.count) {
    return ridePaymentView(await tx.booking.findUniqueOrThrow({ where: { id: booking.id } }))
  }
  return cashRetryOrConflict(ridePaymentView(await tx.booking.findUniqueOrThrow({ where: { id: booking.id } })))
}

export async function recordScheduledFinalCashPayment(tx: Prisma.TransactionClient, bookingId: string) {
  const booking = await tx.booking.findUnique({ where: { id: bookingId } })
  if (!booking) throw new RidePaymentError('Booking not found', 404, 'BOOKING_NOT_FOUND')
  requireCompletedScheduledRide(booking)

  const current = ridePaymentView(booking)
  if (current.state === 'paid') return cashRetryOrConflict(current)

  const now = new Date()
  const claimed = await tx.booking.updateMany({
    where: { id: booking.id, status: 'completed', scheduledFinalPaidAmount: 0, scheduledFinalPaymentMethod: null },
    data: {
      scheduledFinalPaidAmount: booking.scheduledRemainingAmount,
      scheduledFinalPaymentMethod: 'cash',
      scheduledFinalPaidAt: now,
    },
  })
  if (claimed.count) {
    return ridePaymentView(await tx.booking.findUniqueOrThrow({ where: { id: booking.id } }))
  }
  return cashRetryOrConflict(ridePaymentView(await tx.booking.findUniqueOrThrow({ where: { id: booking.id } })))
}

const lateCashRefundEffect = (
  bookingId: string,
  paymentId: string,
  view: RidePaymentView,
): RidePaymentCaptureEffect => view.state === 'paid' && view.method === 'cash'
  ? { type: 'late_final_payment_refund', bookingId, paymentId }
  : null

async function applyRideNowCapture(
  tx: Prisma.TransactionClient,
  payment: CapturedRidePayment & { bookingId: string },
): Promise<RidePaymentCaptureEffect> {
  const claimed = await tx.booking.updateMany({
    where: { id: payment.bookingId, status: 'completed', rideNowPaidAmount: 0, rideNowPaymentMethod: null },
    data: { rideNowPaidAmount: payment.amount, rideNowPaymentMethod: 'upi', rideNowPaidAt: new Date() },
  })
  if (claimed.count) return { type: 'ride_now_final', bookingId: payment.bookingId }

  const booking = await tx.booking.findUnique({ where: { id: payment.bookingId } })
  return booking ? lateCashRefundEffect(payment.bookingId, payment.id, ridePaymentView(booking)) : null
}

async function applyScheduledFinalCapture(
  tx: Prisma.TransactionClient,
  payment: CapturedRidePayment & { bookingId: string },
): Promise<RidePaymentCaptureEffect> {
  const claimed = await tx.booking.updateMany({
    where: { id: payment.bookingId, status: 'completed', scheduledFinalPaidAmount: 0, scheduledFinalPaymentMethod: null },
    data: {
      scheduledFinalPaidAmount: payment.amount,
      scheduledFinalPaymentMethod: 'upi',
      scheduledFinalPaidAt: new Date(),
    },
  })
  if (claimed.count) return { type: 'scheduled_ride_final', bookingId: payment.bookingId }

  const booking = await tx.booking.findUnique({ where: { id: payment.bookingId } })
  return booking ? lateCashRefundEffect(payment.bookingId, payment.id, ridePaymentView(booking)) : null
}

export async function applyRidePaymentCaptureEffect(
  tx: Prisma.TransactionClient,
  payment: CapturedRidePayment,
): Promise<RidePaymentCaptureEffect> {
  if (!payment.bookingId) return undefined
  if (payment.purpose === 'ride_now_final') return applyRideNowCapture(tx, { ...payment, bookingId: payment.bookingId })
  if (payment.purpose === 'scheduled_ride_final') return applyScheduledFinalCapture(tx, { ...payment, bookingId: payment.bookingId })
  return undefined
}
