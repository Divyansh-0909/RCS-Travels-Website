import test from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import { createTestDatabase } from '../helpers/database.js'
import { assertPhase9Environment } from '../helpers/phase9Isolation.js'
import { createPhase9Lifecycle, forbidPhase9Consequences, phase9FinancialSnapshot,
  assertPhase9FinancialInvariants } from '../helpers/phase9Lifecycle.js'
import { claimBookingForDriver } from '../../services/driverAssignment.js'
import { applyCustomerCancellationInTransaction } from '../../services/customerCancellation.js'
import { RESPONSIBILITY_SHADOW_LEASE_MS } from '../../services/responsibilityShadowConfig.js'
import { sweepResponsibilityShadowAdjudication } from '../../services/responsibilityShadowAdjudication.js'
import { runPhase9ShadowProcess } from '../helpers/phase9ShadowProcess.js'

assertPhase9Environment(process.env)

async function setup(t, options) {
  const database = await createTestDatabase()
  t.after(() => database.close())
  const scenario = await createPhase9Lifecycle(database, options)
  t.after(() => scenario.close())
  return { ...scenario, database }
}
async function assigned(t, options) {
  const scenario = await setup(t, options)
  assert.equal((await scenario.deliver()).status, 200)
  assert.equal(await scenario.offer(), 1)
  assert.equal(await scenario.offer(), 0, 'retrying the actual scheduled worker cannot duplicate an offer')
  assert.equal(await scenario.accept(), 'claimed')
  return scenario
}
async function cancelled(t, options) {
  const scenario = await assigned(t, options)
  const row = await scenario.booking()
  const outcome = await scenario.cancel(row)
  assert.equal(outcome.status, 'confirmed')
  return { ...scenario, original: row, caseId: outcome.responsibilityCaseId }
}

test('Phase 9B: real scheduled booking through signed HTTP webhook, acceptance, cancellation, frozen V5 adapter and guarded shadow', async t => {
  const s = await cancelled(t)
  await forbidPhase9Consequences(s.db)
  const before = await assertPhase9FinancialInvariants(s.db, s.bookingId)
  const result = await s.shadow()
  assert.equal(result.outcomes[0].status, 'COMPLETED')
  const shadow = await s.db.responsibilityShadowResult.findFirstOrThrow({ where: { caseId: s.caseId } })
  assert.equal(shadow.mode, 'SHADOW')
  assert.equal(shadow.route, 'NEEDS_ADMIN_REVIEW', 'real cancellation evidence lacks affirmative automatic driver-fault authority')
  assert.equal((await s.db.responsibilityCase.findUniqueOrThrow({ where: { id: s.caseId } })).state, 'NEEDS_ADMIN_REVIEW')
  assert.equal((await s.booking()).status, 'confirmed')
  assert.equal((await s.booking()).driverId, null)
  assert.deepEqual(await phase9FinancialSnapshot(s.db), before)
  assert.equal(s.calls.length, 1)
  assert.equal((await s.shadow()).processed, 0, 'completed work is not reanalyzed')
})

test('Phase 9B: concurrent duplicate signed webhooks apply one capture and one confirmation', async t => {
  const s = await setup(t)
  const outcomes = await Promise.all([s.deliver(), s.deliver(), s.deliver(), s.deliver()])
  assert.deepEqual(outcomes.map(x => x.status), [200, 200, 200, 200])
  assert.equal(await s.db.razorpayWebhookEvent.count(), 1)
  assert.equal((await s.booking()).status, 'confirmed')
  await assertPhase9FinancialInvariants(s.db, s.bookingId)
})

test('Phase 9B: real webhook rejects invalid signature before any persisted payment effect', async t => {
  const s = await setup(t)
  assert.equal((await s.deliver({ validSignature: false })).status, 400)
  assert.equal((await s.booking()).status, 'payment_pending')
  assert.equal(await s.db.razorpayWebhookEvent.count(), 0)
  assert.equal((await s.deliver()).status, 200)
})

test('Phase 9B: competing driver acceptances commit one owner, one deposit and one capacity debit', async t => {
  const s = await setup(t)
  await s.db.driver.update({ where: { id: s.actors.driversByGroup.partner.id }, data: { group: 'rcs' } })
  await s.deliver()
  assert.equal(await s.offer(), 2)
  const outcomes = await Promise.all([s.accept(), s.accept(s.actors.driversByGroup.partner, s.database.connect())])
  assert.deepEqual(outcomes.sort(), ['booking_taken', 'claimed'])
  assert.equal(await s.db.rideOffer.count({ where: { bookingId: s.bookingId, status: 'accepted' } }), 1)
  assert.equal(await s.db.rideOffer.count({ where: { bookingId: s.bookingId, status: 'withdrawn' } }), 1)
  assert.equal(await s.db.walletEntry.count({ where: { bookingId: s.bookingId, type: 'deposit_hold' } }), 1)
  await assertPhase9FinancialInvariants(s.db, s.bookingId)
})

