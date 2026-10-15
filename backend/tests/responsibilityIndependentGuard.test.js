import test from 'node:test'
import assert from 'node:assert/strict'
import { createResponsibilityEvidence, responsibilityRequiredEvidenceByCase } from './helpers/responsibilityEvidence.js'
import { createResponsibilityAnalystFake } from './helpers/responsibilityAnalystFake.js'
import { createTestClock } from './helpers/testClock.js'
import { phase81DevelopmentDataset, phase81WaiverDevelopmentDataset } from '../benchmarks/responsibility/phase81Development.js'
import { simulateJevResponsibilityRoute, normalizeJevResponsibility } from '../benchmarks/responsibility/benchmark.js'
import { guardedCodexResponsibility } from '../benchmarks/codex/responsibility.js'
import { independentResponsibilityGates, RESPONSIBILITY_EVIDENCE_GUARD_VERSION } from '../services/responsibilityEvidenceSafety.js'
import { evaluateResponsibilityPolicy, responsibilityEvaluationKey, DEFAULT_RESPONSIBILITY_POLICY } from '../services/responsibilityPolicyGate.js'
import { responsibilityEvidenceHash } from '../services/responsibilityAnalyst.js'

const now = '2026-10-04T10:00:00.000Z'
const required = responsibilityRequiredEvidenceByCase.DRIVER_CANCELLATION
const records = [...phase81DevelopmentDataset(), ...phase81WaiverDevelopmentDataset()]
const model = classification => ({ classification, responsibility: classification, confidence: 1,
  evidenceSufficient: true, platformMateriallyContributed: classification === 'PLATFORM_CAUSED',
  externalCauseMaterial: false, needsHumanReview: false, severity: 'LOW' })
function fixture(category, value, entryOptions = {}) {
  const journal = createResponsibilityEvidence({ caseId: 'independent-regression', bookingId: 'fixture-booking',
    caseType: 'DRIVER_CANCELLATION', occurredAt: now, clock: createTestClock(now) })
  for (const type of required) journal.record({ category: type, kind: 'category-record', source: 'fixture', value: { present: true } })
  journal.record({ category, kind: 'incident-facts', source: 'fixture-authoritative-record', value, ...entryOptions })
  return journal.snapshot()
}
const checks = (evidence, classification = 'DRIVER_CAUSED') => independentResponsibilityGates(evidence, classification, required)
const authority = (evidence, classification) => checks(evidence, classification).find(check => check.code === 'INDEPENDENT_ROUTE_AUTHORITY').pass
const reviewCheck = evidence => checks(evidence).find(check => check.code === 'INDEPENDENT_MANDATORY_REVIEW')
const route = (evidence, classification) => simulateJevResponsibilityRoute({ evidence, result: model(classification) }).route
async function production(evidence, classification = 'PLATFORM_CAUSED') {
  const fake = await createResponsibilityAnalystFake('platform_caused').analyzeResponsibilityCase(evidence)
  fake.output.suggestedClassification = classification
  fake.output.suggestedActionCategory = classification === 'DRIVER_CAUSED' ? 'AUTO_UPHOLD_CANDIDATE' : 'AUTO_WAIVE_CANDIDATE'
  return evaluateResponsibilityPolicy({ evidence, analysisEnvelope: fake, evidenceHash: responsibilityEvidenceHash(evidence),
    currentState: 'POLICY_EVALUATION', idempotencyKey: responsibilityEvaluationKey({ caseId: evidence.caseId,
      evidenceHash: responsibilityEvidenceHash(evidence), analysisId: fake.analysisId, policyVersion: DEFAULT_RESPONSIBILITY_POLICY.policyVersion }) })
}

