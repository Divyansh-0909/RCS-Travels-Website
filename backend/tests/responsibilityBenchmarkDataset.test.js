import test from 'node:test'
import assert from 'node:assert/strict'

import { responsibilityEvidenceBundleSchema } from '../services/responsibilityContracts.js'
import { responsibilityEvidenceHash } from '../services/responsibilityAnalyst.js'
import { responsibilityCaseType } from '../services/responsibilityEvidence.js'
import {
  RESPONSIBILITY_BENCHMARK_DATASET_VERSION,
  RESPONSIBILITY_BENCHMARK_FROZEN_HASH,
  buildFrozenResponsibilityBenchmarkDataset,
  createRealResponsibilityBenchmarkMetadata,
  responsibilityBenchmarkDatasetHash,
  splitResponsibilityBenchmark,
} from '../benchmarks/responsibility/dataset.js'
import {
  responsibilityBenchmarkCohort,
  responsibilityGroundTruthSource,
} from '../benchmarks/responsibility/contracts.js'
import { checkPredictionInputSeparation } from '../benchmarks/responsibility/metrics.js'

test('Phase 8 frozen responsibility benchmark validates, hashes, and covers every required adversarial scenario', () => {
  const records = buildFrozenResponsibilityBenchmarkDataset()
  assert.equal(RESPONSIBILITY_BENCHMARK_DATASET_VERSION, 'responsibility-benchmark-v1')
  assert.equal(records.length, 154)
  assert.equal(new Set(records.map(record => record.evidence.caseType)).size, Object.keys(responsibilityCaseType).length)
  assert.equal(records.filter(record => record.cohort === responsibilityBenchmarkCohort.FROZEN_SYNTHETIC).length, 56)
  assert.equal(records.filter(record => record.cohort === responsibilityBenchmarkCohort.ADVERSARIAL_SAFETY).length, 98)
  for (const record of records) {
    assert.equal(responsibilityEvidenceBundleSchema.safeParse(record.evidence).success, true)
    assert.equal(record.evidenceHash, responsibilityEvidenceHash(record.evidence))
    assert.deepEqual(record.modelInput.evidence, record.evidence)
    assert.equal(checkPredictionInputSeparation(record), true)
    const serializedInput = JSON.stringify(record.modelInput)
    assert.equal(serializedInput.includes('"label"'), false)
    assert.equal(serializedInput.includes(record.label.responsibility), false)
    assert.equal(serializedInput.includes(record.label.source), false)
    assert.equal(record.evidence.caseId.includes(record.scenario), false)
    assert.equal(record.evidence.bookingId.includes(record.scenario), false)
    assert.equal(record.evidence.timeline.some(item => item.value?.scenario === record.scenario), false)
    assert.equal(Object.isFrozen(record), true)
    assert.equal(Object.isFrozen(record.evidence), true)
    assert.equal(Object.isFrozen(record.label), true)
    assert.equal(record.label.source, responsibilityGroundTruthSource.FROZEN_SYNTHETIC)
  }
  const scenarios = new Set(records.map(record => record.scenario))
  for (const expected of [
    'impossible_assignment', 'network_loss_offline', 'stale_rider_gps', 'cancellation_after_impossible_assignment',
    'rider_cancel_after_platform_delay', 'contradictory_timestamps', 'missing_provenance', 'suggestive_not_proof',
    'conflicting_gps', 'traffic_deterioration', 'missing_notification_delivery', 'provider_acceptance_vs_delivered',
    'cached_vs_contemporaneous_route', 'received_at_vs_observed_at',
  ]) assert.equal(scenarios.has(expected), true, expected)
  assert.equal(responsibilityBenchmarkDatasetHash(records), RESPONSIBILITY_BENCHMARK_FROZEN_HASH)
})

test('Phase 8 split is seeded, deterministic, and isolates scenario families across development and held-out', () => {
  const records = buildFrozenResponsibilityBenchmarkDataset()
  const first = splitResponsibilityBenchmark(records)
  const second = splitResponsibilityBenchmark(records)
  assert.deepEqual(first.heldOut.map(record => record.id), second.heldOut.map(record => record.id))
  assert.equal(first.development.length + first.heldOut.length, records.length)
  assert.equal(first.stratifiedBy, 'scenarioFamily:responsibility')
  const developmentFamilies = new Set(first.development.map(record => record.scenario))
  const heldOutFamilies = new Set(first.heldOut.map(record => record.scenario))
  assert.equal([...heldOutFamilies].some(item => developmentFamilies.has(item)), false)
  const developmentTemplates = new Set(first.development.map(record => record.scenarioFamily))
  assert.equal(first.heldOut.some(record => developmentTemplates.has(record.scenarioFamily)), false)
  assert.equal(first.heldOut.some(record => record.label.requiredMissingEvidence.length > 0), true)
  for (const caseType of Object.values(responsibilityCaseType)) {
    assert.equal(first.development.some(record => record.evidence.caseType === caseType), true)
    assert.equal(first.heldOut.some(record => record.evidence.caseType === caseType), true)
  }
})

test('real cohorts are metadata-only and do not need a database mutation', () => {
  const metadata = createRealResponsibilityBenchmarkMetadata({
    cohort: responsibilityBenchmarkCohort.REAL_LABELED,
    externalCaseReference: 'export:case-123', evidenceVersion: 'responsibility-evidence-v1',
    evidenceHash: 'a'.repeat(64), labelSource: responsibilityGroundTruthSource.ADMIN_HUMAN,
  })
  assert.equal(metadata.cohort, responsibilityBenchmarkCohort.REAL_LABELED)
})
