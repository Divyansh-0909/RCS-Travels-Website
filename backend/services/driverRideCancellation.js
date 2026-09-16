import { prisma } from '../db/prisma.js'
import { applyDriverCancellationConsequences } from './driverCancellations.js'
import { releaseDriverCapacity } from './driverCapacity.js'

/** @type {import('@prisma/client').BookingStatus[]} */
export const DRIVER_CANCELLABLE_STATUSES = ['assigned', 'en_route']

/**
 * Atomically return a captain-cancelled ride to the correct dispatch lane,
 * withdraw stale offers, restore capacity, and record cancellation consequences.
 */
export async function cancelDriverRideInTransaction(tx, booking, driver) {
  /** @type {import('@prisma/client').BookingStatus} */
  const returnedStatus = booking.scheduledAt ? 'confirmed' : 'pending'

  const moved = await tx.booking.updateMany({
    where: { id: booking.id, status: booking.status },
    data: { status: returnedStatus, driverId: null },
  })
  if (moved.count === 0) return null

  await tx.rideOffer.updateMany({
    where: { bookingId: booking.id, status: 'pending' },
    data: { status: 'withdrawn', respondedAt: new Date() },
  })

  await releaseDriverCapacity(tx, {
    driverId: driver.id,
    vehicleClass: driver.vehicleClass,
    sharing: booking.sharing,
  })

  const consequence = await applyDriverCancellationConsequences(tx, driver.id, {
    bookingId: booking.id,
    fromStatus: booking.status,
  })

  return { status: returnedStatus, consequence }
}

export async function cancelDriverRide(booking, driver) {
  return prisma.$transaction((tx) => cancelDriverRideInTransaction(tx, booking, driver))
}
