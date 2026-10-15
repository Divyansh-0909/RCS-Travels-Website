import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { createResponsibilityEvidence, evidenceCategory, responsibilityCaseType } from './helpers/responsibilityEvidence.js'
import { responsibilityCaseState } from '../services/responsibilityCaseState.js'
import { DEFAULT_RESPONSIBILITY_POLICY, provisionalResponsibilityRoute } from '../services/responsibilityPolicyGate.js'
import {
  benchmarkPredictionFromRun,
  createAppendOnlyResponsibilityArtifactWriter,
  createReadOnlyResponsibilityBenchmarkLoader,
  normalizeJevResponsibility,
  runExistingResponsibilityAnalyst,
  runJevResponsibilityAnalyst,
  simulateJevResponsibilityRoute,
} from '../benchmarks/responsibility/benchmark.js'
import {
  consequenceLevel,
  resolveResponsibilityGroundTruth,
  responsibilityBenchmarkCohort,
  responsibilityBenchmarkRecordSchema,
  responsibilityGroundTruthSource,
} from '../benchmarks/responsibility/contracts.js'
import {
  buildFrozenResponsibilityBenchmarkDataset,
  splitResponsibilityBenchmark,
} from '../benchmarks/responsibility/dataset.js'
import {
  aggregateBenchmarkConsistency,
  aggregateBenchmarkOperationalStats,
  checkPredictionInputSeparation,
  classifyBenchmarkDisagreements,
  scoreProbabilityCalibration,
  scoreResponsibilityBenchmark,
} from '../benchmarks/responsibility/metrics.js'
import { evaluateResponsibilityBenchmark } from '../benchmarks/responsibility/evaluation.js'
import {
  main,
  parseResponsibilityBenchmarkOptions,
  runResponsibilityBenchmark,
} from '../benchmarks/responsibility/run.js'

const fixed = '2026-09-25T06:00:00.000Z'

const bundle = (caseId = 'coverage-case', { complete = true } = {}) => {
  const journal = createResponsibilityEvidence({
    caseId,
    bookingId: `booking-${caseId}`,
    caseType: responsibilityCaseType.DRIVER_CANCELLATION,
    occurredAt: fixed,
  })
  journal.record({ category: evidenceCategory.BOOKING, kind: 'booking', source: 'fixture', value: {} })
  if (complete) {
    journal.record({ category: evidenceCategory.ASSIGNMENT, kind: 'assignment', source: 'fixture', value: {}, quality: { fresh: true } })
    journal.record({ category: evidenceCategory.CANCELLATION, kind: 'cancellation', source: 'fixture',
      value: { initiator: 'driver', avoidable: true, platformIssueObserved: false }, quality: { fresh: true } })
  }
  return journal.snapshot()
}

const jevResponse = ({
  classification = 'DRIVER_CAUSED', confidence = 0.9, sufficient = 0.9, platform = 0.1,
  external = 0.1, review = 0.1, severity = 0, model = 'jev-test', usage = {}, probabilities,
} = {}) => ({
  model,
  usage,
  answers: {
    responsibility: { choice: classification, confidence, probabilities },
    evidenceSufficient: { noul: sufficient },
    platformMateriallyContributed: { noul: platform },
    externalCauseMaterial: { noul: external },
    needsHumanReview: { noul: review },
    severity: { score: severity, confidence: 0.8, probabilities: { LOW: 0.8, ignored: 'x' } },
  },
})

const label = (responsibility, overrides = {}) => ({
  responsibility,
  needsReview: false,
  consequenceLevel: consequenceLevel.LEVEL_1,
  autoUpholdAllowed: false,
  autoWaiveAllowed: false,
  evidenceSufficient: true,
  requiredMissingEvidence: [],
  contradictionCritical: false,
  source: responsibilityGroundTruthSource.FROZEN_SYNTHETIC,
  ...overrides,
})

const prediction = (responsibility, overrides = {}) => ({
  responsibility,
  needsReview: false,
  consequenceLevel: consequenceLevel.LEVEL_1,
  autoUpholdAllowed: false,
  autoWaiveAllowed: false,
  evidenceSufficient: true,
  confidence: 0.9,
  probabilities: null,
  ...overrides,
})

