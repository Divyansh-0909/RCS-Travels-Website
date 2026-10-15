import assert from 'node:assert/strict'
import express from 'express'
import { createScheduledScenario } from './scheduledScenario.js'
import { createTestClock } from './testClock.js'
import { createRazorpayFake } from './razorpayFake.js'
import { assertCompensationInventoryInvariants, assertLiabilityInvariants } from './financialInvariants.js'
import { createBookingFromQuote } from '../../services/bookingCreation.js'
import { createOrderForPayment, processRazorpayWebhook, refundPayment } from '../../services/payments.js'
import { createRazorpayWebhookHandler } from '../../routes/payments.js'
import { offerScheduledRide } from '../../services/scheduledOffers.js'
import { sweepScheduledRides } from '../../services/assignScheduledRides.js'
import { claimBookingForDriver } from '../../services/driverAssignment.js'
import { applyScheduledOfferAcceptance } from '../../services/scheduledOfferAcceptance.js'
import { cancelDriverRideInTransaction } from '../../services/driverRideCancellation.js'
import { createJevV5ResponsibilityAnalyst } from '../../services/responsibilityJevV5.js'
import { evidenceCriteriaV5Questions } from '../../benchmarks/responsibility/evidenceCriteriaV5.js'
import { sweepResponsibilityShadowAdjudication } from '../../services/responsibilityShadowAdjudication.js'
import { postWalletEntry } from '../../services/wallet.js'
import { pickupPromiseForAssignment } from '../../services/driverDelay.js'

const noNotify = async () => {}
const CONSEQUENCE_TABLES = ['responsibility_final_decisions', 'responsibility_consequence_executions',
  'responsibility_liabilities', 'responsibility_liability_entries', 'responsibility_compensations',
  'responsibility_compensation_allocations', 'responsibility_appeal_windows', 'responsibility_finalization_handoffs',
  'reliability_strikes', 'reliability_blocks', 'wallet_entries', 'driver_payouts', 'driver_payout_batches', 'drivers',
  'bookings', 'payments', 'notification_deliveries', 'ride_offers', 'driver_cancellations', 'route_observations']

