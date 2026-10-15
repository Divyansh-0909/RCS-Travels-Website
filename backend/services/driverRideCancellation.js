import { prisma } from '../db/prisma.js'
import { systemClock } from '../lib/clock.js'
import { recordDriverCancellationIncident } from './driverCancellations.js'
import { releaseDriverCapacity } from './driverCapacity.js'

/** @type {import('@prisma/client').BookingStatus[]} */
export const DRIVER_CANCELLABLE_STATUSES = ['assigned', 'en_route', 'reached']

/**
 * Atomically return a captain-cancelled ride to the correct dispatch lane,
 * withdraw stale offers, restore capacity, and record the responsibility incident.
 */
export async function cancelDriverRideInTransaction(tx, booking, driver, cancellation = {}, { clock = systemClock } = {}) {
  if (!DRIVER_CANCELLABLE_STATUSES.includes(booking.status)) return null
  /** @type {import('@prisma/client').BookingStatus} */
  const returnedStatus = booking.scheduledAt ? 'confirmed' : 'pending'

  const moved = await tx.booking.updateMany({
    where: { id: booking.id, status: booking.status, driverId: driver.id },
    data: {
      status: returnedStatus,
      driverId: null,
    },
  })
  if (moved.count === 0) return null

  await tx.rideOffer.updateMany({
    where: { bookingId: booking.id, status: 'pending' },
    data: { status: 'withdrawn', respondedAt: clock.now() },
  })

  await releaseDriverCapacity(tx, {
    driverId: driver.id,
    vehicleClass: driver.vehicleClass,
    sharing: booking.sharing,
  })

  const incident = await recordDriverCancellationIncident(tx, driver.id, {
    booking,
    reason: cancellation.reason ?? null,
    otherReason: cancellation.otherReason ?? null,
    now: clock.now(),
  })

  return {
    status: returnedStatus,
    responsibilityCaseId: incident.responsibilityCase.id,
  }
}

export async function cancelDriverRide(booking, driver, cancellation = {}, db = prisma) {
  return db.$transaction((tx) => cancelDriverRideInTransaction(tx, booking, driver, cancellation))
}
