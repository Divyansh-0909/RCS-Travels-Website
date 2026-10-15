import assert from 'node:assert/strict'
import { mock } from 'node:test'
const url = new URL('../../benchmarks/search/approval.js', import.meta.url)
const original = await import(url)
const mode = process.argv[2]
mock.module(url, { namedExports: { ...original, validateDeterministicApproval: records => {
  const result = original.validateDeterministicApproval(records)
  if (mode === 'proof') result.stillDeterministic = 177
  else {
    result.results[0].caseId = 'core-vehicle-preferences-005'
  }
  return result
} } })
const { buildOwnerPolicyReview } = await import('../../benchmarks/search/ownerPolicyReview.js')
assert.throws(() => buildOwnerPolicyReview(), mode === 'proof' ? /OWNER_APPROVAL_PROOF_CHANGED/ : /APPROVED_LABEL_MATERIAL_CHANGE/)
console.log('OWNER_APPROVAL_BOUNDARY_VERIFIED')
