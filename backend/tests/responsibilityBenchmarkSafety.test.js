import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { createResponsibilityAnalystFake } from './helpers/responsibilityAnalystFake.js'
import { buildFrozenResponsibilityBenchmarkDataset, splitResponsibilityBenchmark } from '../benchmarks/responsibility/dataset.js'
import {
  JEV_ADAPTER_VERSION, JEV_BENCHMARK_CONFIGURATION, JEV_DIRECT_ANALYST_CONTRACT_COMPATIBLE,
  JEV_DIRECT_POLICY_GATE_COMPATIBLE, RESPONSIBILITY_BENCHMARK_VERSION,
  benchmarkPredictionFromRun, createJevResponsibilityAdapter, createResponsibilityBenchmarkRunner, normalizeJevResponsibility,
  runExistingResponsibilityAnalyst, runJevResponsibilityAnalyst, simulateJevResponsibilityRoute,
} from '../benchmarks/responsibility/benchmark.js'
import { DEFAULT_RESPONSIBILITY_POLICY } from '../services/responsibilityPolicyGate.js'
import { responsibilityEvidenceHash } from '../services/responsibilityAnalyst.js'
import { responsibilityBenchmarkCohort, responsibilityBenchmarkRecordSchema, realResponsibilityBenchmarkMetadataSchema } from '../benchmarks/responsibility/contracts.js'
import { evaluateResponsibilityBenchmark } from '../benchmarks/responsibility/evaluation.js'
import { benchmarkRepeatDetails, checkPredictionInputSeparation, scoreProbabilityCalibration, scoreResponsibilityBenchmark } from '../benchmarks/responsibility/metrics.js'

const fixture = (classification = 'DRIVER_CAUSED', overrides = {}) => ({
  model: 'jev-fixture', usage: { input_tokens: 9, output_tokens: 4 }, answers: {
    responsibility: { choice: classification, confidence: 0.9, probabilities: { [classification]: 1 } },
    evidenceSufficient: { noul: 0.9 }, platformMateriallyContributed: { noul: classification === 'PLATFORM_CAUSED' ? 0.9 : 0.1 },
    externalCauseMaterial: { noul: 0.1 }, needsHumanReview: { noul: 0.1 }, severity: { score: 0, confidence: 1 },
    ...overrides,
  },
})
const evidence = () => buildFrozenResponsibilityBenchmarkDataset().find(x => x.id === 'driver_cancellation-ordinary_driver_evidence').evidence
const truth = (responsibility, overrides = {}) => ({ responsibility, needsReview: false,
  consequenceLevel: responsibility === 'DRIVER_CAUSED' ? 'LEVEL_1' : 'LEVEL_0', autoUpholdAllowed: responsibility === 'DRIVER_CAUSED',
  autoWaiveAllowed: responsibility !== 'DRIVER_CAUSED', evidenceSufficient: true, requiredMissingEvidence: [],
  contradictionCritical: false, source: 'FROZEN_SYNTHETIC', ...overrides })
const prediction = (responsibility, overrides = {}) => ({ ...truth(responsibility), ...overrides })

