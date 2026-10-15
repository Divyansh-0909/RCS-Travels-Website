import test from 'node:test'
import assert from 'node:assert/strict'
import { buildOwnerPolicyReview, validateOwnerApprovalProof, validateApprovedLabels } from '../benchmarks/search/ownerPolicyReview.js'
import { buildSearchBenchmarkDataset } from '../benchmarks/search/dataset.js'
import { requireReviewedHeldOut } from '../benchmarks/search/validation.js'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

test('owner class approval binds exactly the certified 178 unchanged labels; policy changes retain an old/new audit', () => {
  const baseline = buildSearchBenchmarkDataset(); const result = buildOwnerPolicyReview(baseline)
  assert.equal(result.approval.length, 178); assert.equal(result.summary.policyResolved, 21)
  assert.equal(result.review.length, 121); assert.equal(result.summary.familyReviewsRemaining, 19)
  assert.equal(result.summary.development, 222); assert.equal(result.summary.heldOut, 98)
  assert.equal(result.summary.validation.templateFamilyLeakage, 0)
  for (const approval of result.approval) {
    const row = result.records.find(record => record.id === approval.caseId)
    assert.equal(row.truth.status, 'APPROVED')
    assert.equal(row.truth.disagreementResolved, true)
    assert.equal(row.truth.reviewerMetadata.humanApprovalStatus, 'APPROVED_AS_SPEC_DERIVED_CLASS')
    assert.deepEqual(row.truth.expected, baseline.find(record => record.id === approval.caseId).truth.expected)
    assert.equal(approval.approvedLabelHash, createHash('sha256').update(JSON.stringify(row.truth.expected)).digest('hex'))
  }
  assert.equal(result.changes.length, 21)
  for (const change of result.changes) { assert.equal(change.approvalTransferred, false); assert.notDeepEqual(change.oldTruth, change.newTruth) }
  assert.equal(result.summary.frozen, false); assert.equal(result.summary.heldOutExecuted, false)
  assert.equal(result.summary.exploratoryScored, false); assert.equal(result.summary.calendarWeekAnchorUnscored, 5)
  assert.equal(result.status, 'PARTIALLY_HUMAN_APPROVED_NOT_FROZEN')
  assert.equal(result.receipt.reviewedAt, '2026-10-05'); assert.equal(result.receipt.receiptId, 'product-owner-search-P1-P5-2026-10-05')
  assert.equal(result.receipt.source, 'attachment:b0a53b16-a379-42be-896a-c1cd13ba9022')
  assert.equal(result.receipt.policyVersion, 'search-owner-policy-P1-P5-v1')
  for (const change of result.changes) {
    assert.equal(change.newTruth.status, 'PROPOSED'); assert.equal(change.policyVersion, result.receipt.policyVersion)
    assert.equal(change.reason, `Product owner ${change.policy}; provider outputs are not ground truth`)
    assert.equal(change.reviewDisposition, 'DETERMINISTIC_POLICY_DERIVATION')
    assert.deepEqual(change.newTruth.reviewReasons, []); assert.deepEqual(change.newTruth.unresolvedPolicies, [])
    assert.deepEqual(change.newTruth.expected.ambiguities.value, [])
    const changedFields = change.policy === 'P5' ? ['vehicle', 'ambiguities'] : ['resolvedDate', 'resolvedTime', 'ambiguities']
    for (const field of Object.keys(change.oldTruth.expected).filter(field => !changedFields.includes(field))) {
      assert.deepEqual(change.newTruth.expected[field], change.oldTruth.expected[field])
    }
  }
  assert.equal(result.records.filter(row => row.cohort === 'EXPLORATORY').length, 40)
  assert.throws(() => requireReviewedHeldOut(result.records, { ...result.receipt, datasetHash: result.summary.datasetHash }), /NOT_HUMAN_REVIEWED/)
})
test('policy resolution preserves date/time components, confirms zone conversion and keeps understood out-of-window dates', () => {
  const result = buildOwnerPolicyReview()
  const omitted = result.changes.filter(row => row.policy === 'P2')
  assert.equal(omitted.length, 5)
  for (const row of omitted) {
    assert.equal(row.newTruth.expected.resolvedDate.value, '2026-12-05')
    assert.deepEqual(row.newTruth.expected.date, row.oldTruth.expected.date)
    assert.equal(row.scheduling.error, 'too_far')
  }
  const london = result.changes.filter(row => row.policy === 'P4')
  assert.equal(london.length, 5)
  for (const row of london) { assert.equal(row.conversion.sourceTimeZone, 'Europe/London'); assert.deepEqual(row.newTruth.expected.time, row.oldTruth.expected.time) }
  const midnight = london.find(row => row.conversion.sourceTime === '20:00')
  assert.equal(midnight.newTruth.expected.resolvedDate.value, '2026-10-06')
  assert.equal(midnight.newTruth.expected.resolvedTime.value, '00:30')
  assert.equal(midnight.conversion.sourceDate, '2026-10-05')
  assert.equal(midnight.conversion.source, `Intl/ICU ${process.versions.icu}`)
  assert.equal(midnight.scheduling.error, undefined)
  const lateLondon = london.find(row => row.conversion.sourceTime === '23:00')
  assert.equal(lateLondon.newTruth.expected.resolvedDate.value, '2026-10-06')
  assert.equal(lateLondon.newTruth.expected.resolvedTime.value, '03:30')
  for (const row of result.changes.filter(row => row.policy === 'P3')) {
    assert.equal(row.newTruth.expected.resolvedDate.status, 'NOT_LABELLED')
    assert.equal(row.newTruth.expected.resolvedDate.reason, 'CALENDAR_WEEK_ANCHOR_NOT_ESTABLISHED_BY_APPLICATION')
    assert.equal(row.resolutionLimitation, 'CALENDAR_WEEK_ANCHOR_NOT_ESTABLISHED_BY_APPLICATION')
    assert.equal(row.scheduling, null)
  }
  for (const row of result.changes.filter(row => row.policy !== 'P3')) assert.equal(row.resolutionLimitation, null)
  for (const row of result.changes.filter(row => row.policy === 'P5')) assert.deepEqual(row.newTruth.expected.vehicle.value.excluded, ['suv', 'suv_premium'])
})
test('changing a baseline ID, span, policy label or split cannot inherit human approval', () => {
  for (const modify of [rows => { rows[0].id += '-changed' }, rows => { rows[0].truth.expected.queryType.value = 'BOOKING_REQUEST' },
    rows => { rows[0].split = 'DEVELOPMENT' }, rows => { rows[0].modelInput.query += ' changed' }]) {
    const rows = buildSearchBenchmarkDataset(); modify(rows)
    assert.throws(() => buildOwnerPolicyReview(rows), /OWNER_APPROVAL_BASELINE_CHANGED/)
  }
})
test('a changed independent certification or changed approved interpretation fails closed', () => {
  for (const proof of [{ stillDeterministic: 177, movedToReview: 0 }, { stillDeterministic: 178, movedToReview: 1 },
    { stillDeterministic: 178, movedToReview: 0, datasetValidationError: 'INVALID_SOURCE_SPAN' }]) assert.throws(() => validateOwnerApprovalProof(proof), /PROOF_CHANGED/)
  assert.throws(() => validateApprovedLabels({ vehicle: 'suv' }, { vehicle: 'suv_premium' }), /MATERIAL_CHANGE/)
})
test('the owner approval boundary rejects certification corruption and a policy-changed interpretation in its actual call path', async () => {
  for (const mode of ['proof', 'interpretation']) {
    const result = await promisify(execFile)(process.execPath, ['--import', 'tsx', '--experimental-test-module-mocks',
      fileURLToPath(new URL('./helpers/searchOwnerPolicyProbe.mjs', import.meta.url)), mode], { windowsHide: true })
    assert.equal(result.stdout.trim(), 'OWNER_APPROVAL_BOUNDARY_VERIFIED')
  }
})
test('London fixture resolution is host-timezone independent at a date boundary', async () => {
  const result = await promisify(execFile)(process.execPath, ['--import', 'tsx',
    fileURLToPath(new URL('./helpers/searchOwnerTimezoneProbe.mjs', import.meta.url))],
  { windowsHide: true, env: { ...process.env, TZ: 'America/Los_Angeles' } })
  assert.equal(result.stdout.trim(), 'HOST_TIMEZONE_INDEPENDENCE_VERIFIED')
})
