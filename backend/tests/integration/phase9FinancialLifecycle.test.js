import test from 'node:test'
import assert from 'node:assert/strict'
import { assertPhase9Environment } from '../helpers/phase9Isolation.js'
import { raceTransactions } from '../helpers/database.js'
import { setupFinancialJourney, assignJourney, customerCancelJourney, requestJourneyRefund,
  finishJourneyRefund, transitionJourney, assertJourneyWallets, financialState } from '../helpers/phase9FinancialJourneys.js'
import { forbidPhase9Consequences } from '../helpers/phase9Lifecycle.js'
import { applyCustomerCancellationInTransaction } from '../../services/customerCancellation.js'
import { settleRideTransitionInTransaction } from '../../services/rideSettlement.js'
import { applyRefundProviderState } from '../../services/refundProviderState.js'
import { providerOutcome } from '../helpers/providerPlan.js'
import { recordScheduledFinalCashPayment, ridePaymentView } from '../../services/ridePayments.ts'
import { createOrderForPayment } from '../../services/payments.js'
import { walletEvent } from '../../services/walletKeys.js'
import { seedEntitlement } from '../helpers/compensationFixture.js'
import { outstandingFinalizedLiabilityPaise } from '../../services/responsibilityLiabilityRecovery.js'
import { assertCompensationInventoryInvariants } from '../helpers/financialInvariants.js'

assertPhase9Environment(process.env)

async function replaced(t) {
  const s = await setupFinancialJourney(t)
  await assignJourney(s)
  const original = await s.booking()
  s.record('driver cancellation', await s.cancel(original))
  assert.equal(await s.offer(), 1)
  const replacement = s.actors.driversByGroup.partner
  assert.equal(await s.accept(replacement), 'claimed')
  s.record('replacement accepted', { driverId: replacement.id })
  return { ...s, original, replacement }
}

test('Phase 9 financial: replacement retains independent holds and stale original cancellation cannot release them', async t => {
  const s = await replaced(t)
  const before = await financialState(s)
  assert.equal(await s.cancel(s.original), null)
  assert.deepEqual(await financialState(s), before)
  await assertJourneyWallets(s, { [s.original.driverId]: 100, [s.replacement.id]: 100 })
  assert.equal(await customerCancelJourney(s).then(x => x.moved), true)
  const rows = await assertJourneyWallets(s, { [s.original.driverId]: 0, [s.replacement.id]: 0 })
  for (const driverId of [s.original.driverId, s.replacement.id]) {
    assert.equal(rows.filter(row => row.driverId === driverId && row.type === 'deposit_refund').reduce((sum, row) => sum + row.amount, 0), 100)
  }
  const first = await requestJourneyRefund(s)
  await finishJourneyRefund(s, first.refundId)
  const final = await financialState(s)
  assert.equal(await customerCancelJourney(s).then(x => x.moved), false)
  assert.equal((await requestJourneyRefund(s)).alreadyApplied, true)
  assert.deepEqual((await financialState(s)).financial, final.financial)
})

test('Phase 9 financial: replacement completion credits advance only to completing driver and returns every owner hold', async t => {
  const s = await replaced(t)
  await transitionJourney(s, 'reached', s.replacement)
  await transitionJourney(s, 'started', s.replacement)
  const started = await s.booking()
  assert.equal(await transitionJourney(s, 'completed', s.replacement), true)
  assert.equal(await transitionJourney(s, 'completed', s.replacement, s.db, started), false)
  await s.db.$transaction(tx => recordScheduledFinalCashPayment(tx, s.bookingId))
  await s.db.$transaction(tx => recordScheduledFinalCashPayment(tx, s.bookingId))
  const booking = await s.booking()
  assert.equal(ridePaymentView(booking).state, 'paid')
  assert.equal(booking.commissionPct, 10)
  assert.equal(booking.commissionAmt, 100)
  assert.equal(booking.scheduledAdvancePaidAmount + booking.scheduledFinalPaidAmount, Math.round(booking.customerPayment * 100))
  const entries = await assertJourneyWallets(s, { [s.original.driverId]: 0, [s.replacement.id]: 0 })
  const advance = entries.find(row => row.eventKey === walletEvent.rideCollection(s.bookingId, 'scheduled_ride_advance'))
  assert.equal(advance.driverId, s.replacement.id)
  assert.equal(advance.amount, 100)
  assert.equal(entries.filter(row => row.driverId === s.original.driverId && ['commission', 'ride_collection'].includes(row.type)).length, 0)
  assert.equal((await s.db.driver.findUniqueOrThrow({ where: { id: s.replacement.id } })).vehicleCapacity, 4)
})

