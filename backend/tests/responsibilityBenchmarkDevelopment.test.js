import assert from 'node:assert/strict'
import test from 'node:test'
import { phase81DevelopmentDataset, phase81DevelopmentHash, phase81WaiverDevelopmentDataset } from '../benchmarks/responsibility/phase81Development.js'
import { phase81Dataset, PHASE81_CONFIGURATION, phase81ConfigHash } from '../benchmarks/responsibility/phase81.js'
import { analyzePhase81SeverityFailures } from '../benchmarks/responsibility/phase81Failures.js'
import { scoreRawGatedResponsibility } from '../benchmarks/responsibility/rawGatedMetrics.js'
import { verifiedDevelopmentReplays, replayDevelopmentAdapter } from '../benchmarks/responsibility/replay.js'
import { benchmarkCacheKey } from '../benchmarks/common/cache.js'
import { RESPONSIBILITY_BENCHMARK_DATASET_V2_FROZEN_HASH } from '../benchmarks/responsibility/datasetV2.js'
import { DEFAULT_RESPONSIBILITY_POLICY } from '../services/responsibilityPolicyGate.js'
import { simulateJevResponsibilityRoute } from '../benchmarks/responsibility/benchmark.js'

const records = phase81DevelopmentDataset()
test('independent waiver development examples rely on a recorded incident-bound approval, not an invented valid-reason rule', () => {
  const waivers = phase81WaiverDevelopmentDataset()
  assert.equal(waivers.length, 3)
  assert.equal(phase81DevelopmentHash(waivers), '618bee7137a3be6fc81c0f3ca8dc0c1cb07069bf4857f6e27be59abc5ed78add')
  const priorFamilies = new Set([...records, ...phase81Dataset('heldOut')].map(row => row.scenarioFamily))
  for (const row of waivers) {
    assert.equal(priorFamilies.has(row.scenarioFamily), false)
    assert.equal(row.label.responsibility, 'VALID_WAIVED'); assert.equal(row.label.consequenceLevel, 'LEVEL_0')
    assert.equal(row.label.source, 'FROZEN_SYNTHETIC'); assert.equal(row.label.autoWaiveAllowed, true)
    const factual = row.evidence.timeline.find(event => event.kind === 'authenticated_release_with_reviewed_waiver').value
    assert.equal(factual.adminWaiverApprovalRecorded, true); assert.equal(factual.approvalBoundToSameIncident, true)
    assert.equal(factual.riderAuthenticatedCancellationRequest, true); assert.equal(factual.unresolvedComplaint, false)
    assert.equal(simulateJevResponsibilityRoute({ evidence: row.evidence, result: { classification: 'VALID_WAIVED', severity: 'LOW',
      confidence: 1, evidenceSufficient: true, needsHumanReview: false, externalCauseMaterial: false, platformMateriallyContributed: false } }).route, 'PROVISIONAL_AUTO_WAIVED')
    assert.equal(JSON.stringify(row.modelInput).includes('VALID_WAIVED'), false)
  }
  assert.equal(phase81DevelopmentHash(records), '9390a04d995b9c639bd19abb52432d2f9ee14bb2fec692e95cc6c8f196eb5ce4')
})
test('development receipts identify the actual question, prompt and policy configuration; changes require a different cache namespace', () => {
  assert.equal(PHASE81_CONFIGURATION.jev.questionsHash, 'acd405820422d6eb4df25effbaa2a8f2da00ee6c7c01839b0e1242685c65409f')
  assert.equal(PHASE81_CONFIGURATION.luna.promptHash, '6923e5d5f5d666b596ce1d910263b60cab35712de9ad497586ad1219f1ba9fbb')
  assert.equal(phase81ConfigHash(), '4a0bc4c6e9c78529ad7acaa4f01d16123e8f5fe761e7d1db934770bb04233171')
})
test('expanded responsibility development cohort includes all levels without reusing held-out families or label-bearing input IDs', () => {
  assert.equal(records.length, 110)
  assert.equal(records.filter(row => row.label.consequenceLevel === 'LEVEL_2').length, 6)
  assert.equal(phase81DevelopmentHash(records), phase81DevelopmentHash(phase81DevelopmentDataset()))
  assert.notEqual(phase81DevelopmentHash(records.slice(0, -1)), phase81DevelopmentHash(records))
  const heldFamilies = new Set(phase81Dataset('heldOut').map(row => row.scenarioFamily))
  for (const row of records.slice(-6)) {
    assert.equal(heldFamilies.has(row.scenarioFamily), false)
    assert.match(row.evidence.caseId, /^case-[0-9a-f]{20}$/)
    assert.deepEqual(Object.keys(row.modelInput), ['evidence'])
    assert.equal(JSON.stringify(row.modelInput).includes('LEVEL_2'), false)
    assert.equal(row.label.needsReview, true)
  }
})
test('severity failure analysis retains raw scores and protected gate routes; unbound or changed truth fails', () => {
  const ids = ['failed_pickup-ordinary_driver_evidence', 'failed_pickup-available_driver_unresponsive', 'driver_late-ordinary_driver_evidence', 'driver_late-available_driver_unresponsive']
  const prior = ids.map(id => { const row = records.find(row => row.id === id); return { id, label: row.label,
    results: { jev: { prediction: { consequenceLevel: 'LEVEL_2' }, normalized: { classification: 'DRIVER_CAUSED', severity: 'HIGH' },
      raw: { answers: { severity: { score: 1.6, confidence: .4, probabilities: { 0: .04, 1: .32, 2: .64 } } } }, gate: { route: 'NEEDS_ADMIN_REVIEW', failedGates: [] } } } } })
  const failures = analyzePhase81SeverityFailures(phase81Dataset('development'), prior)
  assert.equal(failures.length, 4)
  for (const item of failures) {
    assert.equal(item.groundTruth.severity, 'LEVEL_1')
    assert.equal(item.jevSeverity, 'HIGH')
    assert.ok(item.score > 1.5)
    assert.equal(item.downstream.route, 'NEEDS_ADMIN_REVIEW')
    assert.ok(item.evidenceSupplied.length)
    const original = records.find(row => row.id === item.caseId)
    assert.deepEqual(item.evidenceSupplied, original.evidence.timeline.map(event => ({ id: event.id, category: event.category, kind: event.kind, value: event.value })))
    assert.ok(item.documentedMapping.trim()); assert.ok(item.preventingEvidence.trim())
    assert.deepEqual(Object.keys(item.failureClassification).sort(), ['adapterMapping', 'criteria', 'crossQuestionGate',
      'evidenceContext', 'modelJudgment', 'questionWording', 'severityMapping'])
    assert.ok(Object.values(item.failureClassification).every(value => value.trim()))
  }
  assert.throws(() => analyzePhase81SeverityFailures([], prior), /NOT_FOUND/)
  const changed = structuredClone(prior); changed[0].label.source = 'ADMIN_HUMAN'
  // Change a failing row, rather than an unrelated successfully classified row.
  changed.find(row => row.id === failures[0].caseId).label.source = 'ADMIN_HUMAN'
  assert.throws(() => analyzePhase81SeverityFailures(phase81Dataset('development'), changed), /LABEL_MISMATCH/)
  const normal = structuredClone(prior[0]); normal.results.jev.prediction.consequenceLevel = 'LEVEL_1'
  assert.equal(analyzePhase81SeverityFailures(phase81Dataset('development'), [normal]).length, 0)
  const severeRecord = records.find(row => row.label.consequenceLevel === 'LEVEL_2')
  assert.equal(analyzePhase81SeverityFailures(records, [{ ...prior[0], id: severeRecord.id, label: severeRecord.label }]).length, 0)
  const unsafe = structuredClone(prior); unsafe[0].results.jev.gate.route = 'PROVISIONAL_AUTO_UPHELD'
  const traced = analyzePhase81SeverityFailures(phase81Dataset('development'), unsafe)
  assert.equal(traced.find(row => row.caseId === unsafe[0].id).downstream.level2Automated, true)
  assert.ok(failures.every(row => row.downstream.level2Automated === false))
})
test('each unsafe raw rationale is detected independently while unknown severity and human-review recommendations remain distinct', () => {
  const base = { ...records[0].label, consequenceLevel: 'LEVEL_1', needsReview: false, evidenceSufficient: true, autoUpholdAllowed: true }
  const normalized = { classification: 'DRIVER_CAUSED', severity: 'MODERATE', evidenceSufficient: true, needsHumanReview: false }
  const score = (truth = {}, output = {}, gate = 'NEEDS_ADMIN_REVIEW') => scoreRawGatedResponsibility([{ label: { ...base, ...truth }, results: {
    jev: { normalized: { ...normalized, ...output }, error: null, gate: { route: gate }, prediction: { consequenceLevel: 'LEVEL_1' } },
  } }], 'jev')
  for (const [truth, output] of [
    [{ responsibility: 'PLATFORM_CAUSED', consequenceLevel: 'LEVEL_0' }, {}],
    [{ needsReview: true }, {}], [{ evidenceSufficient: false }, {}], [{}, { severity: 'HIGH' }],
  ]) assert.equal(score(truth, output).raw.unsafeAdverseRecommendations, 1)
  for (const truth of [{ consequenceLevel: 'LEVEL_2' }, { consequenceLevel: null }]) {
    assert.equal(score(truth, { severity: 'HIGH' }).raw.unsafeAdverseRecommendations, 0)
  }
  assert.equal(score({ needsReview: true }, { evidenceSufficient: false }).raw.unsafeAdverseRecommendations, 0)
  assert.equal(score({ needsReview: true }, { needsHumanReview: true }).raw.unsafeAdverseRecommendations, 0)
  assert.equal(score({ autoUpholdAllowed: false }, {}, 'PROVISIONAL_AUTO_UPHELD').gated.unsafeAutoUpholds, 1)
  assert.equal(score({ responsibility: 'PLATFORM_CAUSED' }, {}, 'PROVISIONAL_AUTO_UPHELD').gated.unsafeAutoUpholds, 1)
  // Even stale output alongside an error is excluded from successful-call accuracy.
  const failure = { label: base, results: { jev: { error: 'SCHEMA', normalized, gate: null, prediction: { consequenceLevel: null } } } }
  assert.equal(scoreRawGatedResponsibility([failure], 'jev').raw.labelledWithResponse, 0)
  const absent = { label: base, results: { jev: { error: null, normalized: null,
    gate: { route: 'NEEDS_ADMIN_REVIEW' }, prediction: { consequenceLevel: null } } } }
  const missing = scoreRawGatedResponsibility([absent], 'jev')
  assert.equal(missing.raw.labelledWithResponse, 0)
  assert.equal(missing.raw.responsibilityAccuracy.denominator, 0)
  assert.equal(missing.gated.reviewRate.value, 1)
})
const receipt = { split: 'development', configHash: 'old-config', configuration: PHASE81_CONFIGURATION }
const row = records[0]
const identity = { domain: 'responsibility', datasetHash: RESPONSIBILITY_BENCHMARK_DATASET_V2_FROZEN_HASH,
  caseId: row.id, inputHash: row.evidenceHash, provider: 'fake', model: 'fake-v1', configHash: 'old-config', runNumber: 1 }
