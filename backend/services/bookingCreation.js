import { prisma } from '../db/prisma.js'
import { createBooking } from '../lib/bookingReference.js'
import { commissionOn, rideFareOf } from './commission.js'
import { customerPaymentFor } from './coupons.js'
import { createScheduledAdvanceIntent, scheduledPaymentAmounts } from './scheduledPayments.js'
import { createOrderForPayment } from './payments.js'
import { startAssignment } from './driverAssignment.js'

export const ACTIVE_BOOKING_STATUSES = ['pending', 'payment_pending', 'confirmed', 'assigned', 'en_route', 'reached', 'started']
const OVERLAP_MS = 15 * 60 * 1000
const normAddress = value => value?.trim().toLowerCase()

export class BookingCreationError extends Error {
  constructor(message, status = 409, code) { super(message); this.status = status; this.code = code }
}

// Shared persistence boundary for every booking client. HTTP/Clerk validation
// remains in the web route; WhatsApp supplies the already-resolved existing
// user. Pricing and route fields always come from a verified server quote.
export async function createBookingFromQuote({ user, quote, pickupAddress, pickupLat, pickupLng,
  dropAddress, dropLat, dropLng, vehicleClass, sharing = false, scheduledAt = null,
  isOutstation = false, source = 'website' }) {
  const pricedClass = quote.fares?.[vehicleClass]
  const fare = pricedClass?.[sharing ? 'sharing' : 'solo']
  if (!(fare > 0)) throw new BookingCreationError('That vehicle could not be priced for this route', 422, 'FARE_QUOTE')

  const active = await prisma.booking.findMany({ where: { userId: user.id, status: { in: ACTIVE_BOOKING_STATUSES } } })
  const rideAt = scheduledAt ? new Date(scheduledAt).getTime() : Date.now()
  for (const booking of active) {
    const activeAt = booking.scheduledAt ? booking.scheduledAt.getTime() : Date.now()
    if (Math.abs(rideAt - activeAt) < OVERLAP_MS)
      throw new BookingCreationError('You already have a ride around this time')
    if (normAddress(booking.pickupAddress) === normAddress(pickupAddress) && normAddress(booking.dropAddress) === normAddress(dropAddress))
      throw new BookingCreationError('You already have an active booking for this route')
  }

  const toll = pricedClass.toll ?? 0
  const airport = pricedClass.airport ?? 0
  const carrier = pricedClass.carrier ?? 0
  const couponAmount = Number.isFinite(quote.coupon?.amount) ? Math.min(fare, quote.coupon.amount) : 0
  const rideFare = rideFareOf(fare, { toll, airport, carrier })
  const { pct: commissionPct, amt: commissionAmt } = commissionOn({ rideFare, couponAmount })
  const safe = quote.safeRoute?.applied === true
  const waypoint = quote.safeRoute?.waypoint
  const data = {
    userId: user.id, customerPhone: user.phone, vehicleClass, source,
    pickupAddress, pickupLat, pickupLng, dropAddress, dropLat, dropLng,
    fare, rideFare, couponAmount, customerPayment: customerPaymentFor(fare, couponAmount),
    soloFare: sharing ? (pricedClass.solo ?? null) : null,
    distanceKm: quote.distanceKm ?? null,
    durationMin: quote.durationMin != null ? Math.round(quote.durationMin) : null,
    routePolyline: quote.polyline ?? null, isOutstation,
    preferSafeRoute: safe, needsCarrier: quote.needsCarrier === true,
    safeWaypointLat: safe && Number.isFinite(waypoint?.lat) ? waypoint.lat : null,
    safeWaypointLng: safe && Number.isFinite(waypoint?.lng) ? waypoint.lng : null,
    scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
    commissionPct, commissionAmt, sharing,
  }

  const write = async (tx, extra) => {
    if (quote.coupon) {
      const claimed = await tx.coupon.updateMany({ where: { id: quote.coupon.id, userId: user.id,
        amount: quote.coupon.amount, redeemedAt: null, bookingId: null }, data: { redeemedAt: new Date() } })
      if (!claimed.count) throw new BookingCreationError('Coupon already redeemed', 409, 'COUPON_UNAVAILABLE')
    }
    const booking = await createBooking({ ...data, ...extra }, tx)
    if (quote.coupon) await tx.coupon.update({ where: { id: quote.coupon.id }, data: { bookingId: booking.id } })
    return booking
  }

  if (!scheduledAt) {
    const booking = await prisma.$transaction(tx => write(tx, { status: 'pending', confirmedAt: null }))
    startAssignment(booking.id)
    return { bookingId: booking.id, reference: booking.reference, bookingCode: user.bookingCode, status: 'pending', fare }
  }

  const amounts = scheduledPaymentAmounts({ fare, couponAmount })
  const result = await prisma.$transaction(async tx => {
    const booking = await write(tx, { status: 'payment_pending', confirmedAt: null,
      scheduledAdvancePct: amounts.advancePercentage, scheduledAdvanceAmount: amounts.advance,
      scheduledRemainingAmount: amounts.remaining, scheduledAdvanceDisposition: 'awaiting_payment' })
    const payment = await createScheduledAdvanceIntent(tx, booking, amounts)
    return { booking, payment }
  })
  const answer = { bookingId: result.booking.id, reference: result.booking.reference, bookingCode: user.bookingCode,
    status: 'payment_pending', fare, financials: { fare: amounts.originalFare, coupon: amounts.coupon,
      finalFare: amounts.finalFare, advance: amounts.advance, remaining: amounts.remaining,
      advancePercentage: amounts.advancePercentage } }
  try { return { ...answer, payment: await createOrderForPayment({ paymentId: result.payment.id, userId: user.id }) } }
  catch { return { ...answer, payment: null, paymentError: { code: 'PAYMENT_ORDER_FAILED', message: 'Payment checkout could not be created. Retry payment.' } } }
}