test('Phase 9 financial: original driver cannot settle or customer-cancel a replacement with a stale same-status snapshot', async t => {
  const s = await replaced(t)
  const before = await financialState(s)
  assert.equal(await transitionJourney(s, 'en_route', s.actors.driversByGroup.rcs, s.db, s.original), false)
  assert.equal(await s.db.$transaction(tx => applyCustomerCancellationInTransaction(tx, {
    booking: s.original, cancellationCharge: 100, advanceDisposition: 'forfeited_to_driver',
  })), false)
  assert.deepEqual(await financialState(s), before)
})

test('Phase 9 financial: incompatible replacement commitment fails without changing either reservation', async t => {
  const s = await setupFinancialJourney(t)
  await assignJourney(s)
  await s.cancel(await s.booking())
  await s.offer()
  const driver = s.actors.driversByGroup.partner
  await s.db.driver.update({ where: { id: driver.id }, data: { vehicleCapacity: 0 } })
  const before = await financialState(s)
  assert.equal(await s.accept(driver), 'no_room')
  assert.deepEqual(await financialState(s), before)
  await s.db.driver.update({ where: { id: driver.id }, data: { vehicleCapacity: 4 } })
  assert.equal(await s.accept(driver), 'claimed')
  await assertJourneyWallets(s, { [driver.id]: 100 })
})

test('Phase 9 financial: replacement versus customer cancellation uses actual row locks and one winner', async t => {
  const s = await setupFinancialJourney(t)
  await assignJourney(s)
  await s.cancel(await s.booking()); await s.offer()
  const booking = await s.booking()
  const result = await raceTransactions(s.database, [
    async (tx, ready) => { await ready(); return s.accept(s.actors.driversByGroup.partner,
      { rideOffer: tx.rideOffer, $transaction: work => work(tx) }) },
    async (tx, ready) => { await ready(); return applyCustomerCancellationInTransaction(tx, {
      booking, cancellationCharge: 0, advanceDisposition: 'refund_pending',
    }) },
  ])
  for (const row of result) assert.equal(row.status, 'fulfilled')
  const final = await s.booking()
  if (final.status === 'cancelled') {
    assert.equal(final.driverId, null)
    await assertJourneyWallets(s, { [s.actors.driversByGroup.rcs.id]: 0, [s.actors.driversByGroup.partner.id]: 0 })
  } else {
    assert.equal(final.status, 'assigned')
    assert.equal(result[1].value, false)
    await assertJourneyWallets(s, { [s.actors.driversByGroup.rcs.id]: 100, [s.actors.driversByGroup.partner.id]: 100 })
  }
  s.record('replacement/cancellation barrier race', result)
})

for (const scenario of ['lost-response', 'timeout', 'crash-before-ack']) {
  test(`Phase 9 financial: refund ${scenario} reconciles one stable provider operation`, async t => {
    const s = await setupFinancialJourney(t)
    await s.deliver(); await customerCancelJourney(s)
    let first
    if (scenario === 'lost-response') {
      s.provider.planNext('refund', providerOutcome.LOST_RESPONSE)
      first = await requestJourneyRefund(s)
    } else if (scenario === 'timeout') {
      s.provider.planNext('refund', providerOutcome.TIMEOUT)
      await assert.rejects(requestJourneyRefund(s), /timed out/)
    } else {
      let crashed = false
      const db = { payment: s.db.payment, $transaction: work => {
        if (!crashed) { crashed = true; throw new Error('Synthetic crash before provider acknowledgement') }
        return s.db.$transaction(work)
      } }
      await assert.rejects(requestJourneyRefund(s, null, db), /Synthetic crash/)
      assert.equal(s.provider.snapshot().refunds.length, 1)
    }
    const recovered = await requestJourneyRefund(s)
    if (first) assert.equal(first.refundId, recovered.refundId)
    assert.equal(s.provider.snapshot().refunds.length, 1)
    const event = await finishJourneyRefund(s, recovered.refundId)
    await s.deliverEvent(event); await s.deliverEvent(event)
    assert.equal((await s.booking()).scheduledAdvanceDisposition, 'refunded')
    assert.equal((await requestJourneyRefund(s)).alreadyApplied, true)
    const payment = await s.db.payment.findFirstOrThrow({ where: { bookingId: s.bookingId } })
    assert.equal(payment.refundOperationStatus, 'succeeded')
    assert.equal(payment.refundRequestedAmount, 10_000)
    assert.ok(s.provider.history.refunds.every(row => row.request.idempotencyKey === payment.refundRequestKey))
    await assertJourneyWallets(s)
  })
}