test('Jev rubric, thresholds, adapter identity, and request options are frozen before held-out evaluation', async () => {
  assert.equal(RESPONSIBILITY_BENCHMARK_VERSION, 'responsibility-benchmark-v1')
  assert.equal(JEV_ADAPTER_VERSION, 'jev-responsibility-benchmark-adapter-v1')
  assert.equal(JEV_DIRECT_ANALYST_CONTRACT_COMPATIBLE, false)
  assert.equal(JEV_DIRECT_POLICY_GATE_COMPATIBLE, false)
  assert.deepEqual(JEV_BENCHMARK_CONFIGURATION, {
    sdkVersion: '0.6.0', adapterVersion: 'jev-responsibility-benchmark-adapter-v1', binaryThreshold: 0.5,
    severityThresholds: [0.5, 1.5], questionsHash: 'acd405820422d6eb4df25effbaa2a8f2da00ee6c7c01839b0e1242685c65409f',
  })
  const calls = []
  const adapter = createJevResponsibilityAdapter({ client: { systemOne: async (...args) => { calls.push(args); return fixture() } } })
  assert.equal(adapter.model, 'jev-latest')
  assert.equal(adapter.configVersion, 'jev-responsibility-benchmark-adapter-v1:jev-latest')
  const result = await adapter.analyzeResponsibilityCase(evidence())
  assert.equal(calls[0][0].model, 'jev-latest')
  assert.equal(createHash('sha256').update(JSON.stringify(calls[0][0].questions)).digest('hex'), JEV_BENCHMARK_CONFIGURATION.questionsHash)
  assert.deepEqual(calls[0][1], { timeout: 10000, retry: { maxRetries: 0 } })
  assert.equal(result.raw.model, 'jev-fixture')
  assert.deepEqual(result.raw.usage, { inputTokens: 9, outputTokens: 4 })
  assert.equal(result.raw.answers.externalCauseMaterial.noul, 0.1)
  assert.equal(normalizeJevResponsibility(fixture('DRIVER_CAUSED', { severity: { score: 0.5 } })).severity, 'MODERATE')
  assert.equal(normalizeJevResponsibility(fixture('DRIVER_CAUSED', { severity: { score: 1.5 } })).severity, 'HIGH')
})

test('missing and out-of-range bounded Jev answers are invalid rather than implicit negative answers', () => {
  const fields = ['evidenceSufficient', 'platformMateriallyContributed', 'externalCauseMaterial', 'needsHumanReview']
  for (const field of fields) {
    for (const noul of [null, undefined, -0.01, 1.01, NaN, Infinity]) {
      assert.throws(() => normalizeJevResponsibility(fixture('DRIVER_CAUSED', { [field]: { noul } })), /JEV_ANSWER_INVALID/)
    }
  }
  for (const confidence of [-0.01, 1.01, null, NaN]) {
    assert.throws(() => normalizeJevResponsibility(fixture('DRIVER_CAUSED', { responsibility: { choice: 'DRIVER_CAUSED', confidence } })), /JEV_ANSWER_INVALID/)
  }
  for (const score of [-0.01, 2.01, null, NaN]) {
    assert.throws(() => normalizeJevResponsibility(fixture('DRIVER_CAUSED', { severity: { score } })), /JEV_ANSWER_INVALID/)
  }
  for (const noul of [0, 1]) {
    assert.equal(normalizeJevResponsibility(fixture('DRIVER_CAUSED', { evidenceSufficient: { noul } })).evidenceSufficient, noul === 1)
  }
})

