import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSearchBenchmarkDataset, searchBenchmarkDatasetHash, heldOutSignoffGate, searchLabelSpans } from '../benchmarks/search/dataset.js'
import { validateSearchDataset, requireReviewedHeldOut } from '../benchmarks/search/validation.js'
import { renderSearchReview, searchReviewArtifacts } from '../benchmarks/search/review.js'
import { instantiate } from '../benchmarks/search/templates.js'
import { readFile } from 'node:fs/promises'

const records = buildSearchBenchmarkDataset()
const clone = () => structuredClone(records)
const firstWithSpan = values => values.find(record => record.truth.expected.pickupSpans?.value?.length)
test('review packet contains every case, readable labels and exactly the highlighted subset', async () => {
  const review = searchReviewArtifacts()
  assert.equal(review.proposal.index.core, 320)
  assert.equal(review.proposal.index.exploratory, 40)
  assert.equal(review.reviewRequired.length, 182)
  assert.equal(review.proposal.index.deterministicallyLabelled, 178)
  assert.equal(review.proposal.index.development, 222)
  assert.equal(review.proposal.index.heldOut, 98)
  for (const record of records) {
    assert.ok(review.reviewMarkdown.includes(record.id))
    assert.equal(review.requiredMarkdown.includes(`| ${record.id} |`), record.truth.reviewReasons.length > 0)
  }
  assert.ok(review.reviewMarkdown.includes('UNSPECIFIED'))
  assert.ok(review.reviewMarkdown.includes('EXPLICIT_ANY'))
  assert.ok(review.reviewMarkdown.includes('PREFERRED'))
  assert.ok(review.requiredMarkdown.includes('WEEKDAY_SEMANTICS'))
  assert.equal(renderSearchReview(records).includes('PROPOSED — NOT FROZEN'), true)
  const proposed = JSON.parse(await readFile(process.env.RCS_SEARCH_REVIEW_ARTIFACT
    ?? new URL('../../docs/search/benchmark-v1/proposed.json', import.meta.url), 'utf8'))
  assert.equal(proposed.datasetHash, searchBenchmarkDatasetHash(records))
  assert.deepEqual(proposed.records, records)
})
test('dataset validation rejects broken source provenance, duplicates, schema leakage and split-family leakage', () => {
  assert.deepEqual(validateSearchDataset(records), { records: 360, templateFamilyLeakage: 0 })
  assert.deepEqual(validateSearchDataset([records[0]], { full: false }), { records: 1, templateFamilyLeakage: 0 })
  assert.throws(() => validateSearchDataset([records[0]]), /COUNT_MISMATCH/)
  const edits = [
    values => { values[1].id = values[0].id },
    values => { values[1].modelInput.query = values[0].modelInput.query },
    values => { values[0].modelInput.label = 'leak' },
    values => { values[3].split = values[0].split === 'HELD_OUT' ? 'DEVELOPMENT' : 'HELD_OUT' },
    values => { values[0].familyId = 'misleading-subfamily' },
    values => { values.at(-1).split = 'DEVELOPMENT' },
    values => { values[0].split = 'EXPLORATORY_ONLY' },
    values => { firstWithSpan(values).truth.expected.pickupSpans.value[0].exactText = 'invented' },
    values => { firstWithSpan(values).truth.expected.pickupSpans.value[0].end = 9000 },
    values => { const span = firstWithSpan(values).truth.expected.pickupSpans.value[0]; span.start = span.end },
    values => { firstWithSpan(values).truth.expected.pickupSpans.value[0].start = -1 },
  ]
  for (const edit of edits) { const modified = clone(); edit(modified); assert.throws(() => validateSearchDataset(modified)) }
})
test('UTF-16 labels preserve a whole emoji and reject a split surrogate, including an exact slice', () => {
  const values = [structuredClone(firstWithSpan(records))]
  const record = values[0]; record.modelInput.query = '🚕'
  for (const field of ['pickupSpans', 'dropSpans', 'stopSpans', 'locationSearchSpans']) record.truth.expected[field] = { status: 'LABELLED', value: [] }
  record.truth.expected.pickupSpans.value = [{ start: 0, end: 2, exactText: '🚕' }]
  assert.equal(validateSearchDataset(values, { full: false }).records, 1)
  record.truth.expected.pickupSpans.value = [{ start: 1, end: 2, exactText: record.modelInput.query.slice(1, 2) }]
  assert.throws(() => validateSearchDataset(values, { full: false }), /INVALID_GOLD_SOURCE_SPAN/)
  record.truth.expected.pickupSpans.value = [{ start: 0, end: 1, exactText: record.modelInput.query.slice(0, 1) }]
  assert.throws(() => validateSearchDataset(values, { full: false }), /INVALID_GOLD_SOURCE_SPAN/)
  record.modelInput.query = '\uD800'; record.truth.expected.pickupSpans.value = [{ start: 0, end: 1, exactText: '\uD800' }]
  assert.equal(validateSearchDataset(values, { full: false }).records, 1)
  assert.throws(() => searchLabelSpans('campus', 'airport'), /GOLD_SPAN_NOT_IN_QUERY/)
  assert.deepEqual(searchLabelSpans('campus to campus', 'campus'), [{ start: 0, end: 6, exactText: 'campus' }, { start: 10, end: 16, exactText: 'campus' }])
})
test('held-out gate cannot be bypassed by a hash alone or by pretending provenance equals human approval', () => {
  assert.throws(() => requireReviewedHeldOut(records), /REVIEWER_METADATA_REQUIRED/)
  assert.equal(heldOutSignoffGate(records, { reviewerIds: ['fixture'], reviewedAt: 'fixture', receiptId: 'fixture', datasetHash: 'changed' }).reason, 'DATASET_HASH_MISMATCH')
  const approved = clone()
  for (const record of approved.filter(row => row.cohort === 'CORE')) record.truth.provenance = 'HUMAN_REVIEWED_SYNTHETIC'
  const receipt = values => ({ reviewerIds: ['test-only-human'], reviewedAt: '2026-10-04T00:00:00Z', receiptId: 'test-only', datasetHash: searchBenchmarkDatasetHash(values) })
  assert.throws(() => requireReviewedHeldOut(approved, receipt(approved)), /CORE_REVIEW_INCOMPLETE/)
  for (const record of approved.filter(row => row.cohort === 'CORE')) {
    record.truth.status = 'APPROVED'; record.truth.disagreementResolved = true; record.truth.reviewerMetadata = { reviewer: 'test-only-human' }
  }
  assert.equal(requireReviewedHeldOut(approved, receipt(approved)).length, 98)
  for (const edit of [record => { record.truth.status = 'PROPOSED' }, record => { record.truth.disagreementResolved = false },
    record => { record.truth.reviewerMetadata = null }]) {
    const changed = structuredClone(approved); edit(changed[0])
    assert.throws(() => requireReviewedHeldOut(changed, receipt(changed)), /CORE_REVIEW_INCOMPLETE/)
  }
  const badSpan = structuredClone(approved); firstWithSpan(badSpan).truth.expected.pickupSpans.value[0].exactText = 'not-in-query'
  assert.throws(() => requireReviewedHeldOut(badSpan, receipt(badSpan)), /INVALID_GOLD_SOURCE_SPAN/)
  assert.throws(() => requireReviewedHeldOut(records, receipt(records)), /HELD_OUT_RECORDS_NOT_HUMAN_REVIEWED/)
})
test('review safeguards independently check partial receipts, each corpus count and duplicate bare-location text', () => {
  for (const receipt of [{}, { reviewerIds: ['fixture'] }, { reviewerIds: ['fixture'], reviewedAt: 'fixture' }]) {
    assert.deepEqual(heldOutSignoffGate(records, receipt), { allowed: false, reason: 'REVIEWER_METADATA_REQUIRED' })
  }
  const wrongHash = { reviewerIds: ['fixture'], reviewedAt: 'fixture', receiptId: 'fixture', datasetHash: 'wrong' }
  assert.deepEqual(heldOutSignoffGate(records, wrongHash), { allowed: false, reason: 'DATASET_HASH_MISMATCH' })
  for (const cohort of ['CORE', 'EXPLORATORY']) {
    const omitted = records.find(record => record.cohort === cohort)
    assert.throws(() => validateSearchDataset(records.filter(record => record.id !== omitted.id)), /COUNT_MISMATCH/)
  }
  const bare = structuredClone(records.filter(record => record.category === 'standalone').slice(0, 2))
  bare[1].modelInput.query = bare[0].modelInput.query
  bare[1].truth.expected.locationSearchSpans = structuredClone(bare[0].truth.expected.locationSearchSpans)
  assert.throws(() => validateSearchDataset(bare, { full: false }), /DUPLICATE_SEARCH_RECORD/)
  const bounds = [structuredClone(firstWithSpan(records))]
  bounds[0].truth.expected.pickupSpans.value = [{ start: 0, end: bounds[0].modelInput.query.length + 1, exactText: bounds[0].modelInput.query }]
  assert.throws(() => validateSearchDataset(bounds, { full: false }), /INVALID_GOLD_SOURCE_SPAN/)
})
test('frozen partial, timing, vehicle, policy and standalone rules are represented separately', () => {
  const find = family => records.find(record => record.familyId === family)
  const expected = family => find(family).truth.expected
  assert.equal(expected('partial-vehicle-date').complexity.value, 'SIMPLE')
  assert.equal(expected('partial-vehicle-date').fallbackExpected.value, 'NOT_REQUIRED')
  assert.equal(expected('partial-vehicle-date').time.value.state, 'UNSPECIFIED')
  assert.equal(expected('partial-vehicle').timingMode.value, 'UNSPECIFIED')
  assert.equal(expected('time-daypart').time.value.value.kind, 'DAYPART')
  assert.deepEqual(expected('time-daypart').ambiguities.value, ['EXACT_TIME_REQUIRED'])
  assert.deepEqual(expected('time-approximate').ambiguities.value, ['TIME_PERIOD_REQUIRED'])
  assert.equal(expected('time-approximate').time.value.value.period, null)
  assert.equal(expected('vehicle-any').vehicle.value.state, 'EXPLICIT_ANY')
  assert.deepEqual(expected('vehicle-excluded-sedan').vehicle.value.excluded, ['sedan'])
  assert.equal(expected('vehicle-preferred').vehicle.value.strength, 'PREFERRED')
  assert.equal(expected('bare-place').groundingTarget.value, 'LOCATION_TARGET_REQUIRED')
  assert.equal(expected('standalone-pickup').groundingTarget.value, 'pickup')
  assert.equal(expected('standalone-drop').groundingTarget.value, 'drop')
  assert.equal(expected('weekday-next').resolvedDate.status, 'NOT_LABELLED')
  assert.equal(expected('omitted-year').date.value.value.year, null)
  assert.equal(expected('non-ist').resolvedTime.status, 'NOT_LABELLED')
  assert.equal(expected('conflicting-times').time.status, 'NOT_LABELLED')
  assert.equal(expected('conflicting-times').missingFields.value.includes('timing.time'), false)
  const custom = instantiate({ fields: { value: '{people}', text: '{hour}', literal: 'literal', boolean: false, nil: null, values: ['{p}'] }, text: '{p}', id: 'test' }, 0)
  assert.equal(custom.fields.value, 2); assert.equal(custom.fields.text, 5)
})