test('Phase 9 financial regression: a late pending acknowledgement and failed webhook cannot regress a processed refund', async t => {
  const s = await setupFinancialJourney(t)
  await s.deliver(); await customerCancelJourney(s)
  const result = await requestJourneyRefund(s)
  const stale = await s.db.payment.findFirstOrThrow({ where: { bookingId: s.bookingId } })
  const pending = s.provider.refund(result.refundId)
  await finishJourneyRefund(s, result.refundId)
  assert.equal((await s.db.$transaction(tx => applyRefundProviderState(tx, stale, pending))).result, 'terminal_refund')
  await finishJourneyRefund(s, result.refundId, 'failed')
  const final = await s.db.payment.findUniqueOrThrow({ where: { id: stale.id } })
  assert.equal(final.status, 'refunded')
  assert.equal(final.refundOperationStatus, 'succeeded')
  assert.equal((await s.booking()).scheduledAdvanceDisposition, 'refunded')
})

test('Phase 9 financial: terminal provider failure stays unresolved without another automatic refund', async t => {
  const s = await setupFinancialJourney(t)
  await s.deliver(); await customerCancelJourney(s)
  const result = await requestJourneyRefund(s)
  await finishJourneyRefund(s, result.refundId, 'failed')
  const payment = await s.db.payment.findFirstOrThrow({ where: { bookingId: s.bookingId } })
  assert.equal(payment.status, 'captured')
  assert.equal(payment.refundOperationStatus, 'failed')
  assert.equal((await s.booking()).scheduledAdvanceDisposition, 'refund_pending')
  assert.equal(s.provider.snapshot().refunds.length, 1)
  assert.equal((await s.booking()).status, 'cancelled')
})

test('Phase 9 financial regression: a delayed payment failure cannot erase a pending refund', async t => {
  const s = await setupFinancialJourney(t)
  await s.deliver(); await customerCancelJourney(s)
  const result = await requestJourneyRefund(s)
  const payment = await s.db.payment.findFirstOrThrow({ where: { bookingId: s.bookingId } })
  const event = s.provider.queuePaymentEvent('payment.failed', payment.razorpayPaymentId)
  assert.equal((await s.deliverEvent(event)).status, 200)
  assert.equal((await s.db.payment.findUniqueOrThrow({ where: { id: payment.id } })).status, 'refund_pending')
  await finishJourneyRefund(s, result.refundId)
  assert.equal((await s.booking()).scheduledAdvanceDisposition, 'refunded')
})

test('Phase 9 financial: arrival cancellation retains approved charge and returns only excess advance', async t => {
  const s = await setupFinancialJourney(t, { fare: 2_000 })
  await assignJourney(s); await transitionJourney(s, 'reached')
  const cancellation = await customerCancelJourney(s, { atPickup: true })
  assert.equal(cancellation.charge, 10_000)
  assert.equal(cancellation.refundAmount, 10_000)
  const result = await requestJourneyRefund(s, cancellation.refundAmount)
  await finishJourneyRefund(s, result.refundId)
  const payment = await s.db.payment.findFirstOrThrow({ where: { bookingId: s.bookingId } })
  assert.equal(payment.status, 'captured', 'partial refund preserves original capture')
  assert.equal((await s.booking()).scheduledAdvanceDisposition, 'partially_refunded')
  assert.equal(payment.amount - s.provider.refund(result.refundId).amount, cancellation.charge)
  assert.equal(await customerCancelJourney(s, { atPickup: true }).then(x => x.moved), false)
  const rows = await assertJourneyWallets(s, { [s.actors.driversByGroup.rcs.id]: 0 })
  assert.equal(rows.filter(row => row.type === 'cancellation_compensation').length, 1)
  assert.equal(rows.find(row => row.type === 'cancellation_compensation').amount, 100)
})

