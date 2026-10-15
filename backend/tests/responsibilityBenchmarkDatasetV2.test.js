import test from 'node:test'
import assert from 'node:assert/strict'

import { responsibilityEvidenceBundleSchema } from '../services/responsibilityContracts.js'
import { responsibilityEvidenceHash } from '../services/responsibilityAnalyst.js'
import {
  RESPONSIBILITY_BENCHMARK_DATASET_V2_FROZEN_HASH,
  RESPONSIBILITY_BENCHMARK_DATASET_V2_SEED,
  RESPONSIBILITY_BENCHMARK_DATASET_V2_VERSION,
  buildFrozenResponsibilityBenchmarkDatasetV2,
  responsibilityBenchmarkDatasetV2Hash,
  responsibilityBenchmarkV2StratumSummary,
  splitResponsibilityBenchmarkV2,
} from '../benchmarks/responsibility/datasetV2.js'

test('V2 is frozen, deterministic synthetic data that conforms to the existing benchmark record schema', () => {
  const records = buildFrozenResponsibilityBenchmarkDatasetV2()
  assert.equal(RESPONSIBILITY_BENCHMARK_DATASET_V2_VERSION, 'responsibility-benchmark-v2')
  assert.equal(records.length, 163)
  assert.equal(Object.isFrozen(records), true)
  for (const record of records) {
    assert.equal(responsibilityEvidenceBundleSchema.safeParse(record.evidence).success, true)
    assert.equal(record.evidenceHash, responsibilityEvidenceHash(record.evidence))
    assert.deepEqual(record.modelInput.evidence, record.evidence)
    assert.equal(Object.isFrozen(record), true)
    assert.equal(record.label.source, 'FROZEN_SYNTHETIC')
    assert.equal(record.evidence.caseId.includes(record.scenario), false)
  }
  assert.equal(responsibilityBenchmarkDatasetV2Hash(records), RESPONSIBILITY_BENCHMARK_DATASET_V2_FROZEN_HASH)
})

test('V2 labels safe policy-supported automation and review-only uncertainty cohorts conservatively', () => {
  const summary = responsibilityBenchmarkV2StratumSummary()
  for (const key of [
    'DRIVER_CAUSED', 'PLATFORM_CAUSED', 'VALID_WAIVED', 'EXTERNAL_OR_UNCERTAIN',
    'LEVEL_0', 'LEVEL_1', 'LEVEL_2', 'SAFE_AUTO_UPHOLD', 'SAFE_AUTO_WAIVE', 'NEEDS_ADMIN_REVIEW',
    'MISSING_MANDATORY_EVIDENCE', 'CRITICAL_CONTRADICTION', 'PLATFORM_IMPOSSIBILITY', 'EXTERNAL_UNCERTAINTY',
  ]) assert.equal(summary[key] > 0, true, key)
  const records = buildFrozenResponsibilityBenchmarkDatasetV2()
  const upheld = records.filter(record => record.label.autoUpholdAllowed)
  assert.equal(upheld.length > 0, true)
  assert.equal(upheld.every(record => record.label.responsibility === 'DRIVER_CAUSED' && record.label.consequenceLevel === 'LEVEL_1'), true)
  assert.equal(records.filter(record => record.label.consequenceLevel === 'LEVEL_2').every(record => record.label.needsReview && !record.label.autoUpholdAllowed), true)
  assert.equal(records.filter(record => record.label.requiredMissingEvidence.length > 0).every(record => record.label.needsReview), true)
  assert.equal(records.filter(record => record.label.contradictionCritical).every(record => record.label.needsReview), true)
})

test('V2 split groups families and keeps every required held-out stratum nonzero', () => {
  const records = buildFrozenResponsibilityBenchmarkDatasetV2()
  const first = splitResponsibilityBenchmarkV2(records)
  const second = splitResponsibilityBenchmarkV2(records)
  assert.equal(first.seed, RESPONSIBILITY_BENCHMARK_DATASET_V2_SEED)
  assert.deepEqual(first.heldOut.map(record => record.id), second.heldOut.map(record => record.id))
  const developmentFamilies = new Set(first.development.map(record => record.scenarioFamily))
  assert.equal(first.heldOut.some(record => developmentFamilies.has(record.scenarioFamily)), false)
  for (const key of [
    'DRIVER_CAUSED', 'PLATFORM_CAUSED', 'VALID_WAIVED', 'EXTERNAL_OR_UNCERTAIN',
    'LEVEL_0', 'LEVEL_1', 'LEVEL_2', 'SAFE_AUTO_UPHOLD', 'SAFE_AUTO_WAIVE', 'NEEDS_ADMIN_REVIEW',
    'MISSING_MANDATORY_EVIDENCE', 'CRITICAL_CONTRADICTION', 'PLATFORM_IMPOSSIBILITY', 'EXTERNAL_UNCERTAINTY',
  ]) assert.equal(first.heldOutStratumSummary[key] > 0, true, key)
  assert.throws(() => splitResponsibilityBenchmarkV2(records, { heldOutFraction: 0 }), /between zero and one/)
  assert.throws(() => splitResponsibilityBenchmarkV2(records, { heldOutFraction: 1 }), /between zero and one/)

  const duplicateFamilies = Array.from({ length: 4 }, (_, index) => ({
    ...records[0], id: `fallback-${index}`, scenarioFamily: `fallback-${index}`,
  }))
  const fallback = splitResponsibilityBenchmarkV2(duplicateFamilies, { heldOutFraction: 0.75 })
  assert.equal(fallback.heldOut.length, 3)
})

test('V2 excludes unlabeled rows and accepts the existing optional scenario-family representation', () => {
  const records = structuredClone(buildFrozenResponsibilityBenchmarkDatasetV2())
  const noFamily = records[0]; delete noFamily.scenarioFamily
  const unlabeled = { ...records[1], label: { ...records[1].label, source: 'UNLABELED' } }
  assert.equal(responsibilityBenchmarkV2StratumSummary([unlabeled]).DRIVER_CAUSED, 0)
  const split = splitResponsibilityBenchmarkV2([noFamily, unlabeled, { ...noFamily, id: 'missing-label', label: null }])
  assert.equal(split.development.length + split.heldOut.length, 1)
  assert.equal(split.adequate, false)
})