test('gate audits and predictions expose safe uphold, waiver, and review with exact eligibility', async () => {
  const bundle = evidence()
  const eligible = normalizeJevResponsibility(fixture())
  const accepted = simulateJevResponsibilityRoute({ evidence: bundle, result: { ...eligible, confidence: 0.8 } })
  assert.equal(accepted.route, 'PROVISIONAL_AUTO_UPHELD')
  assert.equal(accepted.humanReviewRequired, false)
  assert.equal(accepted.policyVersion, DEFAULT_RESPONSIBILITY_POLICY.policyVersion)
  assert.deepEqual(accepted.failedGates, [])
  assert.deepEqual(accepted.passedGates.map(x => x.code), ['CASE_TYPE_ALLOWLIST', 'INDEPENDENT_REQUIRED_EVIDENCE',
    'INDEPENDENT_MANDATORY_REVIEW', 'INDEPENDENT_ROUTE_AUTHORITY', 'REQUIRED_EVIDENCE', 'EVIDENCE_FRESHNESS', 'EVIDENCE_QUALITY',
    'MATERIAL_CONTRADICTIONS', 'JEV_EVIDENCE_SUFFICIENT', 'JEV_HUMAN_REVIEW', 'JEV_EXTERNAL_CAUSE', 'CONFIDENCE_FLOOR',
    'SEVERITY_ALLOWLIST', 'CROSS_QUESTION_CONSISTENCY', 'AUTO_UPHOLD_ENABLED'])
  assert.equal(accepted.passedGates.every(x => x.pass === true && x.detail.length > 0), true)
  const platformEvidence = buildFrozenResponsibilityBenchmarkDataset().find(x => x.id === 'driver_cancellation-ordinary_platform_evidence').evidence
  const jevRun = await runJevResponsibilityAnalyst(platformEvidence, { adapter: createJevResponsibilityAdapter({ client: { systemOne: async () => fixture('PLATFORM_CAUSED') } }) })
  assert.deepEqual(benchmarkPredictionFromRun(jevRun), { responsibility: 'PLATFORM_CAUSED', needsReview: false, consequenceLevel: 'LEVEL_0',
    autoUpholdAllowed: false, autoWaiveAllowed: true, evidenceSufficient: true, reportedEvidenceSufficient: true,
    confidence: 0.9, probabilities: { PLATFORM_CAUSED: 1 } })
  for (const mode of ['malformed', 'invented_evidence_reference', 'contradictory_analysis', 'missing_evidence_reference']) {
    const run = await runExistingResponsibilityAnalyst(bundle, { analyst: createResponsibilityAnalystFake(mode) })
    const p = benchmarkPredictionFromRun(run)
    assert.equal(p.autoUpholdAllowed, false, mode)
    assert.equal(p.autoWaiveAllowed, false, mode)
    assert.equal(p.evidenceSufficient, false, mode)
    assert.equal(p.needsReview, true, mode)
  }
})

test('safety metrics distinguish unknown human eligibility, false raw sufficiency, and both punishment error directions', () => {
  const scored = scoreResponsibilityBenchmark([
    { label: truth('DRIVER_CAUSED', { autoUpholdAllowed: null, consequenceLevel: null, needsReview: null, evidenceSufficient: null }), prediction: prediction('DRIVER_CAUSED', { consequenceLevel: 'LEVEL_2' }) },
    { label: truth('DRIVER_CAUSED'), prediction: prediction('VALID_WAIVED') },
    { label: truth('EXTERNAL_OR_UNCERTAIN', { needsReview: true, evidenceSufficient: false }), prediction: prediction('EXTERNAL_OR_UNCERTAIN', { needsReview: true, evidenceSufficient: false, reportedEvidenceSufficient: true }) },
    { label: truth('PLATFORM_CAUSED'), prediction: prediction('DRIVER_CAUSED', { consequenceLevel: 'LEVEL_2' }) },
  ])
  assert.deepEqual(scored.safety, { unsafeAutoUphold: 1, falseDriverCaused: 1, falseLevel2: 1, falseAutoWaive: 1,
    missedReview: 0, falseEvidenceSufficient: 1, platformToDriver: 1, externalToDriver: 0, contradictionSafety: 0, missingEvidenceSafety: 0,
    humanReviewRecall: 1 })
  assert.deepEqual(scored.automationCoverage, { autoUphold: 0.5, autoWaive: 0.5, review: 0.25 })
  assert.deepEqual(scored.eligibleCoverage, { autoUphold: { eligibleCount: 1, coveredCount: 0, rate: 0 },
    autoWaive: { eligibleCount: 2, coveredCount: 1, rate: 0.5 }, review: { eligibleCount: 1, coveredCount: 1, rate: 1 } })
  assert.equal(scored.severity.confusionMatrix.LEVEL_0.LEVEL_2, 1)
  assert.equal(scored.severity.confusionMatrix.LEVEL_1.LEVEL_0, 1)
})