test('benchmark record schema rejects model-input drift and labeled unlabeled-real records', () => {
  const [record] = buildFrozenResponsibilityBenchmarkDataset()
  const mismatched = structuredClone(record)
  mismatched.modelInput.evidence.caseId = 'different-case'
  const mismatchResult = responsibilityBenchmarkRecordSchema.safeParse(mismatched)
  assert.equal(mismatchResult.success, false)
  assert.match(mismatchResult.error.issues[0].message, /record evidence/)

  const incorrectlyLabeled = structuredClone(record)
  incorrectlyLabeled.cohort = responsibilityBenchmarkCohort.REAL_UNLABELED
  const unlabeledResult = responsibilityBenchmarkRecordSchema.safeParse(incorrectlyLabeled)
  assert.equal(unlabeledResult.success, false)
  assert.match(unlabeledResult.error.issues.at(-1).message, /cannot include ground truth/)
  assert.equal(resolveResponsibilityGroundTruth([]), null)
})

test('Jev normalization validates classifications, required answers, thresholds, severity, and safe metadata', () => {
  const low = normalizeJevResponsibility(jevResponse({ sufficient: 0.5, severity: 0.49, usage: { input_tokens: 3, output_tokens: 2 }, probabilities: { DRIVER_CAUSED: 0.8, bad: 'x' } }))
  assert.equal(low.evidenceSufficient, true)
  assert.equal(low.severity, 'LOW')
  assert.deepEqual(low.probabilities, { DRIVER_CAUSED: 0.8 })
  assert.equal(normalizeJevResponsibility(jevResponse({ severity: 1 })).severity, 'MODERATE')
  assert.equal(normalizeJevResponsibility(jevResponse({ severity: 2 })).severity, 'HIGH')
  assert.throws(() => normalizeJevResponsibility(jevResponse({ classification: 'UNSUPPORTED' })), /JEV_CLASSIFICATION_INVALID/)
  assert.throws(() => normalizeJevResponsibility(jevResponse({ confidence: null })), /JEV_ANSWER_INVALID/)
  assert.throws(() => normalizeJevResponsibility(jevResponse({ severity: null })), /JEV_ANSWER_INVALID/)

  const missingMetadata = jevResponse({ model: null, usage: null, probabilities: undefined })
  const normalized = normalizeJevResponsibility(missingMetadata)
  assert.equal(normalized.classification, 'DRIVER_CAUSED')
})

test('Jev gate simulation fails closed across missing, low-quality, contradictory, external, and disabled-policy paths', () => {
  const eligible = normalizeJevResponsibility(jevResponse())
  const missingGate = simulateJevResponsibilityRoute({ evidence: bundle('missing', { complete: false }), result: eligible })
  assert.equal(missingGate.route, provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW)
  assert.equal(missingGate.failedGates.some(item => item.code === 'REQUIRED_EVIDENCE'), true)

  const unknownGate = simulateJevResponsibilityRoute({ evidence: bundle('unknown-case'), result: eligible, policy: { policyVersion: 'test', cases: {} } })
  assert.equal(unknownGate.route, provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW)

  const qualityEvidence = structuredClone(bundle('quality'))
  qualityEvidence.timeline[0].quality.invalid = true
  assert.equal(simulateJevResponsibilityRoute({ evidence: qualityEvidence, result: eligible }).route, provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW)

  const derivedEvidence = structuredClone(bundle('derived'))
  derivedEvidence.timeline[0].basis = 'derived'
  derivedEvidence.timeline[0].derivedFrom = ['missing-id']
  assert.equal(simulateJevResponsibilityRoute({ evidence: derivedEvidence, result: eligible }).route, provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW)

  const contradictory = structuredClone(bundle('contradictory'))
  contradictory.contradictions.push({ claimKey: 'driver.position', observations: [] })
  assert.equal(simulateJevResponsibilityRoute({ evidence: contradictory, result: eligible }).route, provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW)

  const insufficient = normalizeJevResponsibility(jevResponse({ sufficient: 0.1 }))
  assert.equal(simulateJevResponsibilityRoute({ evidence: bundle('insufficient'), result: insufficient }).route, provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW)
  const humanReview = normalizeJevResponsibility(jevResponse({ review: 0.9 }))
  assert.equal(simulateJevResponsibilityRoute({ evidence: bundle('review'), result: humanReview }).route, provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW)
  const external = normalizeJevResponsibility(jevResponse({ classification: 'EXTERNAL_OR_UNCERTAIN', external: 0.9 }))
  assert.equal(simulateJevResponsibilityRoute({ evidence: bundle('external'), result: external }).route, provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW)

  const platform = normalizeJevResponsibility(jevResponse({ classification: 'PLATFORM_CAUSED', platform: 0.9 }))
  assert.equal(simulateJevResponsibilityRoute({ evidence: bundle('platform'), result: platform }).route, provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW)
  const inconsistentPlatform = normalizeJevResponsibility(jevResponse({ classification: 'PLATFORM_CAUSED', platform: 0.1 }))
  assert.equal(simulateJevResponsibilityRoute({ evidence: bundle('platform-inconsistent'), result: inconsistentPlatform }).route, provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW)
  const waived = normalizeJevResponsibility(jevResponse({ classification: 'VALID_WAIVED' }))
  assert.equal(simulateJevResponsibilityRoute({ evidence: bundle('waived'), result: waived }).route, provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW)
  assert.equal(simulateJevResponsibilityRoute({ evidence: bundle('unsupported-result'), result: { ...eligible, classification: 'NEEDS_REVIEW' } }).route, provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW)

  const unavailableEvidence = structuredClone(bundle('unavailable-extra'))
  unavailableEvidence.timeline.push({
    id: 'ev_extra', category: evidenceCategory.NOTIFICATION, kind: 'unknown-delivery', value: null, source: 'fixture',
    basis: 'direct', derivedFrom: [], availability: 'unknown', claimKey: null, observedAt: fixed, receivedAt: fixed, quality: {},
  })
  assert.equal(simulateJevResponsibilityRoute({ evidence: unavailableEvidence, result: eligible }).route, provisionalResponsibilityRoute.PROVISIONAL_AUTO_UPHELD)

  const basePolicy = structuredClone(DEFAULT_RESPONSIBILITY_POLICY)
  basePolicy.cases.DRIVER_CANCELLATION.autoUpholdAllowed = false
  assert.equal(simulateJevResponsibilityRoute({ evidence: bundle('uphold-disabled'), result: eligible, policy: basePolicy }).route, provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW)
  basePolicy.cases.DRIVER_CANCELLATION.autoWaiveAllowed = false
  assert.equal(simulateJevResponsibilityRoute({ evidence: bundle('waive-disabled'), result: waived, policy: basePolicy }).route, provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW)

  const missingFreshnessLimit = structuredClone(DEFAULT_RESPONSIBILITY_POLICY)
  missingFreshnessLimit.cases.DRIVER_CANCELLATION.maxAgeMsByCategory = {}
  const noFreshMarkers = structuredClone(bundle('missing-freshness-limit'))
  for (const item of noFreshMarkers.timeline) {
    item.quality = {}
    if (item.category !== evidenceCategory.BOOKING) {
      item.observedAt = '2026-09-25T05:59:59.000Z'
      item.receivedAt = fixed
    }
  }
  assert.equal(simulateJevResponsibilityRoute({ evidence: noFreshMarkers, result: eligible, policy: missingFreshnessLimit }).route, provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW)
})

