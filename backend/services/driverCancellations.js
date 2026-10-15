import { responsibilityEvidenceHash } from './responsibilityAnalyst.js'
import { toSubunits } from './paymentIntents.js'
import { responsibilityCaseState } from './responsibilityCaseState.js'
import {
  createResponsibilityEvidence,
  responsibilityCaseType,
} from './responsibilityEvidence.js'
import { enqueueResponsibilityShadowEvidence } from './responsibilityShadowRepository.js'
import { appendLifecycleObservations } from './lifecycleIncidentEvidence.js'

export const DRIVER_CANCELLATION_WINDOW_DAYS = 30

export const cancellationWindowStart = (now = new Date()) =>
  new Date(now.getTime() - DRIVER_CANCELLATION_WINDOW_DAYS * 24 * 60 * 60 * 1000)

// Re-dispatch is a new assignment attempt on the same booking. Its timeout must
// start when the captain returned the ride, not when the customer first booked.
export const assignmentWindowStartedAt = (bookingCreatedAt, latestCancellation) =>
  latestCancellation?.createdAt ?? bookingCreatedAt

export const driverCancellationSourceKey = (bookingId, driverId) => `driver-cancellation:${bookingId}:${driverId}`

async function buildDriverCancellationEvidence(tx, { booking, driverId, cancellationRecord, now }) {
  const caseId = driverCancellationSourceKey(booking.id, driverId)
  const evidence = createResponsibilityEvidence({
    caseId,
    caseType: responsibilityCaseType.DRIVER_CANCELLATION,
    bookingId: booking.id,
    scheduledAt: booking.scheduledAt ?? null,
    occurredAt: now,
    clock: { now: () => now },
  })
  evidence.record({
    category: 'booking',
    kind: 'booking_state_at_driver_cancellation',
    source: `booking:${booking.id}`,
    observedAt: now,
    receivedAt: now,
    value: {
      bookingId: booking.id,
      status: booking.status,
      scheduledAt: booking.scheduledAt?.toISOString() ?? null,
      userId: booking.userId,
      authoritativeFarePaise: toSubunits(booking.fare),
      fareBasis: 'BOOKING_FARE_AT_INCIDENT',
    },
  })
  evidence.record({
    category: 'assignment',
    kind: 'assigned_driver_at_cancellation',
    source: `booking:${booking.id}`,
    observedAt: now,
    receivedAt: now,
    value: { driverId, fromStatus: booking.status,
      confirmedAt: booking.confirmedAt?.toISOString() ?? null,
      driverAssignedAt: booking.driverAssignedAt?.toISOString() ?? null,
      expectedPickupAt: booking.expectedPickupAt?.toISOString() ?? null,
      reachedAt: booking.reachedAt?.toISOString() ?? null,
      reachedLocationObservedAt: booking.reachedLocationAt?.toISOString() ?? null,
    },
  })
  evidence.record({
    category: 'cancellation',
    kind: 'driver_cancellation_recorded',
    source: `driver_cancellation:${cancellationRecord.id}`,
    observedAt: now,
    receivedAt: now,
    value: {
      cancellationId: cancellationRecord.id,
      initiator: 'driver',
      reason: cancellationRecord.reason,
      otherReason: cancellationRecord.otherReason,
      createdAt: cancellationRecord.createdAt.toISOString(),
    },
  })
  await appendLifecycleObservations(tx, evidence, { booking, driverId, now })
  return evidence.snapshot()
}

/** Record factual cancellation history and open one adjudication case. */
export async function recordDriverCancellationIncident(tx, driverId, {
  booking,
  reason = null,
  otherReason = null,
  now = new Date(),
}) {
  const cancellationRecord = await tx.driverCancellation.create({
    data: {
      driverId,
      bookingId: booking.id,
      fromStatus: booking.status,
      reason,
      otherReason,
      createdAt: now,
    },
  })
  const snapshot = await buildDriverCancellationEvidence(tx, { booking, driverId, cancellationRecord, now })
  const responsibilityCase = await tx.responsibilityCase.upsert({
    where: { id: snapshot.caseId },
    update: {},
    create: {
      id: snapshot.caseId,
      sourceKey: snapshot.caseId,
      bookingId: booking.id,
      caseType: snapshot.caseType,
      // Phase 7 shadow analysis is advisory. The real case remains immediately
      // available to an admin even if shadow processing is disabled or offline.
      state: responsibilityCaseState.NEEDS_ADMIN_REVIEW,
      evidenceVersion: snapshot.evidenceVersion,
      evidenceHash: responsibilityEvidenceHash(snapshot),
      evidenceSnapshot: snapshot,
      scheduledAt: booking.scheduledAt ?? null,
      occurredAt: now,
    },
  })
  await enqueueResponsibilityShadowEvidence(responsibilityCase.evidenceSnapshot, { db: tx })
  return { cancellationRecord, responsibilityCase }
}