test('empty automation eligibility is unmeasured rather than zero observed coverage', () => {
  const notMeasured = { eligibleCount: 0, coveredCount: 0, rate: null }
  assert.deepEqual(scoreResponsibilityBenchmark([]).eligibleCoverage,
    { autoUphold: notMeasured, autoWaive: notMeasured, review: notMeasured })
  const score = scoreResponsibilityBenchmark([{ label: truth('DRIVER_CAUSED'), prediction: prediction('DRIVER_CAUSED') }])
  assert.deepEqual(score.eligibleCoverage.autoUphold, { eligibleCount: 1, coveredCount: 1, rate: 1 })
  const absent = scoreResponsibilityBenchmark([{ label: truth('DRIVER_CAUSED'), prediction: null }])
  assert.deepEqual(absent.eligibleCoverage.autoUphold, { eligibleCount: 1, coveredCount: 0, rate: 0 })
})

test('offline evaluation keeps asymmetric systems, cohorts, failures, usage, and repeats distinct', () => {
  const primary = [
    { id: 'a', runNumber: 1, cohort: 'A_FROZEN_SYNTHETIC', label: truth('DRIVER_CAUSED'), existingPrediction: prediction('DRIVER_CAUSED'), jevPrediction: prediction('VALID_WAIVED'),
      existing: { latencyMs: 10, raw: { usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5, requestCount: 1 } }, error: null },
      jev: { latencyMs: 100, raw: { usage: { inputTokens: 4, outputTokens: 1 } }, error: null } },
    { id: 'b', runNumber: 1, cohort: 'B_ADVERSARIAL_SAFETY', label: truth('VALID_WAIVED'), existingPrediction: prediction('DRIVER_CAUSED'), jevPrediction: prediction('VALID_WAIVED'),
      existing: { latencyMs: 999, raw: { usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, requestCount: 0 } }, error: 'timeout' },
      jev: { latencyMs: 200, raw: { usage: { inputTokens: 7, outputTokens: 2 } }, error: null } },
    { id: 'c', runNumber: 1, cohort: 'D_REAL_UNLABELED', label: { ...truth('DRIVER_CAUSED'), source: 'UNLABELED' },
      existingPrediction: prediction('DRIVER_CAUSED'), jevPrediction: prediction('VALID_WAIVED'),
      existing: { latencyMs: 20, raw: null, error: null }, jev: { latencyMs: 300, raw: null, error: null } },
  ]
  const evaluation = evaluateResponsibilityBenchmark([...primary, { ...primary[0], runNumber: 2, existingPrediction: prediction('PLATFORM_CAUSED') }])
  assert.equal(evaluation.cases, 3)
  assert.equal(evaluation.labeledCases, 2)
  assert.equal(evaluation.unlabeledCases, 1)
  assert.equal(evaluation.existing.scores.overall.accuracy, 0.5)
  assert.equal(evaluation.jev.scores.overall.accuracy, 0.5)
  assert.equal(evaluation.existing.cohortScores.A_FROZEN_SYNTHETIC.overall.accuracy, 1)
  assert.equal(evaluation.jev.cohortScores.A_FROZEN_SYNTHETIC.overall.accuracy, 0)
  assert.equal(evaluation.existing.cohortScores.B_ADVERSARIAL_SAFETY.overall.accuracy, 0)
  assert.equal(evaluation.jev.cohortScores.B_ADVERSARIAL_SAFETY.overall.accuracy, 1)
  assert.equal(evaluation.existing.cohortScores.D_REAL_UNLABELED.labeledCount, 0)
  assert.equal(evaluation.existing.consistency.consistencyRate, 0)
  assert.equal(evaluation.jev.consistency.consistencyRate, 1)
  assert.deepEqual(evaluation.existing.failures, { requests: 4, errors: 1, errorRate: 0.25 })
  assert.deepEqual(evaluation.jev.failures, { requests: 4, errors: 0, errorRate: 0 })
  assert.deepEqual(evaluation.existing.operations.latencyMs, { mean: 40 / 3, p50: 10, p95: 20, p99: null, count: 3 })
  assert.equal(evaluation.jev.operations.usage.totalTokens.total, 19)
  assert.equal(evaluation.existing.operations.usage.totalTokens.total, 10)
  assert.equal(evaluation.existing.operations.usage.requestCount.total, 3)
  assert.equal(evaluation.existing.cost, 'NOT_AUTHORITATIVELY_AVAILABLE')
  assert.equal(evaluation.jev.cost, 'NOT_AUTHORITATIVELY_AVAILABLE')
})