test('freshness fallback uses age metadata and timestamps conservatively', () => {
  const eligible = normalizeJevResponsibility(jevResponse())
  const ageEvidence = structuredClone(bundle('age'))
  for (const item of ageEvidence.timeline) {
    if (item.category !== evidenceCategory.BOOKING) item.quality = { ageMs: 0 }
  }
  assert.equal(simulateJevResponsibilityRoute({ evidence: ageEvidence, result: eligible }).route, provisionalResponsibilityRoute.PROVISIONAL_AUTO_UPHELD)

  const timestampEvidence = structuredClone(bundle('timestamp'))
  for (const item of timestampEvidence.timeline) {
    if (item.category === evidenceCategory.BOOKING) continue
    item.quality = {}
    item.observedAt = '2026-09-25T06:00:00.000Z'
    item.receivedAt = '2026-09-25T06:00:00.000Z'
  }
  assert.equal(simulateJevResponsibilityRoute({ evidence: timestampEvidence, result: eligible }).route, provisionalResponsibilityRoute.PROVISIONAL_AUTO_UPHELD)

  const invalidTimestamp = structuredClone(timestampEvidence)
  invalidTimestamp.timeline.find(item => item.category === evidenceCategory.ASSIGNMENT).observedAt = 'invalid'
  assert.equal(simulateJevResponsibilityRoute({ evidence: invalidTimestamp, result: eligible }).route, provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW)
})