test('Phase 9B regression: stale pending offer cannot overwrite a rejection during assignment', async t => {
  const s = await setup(t)
  await s.deliver(); await s.offer()
  await s.db.rideOffer.updateMany({ where: { bookingId: s.bookingId }, data: { status: 'rejected' } })
  await assert.rejects(s.accept(), /OFFER_UNAVAILABLE/)
  assert.equal((await s.booking()).status, 'confirmed')
  assert.equal((await s.booking()).driverId, null)
  assert.equal((await s.db.driver.findUniqueOrThrow({ where: { id: s.actors.driversByGroup.rcs.id } })).vehicleCapacity, 4)
  assert.equal(await s.db.walletEntry.count({ where: { type: 'deposit_hold' } }), 0)
})

test('Phase 9B: infeasible capacity creates no assignment or invented responsibility evidence', async t => {
  const s = await setup(t)
  await s.deliver()
  await s.db.driver.updateMany({ data: { vehicleCapacity: 0 } })
  assert.equal(await s.offer(), 0)
  const row = await s.booking()
  assert.equal(await claimBookingForDriver(row, s.actors.driversByGroup.rcs, row.confirmedAt, undefined, s.claimOptions), 'no_room')
  assert.equal((await s.booking()).status, 'confirmed')
  assert.equal(await s.db.responsibilityCase.count(), 0, 'missing production detector is not fabricated')
})

test('Phase 9B: timed-out offline V5 transport respects retry time and commits one shadow result', async t => {
  const s = await cancelled(t, { timeoutOnce: true })
  await forbidPhase9Consequences(s.db)
  const before = await phase9FinancialSnapshot(s.db)
  const first = await s.shadow()
  assert.equal(first.outcomes[0].status, 'RETRYABLE')
  assert.equal((await s.shadow()).processed, 0)
  s.clock.advance(31_000)
  assert.equal((await s.shadow()).outcomes[0].status, 'COMPLETED')
  assert.equal(await s.db.responsibilityShadowResult.count(), 1)
  assert.equal(s.calls.length, 2)
  assert.deepEqual(await phase9FinancialSnapshot(s.db), before)
})

test('Phase 9B: a forcibly terminated worker is resumed in a new process without duplicate analysis or consequences', async t => {
  const s = await cancelled(t)
  await forbidPhase9Consequences(s.db)
  const before = await phase9FinancialSnapshot(s.db)
  assert.equal((await runPhase9ShadowProcess(s.database, s.clock, 'claim_then_crash')).crashed, true)
  assert.equal((await s.db.responsibilityAdjudicationWork.findFirstOrThrow()).status, 'PROCESSING')
  assert.equal((await s.shadow()).processed, 0)
  s.clock.advance(RESPONSIBILITY_SHADOW_LEASE_MS + 1)
  assert.deepEqual(await runPhase9ShadowProcess(s.database, s.clock, 'resume'), { processed: 1, calls: 1 })
  assert.deepEqual(await runPhase9ShadowProcess(s.database, s.clock, 'resume'), { processed: 0, calls: 0 })
  assert.equal(await s.db.responsibilityShadowResult.count(), 1)
  assert.equal((await s.db.responsibilityShadowResult.findFirstOrThrow()).route, 'NEEDS_ADMIN_REVIEW')
  assert.deepEqual(await phase9FinancialSnapshot(s.db), before)
})

test('Phase 9B: stopping shadow preserves its durable backlog and concurrent resume has one result with no consequences', async t => {
  const s = await cancelled(t)
  await forbidPhase9Consequences(s.db)
  const before = await phase9FinancialSnapshot(s.db)
  const queued = await s.db.responsibilityAdjudicationWork.findMany()
  assert.equal(queued.length, 1)
  const disabled = await sweepResponsibilityShadowAdjudication({ db: s.db, clock: s.clock,
    analyst: { analyzeResponsibilityCase: async () => assert.fail('disabled shadow must not call an analyst') },
    env: { RESPONSIBILITY_ADJUDICATION_MODE: 'disabled' } })
  assert.deepEqual(disabled, { status: 'DISABLED', processed: 0, outcomes: [] })
  assert.deepEqual(await s.db.responsibilityAdjudicationWork.findMany(), queued)
  assert.equal(s.calls.length, 0)
  const resumed = await Promise.all([s.shadow(), s.shadow()])
  assert.equal(resumed.reduce((sum, result) => sum + result.processed, 0), 1)
  assert.equal(s.calls.length, 1)
  assert.equal(await s.db.responsibilityShadowResult.count(), 1)
  assert.deepEqual(await phase9FinancialSnapshot(s.db), before)
})