const observed = [
  'platform_assignment_failure-cancellation_after_impossible_assignment',
  'failed_pickup-rider_cancel_after_platform_delay', 'driver_late-rider_cancel_after_platform_delay',
  'rider_cancellation-rider_cancel_after_platform_delay', 'platform_assignment_failure-rider_cancel_after_platform_delay',
  'replacement_failure-rider_cancel_after_platform_delay',
]
for (const id of observed) test('permanent native unsafe-waiver witness: ' + id, async () => {
  const record = records.find(record => record.id === id)
  assert.equal(record.label.needsReview, true)
  assert.equal(route(record.evidence, 'PLATFORM_CAUSED'), 'NEEDS_ADMIN_REVIEW')
  const output = model('PLATFORM_CAUSED')
  delete output.classification
  const codex = guardedCodexResponsibility({ output, model: 'gpt-6-luna', usage: null, latencyMs: 1 }, record.evidence)
  assert.equal(codex.gate.route, 'NEEDS_ADMIN_REVIEW')
  const jev = normalizeJevResponsibility({ model: 'jev-fixture', answers: {
    responsibility: { choice: 'PLATFORM_CAUSED', confidence: 1 }, evidenceSufficient: { noul: 1 },
    platformMateriallyContributed: { noul: 1 }, externalCauseMaterial: { noul: 0 },
    needsHumanReview: { noul: 0 }, severity: { score: 0, confidence: 1 },
  } })
  assert.equal(simulateJevResponsibilityRoute({ evidence: record.evidence, result: jev }).route, 'NEEDS_ADMIN_REVIEW')
  assert.equal((await production(record.evidence)).route, 'NEEDS_ADMIN_REVIEW')
})

const supports = [
  ['feasibility', 'PLATFORM_CAUSED', { assignmentFeasible: false, platformCapacityAvailable: false }],
  ['cancellation', 'VALID_WAIVED', { reasonCode: 'APPROVED_OPERATIONAL_WAIVER', corroborated: true }],
  ['cancellation', 'VALID_WAIVED', { riderAuthenticatedCancellationRequest: true, driverReleaseRequestedByRider: true,
    adminWaiverApprovalRecorded: true, approvalBoundToSameIncident: true, driverMisconductObserved: false, unresolvedComplaint: false }],
  ['cancellation', 'DRIVER_CAUSED', { initiator: 'driver', avoidable: true, platformIssueObserved: false }],
  ['cancellation', 'DRIVER_CAUSED', { initiator: 'driver', acceptedBooking: true, emergencyReported: false,
    reasonCode: 'PERSONAL_CONVENIENCE', driverAcknowledgedOwnDecision: true }],
  ['cancellation', 'DRIVER_CAUSED', { initiator: 'driver', acceptedBooking: true, emergencyReported: false,
    acknowledgement: 'DECLINED_PICKUP_FOR_PERSONAL_ERRAND', dispatcherConfirmed: true }],
  ['cancellation', 'DRIVER_CAUSED', { initiator: 'driver', acceptedBooking: true, emergencyReported: false,
    reasonCode: 'PERSONAL_CONVENIENCE', driverRequestedRelease: true, adminConfirmedDriverRequest: true }],
]
for (const [category, classification, value] of supports) test('independent runtime authority: ' + JSON.stringify(value), async () => {
  const evidence = fixture(category, value)
  const expected = classification === 'DRIVER_CAUSED' ? 'PROVISIONAL_AUTO_UPHELD' : 'PROVISIONAL_AUTO_WAIVED'
  assert.equal(route(evidence, classification), expected)
  assert.equal((await production(evidence, classification)).route, expected)
  assert.equal(authority(evidence, classification), true)
  assert.equal(authority(evidence, 'EXTERNAL_OR_UNCERTAIN'), false)
  assert.equal(authority(evidence, '__proto__'), false)
  assert.match(checks(evidence, classification).at(-1).detail, new RegExp('^' + RESPONSIBILITY_EVIDENCE_GUARD_VERSION))
  for (const key of Object.keys(value)) {
    const incomplete = { ...value }
    delete incomplete[key]
    assert.equal(authority(fixture(category, incomplete), classification), false, key + ' cannot be inferred')
    const wrong = { ...value, [key]: typeof value[key] === 'boolean' ? !value[key] : 'unsupported-value' }
    assert.equal(authority(fixture(category, wrong), classification), false, key + ' must match the runtime fact')
  }
  for (const key of ['invalid', 'stale']) assert.equal(authority(fixture(category, value, { quality: { [key]: true } }), classification), false)
  assert.equal(authority(fixture(category, value, { quality: { provenance: 'missing' } }), classification), false)
  assert.equal(authority(fixture(category, value, { quality: { corroborated: false } }), classification), false)
  assert.equal(authority(fixture(category, value, { availability: 'unknown' }), classification), false)
  assert.equal(authority(fixture(category, value, { basis: 'derived', derivedFrom: ['unverified-source'] }), classification), false)
})

