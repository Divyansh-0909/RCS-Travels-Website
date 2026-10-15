import { prisma } from '../db/prisma.js'
import { postWalletEntry } from './wallet.js'
import { walletEvent } from './walletKeys.js'
import { releaseDriverCapacity } from './driverCapacity.js'
import { releaseReservedResponsibilityCompensation } from './responsibilityCompensation.js'
import { releaseScheduledDeposits } from './scheduledDepositLifecycle.js'

/**
 * Apply the irreversible part of a customer cancellation in one transaction.
 * Gateway refunds stay outside because the payment provider is an external side effect.
 */
export async function applyCustomerCancellationInTransaction(tx, {
  booking,
  cancellationCharge,
  cancellationReason = null,
  advanceDisposition = null,
}) {
  if (!['pending', 'payment_pending', 'confirmed', 'assigned', 'en_route', 'reached'].includes(booking.status)) return false
  const moved = await tx.booking.updateMany({
    where: { id: booking.id, status: booking.status, driverId: booking.driverId },
    data: {
      status: 'cancelled',
      cancelledBy: 'user',
      cancellationCharge,
      cancellationReason,
      ...(advanceDisposition ? { scheduledAdvanceDisposition: advanceDisposition } : {}),
    },
  })
  if (!moved.count) return false

  await releaseReservedResponsibilityCompensation(tx, booking.id)

  await tx.rideOffer.updateMany({
    where: { bookingId: booking.id, status: 'pending' },
    data: { status: 'withdrawn', respondedAt: new Date() },
  })

  if (booking.driver) {
    await releaseDriverCapacity(tx, {
      driverId: booking.driver.id,
      vehicleClass: booking.driver.vehicleClass,
      sharing: booking.sharing,
    })
  }

  if (booking.scheduledAt) await releaseScheduledDeposits(tx, booking.id)

  if (cancellationCharge > 0 && booking.driverId) {
    await postWalletEntry(tx, {
      driverId: booking.driverId,
      amount: cancellationCharge,
      type: 'cancellation_compensation',
      eventKey: walletEvent.scheduledCancellationCompensation(booking.id),
      bookingId: booking.id,
      note: 'Scheduled customer cancellation compensation',
    })
  }

  return true
}

export async function applyCustomerCancellation(args) {
  return prisma.$transaction((tx) => applyCustomerCancellationInTransaction(tx, args))
}
