import { createHash } from 'node:crypto'
import { createResponsibilityEvidence } from '../../services/responsibilityEvidence.js'
import { responsibilityEvidenceHash } from '../../services/responsibilityAnalyst.js'
import { responsibilityBenchmarkRecordSchema } from './contracts.js'
import { phase81Dataset } from './phase81.js'
import { createTestClock } from '../../tests/helpers/testClock.js'

const now = '2026-10-04T10:00:00.000Z'
const patterns = [
  { family: 'development-documented-conflicting-commitments', type: 'DRIVER_CANCELLATION', kind: 'confirmed_conflicting_commitments',
    facts: { acceptedBooking: true, secondOverlappingBookingAccepted: true, driverAcknowledgedIncompatibleTimes: true,
      dispatcherCorroboratedConflictingAcceptance: true, cancelledOriginalToServeSecond: true, emergencyReported: false } },
  { family: 'development-confirmed-deliberate-unavailability', type: 'DRIVER_OFFLINE', kind: 'authenticated_deliberate_unavailability',
    facts: { acceptedBooking: true, driverAuthenticatedDisableDispatch: true, driverAcknowledgedAvoidingPickupForPersonalErrand: true,
      repeatedPickupContactRefused: true, liveConnectivityConfirmed: true, platformOutageObserved: false } },
]
const reviewedRelease = {
  family: 'development-authenticated-rider-release-reviewed', type: 'DRIVER_CANCELLATION', kind: 'authenticated_release_with_reviewed_waiver',
  facts: { riderAuthenticatedCancellationRequest: true, driverReleaseRequestedByRider: true,
    adminWaiverApprovalRecorded: true, approvalBoundToSameIncident: true, approvalAuditReason: 'Verified rider-requested release before service',
    driverMisconductObserved: false, unresolvedComplaint: false }, waived: true,
}
function supplement(pattern, index) {
  const id = `${pattern.family}-${index}`
  const opaqueId = createHash('sha256').update(id).digest('hex').slice(0, 20)
  const evidence = createResponsibilityEvidence({ caseId: `case-${opaqueId}`, bookingId: `booking-${opaqueId}`, caseType: pattern.type,
    occurredAt: now, scheduledAt: '2026-10-04T10:30:00.000Z', clock: createTestClock(now) })
  for (const [category, kind, value] of [
    ['booking', 'confirmed_booking', { accepted: true, pickupConfirmed: true }],
    ['assignment', 'accepted_assignment', { acceptedAt: '2026-10-04T09:55:00.000Z', feasible: true }],
    ['routing', 'contemporaneous_feasible_route', { feasible: true, etaSeconds: 180 + index * 30 }],
    ['location', 'recent_accurate_gps', { accuracyMeters: 8, sampleAgeSeconds: 2 }],
    ['connectivity', 'verified_live_connection', { connected: true, lastHeartbeatAgeMs: 1000 }],
    ['notification', 'confirmed_acceptance_delivery', { status: 'DELIVERED' }],
    ['cancellation', pattern.kind, pattern.facts],
  ]) evidence.record({ category, kind, value, observedAt: now, receivedAt: now,
    source: `synthetic-development:${category}`, quality: { syntheticBenchmark: true, fresh: true, provenance: 'fixture_record' } })
  const snapshot = evidence.snapshot()
  return responsibilityBenchmarkRecordSchema.parse({ id, scenario: pattern.family, scenarioFamily: pattern.family, cohort: 'A_FROZEN_SYNTHETIC',
    evidence: snapshot, evidenceHash: responsibilityEvidenceHash(snapshot), modelInput: { evidence: snapshot },
    label: { responsibility: pattern.waived ? 'VALID_WAIVED' : 'DRIVER_CAUSED', consequenceLevel: pattern.waived ? 'LEVEL_0' : 'LEVEL_2',
      needsReview: !pattern.waived, autoUpholdAllowed: false, autoWaiveAllowed: Boolean(pattern.waived),
      evidenceSufficient: true, requiredMissingEvidence: [], contradictionCritical: false, source: 'FROZEN_SYNTHETIC' } })
}
// An explicit recorded administrative waiver supplies the outcome: no new reason-code policy is inferred.
// Kept separate so the completed 110-case experiment and its cache identity remain unchanged.
export const phase81WaiverDevelopmentDataset = () => Array.from({ length: 3 }, (_, index) => supplement(reviewedRelease, index))
export function phase81DevelopmentDataset() {
  // Held-out V2 is unchanged. New independent development-only families supply absent Level 2 coverage.
  return [...phase81Dataset('development'), ...patterns.flatMap(pattern => Array.from({ length: 3 }, (_, index) => supplement(pattern, index)))]
}
export const phase81DevelopmentHash = records => createHash('sha256').update(JSON.stringify(records.map(record => ({
  id: record.id, evidenceHash: record.evidenceHash, label: record.label })))).digest('hex')
