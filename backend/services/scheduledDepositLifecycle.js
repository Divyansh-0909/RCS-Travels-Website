import { postWalletEntry } from './wallet.js'
import { walletEvent } from './walletKeys.js'
import { hasScheduledReservationHandoff } from './scheduledReservationHandoff.js'

// Operational reservations, not responsibility penalties. Owner decision:
// retain every actor's reservation until this booking completes/cancels.
// Booking CAS/driver lock are acquired by the calling application transaction.
function requireHold(hold, bookingId, amount = null) {
  if (hold.bookingId !== bookingId || hold.type !== 'deposit_hold'
    || !Number.isFinite(hold.amount) || hold.amount >= 0
    || (amount !== null && hold.amount !== -amount)) throw new Error('DEPOSIT_OWNER_CONFLICT')
}

export async function reserveScheduledDeposit(tx, { bookingId, driverId, offerId, amount }) {
  const legacyKey = walletEvent.depositHold(bookingId)
  const original = await tx.walletEntry.findUnique({ where: { eventKey: legacyKey } })
  let eventKey = legacyKey
  if (original) {
    requireHold(original, bookingId, amount)
    if (original.driverId !== driverId) {
      if (!await hasScheduledReservationHandoff(tx, bookingId, original.driverId)) throw new Error('DEPOSIT_OWNER_CONFLICT')
      eventKey = `${legacyKey}:offer:${offerId}`
    }
  }
  const existing = eventKey === legacyKey ? original
    : await tx.walletEntry.findUnique({ where: { eventKey } })
  if (existing) {
    requireHold(existing, bookingId, amount)
    if (existing.driverId !== driverId) throw new Error('DEPOSIT_OWNER_CONFLICT')
    const released = await tx.walletEntry.findUnique({ where: { eventKey: eventKey.replace('deposit_hold:', 'deposit_refund:') } })
    if (released) throw new Error('DEPOSIT_OWNER_CONFLICT')
  }
  await postWalletEntry(tx, { driverId, amount: -amount, type: 'deposit_hold', eventKey,
    bookingId, note: '10% scheduled ride acceptance deposit' })
}

export async function releaseScheduledDeposits(tx, bookingId) {
  const holds = await tx.walletEntry.findMany({ where: { bookingId, type: 'deposit_hold' }, orderBy: { eventKey: 'asc' } })
  const prefix = walletEvent.depositHold(bookingId)
  for (const hold of holds) {
    requireHold(hold, bookingId)
    if (hold.eventKey !== prefix && !hold.eventKey.startsWith(`${prefix}:offer:`)) throw new Error('DEPOSIT_OWNER_CONFLICT')
    const eventKey = hold.eventKey.replace('deposit_hold:', 'deposit_refund:')
    const existing = await tx.walletEntry.findUnique({ where: { eventKey } })
    if (existing && (existing.driverId !== hold.driverId || existing.bookingId !== bookingId
      || existing.type !== 'deposit_refund' || existing.amount !== -hold.amount)) throw new Error('DEPOSIT_OWNER_CONFLICT')
    await postWalletEntry(tx, { driverId: hold.driverId, amount: -hold.amount, type: 'deposit_refund', eventKey, bookingId,
      note: 'Scheduled ride acceptance deposit released at booking terminal state' })
  }
}
