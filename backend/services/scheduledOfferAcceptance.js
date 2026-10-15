import { systemClock } from '../lib/clock.js'
import { scheduledDepositFor } from './scheduledDeposit.js'
import { reserveScheduledDeposit } from './scheduledDepositLifecycle.js'
import { joinPool } from './driverAssignment.js'
import { withdrawOtherOffers } from './scheduledOffers.js'

/** Shared HTTP/simulator acceptance writes; runs inside the guarded assignment transaction.
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {{booking: {id: string, fare: number, scheduledAt: Date | null}, driverId: string, offerId: string,
 * poolJoin?: {host: {id: string}, orders: {host: {pickupOrder: number, dropOrder: number}, joiner: {pickupOrder: number, dropOrder: number}}} | null,
 * clock?: {now: () => Date}}} input
 */
export async function applyScheduledOfferAcceptance(tx, {
  booking, driverId, offerId, poolJoin = null, clock = systemClock,
}) {
  const answered = await tx.rideOffer.updateMany({
    where: { id: offerId, bookingId: booking.id, driverId, status: 'pending' },
    data: { status: 'accepted', respondedAt: clock.now() },
  })
  if (!answered.count) throw new Error('OFFER_UNAVAILABLE')
  const depositAmount = booking.scheduledAt ? scheduledDepositFor(booking.fare) : 0
  const live = await tx.driver.findUniqueOrThrow({ where: { id: driverId }, select: { walletBalance: true } })
  if (live.walletBalance < depositAmount) throw new Error('INSUFFICIENT_WALLET')
  if (depositAmount > 0) {
    await reserveScheduledDeposit(tx, { bookingId: booking.id, driverId, offerId, amount: depositAmount })
  }
  if (poolJoin) await joinPool(tx, { host: poolJoin.host, joiner: booking, orders: poolJoin.orders })
  await withdrawOtherOffers(booking.id, driverId, tx)
}