test('calibration math and label leakage checks are hand-checkable and reject nested labels', () => {
  const result = scoreProbabilityCalibration([
    { label: truth('DRIVER_CAUSED'), predictedResponsibility: 'DRIVER_CAUSED', probabilities: { DRIVER_CAUSED: 0.75, PLATFORM_CAUSED: 0.25 } },
    { label: truth('PLATFORM_CAUSED'), predictedResponsibility: 'DRIVER_CAUSED', probabilities: { DRIVER_CAUSED: 0.75, PLATFORM_CAUSED: 0.25 } },
  ])
  assert.deepEqual(result, { count: 2, brierScore: 0.625, buckets: [{ bucket: 7, count: 2, meanConfidence: 0.75, accuracy: 0.5 }] })
  assert.equal(checkPredictionInputSeparation({ modelInput: { evidence: { a: { label: 'bad' }, b: 1 } } }), false)
  assert.equal(checkPredictionInputSeparation({ modelInput: { evidence: { a: [{ value: '__BENCHMARK_LABEL_SENTINEL__' }] } } }), false)
  assert.equal(checkPredictionInputSeparation({ modelInput: { evidence: { a: [{ value: 1 }], b: null }, other: true } }), false)
  const split = splitResponsibilityBenchmark(buildFrozenResponsibilityBenchmarkDataset())
  assert.deepEqual(split.heldOutScenarioFamilies, ['driverSevere', 'impossible', 'provenance', 'providerDelivery', 'routeConflict', 'timestamps', 'validWaiver'])
  assert.equal(split.heldOut.length, 56)
  assert.equal(split.development.length, 98)
})

test('calibration excludes unlabeled outcomes and invalid probability distributions', () => {
  const valid = { label: truth('DRIVER_CAUSED'), predictedResponsibility: 'DRIVER_CAUSED', probabilities: { DRIVER_CAUSED: 1 } }
  const invalid = [
    { ...valid, label: { ...valid.label, source: 'UNLABELED' } },
    { ...valid, predictedResponsibility: 'NEEDS_REVIEW' },
    { ...valid, probabilities: { DRIVER_CAUSED: -0.1, PLATFORM_CAUSED: 1.1 } },
    { ...valid, probabilities: { DRIVER_CAUSED: NaN } },
    { ...valid, probabilities: { DRIVER_CAUSED: Infinity } },
    { ...valid, probabilities: { DRIVER_CAUSED: 0.8 } },
    { ...valid, probabilities: {} },
    { ...valid, probabilities: { DRIVER_CAUSED: 1, UNRECOGNIZED: 0 } },
  ]
  assert.deepEqual(scoreProbabilityCalibration(invalid), { count: 0, brierScore: null, buckets: [] })
  assert.deepEqual(scoreProbabilityCalibration([...invalid, valid]), { count: 1, brierScore: 0,
    buckets: [{ bucket: 9, count: 1, meanConfidence: 1, accuracy: 1 }] })
  const zeroPrediction = { ...valid, predictedResponsibility: 'PLATFORM_CAUSED' }
  assert.deepEqual(scoreProbabilityCalibration([zeroPrediction]), { count: 1, brierScore: 0,
    buckets: [{ bucket: 0, count: 1, meanConfidence: 0, accuracy: 0 }] })
})