test('analyst wrappers redact failures and normalized predictions fail closed', async () => {
  const evidence = bundle('wrappers')
  const existingFailure = await runExistingResponsibilityAnalyst(evidence, {
    analyst: { provider: 'openai', model: 'test', analyzeResponsibilityCase: async () => { throw 'raw failure' } },
  })
  assert.equal(existingFailure.error, 'benchmark request failed')
  assert.equal(benchmarkPredictionFromRun(existingFailure).responsibility, 'NEEDS_REVIEW')
  assert.equal(benchmarkPredictionFromRun(existingFailure).evidenceSufficient, false)

  const jevFailure = await runJevResponsibilityAnalyst(evidence, {
    adapter: { provider: 'typesafe-ai', model: 'test', configVersion: 'test', analyzeResponsibilityCase: async () => { throw new Error('sk-secret-token') } },
  })
  assert.equal(jevFailure.error.includes('secret-token'), false)

  const malformed = await runExistingResponsibilityAnalyst(evidence, {
    analyst: { provider: 'openai', model: 'test', analyzeResponsibilityCase: async () => ({ malformed: true }) },
  })
  assert.equal(malformed.raw.analysisId, null)
  assert.equal(malformed.raw.contractVersion, null)
  assert.equal(malformed.raw.provider, null)
  assert.equal(malformed.raw.model, null)
  assert.equal(malformed.raw.usage, null)
  assert.equal(malformed.raw.output, null)
  assert.equal(malformed.gate.route, provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW)

  const partialOutput = await runExistingResponsibilityAnalyst(evidence, {
    analyst: { provider: 'openai', model: 'test', analyzeResponsibilityCase: async () => ({
      usage: { inputTokens: 'bad', outputTokens: null, totalTokens: 5, requestCount: 1 },
      output: { suggestedClassification: 'DRIVER_CAUSED', confidence: 0.9, severityAssessment: 'LOW', suggestedActionCategory: 'AUTO_UPHOLD_CANDIDATE' },
    }) },
  })
  assert.deepEqual(partialOutput.raw.usage, { inputTokens: null, outputTokens: null, totalTokens: 5, requestCount: 1 })
  assert.equal(partialOutput.raw.output.factCount, 0)
  assert.equal(partialOutput.raw.output.inferenceCount, 0)
  assert.equal(partialOutput.gate.route, provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW)

  assert.deepEqual(benchmarkPredictionFromRun(null), {
    responsibility: 'NEEDS_REVIEW', needsReview: true, consequenceLevel: 'LEVEL_0', autoUpholdAllowed: false,
    autoWaiveAllowed: false, evidenceSufficient: false, reportedEvidenceSufficient: null, confidence: null, probabilities: null,
  })
  assert.equal(benchmarkPredictionFromRun({ normalized: { classification: 'DRIVER_CAUSED', severity: 'HIGH', confidence: 1 }, gate: { route: provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW, failedGates: [{ code: 'EVIDENCE_QUALITY' }] } }).consequenceLevel, 'LEVEL_2')
})

test('read-only loader filters invalid snapshots, supports case filters, and recognizes human-final sources', async () => {
  const evidence = bundle('loader-coverage')
  let query = null
  const rows = [
    { id: 'invalid', state: responsibilityCaseState.AI_REVIEW, evidenceSnapshot: { broken: true }, finalDecision: null, adminReview: null },
    { id: 'admin-final', state: responsibilityCaseState.FINAL_UPHELD, evidenceSnapshot: evidence,
      finalDecision: { outcome: 'FINAL_UPHELD', classification: 'DRIVER_CAUSED', consequenceLevel: 'LEVEL_2', source: 'NO_APPEAL_ADMIN', appealId: null }, adminReview: null },
    { id: 'admin-waiver', state: responsibilityCaseState.FINAL_WAIVED, evidenceSnapshot: evidence,
      finalDecision: { outcome: 'FINAL_WAIVED', classification: 'VALID_WAIVED', consequenceLevel: 'LEVEL_0', source: 'ADMIN_WAIVER', appealId: null }, adminReview: null },
    { id: 'appeal-id', state: responsibilityCaseState.FINAL_UPHELD, evidenceSnapshot: evidence,
      finalDecision: { outcome: 'FINAL_UPHELD', classification: 'DRIVER_CAUSED', consequenceLevel: null, source: 'OTHER', appealId: 'appeal-2' }, adminReview: null },
    { id: 'waive-default-level', state: responsibilityCaseState.FINAL_WAIVED, evidenceSnapshot: evidence,
      finalDecision: { outcome: 'FINAL_WAIVED', classification: 'VALID_WAIVED', consequenceLevel: null, source: 'ADMIN_WAIVER', appealId: null }, adminReview: null },
    { id: 'invalid-human', state: responsibilityCaseState.NEEDS_ADMIN_REVIEW, evidenceSnapshot: evidence, finalDecision: null,
      adminReview: { decision: 'OTHER', classification: null, consequenceLevel: null } },
  ]
  const loader = createReadOnlyResponsibilityBenchmarkLoader({ responsibilityCase: { findMany: async value => { query = value; return rows } } })
  const loaded = await loader.load({ take: 10, caseIds: ['admin-final'] })
  assert.deepEqual(query.where, { shadowResults: { some: {} }, id: { in: ['admin-final'] } })
  assert.deepEqual(loaded.map(item => item.label?.source ?? null), ['ADMIN_HUMAN', 'ADMIN_HUMAN', 'FINAL_APPEAL', 'ADMIN_HUMAN', null])
  assert.deepEqual(loaded.map(item => item.label?.responsibility ?? null), ['DRIVER_CAUSED', 'VALID_WAIVED', 'DRIVER_CAUSED', 'VALID_WAIVED', null])
  assert.equal(loaded[2].label.consequenceLevel, null)
  assert.equal(loaded[3].label.consequenceLevel, null)
  assert.equal(loaded[2].label.needsReview, null)
  assert.equal(loaded[2].label.autoUpholdAllowed, null)
  assert.equal(loaded[2].label.evidenceSufficient, null)
})

