import assert from 'node:assert/strict'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createTestDatabase } from './database.js'
import { createPhase9Lifecycle, phase9FinancialSnapshot } from './phase9Lifecycle.js'
import { applyCustomerCancellationInTransaction } from '../../services/customerCancellation.js'
import { customerCancellationChargePaise } from '../../services/cancellationPolicy.js'
import { refundPayment, refundScheduledCancellationAdvance } from '../../services/payments.js'
import { settleRideTransitionInTransaction } from '../../services/rideSettlement.js'
import { balancesFrom } from '../../services/walletKeys.js'

const receiptRoot = new URL('../../../output/phase9-financial-lifecycle-2026-10-09/receipts/', import.meta.url)
const sources = ['services/scheduledDepositLifecycle.js', 'services/scheduledOfferAcceptance.js',
  'services/customerCancellation.js', 'services/rideSettlement.js', 'services/refundProviderState.js',
  'services/commission.js', 'services/walletKeys.js', 'services/driverCancellations.js', 'tests/helpers/phase9Isolation.js']

export async function financialState(s) {
  const [financial, booking, offers, incidents, evidence, allocations, liabilityEntries, cases, shadowResults] = await Promise.all([
    phase9FinancialSnapshot(s.db), s.booking(), s.db.rideOffer.findMany({ orderBy: { id: 'asc' } }),
    s.db.driverCancellation.findMany({ orderBy: { createdAt: 'asc' } }),
    s.db.responsibilityEvidenceVersion.findMany({ orderBy: { createdAt: 'asc' } }),
    s.db.responsibilityCompensationAllocation.findMany({ orderBy: { id: 'asc' } }),
    s.db.responsibilityLiabilityEntry.findMany({ orderBy: { id: 'asc' } }),
    s.db.responsibilityCase.findMany({ orderBy: { id: 'asc' } }),
    s.db.responsibilityShadowResult.findMany({ orderBy: { id: 'asc' } }),
  ])
  return { booking, offers, incidents, evidence, allocations, liabilityEntries, cases, shadowResults, financial, provider: s.provider.snapshot() }
}

export async function setupFinancialJourney(t, options) {
  const database = await createTestDatabase()
  let s
  t.after(async () => {
    try {
      if (s) {
        const hashes = Object.fromEntries(await Promise.all(sources.map(async path => [path,
          createHash('sha256').update(await readFile(new URL(`../../${path}`, import.meta.url))).digest('hex')])) )
        await mkdir(receiptRoot, { recursive: true })
        await writeFile(new URL(`${t.name.replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 170)}-${s.bookingId}.json`, receiptRoot),
          JSON.stringify({ schema: 'phase9-lifecycle-receipt-v1', scenario: t.name,
            frozenV5: 'e484afc4c7fa724ea29af6edd962c48b814dc73a10e4f4a5e33833ad26afbe75',
            initial: s.initial, events: s.events, final: await financialState(s),
            providerHistory: s.provider.history, sourceHashes: hashes, syntheticOnly: true }, null, 2))
      }
    } finally {
      if (s) await s.close()
      await database.close()
    }
  })
  s = { ...await createPhase9Lifecycle(database, options), database, events: [] }
  s.initial = await financialState(s)
  s.record = (event, result = null) => s.events.push({ sequence: s.events.length + 1, at: s.clock.now(), event, result })
  return s
}

export async function assignJourney(s) {
  assert.equal((await s.deliver()).status, 200)
  s.record('signed advance capture')
  await s.offer()
  assert.equal(await s.accept(), 'claimed')
  s.record('original assignment accepted')
  return s
}

export async function customerCancelJourney(s, { atPickup = false, reason = null, connection = s.db } = {}) {
  const booking = await s.db.booking.findUniqueOrThrow({ where: { id: s.bookingId }, include: { driver: true } })
  const charge = customerCancellationChargePaise({ booking, driverAtPickup: atPickup, reason })
  const refundAmount = Math.max(0, booking.scheduledAdvancePaidAmount - charge)
  const disposition = !booking.scheduledAdvancePaidAmount ? 'awaiting_payment'
    : charge === 0 ? 'refund_pending' : refundAmount > 0 ? 'partial_refund_pending' : 'forfeited_to_driver'
  const moved = await connection.$transaction(tx => applyCustomerCancellationInTransaction(tx, {
    booking, cancellationCharge: charge / 100, cancellationReason: reason, advanceDisposition: disposition,
  }))
  s.record('customer cancellation', { moved, charge, refundAmount, disposition })
  return { moved, charge, refundAmount, disposition }
}

export async function requestJourneyRefund(s, amount = null, db = s.db) {
  const payment = await s.db.payment.findFirstOrThrow({ where: { bookingId: s.bookingId, purpose: 'scheduled_ride_advance' } })
  const input = { paymentId: payment.id, gateway: s.provider.gateway, db }
  const result = amount === null ? await refundPayment(input)
    : await refundScheduledCancellationAdvance({ ...input, amount })
  s.record('refund requested/reconciled', result)
  return result
}

export async function finishJourneyRefund(s, refundId, status = 'processed') {
  s.provider.setRefundState(refundId, status)
  const event = s.provider.queueRefundEvent(`refund.${status}`, refundId)
  assert.equal((await s.deliverEvent(event)).status, 200)
  s.record(`signed refund ${status}`, { refundId, event })
  return event
}

export async function transitionJourney(s, to, driver = s.actors.driversByGroup.rcs, connection = s.db, snapshot = null) {
  const booking = snapshot ?? await s.booking()
  s.clock.advance(1_000)
  const input = { booking, driver, from: booking.status, to, distanceKm: 0.01, accuracy: 5,
    capturedAt: s.clock.now().toISOString(), customerConfirmedCompletion: false }
  const moved = await connection.$transaction(tx => settleRideTransitionInTransaction(tx, input, s.clock.now()))
  s.record(`ride ${to}`, { moved, driverId: driver.id })
  return moved
}

export async function assertJourneyWallets(s, expectedHeld = {}) {
  const rows = await s.db.walletEntry.findMany()
  const drivers = await s.db.driver.findMany()
  for (const driver of drivers) {
    const balances = balancesFrom(rows.filter(row => row.driverId === driver.id))
    assert.equal(Math.round(balances.available * 100), Math.round(driver.walletBalance * 100))
    if (Object.hasOwn(expectedHeld, driver.id)) assert.equal(balances.held, expectedHeld[driver.id])
  }
  assert.equal(new Set(rows.map(row => row.eventKey)).size, rows.length)
  return rows
}

export const phase9ReceiptDirectory = fileURLToPath(receiptRoot)
