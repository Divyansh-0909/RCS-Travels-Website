import { prisma } from '../db/prisma.js'
import { postWalletEntry } from './wallet.js'
import { walletEvent } from './walletKeys.js'
import { releaseDriverCapacity } from './driverCapacity.js'

/**
 * Apply the irreversible part of a customer cancellation in one transaction.
 * Gateway refunds stay outside because the payment provider is an external side effect.
 */
export async function applyCustomerCancellationInTransaction(tx, {
  booking,
  cancellationCharge,
  shouldRefund,
  shouldForfeit,
}) {
  const moved = await tx.booking.updateMany({
    where: { id: booking.id, status: booking.status },
    data: {
      status: 'cancelled',
      cancelledBy: 'user',
      cancellationCharge,
      ...(shouldRefund ? { scheduledAdvanceDisposition: 'refund_pending' } : {}),
      ...(shouldForfeit ? { scheduledAdvanceDisposition: 'forfeited_to_driver' } : {}),
    },
  })
  if (!moved.count) return false

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

  if (booking.driverId && booking.scheduledAt) {
    const hold = await tx.walletEntry.findUnique({
      where: { eventKey: walletEvent.depositHold(booking.id) },
    })
    if (hold) {
      await postWalletEntry(tx, {
        driverId: booking.driverId,
        amount: Math.abs(hold.amount),
        type: 'deposit_refund',
        eventKey: walletEvent.depositRefund(booking.id),
        bookingId: booking.id,
        note: 'Scheduled ride acceptance deposit released after customer cancellation',
      })
    }
  }

  if (shouldForfeit && booking.driverId) {
    await postWalletEntry(tx, {
      driverId: booking.driverId,
      amount: booking.scheduledAdvancePaidAmount / 100,
      type: 'cancellation_compensation',
      eventKey: walletEvent.scheduledCancellationCompensation(booking.id),
      bookingId: booking.id,
      note: 'Scheduled customer advance forfeited after late cancellation',
    })
  }

  return true
}

export async function applyCustomerCancellation(args) {
  return prisma.$transaction((tx) => applyCustomerCancellationInTransaction(tx, args))
}
