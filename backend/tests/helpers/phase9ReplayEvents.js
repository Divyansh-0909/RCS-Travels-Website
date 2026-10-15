import assert from 'node:assert/strict'
import { executePhase9DeviceEvent } from './phase9ReplayDeviceEvents.js'
import { cancelCustomerWithEvidenceInTransaction, requestLateDriverRecoveryInTransaction } from '../../services/customerLifecycleIncidents.js'
import { cancellationLocationDecision } from '../../services/cancellationLocationEvidence.js'
import { customerCancellationChargePaise } from '../../services/cancellationPolicy.js'
import { settleRideTransitionInTransaction } from '../../services/rideSettlement.js'
import { haversineDistanceKm, locationProblem, PICKUP_RADIUS_KM, completionGeofence } from '../../services/rideGeofence.js'
import { requestJourneyRefund, finishJourneyRefund } from './phase9FinancialJourneys.js'
import { recordScheduledFinalCashPayment } from '../../services/ridePayments.ts'
import { createOrderForPayment } from '../../services/payments.js'
import { sweepScheduledRides } from '../../services/assignScheduledRides.js'
import { offerScheduledRide } from '../../services/scheduledOffers.js'
import { forbidPhase9Consequences } from './phase9Lifecycle.js'
import { walletEvent } from '../../services/walletKeys.js'
import { providerOutcome } from './providerPlan.js'
import { executePhase9Race } from './phase9ReplayRaces.js'
import { applyRefundProviderState } from '../../services/refundProviderState.js'
import { getDriver } from '../../services/driverAssignment.js'

const silent = async () => {}
const driverFor = (s, event) => s.actors.driversByGroup[event.driver ?? 'rcs']
const current = s => s.db.booking.findUniqueOrThrow({ where: { id: s.bookingId }, include: { driver: { include: { location: true } } } })

async function customerCancellation(s, event) {
  const booking = event.snapshot ? s.snapshots.get(event.snapshot) : await current(s)
  const location = cancellationLocationDecision(booking, s.clock.now().getTime())
  const charge = customerCancellationChargePaise({ booking, driverAtPickup: location.driverAtPickup, reason: event.reason })
  const refundAmount = Math.max(0, booking.scheduledAdvancePaidAmount - charge)
  const disposition = !booking.scheduledAdvancePaidAmount ? 'awaiting_payment'
    : charge === 0 ? 'refund_pending' : refundAmount > 0 ? 'partial_refund_pending' : 'forfeited_to_driver'
  const moved = await s.db.$transaction(tx => cancelCustomerWithEvidenceInTransaction(tx,
    { booking, cancellationCharge: charge / 100, cancellationReason: event.reason, advanceDisposition: disposition },
    { location, clock: s.clock }))
  s.cancellation = { moved, charge, refundAmount, disposition }
  return s.cancellation
}

async function rideTransition(s, event) {
  const booking = event.snapshot ? s.snapshots.get(event.snapshot) : await s.booking()
  const driver = driverFor(s, event)
  const fix = { lat: event.lat ?? (event.to === 'completed' ? booking.dropLat : booking.pickupLat),
    lng: event.lng ?? (event.to === 'completed' ? booking.dropLng : booking.pickupLng),
    accuracy: event.accuracy ?? 5, capturedAt: s.clock.now().getTime() - (event.ageMs ?? 0), mocked: event.mocked }
  if (event.missing) delete fix.capturedAt
  if (['reached', 'started', 'completed'].includes(event.to) && locationProblem(fix, s.clock.now().getTime())) return 'LOCATION_REQUIRED'
  const target = event.to === 'completed' ? { lat: booking.dropLat, lng: booking.dropLng } : { lat: booking.pickupLat, lng: booking.pickupLng }
  const distanceKm = haversineDistanceKm(fix.lat, fix.lng, target.lat, target.lng)
  if (['reached', 'started'].includes(event.to) && distanceKm > PICKUP_RADIUS_KM) return 'PICKUP_GEOFENCE'
  if (event.to === 'completed' && completionGeofence(distanceKm) !== 'normal') return 'DROP_CONFIRMATION_REQUIRED'
  return s.db.$transaction(tx => settleRideTransitionInTransaction(tx, { booking, driver, from: booking.status,
    to: event.to, distanceKm, accuracy: fix.accuracy, capturedAt: new Date(fix.capturedAt).toISOString(),
    customerConfirmedCompletion: false }, s.clock.now()))
}

