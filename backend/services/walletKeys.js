/**
 * Deterministic names for the business events that move a driver's money, and
 * the derivation of what he is shown.
 *
 * Pure on purpose: WalletEntry.eventKey is UNIQUE, so these strings are the only
 * thing stopping a retried completion or a redelivered webhook from paying a
 * driver twice. A key that varies between two runs of the same event — anything
 * carrying a timestamp, a uuid, a retry counter — silently disables that
 * protection while still looking correct, which is why they are built here and
 * tested rather than assembled at each call site.
 */

export const walletEvent = {
  /** The scheduled-ride acceptance deposit going on hold. One per booking. */
  depositHold: (bookingId) => `deposit_hold:booking:${bookingId}`,
  /** That same deposit coming back on completion. One per booking. */
  depositRefund: (bookingId) => `deposit_refund:booking:${bookingId}`,
  /** The platform reimbursing the driver for a coupon the rider spent. */
  couponReimbursement: (bookingId) => `coupon_reimbursement:booking:${bookingId}`,
  /** The 5% cut, when it is settled from the wallet rather than in cash. */
  commission: (bookingId) => `commission:booking:${bookingId}`,
  /**
   * An upheld-complaint fine. Keyed by the THRESHOLD it was levied at, not by a
   * booking and not by a count — re-running the check at 3 complaints must find
   * the same key it wrote the first time, and reaching 4 must not write another.
   */
  fine: (driverId, threshold) => `fine:driver:${driverId}:threshold:${threshold}`,
  /** Money actually paid out, keyed by the payout batch that carried it. */
  payout: (payoutId) => `payout:${payoutId}`,
  /** Manual admin correction. The caller supplies the reference. */
  adjustment: (reference) => `adjustment:${reference}`,
  scheduledCancellationCompensation: (bookingId) => `scheduled_cancellation_compensation:booking:${bookingId}`,
}

/**
 * What the captain sees, derived from the ledger rather than stored.
 *
 * !! THE LEDGER SUM IS *AVAILABLE*, NOT TOTAL. A `deposit_hold` is a real signed
 * debit, so it has already come off sum(entries) by the time it is held. Total is
 * therefore the sum PLUS what is held, not minus it. Getting this backwards
 * subtracts the hold twice and shows a captain less money than he has.
 *
 *   +1000 credit, then an 80 hold  ->  sum 920
 *   available 920, held 80, total 1000
 *
 * @param entries every WalletEntry for one driver; order does not matter.
 */
export function balancesFrom(entries) {
  let available = 0
  // Holds are matched off against their refunds by booking. A hold whose refund
  // has landed is not held any more, whichever order the two rows arrive in.
  const openHolds = new Map()
  const refunded = new Set()

  for (const e of entries) {
    available += e.amount
    if (e.type === 'deposit_hold') openHolds.set(e.bookingId, Math.abs(e.amount))
    else if (e.type === 'deposit_refund') refunded.add(e.bookingId)
  }

  let held = 0
  for (const [bookingId, amount] of openHolds) {
    if (!refunded.has(bookingId)) held += amount
  }

  return { available, held, total: available + held }
}

/**
 * A negative AVAILABLE balance is the state that blocks going online. Held money
 * is not his to spend, so it can never rescue him from a debit.
 */
export function isBlockedByBalance(entries) {
  return balancesFrom(entries).available < 0
}