test('repeat details reveal individual judgment changes and measured numeric variance', () => {
  const rows = [
    { id: 'stable', prediction: { responsibility: 'DRIVER_CAUSED', needsReview: false, consequenceLevel: 'LEVEL_1',
      confidence: 0.5, probabilities: { DRIVER_CAUSED: 0.5 } }, severityScore: 0 },
    { id: 'stable', prediction: { responsibility: 'DRIVER_CAUSED', needsReview: false, consequenceLevel: 'LEVEL_1',
      confidence: 1, probabilities: { DRIVER_CAUSED: 1 } }, severityScore: 2 },
    { id: 'unstable', prediction: { responsibility: 'PLATFORM_CAUSED', needsReview: false, consequenceLevel: 'LEVEL_0',
      confidence: 0.8 }, severityScore: null },
    { id: 'unstable', prediction: { responsibility: 'EXTERNAL_OR_UNCERTAIN', needsReview: true, consequenceLevel: 'LEVEL_2',
      confidence: null }, severityScore: 1 },
    { id: 'single', prediction: { responsibility: 'VALID_WAIVED' } },
  ]
  const variance = { DRIVER_CAUSED: null, PLATFORM_CAUSED: null, VALID_WAIVED: null, EXTERNAL_OR_UNCERTAIN: null }
  assert.deepEqual(benchmarkRepeatDetails(rows), { comparedCases: 2, classificationConsistencyRate: 0.5,
    reviewConsistencyRate: 0.5, severityConsistencyRate: 0.5, cases: [
      { id: 'stable', runs: 2, sameClassification: true, sameReview: true, sameSeverity: true,
        confidenceVariance: 0.0625, severityScoreVariance: 1, probabilityVariance: { ...variance, DRIVER_CAUSED: 0.0625 } },
      { id: 'unstable', runs: 2, sameClassification: false, sameReview: false, sameSeverity: false,
        confidenceVariance: null, severityScoreVariance: null, probabilityVariance: variance },
    ] })
  assert.deepEqual(benchmarkRepeatDetails([]), { comparedCases: 0, classificationConsistencyRate: 0,
    reviewConsistencyRate: 0, severityConsistencyRate: 0, cases: [] })
})

test('output diagnostics separate provider, timeout, schema, and grounding failures without semantic overclaims', () => {
  const runs = [
    { error: 'provider unavailable' }, { error: 'timed out' }, { error: 'JEV_ANSWER_INVALID' },
    { error: 'returned no structured output' },
    { error: null, gate: { failedGates: [{ code: 'ANALYSIS_VALIDATION', detail: 'INVENTED_EVIDENCE_REFERENCE,SELF_CONTRADICTORY_FACTS' }] } },
    { error: null, gate: { failedGates: [{ code: 'AI_REPORTED_MISSING_EVIDENCE', detail: 'reported' }] } },
    { error: null, gate: { failedGates: [{ code: 'ANALYSIS_VALIDATION', detail: 'ANALYSIS_SCHEMA_INVALID' }] } },
    { error: null, gate: { failedGates: [] } },
  ]
  const records = runs.map((existing, index) => ({ id: `diagnostic-${index}`, runNumber: 1,
    cohort: 'D_REAL_UNLABELED', label: null, existing, jev: null,
    existingPrediction: prediction('NEEDS_REVIEW', { needsReview: true }), jevPrediction: prediction('VALID_WAIVED') }))
  const evaluated = evaluateResponsibilityBenchmark(records)
  assert.deepEqual(evaluated.existing.outputDiagnostics, { providerErrors: 1, timeouts: 1, structuredOutputFailures: 3,
    invalidAnalyses: 2, inventedEvidenceReferences: 1, selfContradictoryFacts: 1, reportedMissingEvidenceCases: 1,
    manualReviewRoutes: 8, retryCount: null, unsupportedFactualClaims: 'NOT_SEMANTICALLY_VERIFIED' })
  assert.deepEqual(evaluated.jev.outputDiagnostics, { providerErrors: 0, timeouts: 0, structuredOutputFailures: 0,
    invalidAnalyses: 0, inventedEvidenceReferences: 0, selfContradictoryFacts: 0, reportedMissingEvidenceCases: 0,
    manualReviewRoutes: 0, retryCount: null, unsupportedFactualClaims: 'NOT_SEMANTICALLY_VERIFIED' })
})

