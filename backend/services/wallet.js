import { prisma } from '../db/prisma.js'
import { balancesFrom } from './walletKeys.js'

/**
 * The ONLY way money is written to a driver's ledger.
 *
 * Two things happen together or not at all: the WalletEntry row, and the
 * Driver.walletBalance cache that is a plain sum of those rows. Writing them in
 * separate transactions lets them drift, and the drift is money.
 *
 * IDEMPOTENCY comes from the unique `eventKey`, applied through
 * `createMany({ skipDuplicates: true })` rather than a catch on P2002 — in
 * Postgres a failed INSERT aborts the surrounding transaction, so catching the
 * violation would poison every later write in the same tx. skipDuplicates
 * reports 0 rows instead of raising, which is what makes the retry a clean no-op
 * INCLUDING the balance update. Never move the increment outside this guard.
 *
 * @param tx a Prisma transaction client. Required — callers that have no other
 *           work to do should use postWalletEntryAlone().
 * @returns {{ posted: boolean }} posted:false means this event was already
 *           recorded and nothing moved.
 */
export async function postWalletEntry(tx, {
  driverId,
  amount,
  type,
  eventKey,
  method = null,
  bookingId = null,
  note = null,
}) {
  if (!eventKey) throw new Error('postWalletEntry needs an eventKey — see services/walletKeys.js')
  if (!Number.isFinite(amount)) throw new Error(`postWalletEntry got a non-numeric amount: ${amount}`)

  const { count } = await tx.walletEntry.createMany({
    data: [{ driverId, amount, type, eventKey, method, bookingId, note }],
    skipDuplicates: true,
  })
  // Already recorded. The caller is a retry; nothing moves.
  if (count === 0) return { posted: false }

  await tx.driver.update({
    where: { id: driverId },
    data: { walletBalance: { increment: amount } },
  })
  return { posted: true }
}

/** postWalletEntry when there is no other work to bundle into the transaction. */
export function postWalletEntryAlone(entry) {
  return prisma.$transaction((tx) => postWalletEntry(tx, entry))
}

/**
 * Available / held / total for one driver, derived from the ledger.
 * `available` is the figure Driver.walletBalance caches; see walletKeys.js for
 * why total is the sum PLUS held rather than minus it.
 */
export async function driverBalances(driverId) {
  const entries = await prisma.walletEntry.findMany({
    where: { driverId },
    select: { amount: true, type: true, bookingId: true },
  })
  return balancesFrom(entries)
}
