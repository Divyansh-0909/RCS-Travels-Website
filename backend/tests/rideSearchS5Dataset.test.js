import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CORE_RECORD_COUNT,
  EXPLORATORY_RECORD_COUNT,
  SEARCH_BENCHMARK_CLOCK,
  SEARCH_BENCHMARK_TIME_ZONE,
  buildSearchBenchmarkDataset,
  buildSearchBenchmarkReviewExport,
  heldOutSignoffGate,
  searchBenchmarkDatasetHash,
  searchBenchmarkIndex,
} from '../benchmarks/search/dataset.js'

const dataset = buildSearchBenchmarkDataset()

test('S5 proposed dataset has the required deterministic core and exploratory counts', () => {
  const index = searchBenchmarkIndex(dataset)
  assert.equal(index.total, CORE_RECORD_COUNT + EXPLORATORY_RECORD_COUNT)
  assert.equal(index.core, CORE_RECORD_COUNT)
  assert.equal(index.exploratory, EXPLORATORY_RECORD_COUNT)
  assert.equal(new Set(dataset.map(record => record.id)).size, dataset.length)
  assert.equal(new Set(dataset.map(record => record.modelInput.query)).size, dataset.length)
  assert.equal(searchBenchmarkDatasetHash(dataset), searchBenchmarkDatasetHash(buildSearchBenchmarkDataset()))
})

test('S5 keeps labels outside controlled model input and marks every proposal unreviewed', () => {
  for (const record of dataset) {
    assert.equal(record.modelInput.context.clock, SEARCH_BENCHMARK_CLOCK)
    assert.equal(record.modelInput.context.timeZone, SEARCH_BENCHMARK_TIME_ZONE)
    assert.equal(record.modelInput.context.capabilityVersion, 'ride-search-s4')
    assert.equal('truth' in record.modelInput, false)
    assert.equal(record.truth.provenance, 'UNREVIEWED_PROPOSED_SYNTHETIC')
    assert.equal(record.truth.reviewerMetadata, null)
    assert.equal(record.truth.status, 'PROPOSED')
  }
})

test('S5 split is deterministic and never separates a template family', () => {
  const splits = new Map()
  for (const record of dataset) {
    assert.equal(record.templateFamily, record.familyId)
    const existing = splits.get(record.templateFamily)
    assert.ok(!existing || existing === record.split)
    splits.set(record.familyId, record.split)
  }
  assert.ok(dataset.some(record => record.split === 'DEVELOPMENT'))
  assert.ok(dataset.some(record => record.split === 'HELD_OUT'))
})

test('S5 review export is inspectable but cannot sign off unreviewed held-out records', () => {
  const review = buildSearchBenchmarkReviewExport(dataset)
  assert.equal(review.reviewState, 'UNREVIEWED_PROPOSAL')
  assert.equal(review.index.datasetHash, review.datasetHash)
  assert.deepEqual(heldOutSignoffGate(dataset), { allowed: false, reason: 'REVIEWER_METADATA_REQUIRED' })
  assert.deepEqual(heldOutSignoffGate(dataset, { reviewerIds: ['not-a-real-reviewer'], reviewedAt: '2026-10-04T00:00:00Z', receiptId: 'test-only', datasetHash: review.datasetHash }), { allowed: false, reason: 'HELD_OUT_RECORDS_NOT_HUMAN_REVIEWED' })
})