const entry = { identity, key: benchmarkCacheKey(identity), value: { error: null, raw: { result: true }, normalized: { classification: 'DRIVER_CAUSED' }, latencyMs: 12 } }
test('development replay requires verified input/config/run/domain identity and does not trust old gate output', async () => {
  assert.equal(verifiedDevelopmentReplays(receipt, [entry], records).length, 1)
  for (const overrides of [{ domain: 'search' }, { datasetHash: 'changed' }, { configHash: 'changed' }, { runNumber: 2 }, { inputHash: 'changed' }, { caseId: 'not-development' }]) {
    const altered = { ...entry, identity: { ...identity, ...overrides } }; altered.key = benchmarkCacheKey(altered.identity)
    assert.deepEqual(verifiedDevelopmentReplays(receipt, [altered], records), [])
  }
  assert.deepEqual(verifiedDevelopmentReplays({ ...receipt, split: 'heldOut' }, [entry], records), [])
  assert.deepEqual(verifiedDevelopmentReplays({ ...receipt, configuration: { ...PHASE81_CONFIGURATION, jev: {} } }, [entry], records), [])
  assert.deepEqual(verifiedDevelopmentReplays({ ...receipt, configuration: { ...PHASE81_CONFIGURATION, luna: {} } }, [entry], records), [])
  assert.deepEqual(verifiedDevelopmentReplays(receipt, [{ ...entry, key: 'corrupt' }], records), [])
  for (const value of [{ ...entry.value, error: 'timeout' }, { ...entry.value, raw: null }, { ...entry.value, normalized: null }]) assert.deepEqual(verifiedDevelopmentReplays(receipt, [{ ...entry, value }], records), [])
  let calls = 0
  const adapter = replayDevelopmentAdapter({ provider: 'fake', model: 'fake-v1', async analyzeResponsibilityCase() { calls++; return 'live' } }, [entry])
  const result = await adapter.analyzeResponsibilityCase(row.evidence)
  assert.equal(calls, 0); assert.equal(result.raw.replay.liveRequests, 0)
  assert.equal(result.gate, undefined)
  result.normalized.classification = 'MODIFIED'
  assert.equal(entry.value.normalized.classification, 'DRIVER_CAUSED')
  assert.equal(await adapter.analyzeResponsibilityCase(records[1].evidence), 'live'); assert.equal(calls, 1)
  assert.equal(await replayDevelopmentAdapter({ provider: 'other', model: 'fake-v1', analyzeResponsibilityCase: async () => 'other' }, [entry]).analyzeResponsibilityCase(row.evidence), 'other')
  assert.equal(await replayDevelopmentAdapter({ provider: 'fake', model: 'other', analyzeResponsibilityCase: async () => 'other' }, [entry]).analyzeResponsibilityCase(row.evidence), 'other')
})
test('high severity cannot bypass independent cross-question checks even when test-only policy permits HIGH', () => {
  const complete = records.find(record => record.id === 'driver_cancellation-ordinary_driver_evidence').evidence
  const policy = structuredClone(DEFAULT_RESPONSIBILITY_POLICY)
  policy.cases.DRIVER_CANCELLATION.allowedSeverities.push('HIGH')
  const result = { classification: 'DRIVER_CAUSED', severity: 'HIGH', confidence: 1, evidenceSufficient: true,
    needsHumanReview: false, externalCauseMaterial: false, platformMateriallyContributed: false }
  assert.equal(simulateJevResponsibilityRoute({ evidence: complete, result, policy }).route, 'PROVISIONAL_AUTO_UPHELD')
  for (const override of [{ classification: 'VALID_WAIVED' }, { classification: 'EXTERNAL_OR_UNCERTAIN' }, { evidenceSufficient: false }, { needsHumanReview: true }, { externalCauseMaterial: true }, { platformMateriallyContributed: true }]) {
    assert.notEqual(simulateJevResponsibilityRoute({ evidence: complete, result: { ...result, ...override }, policy }).route, 'PROVISIONAL_AUTO_UPHELD')
  }
  assert.equal(simulateJevResponsibilityRoute({ evidence: { ...complete, contradictions: [{ code: 'conflict' }] }, result, policy }).route, 'NEEDS_ADMIN_REVIEW')
})
test('raw false LEVEL_2 remains visible under review; unlabeled rows and unknown severity cannot change denominators', () => {
  const make = (label, normalized, route, consequenceLevel) => ({ label, results: { jev: { normalized, gate: { route }, prediction: { consequenceLevel } } } })
  const ordinary = records[0].label
  const bad = { classification: 'DRIVER_CAUSED', severity: 'HIGH', evidenceSufficient: true, needsHumanReview: false }
  const sample = [make({ ...ordinary, consequenceLevel: 'LEVEL_1', autoUpholdAllowed: false, needsReview: true }, bad, 'NEEDS_ADMIN_REVIEW', 'LEVEL_2'),
    make({ ...ordinary, consequenceLevel: 'LEVEL_1', autoUpholdAllowed: true, needsReview: false }, { ...bad, severity: 'MODERATE' }, 'PROVISIONAL_AUTO_UPHELD', 'LEVEL_1'),
    make({ ...ordinary, source: 'UNLABELED' }, bad, 'PROVISIONAL_AUTO_UPHELD', 'LEVEL_2'),
    make({ ...ordinary, consequenceLevel: null, autoUpholdAllowed: false }, null, 'NEEDS_ADMIN_REVIEW', null)]
  sample[3].results.jev.error = 'TIMEOUT'; sample[3].results.jev.gate = null
  const scores = scoreRawGatedResponsibility(sample, 'jev')
  assert.equal(scores.labelled, 3); assert.equal(scores.raw.falseLevel2, 1)
  assert.equal(scores.raw.ordinalSeverityAccuracy.denominator, 2)
  assert.equal(scores.raw.unsafeAdverseRecommendations, 1)
  assert.equal(scores.gated.unsafeAutoUpholds, 0)
  assert.equal(scores.gated.safeUpholdRecall.value, 1)
  assert.equal(scores.gated.reviewRecall.value, 1)
  assert.equal(scores.providerFailures, 1); assert.equal(scores.raw.labelledWithResponse, 2)
  assert.equal(scores.gated.failureReviewCount, 1); assert.equal(scores.gated.policyReviewCount, 1)
  assert.equal(scores.raw.responsibilityAccuracy.denominator, 2)
  assert.equal(scoreRawGatedResponsibility([], 'jev').raw.responsibilityAccuracy.value, null)
})
test('raw/gated metrics expose unsafe routes independently for misclassification, missing facts and contradictions', () => {
  const label = { ...records[0].label, responsibility: 'PLATFORM_CAUSED', consequenceLevel: 'LEVEL_0', autoUpholdAllowed: false,
    needsReview: true, evidenceSufficient: false, requiredMissingEvidence: ['notification'], contradictionCritical: true }
  const normalized = { classification: 'DRIVER_CAUSED', severity: 'HIGH', evidenceSufficient: true, needsHumanReview: false }
  const row = { label, results: { jev: { normalized, error: null, gate: { route: 'PROVISIONAL_AUTO_UPHELD' }, prediction: { consequenceLevel: 'LEVEL_2' } } } }
  const scored = scoreRawGatedResponsibility([row, { ...row, label: { ...label, responsibility: 'DRIVER_CAUSED', consequenceLevel: 'LEVEL_2', evidenceSufficient: true, needsReview: false, autoUpholdAllowed: true, contradictionCritical: false, requiredMissingEvidence: [] } }], 'jev')
  assert.equal(scored.raw.falseDriverCaused, 1); assert.equal(scored.raw.falseLevel2, 1)
  assert.equal(scored.gated.unsafeAutoUpholds, 1); assert.equal(scored.gated.falseLevel2Routes, 1)
  assert.equal(scored.gated.missingEvidenceUnsafe, 1); assert.equal(scored.gated.contradictionUnsafe, 1)
  const notSevere = structuredClone(row); notSevere.results.jev.normalized.severity = 'INVALID'
  assert.equal(scoreRawGatedResponsibility([notSevere], 'jev').raw.ordinalSeverityAccuracy.value, 0)
})
test('raw and gated calculator denominators distinguish eligible, review, erroneous, waived and unlabeled populations', () => {
  const item = (truth, severity, route, edits = {}, predictionEdits = {}) => {
    const label = { ...records[0].label, responsibility: truth, consequenceLevel: truth === 'DRIVER_CAUSED' ? 'LEVEL_1' : 'LEVEL_0',
      needsReview: false, autoUpholdAllowed: false, ...edits }
    const normalized = { classification: truth, severity, evidenceSufficient: true, needsHumanReview: false, ...predictionEdits }
    const consequence = normalized.classification === 'DRIVER_CAUSED' ? (severity === 'HIGH' ? 'LEVEL_2' : 'LEVEL_1') : 'LEVEL_0'
    return { label, results: { fake: { normalized, gate: { route }, error: null, prediction: { consequenceLevel: consequence } } } }
  }
  const rows = [
    item('DRIVER_CAUSED', 'MODERATE', 'PROVISIONAL_AUTO_UPHELD', { autoUpholdAllowed: true }),
    item('DRIVER_CAUSED', 'MODERATE', 'NEEDS_ADMIN_REVIEW', { autoUpholdAllowed: true }),
    item('DRIVER_CAUSED', 'HIGH', 'NEEDS_ADMIN_REVIEW', { needsReview: true }),
    item('EXTERNAL_OR_UNCERTAIN', 'HIGH', 'PROVISIONAL_AUTO_UPHELD', { needsReview: true, evidenceSufficient: false,
      requiredMissingEvidence: ['assignment'], contradictionCritical: true }, { classification: 'DRIVER_CAUSED' }),
    item('PLATFORM_CAUSED', 'LOW', 'PROVISIONAL_AUTO_WAIVED'),
    item('VALID_WAIVED', 'LOW', 'NEEDS_ADMIN_REVIEW'),
    item('DRIVER_CAUSED', 'HIGH', 'NEEDS_ADMIN_REVIEW', { consequenceLevel: 'LEVEL_2', needsReview: true }, { needsHumanReview: true }),
    item('EXTERNAL_OR_UNCERTAIN', 'INVALID', 'NEEDS_ADMIN_REVIEW', { needsReview: true }),
    item('DRIVER_CAUSED', 'MODERATE', 'NEEDS_ADMIN_REVIEW', { consequenceLevel: null }),
    { label: { ...records[0].label, responsibility: 'PLATFORM_CAUSED', needsReview: true, autoUpholdAllowed: false },
      results: { fake: { normalized: null, gate: null, error: 'RATE_LIMIT', prediction: { consequenceLevel: null } } } },
    item('PLATFORM_CAUSED', 'HIGH', 'PROVISIONAL_AUTO_UPHELD', { source: 'UNLABELED' }, { classification: 'DRIVER_CAUSED' }),
  ]
  assert.deepEqual(scoreRawGatedResponsibility(rows, 'fake'), {
    labelled: 10, providerFailures: 1, policyEvaluated: 9,
    raw: { labelledWithResponse: 9, responsibilityAccuracy: { numerator: 8, denominator: 9, value: 8 / 9 },
      ordinalSeverityAccuracy: { numerator: 5, denominator: 8, value: 5 / 8 },
      conditionedLevelAccuracy: { numerator: 6, denominator: 8, value: 6 / 8 },
      falseDriverCaused: 1, falseHighSeverity: 2, falseLevel2: 2, unsafeAdverseRecommendations: 2 },
    gated: { unsafeAutoUpholds: 1, falseLevel2Routes: 1, missingEvidenceUnsafe: 1, contradictionUnsafe: 1,
      policyReviewCount: 6, failureReviewCount: 1, reviewRate: { numerator: 7, denominator: 10, value: .7 },
      reviewRecall: { numerator: 4, denominator: 5, value: .8 }, safeUpholdPrecision: { numerator: 1, denominator: 2, value: .5 },
      safeUpholdRecall: { numerator: 1, denominator: 2, value: .5 } },
  })
})
