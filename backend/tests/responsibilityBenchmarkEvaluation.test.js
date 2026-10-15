import assert from 'node:assert/strict'
import test from 'node:test'

import { evaluateResponsibilityBenchmark } from '../benchmarks/responsibility/evaluation.js'

const label = responsibility => ({
  responsibility, needsReview: responsibility === 'EXTERNAL_OR_UNCERTAIN', consequenceLevel: 'LEVEL_0',
  autoUpholdAllowed: false, autoWaiveAllowed: false, evidenceSufficient: true,
  requiredMissingEvidence: [], contradictionCritical: false, source: 'FROZEN_SYNTHETIC',
})
const prediction = responsibility => ({
  responsibility, needsReview: responsibility === 'EXTERNAL_OR_UNCERTAIN', consequenceLevel: 'LEVEL_0',
  autoUpholdAllowed: false, autoWaiveAllowed: false, evidenceSufficient: true,
})

test('evaluation scores only primary runs while repeated runs feed consistency and operational stats', () => {
  const base = {
    id: 'case-a', cohort: 'A_FROZEN_SYNTHETIC', label: label('VALID_WAIVED'),
    existing: { latencyMs: 20, raw: { usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14, requestCount: 1 } }, error: null },
    jev: { latencyMs: 10, raw: { usage: { inputTokens: 5, outputTokens: 2 } }, error: null },
    existingPrediction: prediction('VALID_WAIVED'),
    jevPrediction: { ...prediction('VALID_WAIVED'), probabilities: { VALID_WAIVED: 0.9, DRIVER_CAUSED: 0.05, PLATFORM_CAUSED: 0.03, EXTERNAL_OR_UNCERTAIN: 0.02 } },
  }
  const evaluation = evaluateResponsibilityBenchmark([
    { ...base, runNumber: 1 },
    { ...base, runNumber: 2, jevPrediction: { ...prediction('DRIVER_CAUSED'), probabilities: { VALID_WAIVED: 0.1, DRIVER_CAUSED: 0.8 } } },
  ])
  assert.equal(evaluation.cases, 1)
  assert.equal(evaluation.jev.scores.overall.accuracy, 1)
  assert.equal(evaluation.jev.operations.count, 2)
  assert.equal(evaluation.jev.consistency.comparedGroupCount, 1)
  assert.equal(evaluation.jev.consistency.consistencyRate, 0)
  assert.equal(evaluation.jev.calibration.count, 1)
})

