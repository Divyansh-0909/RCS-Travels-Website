import { prisma } from '../db/prisma.js'
import { createBooking } from '../lib/bookingReference.js'
import { commissionOn, rideFareOf } from './commission.js'
import { customerPaymentFor } from './coupons.js'
import { createScheduledAdvanceIntent, scheduledPaymentAmounts } from './scheduledPayments.js'
import { createOrderForPayment } from './payments.js'
import { startAssignment } from './driverAssignment.js'
import { reserveResponsibilityCompensation } from './responsibilityCompensation.js'

export const ACTIVE_BOOKING_STATUSES = ['pending', 'payment_pending', 'confirmed', 'assigned', 'en_route', 'reached', 'started']
const OVERLAP_MS = 15 * 60 * 1000
const normAddress = value => value?.trim().toLowerCase()

export class BookingCreationError extends Error {
  constructor(message, status = 409, code) { super(message); this.status = status; this.code = code }
}

async function assertNoOverlappingBooking(db, userId, scheduledAt, pickupAddress, dropAddress) {
  const active = await db.booking.findMany({ where: { userId, status: { in: ACTIVE_BOOKING_STATUSES } } })
  const rideAt = scheduledAt ? new Date(scheduledAt).getTime() : Date.now()
  for (const booking of active) {
    const activeAt = booking.scheduledAt ? booking.scheduledAt.getTime() : Date.now()
    if (Math.abs(rideAt - activeAt) < OVERLAP_MS)
      throw new BookingCreationError('You already have a ride around this time')
    if (normAddress(booking.pickupAddress) === normAddress(pickupAddress) && normAddress(booking.dropAddress) === normAddress(dropAddress))
      throw new BookingCreationError('You already have an active booking for this route')
  }
}

function safeWaypointFields(quote) {
  const safe = quote.safeRoute?.applied === true
  const waypoint = quote.safeRoute?.waypoint
  return {
    preferSafeRoute: safe,
    safeWaypointLat: safe && Number.isFinite(waypoint?.lat) ? waypoint.lat : null,
    safeWaypointLng: safe && Number.isFinite(waypoint?.lng) ? waypoint.lng : null,
  }
}

function pricedBookingData({ user, quote, pickupAddress, pickupLat, pickupLng,
  dropAddress, dropLat, dropLng, vehicleClass, sharing, scheduledAt, isOutstation, source }) {
  const pricedClass = quote.fares?.[vehicleClass]
  const fare = pricedClass?.[sharing ? 'sharing' : 'solo']
  if (!(fare > 0)) throw new BookingCreationError('That vehicle could not be priced for this route', 422, 'FARE_QUOTE')
  const toll = pricedClass.toll ?? 0
  const airport = pricedClass.airport ?? 0
  const carrier = pricedClass.carrier ?? 0
  const couponAmount = Number.isFinite(quote.coupon?.amount) ? Math.min(fare, quote.coupon.amount) : 0
  const rideFare = rideFareOf(fare, { toll, airport, carrier })
  const { pct: commissionPct, amt: commissionAmt } = commissionOn({ rideFare, couponAmount })
  return {
    userId: user.id, customerPhone: user.phone, vehicleClass, source,
    pickupAddress, pickupLat, pickupLng, dropAddress, dropLat, dropLng,
    fare, rideFare, couponAmount, customerPayment: customerPaymentFor(fare, couponAmount),
    soloFare: sharing ? (pricedClass.solo ?? null) : null,
    distanceKm: quote.distanceKm ?? null,
    durationMin: quote.durationMin != null ? Math.round(quote.durationMin) : null,
    routePolyline: quote.polyline ?? null, isOutstation,
    ...safeWaypointFields(quote), needsCarrier: quote.needsCarrier === true,
    scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
    commissionPct, commissionAmt, sharing,
  }
}