async function requestRefund(s, event) {
  let db = s.db
  if (event.crashBeforeAck) db = { payment: s.db.payment, $transaction: () => { throw new Error('SYNTHETIC_CRASH_BEFORE_ACK') } }
  try {
    const result = await requestJourneyRefund(s, event.excess ? s.cancellation.refundAmount : null, db)
    s.refundId = result.refundId ?? s.refundId
    if (result.refundId) {
      s.pendingRefund = s.provider.refund(result.refundId)
      s.refundPaymentSnapshot = await s.db.payment.findFirstOrThrow({ where: { bookingId: s.bookingId } })
    }
    return result
  } catch (error) {
    if (!event.expectError) throw error
    assert.match(error.message, new RegExp(event.expectError))
    return { expectedError: event.expectError }
  }
}

async function finalCapture(s) {
  const payment = await s.db.payment.findFirstOrThrow({ where: { bookingId: s.bookingId, purpose: 'scheduled_ride_final' } })
  const order = await createOrderForPayment({ paymentId: payment.id, userId: s.actors.customer.id,
    db: s.db, gateway: s.provider.gateway, clock: s.clock })
  const captured = s.provider.createPayment({ orderId: order.orderId, status: 'captured' })
  const eventId = s.provider.queuePaymentEvent('payment.captured', captured.id)
  const result = await s.deliverEvent(eventId)
  await s.deliverEvent(eventId)
  return result.status
}

const handlers = {
  redispatch: s => getDriver(s.bookingId, { db: s.db, clock: s.clock, push: silent }),
  race: executePhase9Race,
  capture: async (s, event) => (await s.deliver({ validSignature: event.validSignature ?? true })).status,
  offer: s => sweepScheduledRides({ db: s.db, clock: s.clock, reminders: silent, alert: silent,
    offer: (id, options) => offerScheduledRide(id, { ...options, push: silent }) }),
  accept: async (s, event) => {
    try { return await s.accept(driverFor(s, event)) } catch (error) {
      if (event.expectError !== error.message) throw error
      return error.message
    }
  },
  driver_cancel: async (s, event) => s.cancel(event.snapshot ? s.snapshots.get(event.snapshot) : await s.booking(), driverFor(s, event)),
  customer_cancel: customerCancellation,
  stale_cancel: customerCancellation,
  recovery: async s => s.db.$transaction(tx => requestLateDriverRecoveryInTransaction(tx, s.recoveryBooking, { clock: s.clock })),
  ride: rideTransition, stale_ride: rideTransition,
  cash: s => s.db.$transaction(tx => recordScheduledFinalCashPayment(tx, s.bookingId)),
  refund: requestRefund,
  refund_ack: s => s.db.$transaction(tx => applyRefundProviderState(tx, s.refundPaymentSnapshot, s.pendingRefund)),
  refund_callback: async (s, event) => {
    const refundId = s.refundId ?? s.provider.snapshot().refunds[0].id
    return finishJourneyRefund(s, refundId, event.status ?? 'processed')
  },
  payment_failed: async s => {
    const payment = await s.db.payment.findFirstOrThrow({ where: { bookingId: s.bookingId } })
    return (await s.deliverEvent(s.provider.queuePaymentEvent('payment.failed', payment.razorpayPaymentId))).status
  },
  confirmation_fault: async (s, event) => {
    if (!event.enabled) return s.db.$executeRawUnsafe('DROP TRIGGER phase9_confirmation_crash ON bookings')
    await s.db.$executeRawUnsafe(`CREATE FUNCTION phase9_fail_confirmation() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.status = 'confirmed' THEN RAISE EXCEPTION 'PHASE9_CONFIRMATION_CRASH'; END IF; RETURN NEW; END $$`)
    return s.db.$executeRawUnsafe(`CREATE TRIGGER phase9_confirmation_crash BEFORE UPDATE ON bookings
      FOR EACH ROW EXECUTE FUNCTION phase9_fail_confirmation()`)
  },
  provider_fault: (s, event) => { s.provider.planNext('refund', providerOutcome[event.outcome]); return event.outcome },
  snapshot: async (s, event) => { const row = await current(s); s.snapshots.set(event.name, row); s.recoveryBooking = row; return event.name },
  checkpoint: s => s.db.$queryRaw`SELECT 1 AS durable`,
  restart: async s => { await s.db.$disconnect(); await s.booking(); return 'RECONNECTED' },
  forbid: async s => { await forbidPhase9Consequences(s.db); return 'INSTALLED' },
  shadow: s => s.shadow(),
  final_capture: finalCapture,
  foreign_hold: async s => {
    const booking = await s.db.booking.create({ data: s.actors.bookingStates.previous })
    await s.db.walletEntry.update({ where: { eventKey: walletEvent.depositHold(s.bookingId) }, data: { bookingId: booking.id } })
    return 'FOREIGN_HOLD'
  },
}

export async function executePhase9Event(s, event) {
  if (handlers[event.type]) return (await handlers[event.type](s, event)) ?? null
  const result = await executePhase9DeviceEvent(s, event)
  if (result === undefined) throw new Error('REPLAY_UNIMPLEMENTED_EVENT')
  return result
}