test('artifact writer handles empty runs and records failure summaries without overwriting', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'rcs-benchmark-writer-'))
  try {
    const writer = createAppendOnlyResponsibilityArtifactWriter({ outputDir, runId: 'unsafe / id' })
    await writer.append([])
    await writer.append([{ existing: { error: 'x' }, jev: { error: null } }])
    assert.equal((await readFile(writer.artifacts, 'utf8')).trim().split('\n').filter(Boolean).length, 1)
    const summaries = (await readFile(writer.summary, 'utf8')).trim().split('\n').map(JSON.parse)
    assert.deepEqual(summaries.map(item => [item.records, item.failures]), [[0, 0], [1, 1]])
    assert.match(writer.artifacts, /unsafe___id/)
  } finally {
    await rm(outputDir, { recursive: true, force: true })
  }
})

test('benchmark runner preserves explicit IDs and falls back to evidence identity when caseId metadata is absent', async () => {
  const evidence = bundle('runner-defaults')
  const existingAnalyst = {
    provider: 'existing', model: 'test', analyzeResponsibilityCase: async value => ({
      analysisId: 'analysis-runner-defaults', contractVersion: 'ai-responsibility-v1', provider: 'existing', model: 'test',
      output: {
        caseId: value.caseId, suggestedClassification: 'DRIVER_CAUSED', confidence: 0.97,
        factsSupporting: [{ type: 'FACT', evidenceIds: [value.timeline[0].id], statement: 'fact' }], factsAgainst: [], contradictions: [], missingEvidence: [],
        inferences: [{ type: 'INFERENCE', evidenceIds: [value.timeline[0].id], statement: 'inference' }],
        severityAssessment: 'LOW', suggestedActionCategory: 'AUTO_UPHOLD_CANDIDATE', explanationSummary: 'fixture',
      },
    }),
  }
  const jevAdapter = {
    provider: 'jev', model: 'test', configVersion: 'test', analyzeResponsibilityCase: async () => ({ raw: {}, normalized: normalizeJevResponsibility(jevResponse()) }),
  }
  const { createResponsibilityBenchmarkRunner } = await import('../benchmarks/responsibility/benchmark.js')
  const runner = createResponsibilityBenchmarkRunner({ existingAnalyst, jevAdapter })
  const [record] = await runner.run([{ id: 'explicit-id', evidence, label: null }])
  assert.equal(record.id, 'explicit-id')
  assert.equal(record.caseKey.length, 24)
  assert.equal(record.cohort, responsibilityBenchmarkCohort.REAL_UNLABELED)
  assert.equal(record.scenario, 'real-world')

  const [fallback] = await runner.run([{ evidence, label: null }])
  assert.match(fallback.id, /^case-[a-f0-9]{24}$/)
  assert.equal(fallback.caseKey.length, 24)
})

