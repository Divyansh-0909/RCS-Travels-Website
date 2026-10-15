import { systemClock } from '../lib/clock.js'
import { customerObligationPaise } from './responsibilityFinancialMath.js'

const ACTIVE_ALLOCATION_STATUSES = ['RESERVED', 'CONSUMED']
const ELIGIBLE_BOOKING_STATUSES = ['pending', 'payment_pending', 'confirmed', 'assigned', 'en_route', 'reached', 'started']

export class ResponsibilityCompensationError extends Error {
  constructor(code) {
    super(code)
    this.code = code
  }
}

const paise = value => Math.max(0, Math.round(Number(value) * 100))
const allocationSourceKey = (bookingId, compensationId) =>
  `responsibility-compensation:${bookingId}:${compensationId}`

function bookingObligationPaise(booking) {
  return customerObligationPaise({
    farePaise: paise(booking.fare), couponPaise: paise(booking.couponAmount),
  }).obligationPaise
}

function allocationTotal(allocations) {
  return allocations.reduce((total, allocation) => total + allocation.amountPaise, 0)
}

function allocationView(allocation) {
  return {
    id: allocation.id,
    compensationId: allocation.compensationId,
    bookingId: allocation.bookingId,
    amountPaise: allocation.amountPaise,
    status: allocation.status,
    sourceKey: allocation.sourceKey,
  }
}

async function lockInventory(tx, userId) {
  // The user row serializes reservations across all of their entitlements. The
  // entitlement locks then keep the FIFO availability calculation stable until
  // its allocation rows are written.
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`
  await tx.$queryRaw`SELECT id FROM responsibility_compensations WHERE user_id = ${userId} ORDER BY created_at ASC, id ASC FOR UPDATE`
}

export function isBookingEligibleForResponsibilityCompensation(booking) {
  return Boolean(booking?.userId && ELIGIBLE_BOOKING_STATUSES.includes(booking.status))
}

async function eligibleBooking(tx, bookingId) {
  const booking = await tx.booking.findUnique({
    where: { id: bookingId },
    select: { id: true, userId: true, fare: true, couponAmount: true, status: true },
  })
  if (!booking) throw new ResponsibilityCompensationError('BOOKING_MISSING')
  if (!isBookingEligibleForResponsibilityCompensation(booking))
    throw new ResponsibilityCompensationError('BOOKING_NOT_ELIGIBLE')
  return booking
}

/**
 * Reserves compensation against a booking's ordinary post-coupon ride price.
 * Cancellation fees are deliberately absent from this calculation.
 */
export async function reserveResponsibilityCompensation(tx, bookingId) {
  if (!bookingId) throw new ResponsibilityCompensationError('BOOKING_ID_REQUIRED')
  const booking = await eligibleBooking(tx, bookingId)
  await lockInventory(tx, booking.userId)

  const history = await tx.responsibilityCompensationAllocation.findMany({
    where: { bookingId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
  const existing = history.filter(allocation => ACTIVE_ALLOCATION_STATUSES.includes(allocation.status))
  if (existing.length) return {
    bookingId,
    obligationPaise: bookingObligationPaise(booking),
    reservedPaise: allocationTotal(existing),
    allocations: existing.map(allocationView),
    reused: true,
  }

  let remaining = bookingObligationPaise(booking)
  const entitlements = await tx.responsibilityCompensation.findMany({
    where: { userId: booking.userId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    include: { allocations: { where: { status: { in: ACTIVE_ALLOCATION_STATUSES } } } },
  })
  const allocations = []
  for (const entitlement of entitlements) {
    const available = Math.max(0, entitlement.amountPaise - allocationTotal(entitlement.allocations))
    const amountPaise = Math.min(available, remaining)
    if (amountPaise <= 0) continue
    const priorAttempts = history.filter(row => row.compensationId === entitlement.id).length
    const sourceKey = allocationSourceKey(bookingId, entitlement.id)
    const allocation = await tx.responsibilityCompensationAllocation.create({ data: {
      compensationId: entitlement.id,
      bookingId,
      amountPaise,
      status: 'RESERVED',
      sourceKey: priorAttempts ? `${sourceKey}:retry:${priorAttempts}` : sourceKey,
    } })
    allocations.push(allocation)
    remaining -= amountPaise
  }
  return {
    bookingId,
    obligationPaise: bookingObligationPaise(booking),
    reservedPaise: allocationTotal(allocations),
    allocations: allocations.map(allocationView),
    reused: false,
  }
}

export async function releaseReservedResponsibilityCompensation(tx, bookingId, { clock = systemClock } = {}) {
  if (!bookingId) throw new ResponsibilityCompensationError('BOOKING_ID_REQUIRED')
  const result = await tx.responsibilityCompensationAllocation.updateMany({
    where: { bookingId, status: 'RESERVED' },
    data: { status: 'RELEASED', releasedAt: clock.now() },
  })
  return { bookingId, status: 'RELEASED', count: result.count }
}

export async function consumeReservedResponsibilityCompensation(tx, bookingId, {
  clock = systemClock, maxPaise = Number.MAX_SAFE_INTEGER,
} = {}) {
  if (!bookingId) throw new ResponsibilityCompensationError('BOOKING_ID_REQUIRED')
  if (!Number.isSafeInteger(maxPaise) || maxPaise < 0)
    throw new ResponsibilityCompensationError('INVALID_CONSUMPTION_LIMIT')
  const reserved = await tx.responsibilityCompensationAllocation.findMany({
    where: { bookingId, status: 'RESERVED' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
  let remaining = maxPaise
  let count = 0
  for (const allocation of reserved) {
    const originalAmountPaise = allocation.amountPaise
    const applied = Math.min(remaining, originalAmountPaise)
    const data = applied > 0
      ? { status: 'CONSUMED', consumedAt: clock.now(), amountPaise: applied }
      : { status: 'RELEASED', releasedAt: clock.now() }
    const changed = await tx.responsibilityCompensationAllocation.updateMany({
      where: { id: allocation.id, status: 'RESERVED' }, data,
    })
    if (!changed.count) continue
    if (applied > 0) count += 1
    remaining -= applied
    if (applied > 0 && applied < originalAmountPaise) {
      // Keep the unused portion visible as a released allocation; the source
      // entitlement remains available while the consumed part stays attributed.
      await tx.responsibilityCompensationAllocation.create({ data: {
        compensationId: allocation.compensationId,
        bookingId,
        amountPaise: originalAmountPaise - applied,
        status: 'RELEASED',
        releasedAt: clock.now(),
        sourceKey: `${allocation.sourceKey}:unused`,
      } })
    }
  }
  return { bookingId, status: 'CONSUMED', count }
}
