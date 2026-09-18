import { randomUUID } from 'node:crypto'
import { prisma } from '../db/prisma.js'
import { PaymentError } from './paymentErrors.js'
import { MIN_PAYMENT_SUBUNITS } from './paymentIntents.js'
import { balancesFrom, walletEvent } from './walletKeys.js'
import { postWalletEntry } from './wallet.js'

const UPI_RE = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$/

export function normalizeUpiId(value) {
  return String(value ?? '').trim().replace(/\s+/g, '').toLowerCase()
}

export function isValidUpiId(value) {
  return UPI_RE.test(normalizeUpiId(value))
}

/**
 * @param {string} driverId
 * @param {{ limit?: number, cursor?: string | null, db?: any }} [options]
 */
export async function walletStatement(driverId, { limit = 30, cursor = null, db = prisma } = {}) {
  const take = Math.min(100, Math.max(1, Number(limit) || 30))
  const [all, page, driver] = await Promise.all([
    db.walletEntry.findMany({
      where: { driverId },
      select: { amount: true, type: true, bookingId: true },
    }),
    db.walletEntry.findMany({
      where: { driverId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, amount: true, type: true, method: true, bookingId: true, note: true, createdAt: true },
    }),
    db.driver.findUnique({
      where: { id: driverId },
      select: { id: true, walletBalance: true, payoutUpiId: true, payoutUpiVerifiedAt: true },
    }),
  ])
  if (!driver) return null
  const balances = balancesFrom(all)
  const rows = page.slice(0, take)
  const holdsByBooking = new Map()
  const released = new Set()
  for (const entry of all) {
    if (entry.type === 'deposit_hold' && entry.bookingId) holdsByBooking.set(entry.bookingId, Math.abs(entry.amount))
    if (entry.type === 'deposit_refund' && entry.bookingId) released.add(entry.bookingId)
  }
  const openHolds = [...holdsByBooking]
    .filter(([bookingId]) => !released.has(bookingId))
    .map(([bookingId, amount]) => ({ bookingId, amount }))
  return {
    balances,
    cacheBalance: driver.walletBalance,
    inSync: Math.abs(driver.walletBalance - balances.available) < 0.005,
    payoutAccount: {
      upiId: driver.payoutUpiId,
      verified: Boolean(driver.payoutUpiVerifiedAt),
      verifiedAt: driver.payoutUpiVerifiedAt,
    },
    openHolds,
    entries: rows,
    nextCursor: page.length > take ? rows.at(-1)?.id ?? null : null,
  }
}

export async function savePayoutUpi(driverId, rawUpiId, { db = prisma } = {}) {
  const upiId = normalizeUpiId(rawUpiId)
  if (!isValidUpiId(upiId)) throw new PaymentError('INVALID_UPI_ID', 'Enter a valid UPI ID', 400)
  const current = await db.driver.findUnique({ where: { id: driverId }, select: { payoutUpiId: true, payoutUpiVerifiedAt: true } })
  if (!current) throw new PaymentError('DRIVER_NOT_FOUND', 'Driver not found', 404)
  const changed = current.payoutUpiId !== upiId
  const updated = await db.driver.update({
    where: { id: driverId },
    data: { payoutUpiId: upiId, ...(changed ? { payoutUpiVerifiedAt: null } : {}) },
    select: { payoutUpiId: true, payoutUpiVerifiedAt: true },
  })
  return { upiId: updated.payoutUpiId, verified: Boolean(updated.payoutUpiVerifiedAt), verifiedAt: updated.payoutUpiVerifiedAt }
}

export async function setPayoutUpiVerification(driverId, verified, { db = prisma } = {}) {
  const driver = await db.driver.findUnique({ where: { id: driverId }, select: { payoutUpiId: true } })
  if (!driver) throw new PaymentError('DRIVER_NOT_FOUND', 'Driver not found', 404)
  if (verified && !driver.payoutUpiId) throw new PaymentError('PAYOUT_ACCOUNT_MISSING', 'Driver has no payout UPI ID', 409)
  const updated = await db.driver.update({
    where: { id: driverId },
    data: { payoutUpiVerifiedAt: verified ? new Date() : null },
    select: { payoutUpiId: true, payoutUpiVerifiedAt: true },
  })
  return { upiId: updated.payoutUpiId, verified: Boolean(updated.payoutUpiVerifiedAt), verifiedAt: updated.payoutUpiVerifiedAt }
}

export async function createDriverDebtPayment(driverId, { db = prisma } = {}) {
  const create = async (tx) => {
    const driver = await tx.driver.findUniqueOrThrow({ where: { id: driverId }, select: { walletBalance: true } })
    const debt = Math.max(0, Math.round(-driver.walletBalance * 100))
    if (debt === 0) throw new PaymentError('NO_OUTSTANDING_BALANCE', 'There is no negative balance to clear', 409)
    if (debt < MIN_PAYMENT_SUBUNITS) {
      throw new PaymentError('DEBT_BELOW_GATEWAY_MINIMUM', 'Outstanding balance is below Razorpay’s ₹1 minimum', 409)
    }
    const active = await tx.payment.findFirst({
      where: {
        driverId,
        purpose: 'driver_debt_settlement',
        status: { in: ['created', 'order_creating', 'order_created', 'authorized'] },
      },
      orderBy: { createdAt: 'desc' },
    })
    if (active?.amount === debt) return active
    return tx.payment.create({
      data: {
        driverId,
        userId: null,
        bookingId: null,
        purpose: 'driver_debt_settlement',
        amount: debt,
        currency: 'INR',
        idempotencyKey: `driver-debt:${driverId}:${randomUUID()}`,
      },
    })
  }
  return db.$transaction ? db.$transaction(create) : create(db)
}