test('metrics cover empty, invalid, safety, calibration, disagreement, and p99 paths', () => {
  const empty = scoreResponsibilityBenchmark([])
  assert.equal(empty.overall.accuracy, 0)
  assert.equal(empty.macroF1, 0)
  assert.equal(empty.safety.humanReviewRecall, 0)

  const records = [
    { label: label('DRIVER_CAUSED', { needsReview: true }), prediction: prediction('PLATFORM_CAUSED', { autoWaiveAllowed: true }) },
    { label: label('VALID_WAIVED', { consequenceLevel: 'LEVEL_0' }), prediction: prediction('BOGUS', { consequenceLevel: 'BOGUS' }) },
    { label: { ...label('DRIVER_CAUSED'), responsibility: 'BOGUS' }, prediction: prediction('DRIVER_CAUSED') },
    { label: label('EXTERNAL_OR_UNCERTAIN', { needsReview: true, evidenceSufficient: false, contradictionCritical: true, requiredMissingEvidence: ['location'] }), prediction: prediction('EXTERNAL_OR_UNCERTAIN', { needsReview: true, evidenceSufficient: false, consequenceLevel: 'LEVEL_0' }) },
    { label: label('PLATFORM_CAUSED', { consequenceLevel: 'LEVEL_0' }), prediction: null },
  ]
  const scored = scoreResponsibilityBenchmark(records)
  assert.equal(scored.labeledCount, 4)
  assert.equal(scored.safety.falseAutoWaive, 1)
  assert.equal(scored.safety.missedReview, 1)
  assert.equal(scored.confusionMatrix.VALID_WAIVED.NEEDS_REVIEW, 1)

  assert.deepEqual(scoreProbabilityCalibration([]), { count: 0, brierScore: null, buckets: [] })
  const calibration = scoreProbabilityCalibration([
    { label: label('DRIVER_CAUSED'), predictedResponsibility: 'DRIVER_CAUSED', probabilities: { DRIVER_CAUSED: 1 } },
    { label: label('PLATFORM_CAUSED'), predictedResponsibility: 'DRIVER_CAUSED', probabilities: { PLATFORM_CAUSED: 0.4, DRIVER_CAUSED: 0.6 } },
    { label: null, predictedResponsibility: 'DRIVER_CAUSED', probabilities: { DRIVER_CAUSED: 1 } },
    { label: label('VALID_WAIVED'), predictedResponsibility: 'VALID_WAIVED', probabilities: { VALID_WAIVED: 0.8 } },
    { label: label('EXTERNAL_OR_UNCERTAIN'), predictedResponsibility: 'MISSING_KEY', probabilities: { EXTERNAL_OR_UNCERTAIN: 0.7 } },
  ])
  assert.equal(calibration.count, 2)
  assert.equal(calibration.buckets.length >= 2, true)

  const disagreements = classifyBenchmarkDisagreements([
    { id: 'jev-correct', label: label('DRIVER_CAUSED'), existingPrediction: prediction('PLATFORM_CAUSED'), jevPrediction: prediction('DRIVER_CAUSED') },
    { id: 'existing-correct', label: label('DRIVER_CAUSED'), existingPrediction: prediction('DRIVER_CAUSED'), jevPrediction: prediction('PLATFORM_CAUSED') },
    { id: 'both-wrong', label: label('DRIVER_CAUSED'), existingPrediction: prediction('PLATFORM_CAUSED'), jevPrediction: prediction('VALID_WAIVED') },
    { id: 'severity', label: label('DRIVER_CAUSED'), existingPrediction: prediction('DRIVER_CAUSED', { consequenceLevel: 'LEVEL_1' }), jevPrediction: prediction('DRIVER_CAUSED', { consequenceLevel: 'LEVEL_2' }) },
    { id: 'both-review', label: label('EXTERNAL_OR_UNCERTAIN'), existingPrediction: prediction('EXTERNAL_OR_UNCERTAIN', { needsReview: true }), jevPrediction: prediction('EXTERNAL_OR_UNCERTAIN', { needsReview: true }) },
    { id: 'one-review', label: label('DRIVER_CAUSED'), existingPrediction: prediction('DRIVER_CAUSED', { needsReview: true }), jevPrediction: prediction('DRIVER_CAUSED') },
    { id: 'unlabeled', label: label('DRIVER_CAUSED', { source: responsibilityGroundTruthSource.UNLABELED }), existingPrediction: prediction('DRIVER_CAUSED'), jevPrediction: prediction('DRIVER_CAUSED') },
    { id: 'missing-prediction', label: label('DRIVER_CAUSED'), existingPrediction: null, jevPrediction: prediction('DRIVER_CAUSED') },
  ])
  assert.deepEqual(disagreements.jevCorrectExistingWrong, ['jev-correct'])
  assert.deepEqual(disagreements.existingCorrectJevWrong, ['existing-correct'])
  assert.deepEqual(disagreements.bothWrong, ['both-wrong'])
  assert.deepEqual(disagreements.bothCorrectSeverityDisagreement, ['severity'])
  assert.deepEqual(disagreements.bothReview, ['both-review'])
  assert.deepEqual(disagreements.oneReviewOtherDecides, ['one-review'])

  const rows = Array.from({ length: 100 }, (_, index) => ({ latencyMs: index, inputTokens: index === 0 ? -1 : 1 }))
  const operations = aggregateBenchmarkOperationalStats(rows)
  assert.equal(operations.latencyMs.p99, 98)
  assert.equal(operations.usage.inputTokens.count, 99)

  assert.deepEqual(aggregateBenchmarkConsistency([
    { id: '', prediction: prediction('DRIVER_CAUSED') },
    { id: 'raw', responsibility: 'DRIVER_CAUSED' },
    { id: 'raw', responsibility: 'DRIVER_CAUSED' },
  ]), { groupCount: 1, comparedGroupCount: 1, consistentGroupCount: 1, consistencyRate: 1 })
  assert.equal(checkPredictionInputSeparation({ modelInput: { evidence: [{ safe: true }] } }), true)
})