/** Install only on a migration-backed database issued by the existing disposable harness. */
export async function forbidPhase9Consequences(db) {
  const [identity] = await db.$queryRaw`SELECT current_database() AS name`
  assert.match(identity.name, /^rcs_verify_[a-f0-9]{32}$/)
  await db.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION phase9_forbid_consequence() RETURNS trigger
    LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'PHASE9_CONSEQUENCE_FORBIDDEN'; END $$`)
  for (const table of CONSEQUENCE_TABLES) {
    await db.$executeRawUnsafe(`CREATE TRIGGER phase9_no_consequence
      BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON "${table}"
      FOR EACH STATEMENT EXECUTE FUNCTION phase9_forbid_consequence()`)
  }
}

export async function phase9FinancialSnapshot(db) {
  const [payments, wallets, drivers, liabilities, compensation, finality, strikes, blocks, appeals, executions, payouts] = await Promise.all([
    db.payment.findMany({ orderBy: { id: 'asc' } }), db.walletEntry.findMany({ orderBy: { eventKey: 'asc' } }),
    db.driver.findMany({ orderBy: { id: 'asc' }, select: { id: true, walletBalance: true, vehicleCapacity: true } }),
    db.responsibilityLiability.count(), db.responsibilityCompensation.count(), db.responsibilityFinalDecision.count(),
    db.reliabilityStrike.count(), db.reliabilityBlock.count(), db.responsibilityAppealWindow.count(),
    db.responsibilityConsequenceExecution.count(), db.driverPayout.count(),
  ])
  return { payments, wallets, drivers, liabilities, compensation, finality, strikes, blocks, appeals, executions, payouts }
}

export async function assertPhase9FinancialInvariants(db, bookingId) {
  const booking = await db.booking.findUniqueOrThrow({ where: { id: bookingId } })
  const snapshot = await phase9FinancialSnapshot(db)
  const captured = snapshot.payments.filter(p => p.bookingId === bookingId && p.status === 'captured')
    .reduce((sum, p) => sum + p.amount, 0)
  assert.equal(captured, 10_000, 'one authoritative advance capture, in paise')
  assert.equal(booking.scheduledAdvancePaidAmount, captured, 'capture applied once to booking')
  assert.equal(captured + booking.scheduledRemainingAmount, 100_000, 'advance plus outstanding fare conserved')
  for (const driver of snapshot.drivers) {
    const balance = snapshot.wallets.filter(row => row.driverId === driver.id).reduce((sum, row) => sum + row.amount, 0)
    assert.equal(Math.round(driver.walletBalance * 100), Math.round(balance * 100), 'wallet cache equals real ledger')
  }
  for (const key of ['liabilities', 'compensation', 'finality', 'strikes', 'blocks', 'appeals', 'executions', 'payouts']) {
    assert.equal(snapshot[key], 0, `${key}: advisory shadow cannot create authority or effects`)
  }
  assertLiabilityInvariants({ finalizedPaise: 0, collectedPaise: 0, outstandingPaise: 0 })
  assertCompensationInventoryInvariants({ issuedPaise: 0, availablePaise: 0, reservedPaise: 0, consumedPaise: 0 })
  return snapshot
}

export async function createPhase9Lifecycle(database, { timeoutOnce = false, fare = 1_000,
  beforeBooking = async () => {}, clock: suppliedClock, navigation, deferBooking = false } = {}) {
  const db = database.client
  const [identity] = await db.$queryRaw`SELECT current_database() AS name`
  assert.equal(identity.name, database.name)
  assert.match(identity.name, /^rcs_verify_[a-f0-9]{32}$/)
  const clock = suppliedClock ?? createTestClock(new Date().toISOString())
  const actors = createScheduledScenario({ now: clock.now().toISOString() })
  // Reuse the existing actor factory, but create the booking through the real service.
  await actors.persistActors(db)
  await beforeBooking({ db, actors, clock })
  await db.$transaction(async tx => {
    for (const driver of actors.drivers) {
      await postWalletEntry(tx, { driverId: driver.id, amount: 1_000, type: 'adjustment',
        eventKey: `phase9-opening:${driver.id}`, note: 'Synthetic simulator opening balance' })
    }
  })
  const provider = createRazorpayFake({ clock })
  const calls = []
  const analyst = createJevV5ResponsibilityAnalyst({ client: { async systemOne(request, options) {
    assert.deepEqual(request.questions, evidenceCriteriaV5Questions())
    assert.equal(request.model, 'jev-latest')
    assert.deepEqual(options, { timeout: 60_000, retry: { maxRetries: 0 } })
    const call = { caseId: request.state.caseId, questions: Object.keys(request.questions), response: null }
    calls.push(call)
    if (timeoutOnce && calls.length === 1) {
      const error = new Error('Synthetic provider timeout')
      error.code = 'ETIMEDOUT'
      throw error
    }
    const answers = Object.fromEntries(Object.keys(request.questions).map(key => [key, { choice: 'NO', confidence: 0.97 }]))
    answers.responsibility.choice = 'DRIVER_CAUSED'
    answers.evidenceSufficient.choice = 'YES'
    answers.ordinaryDriverFailure.choice = 'YES'
    call.response = { model: 'jev-1.13.0', answers, usage: { input_tokens: 0, output_tokens: 0 } }
    return call.response
  } } })
  const created = deferBooking ? null : await createBookingFromQuote({ user: actors.customer,
    quote: { fares: { sedan: { solo: fare, toll: 0, airport: 0, carrier: 0 } }, distanceKm: 4.2, durationMin: 18 },
    pickupAddress: 'Synthetic Delhi pickup', pickupLat: 28.6129, pickupLng: 77.2295,
    dropAddress: 'Synthetic Delhi drop', dropLat: 28.6315, dropLng: 77.2167,
    vehicleClass: 'sedan', scheduledAt: new Date(clock.now().getTime() + 2 * 60 * 60 * 1_000).toISOString(),
  }, { db, createOrder: args => createOrderForPayment({ ...args, gateway: provider.gateway, clock }) })
  let bookingId = created?.bookingId ?? null
  let eventId = null
  const adoptBooking = async id => {
    assert.equal(bookingId, null, 'Only one UI-created booking can be adopted')
    const row = await db.booking.findUniqueOrThrow({ where: { id } })
    assert.equal(row.userId, actors.customer.id)
    assert.equal(row.status, 'payment_pending')
    const payment = await db.payment.findFirstOrThrow({ where: { bookingId: id, purpose: 'scheduled_ride_advance' } })
    assert.ok(payment.razorpayOrderId)
    bookingId = id
    const external = provider.createPayment({ orderId: payment.razorpayOrderId, status: 'authorized' })
    return external
  }
  if (created) {
    assert.equal(created.status, 'payment_pending')
    assert.ok(created.payment, 'real service created a gateway order')
    const external = provider.createPayment({ orderId: created.payment.orderId, status: 'captured' })
    eventId = provider.queuePaymentEvent('payment.captured', external.id)
  }
  const app = express()
  app.post('/payments/webhook', express.raw({ type: 'application/json' }), createRazorpayWebhookHandler({
    processWebhook: args => processRazorpayWebhook({ ...args, db, gateway: provider.webhookGateway, notifyPayment: noNotify,
      refundPaymentFn: args => refundPayment({ ...args, db, gateway: provider.gateway }) }),
  }))
  app.use((error, _req, res, _next) => res.status(500).json({ error: error.code ?? 'SIMULATOR_ERROR' }))
  const server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener))
  })
  const address = `http://127.0.0.1:${server.address().port}/payments/webhook`
  const close = () => new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve())
    server.closeAllConnections()
  })
  const deliverEvent = (id, options = {}) => provider.deliverWebhook(id, async payload => {
    const response = await fetch(address, { method: 'POST', body: payload.rawBody,
      headers: { 'content-type': 'application/json', 'x-razorpay-signature': payload.signature, 'x-razorpay-event-id': payload.eventId } })
    return { status: response.status, body: await response.json() }
  }, options)
  const captureAdvance = () => {
    const payment = provider.snapshot().payments.find(row => row.order_id)
    assert.ok(payment)
    provider.setPaymentState(payment.id, 'captured')
    eventId = provider.queuePaymentEvent('payment.captured', payment.id)
  }
  const deliver = (options = {}) => deliverEvent(eventId, options)
  const booking = () => db.booking.findUniqueOrThrow({ where: { id: bookingId } })
  const offer = async ({ at } = {}) => {
    const current = await booking()
    // Adopt the real confirmation stamp, then control dispatch/assignment/retry time explicitly.
    clock.set(at ?? new Date(current.confirmedAt.getTime() + 61 * 60 * 1_000).toISOString())
    const before = await db.rideOffer.count({ where: { bookingId } })
    await sweepScheduledRides({ db, clock, reminders: noNotify, alert: noNotify,
      offer: (id, options) => offerScheduledRide(id, { ...options, push: noNotify }) })
    return (await db.rideOffer.count({ where: { bookingId } })) - before
  }
  const claimOptions = { db, clock,
    pickupPromise: (row, driverId, now) => pickupPromiseForAssignment(row, driverId, now, clock, { db, navigation }),
    notifyAssigned: noNotify, notifyPool: noNotify }
  const accept = async (driver = actors.driversByGroup.rcs, connection = db) => {
    const row = await booking()
    const pending = await connection.rideOffer.findFirstOrThrow({ where: { bookingId, driverId: driver.id } })
    return claimBookingForDriver(row, driver, row.confirmedAt,
      tx => applyScheduledOfferAcceptance(tx, { booking: row, driverId: driver.id, offerId: pending.id, clock }),
      { ...claimOptions, db: connection })
  }
  const cancel = (row, driver = actors.driversByGroup.rcs, connection = db) => connection.$transaction(tx =>
    cancelDriverRideInTransaction(tx, row, driver, { reason: 'rider_unreachable' }, { clock }))
  const shadow = () => sweepResponsibilityShadowAdjudication({ db, clock, analyst, batchSize: 25,
    env: { RESPONSIBILITY_ADJUDICATION_MODE: 'shadow' } })
  return { db, actors, clock, provider, calls, get bookingId() { return bookingId }, adoptBooking, captureAdvance, booking, deliver, deliverEvent, offer, accept, cancel, shadow, close, claimOptions }
}