async function writeBooking(tx, data, coupon, extra) {
  if (coupon) {
    const claimed = await tx.coupon.updateMany({ where: { id: coupon.id, userId: data.userId,
      amount: coupon.amount, redeemedAt: null, bookingId: null }, data: { redeemedAt: new Date() } })
    if (!claimed.count) throw new BookingCreationError('Coupon already redeemed', 409, 'COUPON_UNAVAILABLE')
  }
  const booking = await createBooking({ ...data, ...extra }, tx)
  if (coupon) await tx.coupon.update({ where: { id: coupon.id }, data: { bookingId: booking.id } })
  return booking
}

async function createImmediateBooking(db, data, coupon, user, assign) {
  const booking = await db.$transaction(async tx => {
    const created = await writeBooking(tx, data, coupon, { status: 'pending', confirmedAt: null })
    const reservation = await reserveResponsibilityCompensation(tx, created.id)
    if (!reservation.reservedPaise) return created
    return tx.booking.update({ where: { id: created.id }, data: {
      customerPayment: (reservation.obligationPaise - reservation.reservedPaise) / 100,
    } })
  })
  assign(booking.id)
  return { bookingId: booking.id, reference: booking.reference, bookingCode: user.bookingCode,
    status: 'pending', fare: data.fare }
}

async function createScheduledBooking(db, data, coupon, user, createOrder) {
  const result = await db.$transaction(async tx => {
    const created = await writeBooking(tx, data, coupon, { status: 'payment_pending', confirmedAt: null })
    const reservation = await reserveResponsibilityCompensation(tx, created.id)
    const amounts = scheduledPaymentAmounts({ fare: data.fare, couponAmount: data.couponAmount,
      compensationAmount: reservation.reservedPaise / 100 })
    const noAdvance = amounts.advance === 0
    const booking = await tx.booking.update({ where: { id: created.id }, data: {
      customerPayment: amounts.obligation / 100,
      scheduledAdvancePct: amounts.advancePercentage,
      scheduledAdvanceAmount: amounts.advance,
      scheduledRemainingAmount: amounts.remaining,
      scheduledAdvanceDisposition: noAdvance ? 'not_applicable' : 'awaiting_payment',
      ...(noAdvance ? { status: 'confirmed', confirmedAt: new Date() } : {}),
    } })
    const payment = noAdvance ? null : await createScheduledAdvanceIntent(tx, booking, amounts)
    return { booking, payment, amounts }
  })
  const { amounts } = result
  const answer = { bookingId: result.booking.id, reference: result.booking.reference, bookingCode: user.bookingCode,
    status: result.booking.status, fare: data.fare, financials: { fare: amounts.originalFare, coupon: amounts.coupon,
      finalFare: amounts.finalFare, advance: amounts.advance, remaining: amounts.remaining,
      advancePercentage: amounts.advancePercentage } }
  if (!result.payment) return { ...answer, payment: null }
  try { return { ...answer, payment: await createOrder({ paymentId: result.payment.id, userId: user.id, db }) } }
  catch { return { ...answer, payment: null, paymentError: { code: 'PAYMENT_ORDER_FAILED', message: 'Payment checkout could not be created. Retry payment.' } } }
}

// Shared persistence boundary for every booking client. HTTP/Clerk validation
// remains in the web route; WhatsApp supplies the already-resolved existing
// user. Pricing and route fields always come from a verified server quote.
export async function createBookingFromQuote({ user, quote, pickupAddress, pickupLat, pickupLng,
  dropAddress, dropLat, dropLng, vehicleClass, sharing = false, scheduledAt = null,
  isOutstation = false, source = 'website' }, {
  db = prisma, createOrder = createOrderForPayment, assign = startAssignment,
} = {}) {
  const data = pricedBookingData({ user, quote, pickupAddress, pickupLat, pickupLng,
    dropAddress, dropLat, dropLng, vehicleClass, sharing, scheduledAt, isOutstation, source })
  await assertNoOverlappingBooking(db, user.id, scheduledAt, pickupAddress, dropAddress)
  return scheduledAt
    ? createScheduledBooking(db, data, quote.coupon, user, createOrder)
    : createImmediateBooking(db, data, quote.coupon, user, assign)
}
