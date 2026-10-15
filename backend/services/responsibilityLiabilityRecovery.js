import { prisma } from '../db/prisma.js'
import { walletEvent } from './walletKeys.js'
import { postWalletEntry } from './wallet.js'
import { assertGrossRecoveryNetInvariant } from './responsibilityFinancialMath.js'

export class ResponsibilityLiabilityRecoveryError extends Error {
  constructor(code) {
    super(code)
    this.code = code
  }
}

const FINAL_UPHELD = 'FINAL_UPHELD'

const paiseFromRupees = amount => {
  if (!Number.isFinite(amount) || amount <= 0) return null
  const paise = Math.round(amount * 100)
  return Number.isSafeInteger(paise) && Math.abs(amount * 100 - paise) < 0.000001 ? paise : null
}

const entryOutstandingPaise = liability => {
  const corrections = liability.entries
    .filter(entry => entry.kind === 'CORRECTION')
    .reduce((total, entry) => total + entry.amountPaise, 0)
  const recovered = liability.entries
    .filter(entry => entry.kind === 'RECOVERED')
    .reduce((total, entry) => total + entry.amountPaise, 0)
  return Math.max(0, liability.amountPaise + corrections - recovered)
}

const finalizedLiabilityWhere = driverId => ({
  driverId,
  case: { state: FINAL_UPHELD },
  finalDecision: { outcome: FINAL_UPHELD },
})

async function finalizedLiabilities(tx, driverId) {
  return tx.responsibilityLiability.findMany({
    where: finalizedLiabilityWhere(driverId),
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      amountPaise: true,
      entries: { select: { kind: true, amountPaise: true, sourceKey: true } },
    },
  })
}

/** The amount still owed across final upheld liabilities, in integer paise. */
export async function outstandingFinalizedLiabilityPaise(driverId, { db = prisma } = {}) {
  if (!driverId) return 0
  const liabilities = await finalizedLiabilities(db, driverId)
  return liabilities.reduce((total, liability) => total + entryOutstandingPaise(liability), 0)
}

async function lockRecoveryRows(tx, driverId) {
  // The driver row serializes recoveries across several finalized liabilities.
  // Liability locks preserve FIFO once the source earning has been selected.
  await tx.$queryRaw`SELECT id FROM drivers WHERE id = ${driverId} FOR UPDATE`
  await tx.$queryRaw`
    SELECT l.id
    FROM responsibility_liabilities l
    JOIN responsibility_cases c ON c.id = l.case_id
    JOIN responsibility_final_decisions d ON d.id = l.final_decision_id
    WHERE l.driver_id = ${driverId}
      AND c.state = ${FINAL_UPHELD}
      AND d.outcome = ${FINAL_UPHELD}
    ORDER BY l.created_at ASC, l.id ASC
    FOR UPDATE OF l`
}

function platformControlledEarning(earning) {
  if (!earning.bookingId) return false
  if (earning.type === 'ride_collection') return earning.method === 'upi'
  return earning.type === 'coupon_reimbursement'
    || earning.type === 'responsibility_compensation_funding'
}

/**
 * Recover finalized liabilities from exactly one persisted, platform-controlled
 * positive earning. Direct cash never enters this boundary.
 * @param {{driverId?: string, earningEventKey?: string,
 *   db?: typeof prisma | import('@prisma/client').Prisma.TransactionClient}} [input]
 */
export async function recoverFinalizedLiabilitiesFromEarning({
  driverId,
  earningEventKey,
  db = prisma,
} = {}) {
  if (!driverId) throw new ResponsibilityLiabilityRecoveryError('DRIVER_ID_REQUIRED')
  if (!earningEventKey) throw new ResponsibilityLiabilityRecoveryError('EARNING_EVENT_KEY_REQUIRED')

  const work = async tx => {
    await lockRecoveryRows(tx, driverId)
    const earning = await tx.walletEntry.findUnique({
      where: { eventKey: earningEventKey },
      select: { driverId: true, amount: true, type: true, method: true, bookingId: true },
    })
    if (!earning || earning.driverId !== driverId) throw new ResponsibilityLiabilityRecoveryError('EARNING_SOURCE_MISSING')
    if (!platformControlledEarning(earning)) {
      throw new ResponsibilityLiabilityRecoveryError('EARNING_SOURCE_NOT_PLATFORM_CONTROLLED')
    }
    const earningPaise = paiseFromRupees(earning.amount)
    if (earningPaise === null) throw new ResponsibilityLiabilityRecoveryError('EARNING_SOURCE_AMOUNT_INVALID')

    const liabilities = await finalizedLiabilities(tx, driverId)
    let remainingPaise = earningPaise
    const recovered = []
    for (const liability of liabilities) {
      const sourceKey = walletEvent.liabilityRecovery(liability.id, earningEventKey)
      const alreadyRecovered = liability.entries.find(entry => entry.kind === 'RECOVERED' && entry.sourceKey === sourceKey)
      if (alreadyRecovered) {
        remainingPaise -= alreadyRecovered.amountPaise
        continue
      }
      const allocationPaise = Math.min(remainingPaise, entryOutstandingPaise(liability))
      if (allocationPaise <= 0) continue
      const inserted = await tx.responsibilityLiabilityEntry.createMany({
        data: [{
          liabilityId: liability.id,
          kind: 'RECOVERED',
          amountPaise: allocationPaise,
          sourceKey,
          earningBookingId: earning.bookingId,
        }],
        skipDuplicates: true,
      })
      if (inserted.count === 0) {
        // A concurrent worker may have inserted this deterministic allocation
        // after our liability snapshot. Count that durable allocation before
        // considering the next FIFO row; otherwise both workers could spend the
        // same earning against different liabilities.
        const existing = await tx.responsibilityLiabilityEntry.findUnique({ where: { sourceKey } })
        if (!existing || existing.liabilityId !== liability.id || existing.kind !== 'RECOVERED' || existing.amountPaise <= 0) {
          throw new ResponsibilityLiabilityRecoveryError('RECOVERY_IDEMPOTENCY_CONFLICT')
        }
        remainingPaise -= existing.amountPaise
        continue
      }
      const walletPost = await postWalletEntry(tx, {
        driverId,
        amount: -allocationPaise / 100,
        type: 'liability_recovery',
        eventKey: sourceKey,
        bookingId: earning.bookingId,
        note: 'Finalized responsibility liability recovered from platform-controlled earning',
      })
      if (!walletPost.posted) throw new ResponsibilityLiabilityRecoveryError('RECOVERY_WALLET_ENTRY_CONFLICT')
      remainingPaise -= allocationPaise
      recovered.push({ liabilityId: liability.id, amountPaise: allocationPaise, sourceKey })
    }
    assertGrossRecoveryNetInvariant({
      grossPaise: earningPaise,
      recoveryPaise: earningPaise - remainingPaise,
      netPaise: remainingPaise,
    })
    return {
      earningEventKey,
      earningBookingId: earning.bookingId,
      recovered,
      recoveredPaise: recovered.reduce((total, row) => total + row.amountPaise, 0),
      unrecoveredEarningPaise: remainingPaise,
    }
  }
  return db.$transaction ? db.$transaction(work) : work(db)
}