test('evaluation handles missing runtime metadata and empty inputs conservatively', () => {
  const empty = evaluateResponsibilityBenchmark([])
  assert.equal(empty.cases, 0)
  assert.equal(empty.existing.failures.errorRate, 0)
  assert.equal(empty.jev.calibration.count, 0)

  const evaluated = evaluateResponsibilityBenchmark([{
    id: 'missing-runtime', runNumber: 1, cohort: responsibilityBenchmarkCohort.REAL_UNLABELED, label: null,
    existing: null, jev: { latencyMs: null, raw: null, error: 'provider-down' },
    existingPrediction: prediction('NEEDS_REVIEW', { needsReview: true }), jevPrediction: prediction('NEEDS_REVIEW', { needsReview: true }),
  }])
  assert.equal(evaluated.unlabeledCases, 1)
  assert.equal(evaluated.existing.operations.usage.totalTokens.count, 0)
  assert.equal(evaluated.jev.failures.errors, 1)
})

test('dataset split honors extreme held-out fractions without leaking scenario families', () => {
  const records = buildFrozenResponsibilityBenchmarkDataset()
  assert.throws(() => splitResponsibilityBenchmark(records, { heldOutFraction: 0 }), /between zero and one/)
  assert.throws(() => splitResponsibilityBenchmark(records, { heldOutFraction: 1 }), /between zero and one/)
  for (const heldOutFraction of [0.01, 0.99]) {
    const split = splitResponsibilityBenchmark(records, { seed: `coverage-${heldOutFraction}`, heldOutFraction })
    assert.equal(split.development.length > 0, true)
    assert.equal(split.heldOut.length > 0, true)
    const developmentFamilies = new Set(split.development.map(record => record.scenario))
    assert.equal(split.heldOut.some(record => developmentFamilies.has(record.scenario)), false)
  }

  const synthetic = structuredClone(records.slice(0, 2))
  synthetic.push({ ...synthetic[0], id: 'unlabeled', scenario: 'unlabeled', label: null })
  synthetic.push({ ...synthetic[0], id: 'explicit-unlabeled', scenario: 'explicit-unlabeled', label: { ...synthetic[0].label, source: 'UNLABELED' } })
  const withoutUnlabeled = splitResponsibilityBenchmark(synthetic, { heldOutFraction: 0.5 })
  assert.equal(withoutUnlabeled.development.some(record => record.id === 'unlabeled'), false)
  assert.equal(withoutUnlabeled.heldOut.some(record => record.id === 'unlabeled'), false)

  const conflict = structuredClone(records.slice(0, 2))
  const legacy = conflict.map(record => { const copy = { ...record }; delete copy.scenarioFamily; return copy })
  assert.equal(splitResponsibilityBenchmark(legacy).heldOut.length + splitResponsibilityBenchmark(legacy).development.length, 2)
  conflict[1].scenario = conflict[0].scenario
  conflict[1].scenarioFamily = conflict[0].scenarioFamily
  conflict[1].label.responsibility = conflict[0].label.responsibility === 'DRIVER_CAUSED' ? 'PLATFORM_CAUSED' : 'DRIVER_CAUSED'
  assert.throws(() => splitResponsibilityBenchmark(conflict), /SCENARIO_FAMILY_LABEL_CONFLICT/)
})