test('false review and sufficient flags cannot promote null, unavailable or empty required evidence', async () => {
  const value = { initiator: 'driver', avoidable: true, platformIssueObserved: false }
  for (const modify of [entry => { entry.availability = 'not_available' }, entry => { entry.value = null },
    entry => { entry.quality.invalid = true }, entry => { entry.quality.provenance = 'missing' },
    entry => { entry.quality.stale = true }, entry => { entry.quality.corroborated = false }]) {
    const evidence = structuredClone(fixture('cancellation', value))
    modify(evidence.timeline.find(entry => entry.category === 'booking'))
    assert.equal(checks(evidence)[0].pass, false)
    assert.match(checks(evidence)[0].detail, /missing-or-unusable:booking/)
    assert.equal(route(evidence, 'DRIVER_CAUSED'), 'NEEDS_ADMIN_REVIEW')
    assert.equal((await production(evidence, 'DRIVER_CAUSED')).route, 'NEEDS_ADMIN_REVIEW')
  }
  const empty = structuredClone(fixture('cancellation', value))
  empty.timeline = []
  assert.equal(checks(empty)[0].detail, 'missing-or-unusable:booking,assignment,cancellation')
  assert.equal(route(empty, 'DRIVER_CAUSED'), 'NEEDS_ADMIN_REVIEW')
})

test('absent required values fail the independent boundary and production evidence schema', async () => {
  const evidence = structuredClone(fixture('cancellation', { initiator: 'driver', avoidable: true, platformIssueObserved: false }))
  delete evidence.timeline.find(entry => entry.category === 'booking').value
  assert.equal(checks(evidence)[0].pass, false)
  assert.equal(route(evidence, 'DRIVER_CAUSED'), 'NEEDS_ADMIN_REVIEW')
  await assert.rejects(production(evidence, 'DRIVER_CAUSED'), /Invalid input/)
})

test('capacity arithmetic and delay require causal review independently of classification and severity', async () => {
  for (const delay of [1, -1, null, '900']) {
    const evidence = fixture('assignment', { delayedSeconds: delay })
    assert.equal(reviewCheck(evidence).detail, 'PLATFORM_DELAY_CAUSAL_REVIEW')
    for (const classification of ['DRIVER_CAUSED', 'PLATFORM_CAUSED', 'VALID_WAIVED']) {
      assert.equal(route(evidence, classification), 'NEEDS_ADMIN_REVIEW')
      assert.equal((await production(evidence, classification)).route, 'NEEDS_ADMIN_REVIEW')
    }
  }
  assert.equal(reviewCheck(fixture('assignment', { delayedSeconds: 0 })).pass, true)
  assert.equal(reviewCheck(fixture('connectivity', { delayedSeconds: 900 })).pass, true)
  assert.equal(reviewCheck(fixture('feasibility', { availableDrivers: 0 })).detail, 'CAPACITY_COUNT_DOES_NOT_ESTABLISH_CAUSAL_WAIVER')
  assert.equal(reviewCheck(fixture('feasibility', { availableDrivers: 1 })).pass, true)
  assert.equal(reviewCheck(fixture('routing', { availableDrivers: 0 })).pass, true)
  const proof = structuredClone(fixture('feasibility', { assignmentFeasible: false, platformCapacityAvailable: false }))
  proof.timeline.at(-1).value.availableDrivers = 0
  assert.equal(reviewCheck(proof).pass, true)
  assert.equal(route(proof, 'PLATFORM_CAUSED'), 'PROVISIONAL_AUTO_WAIVED')
})