test('Phase 9 financial: authorized rider waiver at arrival returns full advance without driver compensation', async t => {
  const s = await setupFinancialJourney(t)
  await assignJourney(s); await transitionJourney(s, 'reached')
  assert.equal((await customerCancelJourney(s, { atPickup: true, reason: 'driver_asked_to_cancel' })).charge, 0)
  const result = await requestJourneyRefund(s); await finishJourneyRefund(s, result.refundId)
  assert.equal(await s.db.walletEntry.count({ where: { type: 'cancellation_compensation' } }), 0)
  await assertJourneyWallets(s, { [s.actors.driversByGroup.rcs.id]: 0 })
})

test('Phase 9 financial: cancellation racing delayed capture cannot confirm a cancelled booking and refunds exactly once', async t => {
  const s = await setupFinancialJourney(t)
  const result = await customerCancelJourney(s)
  assert.equal(result.disposition, 'awaiting_payment')
  assert.equal((await s.deliver()).status, 200)
  assert.equal((await s.deliver()).status, 200)
  assert.equal((await s.booking()).status, 'cancelled')
  assert.equal(s.provider.snapshot().refunds.length, 1)
  await finishJourneyRefund(s, s.provider.snapshot().refunds[0].id)
  assert.equal((await s.booking()).scheduledAdvanceDisposition, 'refunded')
})

test('Phase 9 financial: duplicate completion is one terminal transition and one settlement', async t => {
  const s = await setupFinancialJourney(t)
  await assignJourney(s); await transitionJourney(s, 'reached'); await transitionJourney(s, 'started')
  const booking = await s.booking()
  const input = { booking, driver: s.actors.driversByGroup.rcs, from: 'started', to: 'completed',
    distanceKm: 0.01, accuracy: 5, capturedAt: s.clock.now().toISOString(), customerConfirmedCompletion: false }
  const results = await raceTransactions(s.database, [0, 1].map(() => async (tx, ready) => {
    await ready(); return settleRideTransitionInTransaction(tx, input, s.clock.now())
  }))
  assert.deepEqual(results.map(row => row.value).sort(), [false, true])
  for (const row of results) assert.equal(row.status, 'fulfilled')
  assert.equal(await s.db.walletEntry.count({ where: { type: 'commission' } }), 1)
  assert.equal(await s.db.walletEntry.count({ where: { type: 'deposit_refund' } }), 1)
  assert.equal((await s.db.driver.findUniqueOrThrow({ where: { id: booking.driverId } })).vehicleCapacity, 4)
  s.record('duplicate completion barrier race', results)
})

test('Phase 9 financial: final platform payment passes the actual signed webhook and cannot pay twice', async t => {
  const s = await setupFinancialJourney(t)
  await assignJourney(s); await transitionJourney(s, 'reached'); await transitionJourney(s, 'started'); await transitionJourney(s, 'completed')
  const final = await s.db.payment.findFirstOrThrow({ where: { bookingId: s.bookingId, purpose: 'scheduled_ride_final' } })
  const checkout = await createOrderForPayment({ paymentId: final.id, userId: s.actors.customer.id, db: s.db,
    gateway: s.provider.gateway, clock: s.clock })
  const captured = s.provider.createPayment({ orderId: checkout.orderId, status: 'captured' })
  const event = s.provider.queuePaymentEvent('payment.captured', captured.id)
  assert.equal((await s.deliverEvent(event)).status, 200)
  assert.equal((await s.deliverEvent(event)).status, 200)
  const booking = await s.booking()
  assert.equal(ridePaymentView(booking).state, 'paid')
  assert.equal(booking.scheduledAdvancePaidAmount + booking.scheduledFinalPaidAmount, 100_000)
  const rows = await assertJourneyWallets(s, { [booking.driverId]: 0 })
  assert.equal(rows.filter(row => row.type === 'ride_collection').reduce((sum, row) => sum + row.amount, 0), 1_000)
  assert.equal(rows.filter(row => row.type === 'commission').reduce((sum, row) => sum + row.amount, 0), -100)
  s.record('final signed capture', { event })
})

