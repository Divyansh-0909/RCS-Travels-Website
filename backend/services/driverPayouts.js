import { prisma } from '../db/prisma.js'
import { PaymentError } from './paymentErrors.js'
import { createRazorpayXGateway } from './razorpayX.js'
import { postWalletEntry } from './wallet.js'
import { walletEvent } from './walletKeys.js'

const MIN_PAYOUT_SUBUNITS = 100
const ACTIVE_PAYOUT_STATUSES = ['pending', 'processing']

const cleanReference = (value) => String(value ?? '').trim()
const paise = (rupees) => Math.max(0, Math.round(Number(rupees) * 100))

function publicBatch(batch) {
  return {
    id: batch.id,
    reference: batch.reference,
    status: batch.status,
    createdBy: batch.createdBy,
    createdAt: batch.createdAt,
    executedAt: batch.executedAt,
    payouts: batch.payouts ?? undefined,
  }
}

function providerState(status) {
  switch (status) {
    case 'processed': return 'paid'
    case 'reversed': return 'reversed'
    case 'cancelled':
    case 'rejected':
    case 'failed': return 'failed'
    default: return 'processing'
  }
}

async function recomputeBatchStatus(batchId, db = prisma) {
  const payouts = await db.driverPayout.findMany({ where: { batchId }, select: { status: true } })
  const hasOpen = payouts.some((row) => ACTIVE_PAYOUT_STATUSES.includes(row.status))
  const allPaid = payouts.length > 0 && payouts.every((row) => row.status === 'paid')
  const status = hasOpen ? 'processing' : allPaid ? 'completed' : 'partial'
  return db.driverPayoutBatch.update({
    where: { id: batchId },
    data: { status, ...(!hasOpen ? { executedAt: new Date() } : {}) },
  })
}

/**
 * @param {{ createdBy: string, reference: string, driverIds?: string[] | null, db?: any }} input
 */
export async function createPayoutBatch({ createdBy, reference, driverIds = null, db = prisma }) {
  const actor = String(createdBy ?? '').trim()
  const ref = cleanReference(reference)
  if (!actor || !ref || ref.length > 120) throw new PaymentError('INVALID_PAYOUT_BATCH', 'Creator and stable payout reference are required', 400)
  const normalizedIds = Array.isArray(driverIds) ? [...new Set(driverIds.map(String).filter(Boolean))] : null

  const work = async (tx) => {
    const existing = await tx.driverPayoutBatch.findUnique({
      where: { reference: ref },
      include: { payouts: { orderBy: { createdAt: 'asc' } } },
    })
    if (existing) return { ...publicBatch(existing), alreadyApplied: true }

    const drivers = await tx.driver.findMany({
      where: {
        walletBalance: { gt: 0 },
        payoutUpiId: { not: null },
        payoutUpiVerifiedAt: { not: null },
        ...(normalizedIds ? { id: { in: normalizedIds } } : {}),
      },
      select: { id: true, name: true, walletBalance: true, payoutUpiId: true },
      orderBy: { id: 'asc' },
    })
    if (!drivers.length) throw new PaymentError('NO_ELIGIBLE_PAYOUTS', 'No captains have a verified payout account and positive available balance', 409)

    const active = await tx.driverPayout.findMany({
      where: { driverId: { in: drivers.map((driver) => driver.id) }, status: { in: ACTIVE_PAYOUT_STATUSES } },
      select: { driverId: true },
    })
    const activeIds = new Set(active.map((row) => row.driverId))
    const eligible = drivers
      .filter((driver) => !activeIds.has(driver.id))
      .map((driver) => ({ ...driver, amount: paise(driver.walletBalance) }))
      .filter((driver) => driver.amount >= MIN_PAYOUT_SUBUNITS)

    if (!eligible.length) throw new PaymentError('NO_ELIGIBLE_PAYOUTS', 'Eligible captains already have an open payout or their balance is below ₹1', 409)

    const batch = await tx.driverPayoutBatch.create({
      data: {
        reference: ref,
        createdBy: actor,
        payouts: {
          create: eligible.map((driver) => ({
            driverId: driver.id,
            amount: driver.amount,
            payoutUpiId: driver.payoutUpiId,
            idempotencyKey: `driver-payout:${ref}:${driver.id}`,
          })),
        },
      },
      include: { payouts: { orderBy: { createdAt: 'asc' } } },
    })
    return { ...publicBatch(batch), alreadyApplied: false }
  }

  if (!db.$transaction) return work(db)
  return db.$transaction(work, { isolationLevel: 'Serializable' })
}