test('missing Jev answers and typed parse errors are structured failures, not provider outages', async () => {
  for (const field of ['responsibility', 'evidenceSufficient', 'platformMateriallyContributed', 'externalCauseMaterial', 'needsHumanReview', 'severity']) {
    const response = fixture()
    delete response.answers[field]
    assert.throws(() => normalizeJevResponsibility(response), /JEV_ANSWER_INVALID/)
  }
  for (const response of [null, {}, { answers: null }]) assert.throws(() => normalizeJevResponsibility(response), /JEV_ANSWER_INVALID/)
  const bundle = evidence()
  const malformed = await runJevResponsibilityAnalyst(bundle, { adapter: createJevResponsibilityAdapter({ client: { systemOne: async () => ({}) } }) })
  assert.equal(malformed.errorCategory, 'SCHEMA')
  const typed = new Error('[{"code":"invalid_type"}]')
  typed.name = 'ZodError'
  const analyst = { provider: 'openai', model: 'test', analyzeResponsibilityCase: async () => { throw typed } }
  const parsed = await runExistingResponsibilityAnalyst(bundle, { analyst })
  assert.equal(parsed.errorCategory, 'SCHEMA')
  const timeout = await runExistingResponsibilityAnalyst(bundle, { analyst: { ...analyst, analyzeResponsibilityCase: async () => { throw new Error('AI timeout') } } })
  assert.equal(timeout.errorCategory, 'TIMEOUT')
  const evaluated = evaluateResponsibilityBenchmark([{ id: 'typed', cohort: 'D_REAL_UNLABELED', runNumber: 1, label: null,
    existing: parsed, jev: malformed, existingPrediction: benchmarkPredictionFromRun(parsed), jevPrediction: benchmarkPredictionFromRun(malformed) },
  { id: 'timeout', cohort: 'D_REAL_UNLABELED', runNumber: 1, label: null, existing: timeout, jev: null,
    existingPrediction: benchmarkPredictionFromRun(timeout), jevPrediction: prediction('VALID_WAIVED') }])
  assert.equal(evaluated.existing.outputDiagnostics.structuredOutputFailures, 1)
  assert.equal(evaluated.existing.outputDiagnostics.timeouts, 1)
  assert.equal(evaluated.jev.outputDiagnostics.structuredOutputFailures, 1)
  assert.equal(evaluated.jev.outputDiagnostics.providerErrors, 0)
})

test('audit identity and elapsed time survive success, failure, and backwards wall-clock movement', async t => {
  let now = 1000
  t.mock.method(Date, 'now', () => now)
  const bundle = evidence()
  const fake = createResponsibilityAnalystFake('driver_caused')
  const analyst = { ...fake, analyzeResponsibilityCase: async input => { now = 1050; return fake.analyzeResponsibilityCase(input) } }
  const adapter = { provider: 'typesafe-ai', model: 'audit-jev', configVersion: 'audit-config', analyzeResponsibilityCase: async () => {
    now = 1040; return { raw: fixture(), normalized: normalizeJevResponsibility(fixture()) }
  } }
  const successful = await runExistingResponsibilityAnalyst(bundle, { analyst })
  assert.equal(successful.latencyMs, 50)
  const backwards = await runJevResponsibilityAnalyst(bundle, { adapter })
  assert.equal(backwards.latencyMs, 0)
  const failing = await runJevResponsibilityAnalyst(bundle, { adapter: { ...adapter, analyzeResponsibilityCase: async () => {
    now = 1090; throw new Error('provider failure')
  } } })
  assert.equal(failing.latencyMs, 50)
  assert.equal(failing.provider, 'typesafe-ai')
  assert.equal(failing.model, 'audit-jev')
  assert.equal(failing.configVersion, 'audit-config')
  const [record] = await createResponsibilityBenchmarkRunner({ existingAnalyst: fake, jevAdapter: adapter }).run([
    { id: 'audit-case', caseId: 'audit-source', evidence: bundle, label: truth('DRIVER_CAUSED'), cohort: 'A_FROZEN_SYNTHETIC', scenario: 'audit' },
  ], { runNumber: 3 })
  assert.equal(record.version, 'responsibility-benchmark-v1')
  assert.equal(record.runNumber, 3)
  assert.equal(record.id, 'audit-case')
  assert.equal(record.caseKey, createHash('sha256').update('audit-source').digest('hex').slice(0, 24))
  assert.equal(record.caseType, bundle.caseType)
  assert.equal(record.evidenceHash, responsibilityEvidenceHash(bundle))
  assert.equal(record.evidenceVersion, bundle.evidenceVersion)
  assert.equal(Number.isFinite(Date.parse(record.recordedAt)), true)
  assert.equal(record.cohort, 'A_FROZEN_SYNTHETIC')
  assert.equal(record.scenario, 'audit')
})