test('Phase 9 financial: below-floor completion charges zero commission and shadow cannot change terminal finances', async t => {
  const s = await setupFinancialJourney(t, { fare: 700 })
  await assignJourney(s)
  const incident = await s.cancel(await s.booking())
  await s.offer(); const replacement = s.actors.driversByGroup.partner
  assert.equal(await s.accept(replacement), 'claimed')
  await transitionJourney(s, 'reached', replacement); await transitionJourney(s, 'started', replacement); await transitionJourney(s, 'completed', replacement)
  assert.equal((await s.booking()).commissionAmt, 0)
  await forbidPhase9Consequences(s.db)
  const before = await financialState(s)
  assert.equal((await s.shadow()).outcomes[0].status, 'COMPLETED')
  assert.deepEqual((await financialState(s)).financial, before.financial)
  assert.equal((await s.db.responsibilityCase.findUniqueOrThrow({ where: { id: incident.responsibilityCaseId } })).state, 'NEEDS_ADMIN_REVIEW')
})

test('Phase 9 financial: two replacement drivers race for one owner and one additional hold', async t => {
  const s = await setupFinancialJourney(t)
  await assignJourney(s); await s.cancel(await s.booking())
  const drivers = [s.actors.driversByGroup.admin, s.actors.driversByGroup.partner]
  await s.db.driver.updateMany({ where: { id: { in: drivers.map(row => row.id) } }, data: { group: 'partner' } })
  assert.equal(await s.offer(), 2)
  const results = await raceTransactions(s.database, drivers.map(driver => async (tx, ready) => {
    await ready(); return s.accept(driver, { rideOffer: tx.rideOffer, $transaction: work => work(tx) })
  }))
  for (const row of results) assert.equal(row.status, 'fulfilled')
  assert.deepEqual(results.map(row => row.value).sort(), ['booking_taken', 'claimed'])
  assert.equal(await s.db.walletEntry.count({ where: { type: 'deposit_hold' } }), 2)
  assert.equal(await s.db.rideOffer.count({ where: { bookingId: s.bookingId, status: 'accepted' } }), 2)
  await assertJourneyWallets(s)
  s.record('replacement acceptance barrier race', results)
})

test('Phase 9 financial regression: a foreign booking deposit cannot authorize acceptance or terminal release', async t => {
  const s = await setupFinancialJourney(t)
  await assignJourney(s); await s.cancel(await s.booking()); await s.offer()
  const foreign = await s.db.booking.create({ data: s.actors.bookingStates.previous })
  await s.db.walletEntry.update({ where: { eventKey: walletEvent.depositHold(s.bookingId) }, data: { bookingId: foreign.id } })
  const before = await financialState(s)
  await assert.rejects(s.accept(s.actors.driversByGroup.partner), /DEPOSIT_OWNER_CONFLICT/)
  assert.deepEqual(await financialState(s), before)
  assert.equal(await s.db.walletEntry.count({ where: { bookingId: foreign.id, type: 'deposit_refund' } }), 0)
  assert.equal((await s.db.booking.findUniqueOrThrow({ where: { id: foreign.id } })).status, foreign.status)
})

test('Phase 9 financial: started ride completion wins over unsupported self-cancellation without a duplicate effect', async t => {
  const s = await setupFinancialJourney(t)
  await assignJourney(s); await transitionJourney(s, 'reached'); await transitionJourney(s, 'started')
  const booking = await s.booking()
  const results = await raceTransactions(s.database, [
    async (tx, ready) => { await ready(); return settleRideTransitionInTransaction(tx, {
      booking, driver: s.actors.driversByGroup.rcs, from: 'started', to: 'completed',
      distanceKm: 0.01, accuracy: 5, capturedAt: s.clock.now().toISOString(), customerConfirmedCompletion: false,
    }, s.clock.now()) },
    async (tx, ready) => { await ready(); return applyCustomerCancellationInTransaction(tx, { booking, cancellationCharge: 0 }) },
  ])
  assert.deepEqual(results.map(row => row.value), [true, false])
  for (const row of results) assert.equal(row.status, 'fulfilled')
  assert.equal((await s.booking()).status, 'completed')
  assert.equal(await s.db.walletEntry.count({ where: { type: 'commission' } }), 1)
  await assertJourneyWallets(s, { [booking.driverId]: 0 })
  s.record('completion/cancellation barrier race', results)
})

