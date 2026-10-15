import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveResponsibilityGroundTruth, responsibilityGroundTruthSource } from '../benchmarks/responsibility/contracts.js'

const candidate = (source, responsibility) => ({
  responsibility, needsReview: false, consequenceLevel: 'LEVEL_1', autoUpholdAllowed: false,
  autoWaiveAllowed: false, evidenceSufficient: true, requiredMissingEvidence: [], contradictionCritical: false, source,
})

test('ground truth hierarchy is final appeal, admin human, frozen synthetic, then unlabeled', () => {
  const result = resolveResponsibilityGroundTruth([
    candidate(responsibilityGroundTruthSource.UNLABELED, 'EXTERNAL_OR_UNCERTAIN'),
    candidate(responsibilityGroundTruthSource.FROZEN_SYNTHETIC, 'DRIVER_CAUSED'),
    candidate(responsibilityGroundTruthSource.ADMIN_HUMAN, 'PLATFORM_CAUSED'),
    candidate(responsibilityGroundTruthSource.FINAL_APPEAL, 'VALID_WAIVED'),
  ])
  assert.equal(result.responsibility, 'VALID_WAIVED')
})

test('ground truth rejects conflicting equally authoritative labels and treats unlabeled-only input as no truth', () => {
  assert.throws(() => resolveResponsibilityGroundTruth([
    candidate(responsibilityGroundTruthSource.ADMIN_HUMAN, 'DRIVER_CAUSED'),
    candidate(responsibilityGroundTruthSource.ADMIN_HUMAN, 'PLATFORM_CAUSED'),
  ]), /GROUND_TRUTH_CONFLICT/)
  assert.equal(resolveResponsibilityGroundTruth([
    candidate(responsibilityGroundTruthSource.UNLABELED, 'EXTERNAL_OR_UNCERTAIN'),
  ]), null)
})