test('input identity requires the exact snapshot and hash, not just a matching case ID', () => {
  const record = structuredClone(buildFrozenResponsibilityBenchmarkDataset()[0])
  const changed = structuredClone(record)
  changed.modelInput.evidence.timeline[0].value = { differentFacts: true }
  assert.equal(changed.modelInput.evidence.caseId, changed.evidence.caseId)
  assert.throws(() => responsibilityBenchmarkRecordSchema.parse(changed), /Model input must use the record evidence/)
  assert.throws(() => responsibilityBenchmarkRecordSchema.parse({ ...record, evidenceHash: '0'.repeat(64) }), /Evidence hash must match/)
  assert.equal(responsibilityBenchmarkRecordSchema.safeParse({ ...record, evidence: { ...record.evidence, caseId: '' } }).success, false)
  const metadata = { cohort: 'C_REAL_LABELED', externalCaseReference: 'opaque-source', evidenceVersion: record.evidence.evidenceVersion,
    evidenceHash: record.evidenceHash, labelSource: 'ADMIN_HUMAN' }
  for (const hash of [`x${record.evidenceHash}`, `${record.evidenceHash}x`]) {
    assert.equal(responsibilityBenchmarkRecordSchema.safeParse({ ...record, evidenceHash: hash }).success, false)
    assert.equal(realResponsibilityBenchmarkMetadataSchema.safeParse({ ...metadata, evidenceHash: hash }).success, false)
  }
  assert.deepEqual(Object.values(responsibilityBenchmarkCohort), ['A_FROZEN_SYNTHETIC', 'B_ADVERSARIAL_SAFETY', 'C_REAL_LABELED', 'D_REAL_UNLABELED'])
})

test('adverse safety is denied by either non-driver truth or an explicit ineligible driver label', () => {
  const records = [
    { label: truth('DRIVER_CAUSED', { autoUpholdAllowed: false }), prediction: prediction('DRIVER_CAUSED') },
    { label: truth('PLATFORM_CAUSED', { autoUpholdAllowed: null }), prediction: prediction('DRIVER_CAUSED') },
  ]
  assert.equal(scoreResponsibilityBenchmark(records).safety.unsafeAutoUphold, 2)
  for (const overrides of [{ needsReview: false, evidenceSufficient: false }, { needsReview: true, evidenceSufficient: true }]) {
    const score = scoreResponsibilityBenchmark([{ label: truth('EXTERNAL_OR_UNCERTAIN', { contradictionCritical: true,
      requiredMissingEvidence: ['location'] }), prediction: prediction('EXTERNAL_OR_UNCERTAIN', overrides) }])
    assert.equal(score.safety.contradictionSafety, 1)
    assert.equal(score.safety.missingEvidenceSafety, 1)
  }
})
