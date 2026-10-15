import test from 'node:test'
import assert from 'node:assert/strict'
import { assertReviewEvidence } from '../services/responsibilityReviewEvidence.js'
import { reviewResponsibilityCase } from '../services/responsibilityReviewService.js'
import { reviewResponsibilityAppeal } from '../services/responsibilityAppealService.js'

const evidenceHash = 'a'.repeat(64)
const row = { id: 'case', evidenceVersion: 'responsibility-evidence-v1', evidenceHash }
const expected = { version: row.evidenceVersion, hash: evidenceHash }
const code = value => error => error.code === value
test('review accepts the exact persisted identity and optional internal legacy callers', () => {
  assertReviewEvidence(row, expected)
  assertReviewEvidence(row, undefined)
})
test('review precondition rejects missing, malformed and partial identities', () => {
  for (const value of [null, {}, { ...expected, version: 1 }, { ...expected, version: '' },
    { ...expected, version: '  ' }, { ...expected, version: 'v'.repeat(201) },
    { ...expected, hash: null }, { ...expected, hash: 'a'.repeat(63) }, { ...expected, hash: 'a'.repeat(65) },
    { ...expected, hash: 'A'.repeat(64) }, { ...expected, hash: 'g'.repeat(64) },
    { ...expected, hash: BigInt('1'.repeat(64)) }]) {
    assert.throws(() => assertReviewEvidence(row, value), error => code('INVALID_REVIEW_EVIDENCE')(error)
      && error.message === 'Review evidence identity is required' && error.status === 400)
  }
})
test('review rejects a superseded version or hash independently', () => {
  assert.throws(() => assertReviewEvidence(row, { ...expected, version: 'responsibility-evidence-v2' }), error => code('REVIEW_EVIDENCE_CHANGED')(error)
    && error.message === 'Evidence changed. Reload the case before reviewing.' && error.status === 409)
  assert.throws(() => assertReviewEvidence(row, { ...expected, hash: 'b'.repeat(64) }), code('REVIEW_EVIDENCE_CHANGED'))
  assertReviewEvidence({ ...row, evidenceVersion: 'v'.repeat(200) }, { ...expected, version: 'v'.repeat(200) })
})
test('admin and appeal preconditions execute under the case lock before existing-authority reuse', async () => {
  let locked = false
  const repository = { async withLockedCase(id, work) {
    assert.equal(id, row.id); locked = true
    return work({ findAdminReview() { assert.fail('stale review reached authority') },
      findFinalDecision() { assert.fail('stale appeal reached authority') } }, row)
  } }
  const expectedEvidence = { ...expected, hash: 'b'.repeat(64) }
  await assert.rejects(reviewResponsibilityCase({ caseId: row.id, adminActorId: 'synthetic-admin', decision: 'WAIVE',
    reason: 'Synthetic review', expectedEvidence }, { repository }), code('REVIEW_EVIDENCE_CHANGED'))
  assert.equal(locked, true); locked = false
  await assert.rejects(reviewResponsibilityAppeal({ caseId: row.id, reviewerId: 'synthetic-admin', outcome: 'WAIVE',
    reason: 'Synthetic review', expectedEvidence }, { repository }), code('REVIEW_EVIDENCE_CHANGED'))
  assert.equal(locked, true)
})