export async function postAdminAdjustment({ driverId, amount, note, reference, db = prisma }) {
  const cleanReference = String(reference ?? '').trim()
  const cleanNote = String(note ?? '').trim()
  if (!cleanReference || cleanReference.length > 120) throw new PaymentError('INVALID_REFERENCE', 'A stable adjustment reference is required', 400)
  if (!cleanNote || cleanNote.length > 500) throw new PaymentError('INVALID_NOTE', 'An adjustment note is required', 400)
  if (!Number.isFinite(amount) || amount === 0) throw new PaymentError('INVALID_AMOUNT', 'Adjustment amount must be non-zero', 400)
  return db.$transaction(async (tx) => {
    const driver = await tx.driver.findUnique({ where: { id: driverId }, select: { id: true } })
    if (!driver) throw new PaymentError('DRIVER_NOT_FOUND', 'Driver not found', 404)
    const key = walletEvent.adjustment(cleanReference)
    const existing = await tx.walletEntry.findUnique({ where: { eventKey: key } })
    if (existing && (existing.driverId !== driverId || existing.amount !== amount || existing.note !== cleanNote)) {
      throw new PaymentError('IDEMPOTENCY_CONFLICT', 'Adjustment reference was already used for different terms', 409)
    }
    const posted = await postWalletEntry(tx, {
      driverId,
      amount,
      type: 'adjustment',
      eventKey: key,
      note: cleanNote,
    })
    const entries = await tx.walletEntry.findMany({ where: { driverId }, select: { amount: true, type: true, bookingId: true } })
    return { ...posted, balances: balancesFrom(entries), eventKey: key }
  })
}

export async function reconciliationReport({ db = prisma } = {}) {
  const drivers = await db.driver.findMany({ select: { id: true, name: true, phone: true, walletBalance: true } })
  const sums = await db.walletEntry.groupBy({ by: ['driverId'], _sum: { amount: true } })
  const byDriver = new Map(sums.map((row) => [row.driverId, row._sum.amount ?? 0]))
  return drivers.map((driver) => {
    const ledgerBalance = byDriver.get(driver.id) ?? 0
    const drift = driver.walletBalance - ledgerBalance
    return { ...driver, ledgerBalance, drift, inSync: Math.abs(drift) < 0.005 }
  })
}

export async function repairWalletCache({ driverId, note, reference, actorId, db = prisma }) {
  const cleanNote = String(note ?? '').trim()
  const cleanReference = String(reference ?? '').trim()
  const cleanActorId = String(actorId ?? '').trim()
  if (!cleanNote || !cleanReference || !cleanActorId) throw new PaymentError('AUDIT_NOTE_REQUIRED', 'Repair note, reference and actor are required', 400)
  if (cleanReference.length > 120 || cleanNote.length > 500) throw new PaymentError('INVALID_AUDIT_INPUT', 'Repair reference or note is too long', 400)
  return db.$transaction(async (tx) => {
    const prior = await tx.walletCacheRepairAudit.findUnique({ where: { reference: cleanReference } })
    if (prior) {
      if (prior.driverId !== driverId || prior.note !== cleanNote || prior.actorId !== cleanActorId) {
        throw new PaymentError('IDEMPOTENCY_CONFLICT', 'Repair reference was already used for different terms', 409)
      }
      return {
        driverId: prior.driverId,
        before: prior.beforeBalance,
        ledgerBalance: prior.ledgerBalance,
        repaired: prior.repaired,
        note: prior.note,
        reference: prior.reference,
        alreadyApplied: true,
      }
    }
    const entries = await tx.walletEntry.findMany({ where: { driverId }, select: { amount: true } })
    const ledgerBalance = entries.reduce((sum, row) => sum + row.amount, 0)
    const driver = await tx.driver.findUnique({ where: { id: driverId }, select: { walletBalance: true } })
    if (!driver) throw new PaymentError('DRIVER_NOT_FOUND', 'Driver not found', 404)
    const before = driver.walletBalance
    const repaired = Math.abs(before - ledgerBalance) >= 0.005
    if (repaired) {
      await tx.driver.update({ where: { id: driverId }, data: { walletBalance: ledgerBalance } })
    }
    await tx.walletCacheRepairAudit.create({
      data: {
        driverId,
        reference: cleanReference,
        note: cleanNote,
        actorId: cleanActorId,
        beforeBalance: before,
        ledgerBalance,
        repaired,
      },
    })
    return { driverId, before, ledgerBalance, repaired, note: cleanNote, reference: cleanReference, alreadyApplied: false }
  })
}