test('serious corroborated facts cannot be downgraded to low severity automatic routing', async () => {
  for (const value of [{ repeatedRefusalAfterAcceptance: true },
    { driverAuthenticatedDisableDispatch: true, driverAcknowledgedAvoidingPickupForPersonalErrand: true },
    { secondOverlappingBookingAccepted: true, driverAcknowledgedIncompatibleTimes: true }]) {
    const evidence = fixture('cancellation', value)
    assert.equal(reviewCheck(evidence).detail, 'SERIOUS_CONDUCT_REVIEW')
    assert.equal(route(evidence, 'DRIVER_CAUSED'), 'NEEDS_ADMIN_REVIEW')
    assert.equal((await production(evidence, 'DRIVER_CAUSED')).route, 'NEEDS_ADMIN_REVIEW')
    for (const key of Object.keys(value)) {
      const incomplete = { ...value, [key]: false }
      assert.equal(reviewCheck(fixture('cancellation', incomplete)).pass, true)
    }
  }
})

test('opposing affirmative route evidence has independent mandatory-review precedence', () => {
  for (const [category, , value] of supports.slice(0, 3)) {
    const evidence = structuredClone(fixture('cancellation', { initiator: 'driver', avoidable: true, platformIssueObserved: false }))
    evidence.timeline.push({ ...evidence.timeline.at(-1), id: 'opposing-evidence', category, value })
    assert.equal(reviewCheck(evidence).detail, 'CONFLICTING_ROUTE_AUTHORITY')
    assert.equal(route(evidence, 'DRIVER_CAUSED'), 'NEEDS_ADMIN_REVIEW')
  }
})

test('contradictions and invented model authority remain blocked without consuming labels', async () => {
  assert.equal(RESPONSIBILITY_EVIDENCE_GUARD_VERSION, 'responsibility-independent-evidence-v1')
  for (const id of ['driver_cancellation-conflicting_gps', 'driver_cancellation-missing_provenance']) {
    const evidence = records.find(record => record.id === id).evidence
    for (const classification of ['DRIVER_CAUSED', 'PLATFORM_CAUSED', 'VALID_WAIVED']) {
      assert.equal(route(evidence, classification), 'NEEDS_ADMIN_REVIEW')
      assert.equal((await production(evidence, classification)).route, 'NEEDS_ADMIN_REVIEW')
    }
  }
  for (const value of [[], 'text', 42, false, null, { safeWaiver: true, needsHumanReview: false, evidenceSufficient: true }]) {
    assert.equal(authority(fixture('cancellation', value), 'VALID_WAIVED'), false)
  }
  assert.equal(authority(fixture('booking', { reasonCode: 'APPROVED_OPERATIONAL_WAIVER', corroborated: true }), 'VALID_WAIVED'), false)
  const absentQuality = structuredClone(fixture('cancellation', { initiator: 'driver', avoidable: true, platformIssueObserved: false }))
  for (const entry of absentQuality.timeline) delete entry.quality
  assert.equal(authority(absentQuality, 'DRIVER_CAUSED'), true)
  const original = fixture('cancellation', { reasonCode: 'APPROVED_OPERATIONAL_WAIVER', corroborated: true })
  const snapshot = structuredClone(original)
  assert.equal(checks(original, 'VALID_WAIVED').every(check => check.pass), true)
  assert.deepEqual(checks(original, 'VALID_WAIVED'), [
    { code: 'INDEPENDENT_REQUIRED_EVIDENCE', pass: true, detail: 'usable' },
    { code: 'INDEPENDENT_MANDATORY_REVIEW', pass: true, detail: 'no-evidence-review-blocker' },
    { code: 'INDEPENDENT_ROUTE_AUTHORITY', pass: true, detail: 'responsibility-independent-evidence-v1:VALID_WAIVED' },
  ])
  assert.deepEqual(original, snapshot)
  const undefinedValue = structuredClone(original)
  undefinedValue.timeline.at(-1).value = undefined
  assert.equal(authority(undefinedValue, 'VALID_WAIVED'), false)
  const arrayValue = structuredClone(original)
  arrayValue.timeline.at(-1).value = Object.assign([], original.timeline.at(-1).value)
  assert.equal(authority(arrayValue, 'VALID_WAIVED'), false)
  assert.equal(route(arrayValue, 'VALID_WAIVED'), 'NEEDS_ADMIN_REVIEW')
  const functionValue = structuredClone(original)
  functionValue.timeline.at(-1).value = Object.assign(() => {}, original.timeline.at(-1).value)
  assert.equal(authority(functionValue, 'VALID_WAIVED'), false)
  assert.equal(route(functionValue, 'VALID_WAIVED'), 'NEEDS_ADMIN_REVIEW')
})