test('benchmark CLI option parsing validates bounds and orchestration is dependency-injectable', async () => {
  assert.throws(() => parseResponsibilityBenchmarkOptions({ argv: [], env: {} }), /OUTPUT_DIR_REQUIRED/)
  assert.throws(() => parseResponsibilityBenchmarkOptions({ argv: ['--output=x', '--source=nope'], env: {} }), /SOURCE_INVALID/)
  assert.throws(() => parseResponsibilityBenchmarkOptions({ argv: ['--output=x', '--split=nope'], env: {} }), /SPLIT_INVALID/)
  assert.throws(() => parseResponsibilityBenchmarkOptions({ argv: ['--output=x', '--take=0'], env: {} }), /TAKE_INVALID/)
  assert.throws(() => parseResponsibilityBenchmarkOptions({ argv: ['--output=x', '--repeats=11'], env: {} }), /REPEATS_INVALID/)
  assert.throws(() => parseResponsibilityBenchmarkOptions({ argv: ['--output=x', '--repeats=1.9'], env: {} }), /REPEATS_INVALID/)
  assert.throws(() => parseResponsibilityBenchmarkOptions({ argv: ['--output=x', '--repeats=9garbage'], env: {} }), /REPEATS_INVALID/)
  assert.throws(() => parseResponsibilityBenchmarkOptions({ argv: ['--output=x', '--consistency-count=101'], env: {} }), /CONSISTENCY_COUNT_INVALID/)

  const fromEnv = parseResponsibilityBenchmarkOptions({ argv: [], env: { RESPONSIBILITY_BENCHMARK_OUTPUT_DIR: 'env-output' } })
  assert.deepEqual(fromEnv, { outputDir: 'env-output', source: 'frozen', splitName: 'heldout', take: 100, repeats: 1, consistencyCount: 8, existingModel: null, runId: undefined })
  assert.equal(parseResponsibilityBenchmarkOptions({ argv: ['--output=x', '--existing-model=gpt-5-mini-2025-08-07'], env: {} }).existingModel, 'gpt-5-mini-2025-08-07')

  const outputDir = await mkdtemp(join(tmpdir(), 'rcs-benchmark-run-'))
  const evidence = bundle('real-runner')
  const prismaClient = { responsibilityCase: { findMany: async () => [{ id: 'real-case', state: responsibilityCaseState.NEEDS_ADMIN_REVIEW,
    evidenceSnapshot: evidence, finalDecision: null, adminReview: null }] } }
  const calls = []
  const createRunner = () => ({ run: async (cases, { runNumber }) => {
    calls.push({ size: cases.length, runNumber })
    return cases.map(item => ({ id: item.id, runNumber }))
  } })
  const createWriter = ({ runId }) => ({ artifacts: `artifacts-${runId}`, summary: `summary-${runId}`, append: async (records, metadata) => calls.push({ written: records.length, metadata }) })
  const dependencies = {
    prismaClient,
    createExistingAnalyst: () => ({ provider: 'existing', model: 'existing-model' }),
    createJevAdapter: () => ({ provider: 'jev', model: 'jev-model' }),
    createRunner,
    createWriter,
    evaluate: records => ({ count: records.length }),
  }
  try {
    const all = await runResponsibilityBenchmark({ outputDir, source: 'all', splitName: 'development', take: 1, repeats: 2, consistencyCount: 2, runId: 'unit' }, dependencies)
    assert.equal(all.cases, 99)
    assert.equal(all.records, 101)
    assert.equal(all.config.source, 'all')
    assert.equal(all.config.consistencyCaseCount, 2)
    assert.deepEqual(calls.slice(0, 2).map(item => item.runNumber), [1, 2])

    const allFrozen = await runResponsibilityBenchmark({ outputDir, source: 'frozen', splitName: 'all', take: 1, repeats: 1, consistencyCount: 999, runId: 'all' }, dependencies)
    assert.equal(allFrozen.cases, 154)
    assert.equal(allFrozen.config.consistencyCaseCount, 154)

    const heldOut = await runResponsibilityBenchmark({ outputDir, source: 'frozen', splitName: 'heldout', take: 1, repeats: 1, consistencyCount: 1, runId: 'heldout' }, dependencies)
    assert.equal(heldOut.cases, 56)

    const previousTypesafeKey = process.env.TYPESAFE_API_KEY
    process.env.TYPESAFE_API_KEY = 'phase8-test-key'
    try {
      const defaultFactories = await runResponsibilityBenchmark(
        { outputDir, source: 'frozen', splitName: 'heldout', take: 1, repeats: 1, consistencyCount: 0, runId: 'defaults' },
        { createRunner: ({ existingAnalyst, jevAdapter }) => ({ run: async () => {
          assert.equal(existingAnalyst.provider, 'openai')
          assert.equal(jevAdapter.provider, 'typesafe-ai')
          return []
        } }), createWriter, evaluate: records => ({ count: records.length }) },
      )
      assert.equal(defaultFactories.records, 0)
    } finally {
      if (previousTypesafeKey === undefined) delete process.env.TYPESAFE_API_KEY
      else process.env.TYPESAFE_API_KEY = previousTypesafeKey
    }

    const viaMain = await main({ argv: [`--output=${outputDir}`, '--source=real', '--take=1', '--run-id=main'], env: {}, dependencies })
    assert.equal(viaMain.cases, 1)
  } finally {
    await rm(outputDir, { recursive: true, force: true })
  }
})
