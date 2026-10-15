import { createHash } from 'node:crypto'
import { benchmarkPredictionFromRun } from './benchmark.js'

// Benchmark-only guard derived from affirmative evidence fields, never case IDs or truth labels.
// It is not a replacement for the production responsibility policy.
export const DEVELOPMENT_SEVERITY_GUARD_VERSION = 'development-evidenced-aggravation-review-v1'
const aggravatingFact = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && ((value.secondOverlappingBookingAccepted === true && value.driverAcknowledgedIncompatibleTimes === true)
    || (value.driverAuthenticatedDisableDispatch === true && value.driverAcknowledgedAvoidingPickupForPersonalErrand === true))
export function applyDevelopmentSeverityGuard(run, evidence) {
  const cloned = structuredClone(run)
  const evidenceIds = evidence.timeline.filter(item => item.availability === 'available' && item.basis === 'direct'
    && aggravatingFact(item.value)).map(item => item.id)
  const predicates = run.raw?.decisions
  const crossQuestionRisk = predicates?.aggravatingEvidencePresent === 'YES'
  if (!run.error && run.gate && (evidenceIds.length > 0 || crossQuestionRisk)) {
    cloned.gate.route = 'NEEDS_ADMIN_REVIEW'; cloned.gate.humanReviewRequired = true
    cloned.gate.failedGates.push({ code: 'DEVELOPMENT_EVIDENCED_AGGRAVATION_REVIEW', pass: false,
      detail: evidenceIds.length ? 'affirmative-aggravating-evidence' : 'reported-aggravation-requires-review' })
  }
  cloned.developmentGuard = { version: DEVELOPMENT_SEVERITY_GUARD_VERSION, evidenceIds,
    evidenceHash: createHash('sha256').update(JSON.stringify(evidence)).digest('hex'), productionApplied: false }
  cloned.prediction = benchmarkPredictionFromRun(cloned)
  return cloned
}
