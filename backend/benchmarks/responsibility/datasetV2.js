import { createHash } from 'node:crypto'
import { createTestClock } from '../../tests/helpers/testClock.js'
import { responsibilityEvidenceHash } from '../../services/responsibilityAnalyst.js'
import { createResponsibilityEvidence } from '../../services/responsibilityEvidence.js'
import { responsibilityBenchmarkRecordSchema } from './contracts.js'
import { buildFrozenResponsibilityBenchmarkDataset } from './dataset.js'

export const RESPONSIBILITY_BENCHMARK_DATASET_V2_VERSION = 'responsibility-benchmark-v2'
export const RESPONSIBILITY_BENCHMARK_DATASET_V2_SEED = 'rcs-responsibility-phase8-v2-2026-10-04'
export const RESPONSIBILITY_BENCHMARK_DATASET_V2_FROZEN_HASH = '9369dd84368f1ea827117d3fdfcb6d7d19b66c2da026c091b199e2204b24911e'
const NOW = '2026-10-04T10:00:00.000Z'
const digest = value => createHash('sha256').update(value).digest('hex')
const positivePatterns = [
  { family: 'signed-personal-cancellation', kind: 'authenticated_driver_cancellation', value: { initiator: 'driver', acceptedBooking: true,
    reasonCode: 'PERSONAL_CONVENIENCE', driverAcknowledgedOwnDecision: true, emergencyReported: false } },
  { family: 'acknowledged-dispatch-refusal', kind: 'recorded_driver_refusal', value: { initiator: 'driver', acceptedBooking: true,
    acknowledgement: 'DECLINED_PICKUP_FOR_PERSONAL_ERRAND', dispatcherConfirmed: true, emergencyReported: false } },
  { family: 'driver-requested-unassignment', kind: 'confirmed_driver_unassignment', value: { initiator: 'driver', acceptedBooking: true,
    driverRequestedRelease: true, reasonCode: 'PERSONAL_CONVENIENCE', adminConfirmedDriverRequest: true, emergencyReported: false } },
]

function positiveRecord(pattern, index) {
  const id = `driver_cancellation-${pattern.family}-${index}`
  const caseId = `case-${digest(`${RESPONSIBILITY_BENCHMARK_DATASET_V2_VERSION}:${id}`).slice(0, 20)}`
  const journal = createResponsibilityEvidence({ caseId, caseType: 'DRIVER_CANCELLATION', bookingId: `booking-${caseId}`,
    scheduledAt: '2026-10-04T10:30:00.000Z', occurredAt: NOW, clock: createTestClock(NOW) })
  const facts = [
    ['booking', 'booking_record', { status: 'confirmed', pickupConfirmed: true, scheduledAt: '2026-10-04T10:30:00.000Z' }],
    ['assignment', 'driver_acceptance', { accepted: true, acceptedAt: '2026-10-04T09:55:00.000Z', assignmentValid: true }],
    ['cancellation', pattern.kind, pattern.value],
    ['routing', 'contemporaneous_route', { providerAvailable: true, feasible: true, etaSeconds: 180 + index * 20 }],
    ['connectivity', 'session_heartbeat', { connected: true, lastHeartbeatAgeMs: 1000 }],
    ['notification', 'acceptance_notice_delivered', { status: 'DELIVERED', deliveredAt: '2026-10-04T09:55:01.000Z' }],
  ]
  for (const [category, kind, value] of facts) journal.record({ category, kind, value, observedAt: NOW, receivedAt: NOW,
    source: `synthetic-fixture:${category}`, quality: { syntheticBenchmark: true, fresh: true, provenance: 'fixture_record' } })
  const evidence = journal.snapshot()
  return responsibilityBenchmarkRecordSchema.parse({ id, scenario: pattern.family, scenarioFamily: pattern.family,
    cohort: 'A_FROZEN_SYNTHETIC', evidence, evidenceHash: responsibilityEvidenceHash(evidence), modelInput: { evidence },
    label: { responsibility: 'DRIVER_CAUSED', needsReview: false, consequenceLevel: 'LEVEL_1', autoUpholdAllowed: true,
      autoWaiveAllowed: false, evidenceSufficient: true, requiredMissingEvidence: [], contradictionCritical: false, source: 'FROZEN_SYNTHETIC' } })
}

