export const RESPONSIBILITY_EVIDENCE_GUARD_VERSION = 'responsibility-independent-evidence-v1'

const platform = { assignmentFeasible: false, platformCapacityAvailable: false }
const waiver = { reasonCode: 'APPROVED_OPERATIONAL_WAIVER', corroborated: true }
const release = { riderAuthenticatedCancellationRequest: true, driverReleaseRequestedByRider: true,
  adminWaiverApprovalRecorded: true, approvalBoundToSameIncident: true,
  driverMisconductObserved: false, unresolvedComplaint: false }
const ordinary = { initiator: 'driver', avoidable: true, platformIssueObserved: false }
const personal = { initiator: 'driver', acceptedBooking: true, emergencyReported: false }
const driverPatterns = [ordinary,
  { ...personal, reasonCode: 'PERSONAL_CONVENIENCE', driverAcknowledgedOwnDecision: true },
  { ...personal, acknowledgement: 'DECLINED_PICKUP_FOR_PERSONAL_ERRAND', dispatcherConfirmed: true },
  { ...personal, reasonCode: 'PERSONAL_CONVENIENCE', driverRequestedRelease: true, adminConfirmedDriverRequest: true }]
const seriousPatterns = [{ repeatedRefusalAfterAcceptance: true },
  { driverAuthenticatedDisableDispatch: true, driverAcknowledgedAvoidingPickupForPersonalErrand: true },
  { secondOverlappingBookingAccepted: true, driverAcknowledgedIncompatibleTimes: true }]

function usable(entry) {
  return entry.availability === 'available' && entry.value !== null && entry.value !== undefined
    && entry.quality?.invalid !== true && entry.quality?.provenance !== 'missing'
    && entry.quality?.stale !== true && entry.quality?.corroborated !== false
}
function matches(entries, category, fields) {
  return entries.some(entry => entry.category === category
    && Object.entries(fields).every(([key, value]) => entry.value[key] === value))
}
function directFacts(entries) {
  return entries.filter(entry => entry.basis === 'direct' && typeof entry.value === 'object' && !Array.isArray(entry.value))
}
function reviewReasons(facts, driverSupported, platformSupported, waiverSupported) {
  const reasons = []
  if (facts.some(entry => entry.category === 'assignment' && Object.hasOwn(entry.value, 'delayedSeconds')
    && entry.value.delayedSeconds !== 0)) reasons.push('PLATFORM_DELAY_CAUSAL_REVIEW')
  if (facts.some(entry => entry.category === 'feasibility' && entry.value.availableDrivers === 0)
    && !platformSupported) reasons.push('CAPACITY_COUNT_DOES_NOT_ESTABLISH_CAUSAL_WAIVER')
  if (seriousPatterns.some(pattern => matches(facts, 'cancellation', pattern))) reasons.push('SERIOUS_CONDUCT_REVIEW')
  if (matches(facts, 'external', { independentlyVerified: true, affectedRoute: true })
    || matches(facts, 'connectivity', { online: false })
    || matches(facts, 'traffic', { deteriorated: true })) reasons.push('MATERIAL_EXTERNAL_CAUSAL_REVIEW')
  if (driverSupported && (platformSupported || waiverSupported)) reasons.push('CONFLICTING_ROUTE_AUTHORITY')
  return reasons
}

// These are runtime evidence predicates from the frozen contract, never fixture IDs,
// scenario names, truth labels, model statements, confidence or severity outputs.
export function independentResponsibilityGates(evidence, classification, requiredCategories) {
  const entries = evidence.timeline.filter(usable), facts = directFacts(entries)
  const missing = requiredCategories.filter(category => !entries.some(entry => entry.category === category))
  const driverSupported = driverPatterns.some(pattern => matches(facts, 'cancellation', pattern))
  const platformSupported = matches(facts, 'feasibility', platform)
  const waiverSupported = matches(facts, 'cancellation', waiver) || matches(facts, 'cancellation', release)
  const reasons = reviewReasons(facts, driverSupported, platformSupported, waiverSupported)
  const support = { DRIVER_CAUSED: driverSupported, PLATFORM_CAUSED: platformSupported, VALID_WAIVED: waiverSupported }
  return [
    { code: 'INDEPENDENT_REQUIRED_EVIDENCE', pass: missing.length === 0,
      detail: missing.length ? 'missing-or-unusable:' + missing.join(',') : 'usable' },
    { code: 'INDEPENDENT_MANDATORY_REVIEW', pass: reasons.length === 0,
      detail: reasons.length ? reasons.join(',') : 'no-evidence-review-blocker' },
    { code: 'INDEPENDENT_ROUTE_AUTHORITY', pass: Object.hasOwn(support, classification) && support[classification],
      detail: RESPONSIBILITY_EVIDENCE_GUARD_VERSION + ':' + classification },
  ]
}
