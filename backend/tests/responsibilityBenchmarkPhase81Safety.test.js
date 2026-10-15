import assert from 'node:assert/strict'
import test from 'node:test'

import {
  resolveResponsibilityGroundTruth,
  responsibilityGroundTruthSource,
} from '../benchmarks/responsibility/contracts.js'
import { splitResponsibilityBenchmark } from '../benchmarks/responsibility/dataset.js'
import { evaluateResponsibilityBenchmark } from '../benchmarks/responsibility/evaluation.js'
import { checkPredictionInputSeparation, scoreResponsibilityBenchmark } from '../benchmarks/responsibility/metrics.js'

const label = (responsibility, overrides = {}) => ({
  responsibility,
  needsReview: false,
  consequenceLevel: 'LEVEL_1',
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
  consequenceLevel: 'LEVEL_1',
  autoUpholdAllowed: false,
  autoWaiveAllowed: false,
  evidenceSufficient: true,
  ...overrides,
})

test('Phase 8.1 ground truth hierarchy selects the strongest human label and never promotes unlabeled input', () => {
  const frozen = label('DRIVER_CAUSED')
  const admin = label('PLATFORM_CAUSED', { source: responsibilityGroundTruthSource.ADMIN_HUMAN })
  const appeal = label('VALID_WAIVED', { source: responsibilityGroundTruthSource.FINAL_APPEAL })
  const unlabeled = label('EXTERNAL_OR_UNCERTAIN', { source: responsibilityGroundTruthSource.UNLABELED })

  assert.equal(resolveResponsibilityGroundTruth([frozen, unlabeled]).responsibility, 'DRIVER_CAUSED')
  assert.equal(resolveResponsibilityGroundTruth([frozen, admin, unlabeled]).responsibility, 'PLATFORM_CAUSED')
  assert.equal(resolveResponsibilityGroundTruth([frozen, admin, appeal, unlabeled]).responsibility, 'VALID_WAIVED')
  assert.equal(resolveResponsibilityGroundTruth([unlabeled]), null)
})

test('Phase 8.1 held-out split keeps whole scenario families together, reserves provenance, and excludes unlabeled rows', () => {
  const record = (id, scenarioFamily, responsibility, source = responsibilityGroundTruthSource.FROZEN_SYNTHETIC) => ({
    id,
    scenario: `${scenarioFamily}-${id}`,
    scenarioFamily,
    label: label(responsibility, { source }),
  })
  const records = [
    record('driver-a-1', 'driver-a', 'DRIVER_CAUSED'),
    record('driver-a-2', 'driver-a', 'DRIVER_CAUSED'),
    record('driver-b', 'driver-b', 'DRIVER_CAUSED'),
    record('platform-a', 'platform-a', 'PLATFORM_CAUSED'),
    record('platform-b', 'platform-b', 'PLATFORM_CAUSED'),
    record('provenance', 'provenance', 'EXTERNAL_OR_UNCERTAIN'),
    record('unlabeled', 'driver-a', 'DRIVER_CAUSED', responsibilityGroundTruthSource.UNLABELED),
  ]
  const split = splitResponsibilityBenchmark(records, { seed: 'phase81', heldOutFraction: 0.5 })
  const developmentFamilies = new Set(split.development.map(item => item.scenarioFamily))
  const heldOutFamilies = new Set(split.heldOut.map(item => item.scenarioFamily))

  assert.equal([...developmentFamilies].some(family => heldOutFamilies.has(family)), false)
  assert.equal(split.heldOut.filter(item => item.scenarioFamily === 'driver-a').length, 2)
  assert.equal(heldOutFamilies.has('provenance'), true)
  assert.equal([...split.development, ...split.heldOut].some(item => item.id === 'unlabeled'), false)
})

test('Phase 8.1 label firewall rejects nested labels and label sentinels while accepting an evidence-only input', () => {
  assert.equal(checkPredictionInputSeparation({ modelInput: { evidence: { timeline: [{ value: { safe: true } }] } } }), true)
  assert.equal(checkPredictionInputSeparation({ modelInput: { evidence: { timeline: [{ value: { label: 'DRIVER_CAUSED' } }] } } }), false)
  assert.equal(checkPredictionInputSeparation({ modelInput: { evidence: [{ nested: '__BENCHMARK_LABEL_SENTINEL__' }] } }), false)
})

test('Phase 8.1 safety metrics separate safe uphold from unsafe uphold and retain false LEVEL_2 under caught review', () => {
  const scored = scoreResponsibilityBenchmark([
    { label: label('DRIVER_CAUSED', { autoUpholdAllowed: true }), prediction: prediction('DRIVER_CAUSED', { autoUpholdAllowed: true }) },
    { label: label('DRIVER_CAUSED', { autoUpholdAllowed: false }), prediction: prediction('DRIVER_CAUSED', { autoUpholdAllowed: true }) },
    { label: label('PLATFORM_CAUSED', { autoUpholdAllowed: null }), prediction: prediction('DRIVER_CAUSED', { autoUpholdAllowed: true }) },
    { label: label('DRIVER_CAUSED', { needsReview: true, consequenceLevel: 'LEVEL_1' }), prediction: prediction('DRIVER_CAUSED', { needsReview: true, consequenceLevel: 'LEVEL_2' }) },
  ])

  assert.equal(scored.safety.unsafeAutoUphold, 2)
  assert.equal(scored.safety.falseDriverCaused, 1)
  assert.equal(scored.safety.falseLevel2, 1)
  assert.equal(scored.safety.missedReview, 0)
  assert.equal(scored.safety.humanReviewRecall, 1)
})

test('Phase 8.1 unlabeled records cannot affect scores, safety failures, or evaluation case totals', () => {
  const toxicUnlabeled = {
    label: label('PLATFORM_CAUSED', { source: responsibilityGroundTruthSource.UNLABELED, needsReview: true, consequenceLevel: 'LEVEL_0' }),
    prediction: prediction('DRIVER_CAUSED', { autoUpholdAllowed: true, consequenceLevel: 'LEVEL_2' }),
  }
  const safeLabeled = {
    label: label('DRIVER_CAUSED', { autoUpholdAllowed: true }),
    prediction: prediction('DRIVER_CAUSED', { autoUpholdAllowed: true }),
  }
  const scored = scoreResponsibilityBenchmark([safeLabeled, toxicUnlabeled])
  assert.equal(scored.labeledCount, 1)
  assert.equal(scored.safety.unsafeAutoUphold, 0)
  assert.equal(scored.safety.falseDriverCaused, 0)
  assert.equal(scored.safety.falseLevel2, 0)
  assert.equal(scored.safety.missedReview, 0)

  const evaluation = evaluateResponsibilityBenchmark([
    { id: 'labeled', runNumber: 1, cohort: 'A_FROZEN_SYNTHETIC', ...safeLabeled, existingPrediction: safeLabeled.prediction, jevPrediction: safeLabeled.prediction },
    { id: 'unlabeled', runNumber: 1, cohort: 'D_REAL_UNLABELED', ...toxicUnlabeled, existingPrediction: toxicUnlabeled.prediction, jevPrediction: toxicUnlabeled.prediction },
  ])
  assert.equal(evaluation.cases, 2)
  assert.equal(evaluation.labeledCases, 1)
  assert.equal(evaluation.unlabeledCases, 1)
  assert.equal(evaluation.existing.scores.labeledCount, 1)
  assert.equal(evaluation.existing.scores.safety.unsafeAutoUphold, 0)
})