test('Phase 9 financial: confirmation transaction failure rolls back webhook receipt and recovers the original capture', async t => {
  const s = await setupFinancialJourney(t)
  await s.db.$executeRawUnsafe(`CREATE FUNCTION phase9_fail_confirmation() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.status = 'confirmed' THEN RAISE EXCEPTION 'PHASE9_CONFIRMATION_CRASH'; END IF; RETURN NEW; END $$`)
  await s.db.$executeRawUnsafe(`CREATE TRIGGER phase9_confirmation_crash BEFORE UPDATE ON bookings
    FOR EACH ROW EXECUTE FUNCTION phase9_fail_confirmation()`)
  assert.equal((await s.deliver()).status, 500)
  assert.equal((await s.booking()).status, 'payment_pending')
  assert.equal(await s.db.razorpayWebhookEvent.count(), 0)
  await s.db.$executeRawUnsafe('DROP TRIGGER phase9_confirmation_crash ON bookings')
  assert.equal((await s.deliver()).status, 200)
  assert.equal((await s.deliver()).status, 200)
  assert.equal(await s.db.razorpayWebhookEvent.count(), 1)
  assert.equal((await s.booking()).scheduledAdvancePaidAmount, 10_000)
  assert.equal(s.provider.snapshot().payments.length, 1)
  s.record('confirmation crash then replay original signed capture')
})

async function compensatedJourney(t) {
  let entitlement
  const s = await setupFinancialJourney(t, { beforeBooking: async ({ db, actors, clock }) => {
    await db.booking.create({ data: actors.bookingStates.previous })
    entitlement = await seedEntitlement(db, actors, clock.now())
  } })
  return { ...s, entitlement }
}

test('Phase 9 financial: cancellation releases preexisting compensation in full without consuming it for a charge', async t => {
  const s = await compensatedJourney(t)
  await assignJourney(s); await transitionJourney(s, 'reached')
  assert.equal((await s.booking()).scheduledAdvancePaidAmount, 9_000)
  assert.equal((await customerCancelJourney(s, { atPickup: true })).charge, 9_000)
  const allocations = await s.db.responsibilityCompensationAllocation.findMany({ where: { bookingId: s.bookingId } })
  assert.equal(allocations.length, 1); assert.equal(allocations[0].status, 'RELEASED')
  assertCompensationInventoryInvariants({ issuedPaise: 10_000, availablePaise: 10_000, reservedPaise: 0, consumedPaise: 0 })
  assert.equal(await outstandingFinalizedLiabilityPaise(s.actors.driversByGroup.rcs.id, { db: s.db }), 10_000)
  assert.equal(await s.db.responsibilityLiabilityEntry.count({ where: { kind: 'RECOVERED' } }), 0)
  await assertJourneyWallets(s)
})

test('Phase 9 financial: completion consumes existing compensation and recovers only finalized liability from controlled earnings', async t => {
  const s = await compensatedJourney(t)
  await assignJourney(s); await transitionJourney(s, 'reached'); await transitionJourney(s, 'started')
  const snapshot = await s.booking()
  assert.equal(await transitionJourney(s, 'completed'), true)
  assert.equal(await transitionJourney(s, 'completed', s.actors.driversByGroup.rcs, s.db, snapshot), false)
  await s.db.$transaction(tx => recordScheduledFinalCashPayment(tx, s.bookingId))
  const booking = await s.booking()
  const allocations = await s.db.responsibilityCompensationAllocation.findMany({ where: { bookingId: s.bookingId } })
  assert.equal(allocations[0].status, 'CONSUMED')
  assert.equal(booking.customerPayment, 900)
  assert.equal(booking.commissionAmt, 100, 'responsibility compensation does not reduce commission base')
  assert.equal(booking.scheduledAdvancePaidAmount + booking.scheduledFinalPaidAmount + allocations[0].amountPaise, 100_000)
  assert.equal(await outstandingFinalizedLiabilityPaise(booking.driverId, { db: s.db }), 0)
  const recovery = await s.db.responsibilityLiabilityEntry.findMany({ where: { kind: 'RECOVERED' } })
  assert.equal(recovery.reduce((sum, row) => sum + row.amountPaise, 0), 10_000)
  const rows = await assertJourneyWallets(s, { [booking.driverId]: 0 })
  assert.equal(rows.filter(row => row.type === 'liability_recovery').reduce((sum, row) => sum + row.amount, 0), -100)
  assert.equal(rows.filter(row => row.type === 'responsibility_compensation_funding').reduce((sum, row) => sum + row.amount, 0), 100)
  assertCompensationInventoryInvariants({ issuedPaise: 10_000, availablePaise: 0, reservedPaise: 0, consumedPaise: 10_000 })
})
