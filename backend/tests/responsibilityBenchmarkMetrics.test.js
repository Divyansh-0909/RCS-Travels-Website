import test from 'node:test'
import assert from 'node:assert/strict'

import { scoreResponsibilityBenchmark, aggregateBenchmarkConsistency, aggregateBenchmarkOperationalStats, checkPredictionInputSeparation } from '../benchmarks/responsibility/metrics.js'
import { responsibilityGroundTruthSource } from '../benchmarks/responsibility/contracts.js'

const label = (responsibility, overrides = {}) => ({
  responsibility, needsReview: false, consequenceLevel: 'LEVEL_1', autoUpholdAllowed: false,
  autoWaiveAllowed: false, evidenceSufficient: true, requiredMissingEvidence: [], contradictionCritical: false,
  source: responsibilityGroundTruthSource.FROZEN_SYNTHETIC, ...overrides,
})
const prediction = (responsibility, overrides = {}) => ({
  responsibility, needsReview: false, consequenceLevel: 'LEVEL_1', autoUpholdAllowed: false,
  autoWaiveAllowed: false, evidenceSufficient: true, ...overrides,
})

test('hand-checkable metrics exclude unlabeled records and count safety failures exactly', () => {
  const records = [
    { label: label('DRIVER_CAUSED', { consequenceLevel: 'LEVEL_2', autoUpholdAllowed: true }), prediction: prediction('DRIVER_CAUSED', { consequenceLevel: 'LEVEL_2', autoUpholdAllowed: true }) },
    { label: label('PLATFORM_CAUSED', { needsReview: true, consequenceLevel: 'LEVEL_0' }), prediction: prediction('DRIVER_CAUSED', { autoUpholdAllowed: true, consequenceLevel: 'LEVEL_2' }) },
    { label: label('EXTERNAL_OR_UNCERTAIN', { needsReview: true, consequenceLevel: 'LEVEL_0', evidenceSufficient: false, requiredMissingEvidence: ['connectivity'], contradictionCritical: true }), prediction: prediction('DRIVER_CAUSED') },
    { label: label('VALID_WAIVED', { consequenceLevel: 'LEVEL_0', autoWaiveAllowed: true }), prediction: prediction('VALID_WAIVED', { consequenceLevel: 'LEVEL_0', autoWaiveAllowed: true }) },
    { label: label('EXTERNAL_OR_UNCERTAIN', { needsReview: true, consequenceLevel: 'LEVEL_0' }), prediction: prediction('EXTERNAL_OR_UNCERTAIN', { consequenceLevel: 'LEVEL_0', needsReview: true }) },
    { label: label('PLATFORM_CAUSED', { source: responsibilityGroundTruthSource.UNLABELED }), prediction: prediction('DRIVER_CAUSED') },
  ]
  const result = scoreResponsibilityBenchmark(records)
  assert.equal(result.labeledCount, 5)
  assert.equal(result.overall.accuracy, 3 / 5)
  assert.equal(result.perClass.DRIVER_CAUSED.precision, 1 / 3)
  assert.equal(result.perClass.DRIVER_CAUSED.recall, 1)
  assert.equal(result.confusionMatrix.PLATFORM_CAUSED.DRIVER_CAUSED, 1)
  assert.equal(result.confusionMatrix.EXTERNAL_OR_UNCERTAIN.DRIVER_CAUSED, 1)
  assert.equal(result.safety.unsafeAutoUphold, 1)
  assert.equal(result.safety.falseDriverCaused, 2)
  assert.equal(result.safety.falseLevel2, 1)
  assert.equal(result.safety.falseAutoWaive, 0)
  assert.equal(result.safety.missedReview, 2)
  assert.equal(result.safety.falseEvidenceSufficient, 1)
  assert.equal(result.safety.platformToDriver, 1)
  assert.equal(result.safety.externalToDriver, 1)
  assert.equal(result.safety.contradictionSafety, 1)
  assert.equal(result.safety.missingEvidenceSafety, 1)
  assert.equal(result.safety.humanReviewRecall, 1 / 3)
  assert.equal(result.macroF1, (0.5 + 0 + 1 + (2 / 3)) / 4)
  assert.equal(result.reviewRate, 1 / 5)
  assert.equal(result.severity.confusionMatrix.LEVEL_0.LEVEL_2, 1)
})

test('latency and usage aggregation ignores absent values and has stable percentiles', () => {
  assert.deepEqual(aggregateBenchmarkOperationalStats([
    { latencyMs: 10, inputTokens: 4, outputTokens: 2, totalTokens: 6, requestCount: 1 },
    { latencyMs: 30, inputTokens: 8, outputTokens: null, totalTokens: 8, requestCount: 2 },
    { latencyMs: null, inputTokens: null, outputTokens: 4, totalTokens: 4, requestCount: null },
  ]), {
    count: 3, latencyMs: { mean: 20, p50: 10, p95: 30, p99: null, count: 2 },
    usage: {
      inputTokens: { total: 12, mean: 6, count: 2 }, outputTokens: { total: 6, mean: 3, count: 2 },
      totalTokens: { total: 18, mean: 6, count: 3 }, requestCount: { total: 3, mean: 1.5, count: 2 },
    },
  })
  assert.deepEqual(aggregateBenchmarkOperationalStats([11, 2, 1].map(latencyMs => ({ latencyMs }))).latencyMs,
    { mean: 14 / 3, p50: 2, p95: 11, p99: null, count: 3 })
})

test('consistency aggregation compares repeated evaluations of the same benchmark case', () => {
  assert.deepEqual(aggregateBenchmarkConsistency([
    { caseId: 'stable', prediction: prediction('DRIVER_CAUSED') },
    { caseId: 'stable', prediction: prediction('DRIVER_CAUSED') },
    { caseId: 'unstable', prediction: prediction('PLATFORM_CAUSED') },
    { caseId: 'unstable', prediction: prediction('NEEDS_REVIEW', { needsReview: true }) },
    { caseId: 'single', prediction: prediction('VALID_WAIVED') },
  ]), { groupCount: 3, comparedGroupCount: 2, consistentGroupCount: 1, consistencyRate: 0.5 })
  assert.deepEqual(aggregateBenchmarkConsistency([{ id: 'no-severity', prediction: {} }, { id: 'no-severity', prediction: {} }]),
    { groupCount: 1, comparedGroupCount: 1, consistentGroupCount: 1, consistencyRate: 1 })
})

test('model input cannot contain benchmark labels or their sentinel', () => {
  assert.equal(checkPredictionInputSeparation({ modelInput: { evidence: { caseId: 'safe' } } }), true)
  assert.equal(checkPredictionInputSeparation({ modelInput: { label: { responsibility: 'DRIVER_CAUSED' } } }), false)
  assert.equal(checkPredictionInputSeparation({ modelInput: { evidence: '__BENCHMARK_LABEL_SENTINEL__' } }), false)
})