async function applyProviderState(payoutId, provider, { db = prisma } = {}) {
  const state = providerState(provider.status)
  return db.$transaction(async (tx) => {
    const payout = await tx.driverPayout.findUnique({
      where: { id: payoutId },
      include: { driver: { select: { walletBalance: true } } },
    })
    if (!payout) throw new PaymentError('PAYOUT_NOT_FOUND', 'Payout not found', 404)

    if (state === 'paid') {
      await postWalletEntry(tx, {
        driverId: payout.driverId,
        amount: -(payout.amount / 100),
        type: 'payout',
        method: 'upi',
        eventKey: walletEvent.payout(payout.id),
        note: `RazorpayX payout ${provider.id}`,
      })
      return tx.driverPayout.update({
        where: { id: payout.id },
        data: {
          status: 'paid',
          externalPayoutId: provider.id,
          paidAt: payout.paidAt ?? new Date(),
          failureCode: null,
          failureReason: null,
        },
      })
    }

    if (state === 'reversed') {
      if (payout.status === 'paid') {
        await postWalletEntry(tx, {
          driverId: payout.driverId,
          amount: payout.amount / 100,
          type: 'payout_reversal',
          method: 'upi',
          eventKey: walletEvent.payoutReversal(payout.id),
          note: `RazorpayX reversed payout ${provider.id}`,
        })
      }
      return tx.driverPayout.update({
        where: { id: payout.id },
        data: { status: 'reversed', externalPayoutId: provider.id },
      })
    }

    if (state === 'failed') {
      return tx.driverPayout.update({
        where: { id: payout.id },
        data: {
          status: 'failed',
          externalPayoutId: provider.id ?? payout.externalPayoutId,
          failureCode: provider.failure_reason ?? provider.status,
          failureReason: provider.error?.description ?? provider.failure_reason ?? `Provider status: ${provider.status}`,
        },
      })
    }

    return tx.driverPayout.update({
      where: { id: payout.id },
      data: { status: 'processing', externalPayoutId: provider.id ?? payout.externalPayoutId },
    })
  })
}

async function executePayout(payout, { gateway, db }) {
  if (!ACTIVE_PAYOUT_STATUSES.includes(payout.status)) return payout
  if (payout.status === 'processing' && payout.externalPayoutId) {
    const provider = await gateway.fetchPayout(payout.externalPayoutId)
    return applyProviderState(payout.id, provider, { db })
  }

  const driver = await db.driver.findUnique({
    where: { id: payout.driverId },
    select: { name: true, walletBalance: true, payoutUpiId: true, payoutUpiVerifiedAt: true },
  })
  if (!driver || !driver.payoutUpiVerifiedAt || driver.payoutUpiId !== payout.payoutUpiId) {
    return db.driverPayout.update({
      where: { id: payout.id },
      data: { status: 'failed', failureCode: 'PAYOUT_ACCOUNT_CHANGED', failureReason: 'Verified payout destination changed before execution' },
    })
  }
  if (paise(driver.walletBalance) < payout.amount) {
    return db.driverPayout.update({
      where: { id: payout.id },
      data: { status: 'failed', failureCode: 'AVAILABLE_BALANCE_CHANGED', failureReason: 'Available wallet balance dropped before payout execution' },
    })
  }

  try {
    const provider = await gateway.createPayout({
      amount: payout.amount,
      currency: payout.currency,
      upiId: payout.payoutUpiId,
      name: driver.name,
      reference: payout.id,
      idempotencyKey: payout.idempotencyKey,
    })
    return applyProviderState(payout.id, provider, { db })
  } catch (error) {
    await db.driverPayout.update({
      where: { id: payout.id },
      data: {
        status: 'pending',
        failureCode: error.code ?? 'PAYOUT_GATEWAY_ERROR',
        failureReason: String(error.description ?? error.message ?? 'Payout request failed').slice(0, 500),
      },
    })
    throw error
  }
}

export async function executePayoutBatch(batchId, { gateway = createRazorpayXGateway(), db = prisma } = {}) {
  const batch = await db.driverPayoutBatch.findUnique({
    where: { id: batchId },
    include: { payouts: { orderBy: { createdAt: 'asc' } } },
  })
  if (!batch) throw new PaymentError('PAYOUT_BATCH_NOT_FOUND', 'Payout batch not found', 404)

  await db.driverPayoutBatch.update({ where: { id: batch.id }, data: { status: 'processing' } })
  const results = []
  for (const payout of batch.payouts) {
    try {
      results.push(await executePayout(payout, { gateway, db }))
    } catch (error) {
      results.push({ id: payout.id, status: 'pending', error: error.code ?? 'PAYOUT_GATEWAY_ERROR' })
    }
  }
  const updatedBatch = await recomputeBatchStatus(batch.id, db)
  return { batch: publicBatch(updatedBatch), payouts: results }
}

export async function refreshPayout(payoutId, { gateway = createRazorpayXGateway(), db = prisma } = {}) {
  const payout = await db.driverPayout.findUnique({ where: { id: payoutId } })
  if (!payout) throw new PaymentError('PAYOUT_NOT_FOUND', 'Payout not found', 404)
  if (!payout.externalPayoutId) return payout
  const provider = await gateway.fetchPayout(payout.externalPayoutId)
  const updated = await applyProviderState(payout.id, provider, { db })
  await recomputeBatchStatus(payout.batchId, db)
  return updated
}

export async function listPayoutBatches({ limit = 30, db = prisma } = {}) {
  return db.driverPayoutBatch.findMany({
    take: Math.min(100, Math.max(1, Number(limit) || 30)),
    orderBy: { createdAt: 'desc' },
    include: { payouts: { orderBy: { createdAt: 'asc' }, include: { driver: { select: { id: true, name: true, phone: true } } } } },
  })
}
