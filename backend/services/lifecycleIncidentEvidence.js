import { createResponsibilityEvidence, responsibilityCaseType } from './responsibilityEvidence.js'
import { responsibilityEvidenceHash } from './responsibilityAnalyst.js'
import { responsibilityCaseState } from './responsibilityCaseState.js'
import { enqueueResponsibilityShadowEvidence } from './responsibilityShadowRepository.js'
import { MAX_LOCATION_AGE_MS, MAX_LOCATION_ACCURACY_M } from './rideGeofence.js'

const iso = value => value == null ? null : value.toISOString()
const ACTIVE = ['assigned', 'en_route', 'reached', 'started', 'confirmed']

async function readLifecycleObservations(tx, { booking, driverId, now }) {
  const [location, driver, routes, notifications, commitments] = await Promise.all([
    driverId ? tx.driverLocation.findUnique({ where: { driverId } }) : null,
    driverId ? tx.driver.findUnique({ where: { id: driverId }, select: { isOnline: true } }) : null,
    tx.routeObservation.findMany({ where: { bookingId: booking.id, receivedAt: { lte: now } },
      orderBy: [{ calculatedAt: 'asc' }, { id: 'asc' }] }),
    tx.notificationDelivery.findMany({ where: { bookingId: booking.id, attemptedAt: { lte: now } },
      orderBy: [{ attemptedAt: 'asc' }, { id: 'asc' }] }),
    driverId ? tx.booking.findMany({ where: { driverId, id: { not: booking.id }, status: { in: ACTIVE } },
      select: { id: true, status: true, scheduledAt: true, driverAssignedAt: true, startedAt: true,
        expectedPickupAt: true }, orderBy: { id: 'asc' } }) : [],
  ])
  return { location, driver, routes, notifications, commitments }
}

function gpsReliability(location) {
  return { invalid: !Number.isFinite(location?.accuracyMeters) || location.accuracyMeters < 0
      || location.accuracyMeters > MAX_LOCATION_ACCURACY_M,
    provenance: location?.observedAt && location.receivedAt ? 'present' : 'missing' }
}

function recordLocation(record, location, driverId, now) {
  const usableLocation = location && (!location.receivedAt || location.receivedAt <= now) ? location : null
  const ageMs = usableLocation?.observedAt ? now - usableLocation.observedAt : null
  record('location', 'location_snapshot_at_incident', usableLocation, `driver_location:${driverId ?? 'unassigned'}`,
    { observedAt: usableLocation?.observedAt ?? now, receivedAt: usableLocation?.receivedAt ?? now },
    { ...gpsReliability(usableLocation), observationTimeKnown: Boolean(usableLocation?.observedAt), ageMs,
      stale: ageMs === null || ageMs < 0 || ageMs > MAX_LOCATION_AGE_MS }, usableLocation ? 'available' : 'unknown')
}

function recordNotifications(record, notifications, bookingId, now) {
  if (!notifications.length) record('notification', 'delivery_history_unavailable', null, `booking:${bookingId}`, {}, {}, 'unknown')
  for (const delivery of notifications) {
    // A later callback must not be represented as knowledge available at the incident.
    if (delivery.providerStatusReceivedAt && delivery.providerStatusReceivedAt > now) continue
    record('notification', 'persisted_notification_delivery', delivery, `notification_delivery:${delivery.id}`,
      { observedAt: delivery.providerStatusAt ?? delivery.attemptedAt,
        receivedAt: delivery.providerStatusReceivedAt ?? delivery.attemptedAt })
  }
}

/** Snapshot observed facts. None of these observations asserts causal fault or feasibility. */
export async function appendLifecycleObservations(tx, evidence, context) {
  const { booking, driverId, now } = context
  const { location, driver, routes, notifications, commitments } = await readLifecycleObservations(tx, context)
  const record = (category, kind, value, source, timestamps = {}, quality = {}, availability = 'available') =>
    evidence.record({ category, kind, value: JSON.parse(JSON.stringify(value)), source, observedAt: now, receivedAt: now,
      ...timestamps, quality, availability })
  recordLocation(record, location, driverId, now)
  record('connectivity', 'account_online_flag_at_incident', driver, `driver:${driverId ?? 'unassigned'}`,
    {}, { reachability: 'UNKNOWN', historicalConnectivity: 'UNAVAILABLE' }, driver ? 'available' : 'unknown')
  if (!routes.length) record('routing', 'route_history_unavailable', null, `booking:${booking.id}`, {}, {}, 'unknown')
  for (const route of routes) record('routing', 'persisted_route_observation', route, `route_observation:${route.id}`,
    { observedAt: route.calculatedAt, receivedAt: route.receivedAt })
  recordNotifications(record, notifications, booking.id, now)
  record('feasibility', 'observed_driver_commitments', { driverId, commitments, assessment: 'UNASSESSED' },
    `driver_commitments:${driverId ?? 'unassigned'}`)
}

/** Only committed customer transitions may call this; unsupported families have no detector here. */
export async function recordCustomerLifecycleIncident(tx, { booking, caseType, sourceKey, trigger, now }) {
  if (![responsibilityCaseType.RIDER_CANCELLATION, responsibilityCaseType.DRIVER_LATE].includes(caseType)) {
    throw new Error('UNSUPPORTED_LIFECYCLE_DETECTOR')
  }
  const evidence = createResponsibilityEvidence({ caseId: sourceKey, caseType, bookingId: booking.id,
    scheduledAt: booking.scheduledAt, occurredAt: now, clock: { now: () => now } })
  evidence.record({ category: 'booking', kind: 'booking_state_at_customer_transition', source: `booking:${booking.id}`,
    observedAt: now, receivedAt: now, value: { bookingId: booking.id, userId: booking.userId,
      status: booking.status, scheduledAt: iso(booking.scheduledAt), confirmedAt: iso(booking.confirmedAt) } })
  evidence.record({ category: 'assignment', kind: 'assignment_at_customer_transition', source: `booking:${booking.id}`,
    observedAt: now, receivedAt: now, value: { driverId: booking.driverId, driverAssignedAt: iso(booking.driverAssignedAt),
      expectedPickupAt: iso(booking.expectedPickupAt), reachedAt: iso(booking.reachedAt) } })
  evidence.record({ category: caseType === responsibilityCaseType.RIDER_CANCELLATION ? 'cancellation' : 'progress',
    kind: 'committed_customer_transition', source: sourceKey, observedAt: now, receivedAt: now, value: trigger })
  await appendLifecycleObservations(tx, evidence, { booking, driverId: booking.driverId, now })
  const snapshot = evidence.snapshot()
  const incident = await tx.responsibilityCase.upsert({ where: { id: sourceKey }, update: {}, create: {
    id: sourceKey, sourceKey, bookingId: booking.id, caseType, state: responsibilityCaseState.NEEDS_ADMIN_REVIEW,
    evidenceVersion: snapshot.evidenceVersion, evidenceHash: responsibilityEvidenceHash(snapshot), evidenceSnapshot: snapshot,
    scheduledAt: booking.scheduledAt, occurredAt: now,
  } })
  await enqueueResponsibilityShadowEvidence(incident.evidenceSnapshot, { db: tx })
  return incident
}
