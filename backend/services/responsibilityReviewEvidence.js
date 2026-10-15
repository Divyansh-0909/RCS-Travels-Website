import { lifecycleError } from './responsibilityLifecycleErrors.js'

// Protected HTTP reviews require this precondition. Existing internal lifecycle
// callers may omit it; they do not represent a browser's previously loaded view.
export function assertReviewEvidence(responsibilityCase, expected) {
  if (expected === undefined) return
  if (!expected || typeof expected.version !== 'string' || !expected.version.trim() || expected.version.length > 200
    || typeof expected.hash !== 'string' || !/^[a-f0-9]{64}$/.test(expected.hash)) {
    throw lifecycleError('INVALID_REVIEW_EVIDENCE', 'Review evidence identity is required', 400)
  }
  if (responsibilityCase.evidenceVersion !== expected.version || responsibilityCase.evidenceHash !== expected.hash) {
    throw lifecycleError('REVIEW_EVIDENCE_CHANGED', 'Evidence changed. Reload the case before reviewing.', 409)
  }
}