test('Phase 9B regression: old driver cancellation cannot cancel a replacement assignment with the same status', async t => {
  const s = await cancelled(t)
  const dispatch = await s.booking()
  // Exercise the common assignment boundary; the legacy scheduled deposit lifecycle
  // is separately blocked/tested below until its ownership can be resolved safely.
  assert.equal(await claimBookingForDriver(dispatch, s.actors.driversByGroup.partner,
    dispatch.confirmedAt, undefined, s.claimOptions), 'claimed')
  const replacement = await s.booking()
  assert.equal(await s.cancel(s.original), null)
  assert.equal((await s.booking()).driverId, replacement.driverId)
  assert.equal((await s.booking()).status, 'assigned')
  assert.equal(await s.db.driverCancellation.count(), 1)
})

test('Phase 9B regression: original-driver hold is retained while a replacement funds its independent reservation', async t => {
  const s = await cancelled(t)
  assert.equal(await s.offer(), 1)
  assert.equal(await s.accept(s.actors.driversByGroup.partner), 'claimed')
  assert.equal((await s.booking()).status, 'assigned')
  assert.equal((await s.booking()).driverId, s.actors.driversByGroup.partner.id)
  assert.equal((await s.db.driver.findUniqueOrThrow({ where: { id: s.actors.driversByGroup.partner.id } })).walletBalance, 900)
  assert.equal(await s.db.walletEntry.count({ where: { bookingId: s.bookingId, type: 'deposit_hold' } }), 2)
})

test('Phase 9B: customer and driver cancellation race leaves one transition and one capacity release', async t => {
  const s = await assigned(t)
  const row = await s.db.booking.findUniqueOrThrow({ where: { id: s.bookingId }, include: { driver: true } })
  const outcomes = await Promise.all([
    s.cancel(row), s.database.connect().$transaction(tx => applyCustomerCancellationInTransaction(tx, {
      booking: row, cancellationCharge: 0, cancellationReason: 'Synthetic race', advanceDisposition: 'refund_pending',
    })),
  ])
  assert.equal(outcomes.filter(Boolean).length, 1)
  assert.equal((await s.db.driver.findUniqueOrThrow({ where: { id: row.driverId } })).vehicleCapacity, 4)
  assert.ok(['confirmed', 'cancelled'].includes((await s.booking()).status))
  assert.equal(await s.db.responsibilityLiability.count(), 0)
})

test('Phase 9 isolation: remote sockets and consequence writes fail closed', async t => {
  const socket = new net.Socket()
  assert.throws(() => socket.connect(443, 'provider.invalid'), /forbids non-loopback/)
  socket.destroy()
  const s = await cancelled(t)
  await forbidPhase9Consequences(s.db)
  await assert.rejects(s.db.driver.update({ where: { id: s.actors.driversByGroup.rcs.id }, data: { walletBalance: 9_999 } }), /PHASE9_CONSEQUENCE_FORBIDDEN/)
  await assert.rejects(s.db.$executeRawUnsafe('TRUNCATE wallet_entries'), /PHASE9_CONSEQUENCE_FORBIDDEN/)
  for (const table of ['bookings', 'payments', 'notification_deliveries', 'ride_offers',
    'responsibility_final_decisions', 'responsibility_liabilities', 'reliability_strikes',
    'reliability_blocks', 'driver_payouts', 'responsibility_compensations']) {
    await assert.rejects(s.db.$executeRawUnsafe(`DELETE FROM "${table}"`), /PHASE9_CONSEQUENCE_FORBIDDEN/)
    await assert.rejects(s.db.$executeRawUnsafe(`INSERT INTO "${table}" DEFAULT VALUES`), /PHASE9_CONSEQUENCE_FORBIDDEN/)
  }
  assert.equal((await s.shadow()).outcomes[0].status, 'COMPLETED')
  await assertPhase9FinancialInvariants(s.db, s.bookingId)
})