export function buildFrozenResponsibilityBenchmarkDatasetV2() {
  // Keep V1 observations and labels intact. V2 adds independent affirmative Level 1 patterns.
  return Object.freeze([...buildFrozenResponsibilityBenchmarkDataset(), ...positivePatterns.flatMap(pattern =>
    Array.from({ length: 3 }, (_entry, index) => Object.freeze(positiveRecord(pattern, index))))])
}

export function responsibilityBenchmarkDatasetV2Hash(records = buildFrozenResponsibilityBenchmarkDatasetV2()) {
  return digest(JSON.stringify(records.map(record => ({ id: record.id, family: record.scenarioFamily, evidenceHash: record.evidenceHash, label: record.label }))))
}

export function responsibilityBenchmarkV2StratumSummary(records = buildFrozenResponsibilityBenchmarkDatasetV2()) {
  const counts = Object.fromEntries(['DRIVER_CAUSED', 'PLATFORM_CAUSED', 'VALID_WAIVED', 'EXTERNAL_OR_UNCERTAIN', 'LEVEL_0', 'LEVEL_1', 'LEVEL_2',
    'SAFE_AUTO_UPHOLD', 'SAFE_AUTO_WAIVE', 'NEEDS_ADMIN_REVIEW', 'MISSING_MANDATORY_EVIDENCE', 'CRITICAL_CONTRADICTION', 'PLATFORM_IMPOSSIBILITY', 'EXTERNAL_UNCERTAINTY'].map(key => [key, 0]))
  for (const { label, scenarioFamily } of records) {
    if (!label || label.source === 'UNLABELED') continue
    counts[label.responsibility] += 1; counts[label.consequenceLevel] += 1
    counts[label.autoUpholdAllowed ? 'SAFE_AUTO_UPHOLD' : label.autoWaiveAllowed ? 'SAFE_AUTO_WAIVE' : 'NEEDS_ADMIN_REVIEW'] += 1
    if (label.requiredMissingEvidence.length) counts.MISSING_MANDATORY_EVIDENCE += 1
    if (label.contradictionCritical) counts.CRITICAL_CONTRADICTION += 1
    if (['impossible', 'impossibleCancellation'].includes(scenarioFamily)) counts.PLATFORM_IMPOSSIBILITY += 1
    if (label.responsibility === 'EXTERNAL_OR_UNCERTAIN') counts.EXTERNAL_UNCERTAINTY += 1
  }
  return counts
}

export function splitResponsibilityBenchmarkV2(records, { seed = RESPONSIBILITY_BENCHMARK_DATASET_V2_SEED, heldOutFraction = 0.25 } = {}) {
  if (!(heldOutFraction > 0 && heldOutFraction < 1)) throw new Error('heldOutFraction must be between zero and one')
  const families = new Map()
  for (const record of records.filter(row => row.label && row.label.source !== 'UNLABELED')) {
    const family = record.scenarioFamily ?? record.scenario
    families.set(family, [...(families.get(family) ?? []), record])
  }
  const ordered = [...families.keys()].sort((a, b) => digest(`${seed}:${a}`).localeCompare(digest(`${seed}:${b}`)))
  const uncovered = new Set(Object.keys(responsibilityBenchmarkV2StratumSummary([])))
  const heldFamilies = new Set()
  for (const family of ordered) {
    const coverage = Object.entries(responsibilityBenchmarkV2StratumSummary(families.get(family))).filter(([, count]) => count > 0).map(([key]) => key)
    if (coverage.some(key => uncovered.has(key))) { heldFamilies.add(family); for (const key of coverage) uncovered.delete(key) }
  }
  const target = Math.max(1, Math.round(ordered.length * heldOutFraction))
  for (const family of ordered) { if (heldFamilies.size >= target) break; heldFamilies.add(family) }
  const heldOut = []; const development = []
  for (const [family, group] of families) (heldFamilies.has(family) ? heldOut : development).push(...group)
  return { development, heldOut, seed, heldOutScenarioFamilies: [...heldFamilies].sort(), heldOutStratumSummary: responsibilityBenchmarkV2StratumSummary(heldOut),
    adequate: uncovered.size === 0, missingStrata: [...uncovered] }
}