test('material external evidence is independent of false model external and review flags', () => {
  const driver = { initiator: 'driver', avoidable: true, platformIssueObserved: false }
  for (const [category, value] of [['external', { independentlyVerified: true, affectedRoute: true }],
    ['connectivity', { online: false }], ['traffic', { deteriorated: true }]]) {
    const evidence = structuredClone(fixture('cancellation', driver))
    evidence.timeline.push({ ...evidence.timeline.at(-1), id: 'material-external', category, value })
    assert.equal(reviewCheck(evidence).detail, 'MATERIAL_EXTERNAL_CAUSAL_REVIEW')
    assert.equal(route(evidence, 'DRIVER_CAUSED'), 'NEEDS_ADMIN_REVIEW')
    for (const key of Object.keys(value)) {
      const changed = structuredClone(evidence)
      changed.timeline.at(-1).value[key] = !value[key]
      assert.equal(reviewCheck(changed).pass, true)
    }
    const otherCategory = structuredClone(evidence)
    otherCategory.timeline.at(-1).category = 'booking'
    assert.equal(reviewCheck(otherCategory).pass, true)
  }
})

test('invalid production envelopes remain conservative before independent output access', () => {
  const evidence = fixture('cancellation', { initiator: 'driver', avoidable: true, platformIssueObserved: false })
  for (const analysisEnvelope of [null, {}, { output: null }]) {
    const result = evaluateResponsibilityPolicy({ evidence, analysisEnvelope, evidenceHash: responsibilityEvidenceHash(evidence),
      currentState: 'POLICY_EVALUATION', idempotencyKey: 'invalid-envelope-key' })
    assert.equal(result.route, 'NEEDS_ADMIN_REVIEW')
    assert.equal(result.failedGates.some(item => item.code === 'ANALYSIS_VALIDATION'), true)
    assert.equal(result.passedGates.some(item => item.code.startsWith('INDEPENDENT_')), false)
  }
})

test('multiple independent review reasons retain their distinct auditable identities', () => {
  const evidence = structuredClone(fixture('cancellation', { repeatedRefusalAfterAcceptance: true }))
  evidence.timeline.push({ ...evidence.timeline.at(-1), id: 'delay-evidence', category: 'assignment', value: { delayedSeconds: 1 } })
  assert.equal(reviewCheck(evidence).detail, 'PLATFORM_DELAY_CAUSAL_REVIEW,SERIOUS_CONDUCT_REVIEW')
})

test('independent authority preserves the separate policy automation enablement veto', () => {
  const evidence = fixture('feasibility', { assignmentFeasible: false, platformCapacityAvailable: false })
  const policy = structuredClone(DEFAULT_RESPONSIBILITY_POLICY)
  policy.cases.DRIVER_CANCELLATION.autoWaiveAllowed = false
  const result = simulateJevResponsibilityRoute({ evidence, result: model('PLATFORM_CAUSED'), policy })
  assert.equal(result.route, 'NEEDS_ADMIN_REVIEW')
  assert.deepEqual(result.failedGates.find(check => check.code === 'AUTO_WAIVE_ENABLED'),
    { code: 'AUTO_WAIVE_ENABLED', pass: false, detail: 'policy' })
})
