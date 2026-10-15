import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSearchBenchmarkDataset } from '../benchmarks/search/dataset.js'
import { validateDeterministicApproval } from '../benchmarks/search/approval.js'
import { buildClassReviewPack, renderCoreClassReview } from '../benchmarks/search/classReview.js'

const records = buildSearchBenchmarkDataset()
const replace = (id, mutate) => { const changed = structuredClone(records); mutate(changed.find(row => row.id === id)); return changed }
const deterministic = records.filter(row => row.truth.derivation === 'FROZEN_SPEC_DETERMINISTIC')
test('independent proof certifies 178 proposed deterministic cases without granting human approval', () => {
  const report = validateDeterministicApproval(records)
  assert.equal(report.originalDeterministic, 178)
  assert.equal(report.stillDeterministic, 178); assert.equal(report.movedToReview, 0)
  assert.equal(report.approvalGranted, false); assert.equal(report.datasetValidationError, null)
  assert.ok(report.results.every(row => row.eligible && row.proofs.length))
  assert.equal(report.version, 'search-class-approval-proof-v1')
  assert.match(report.datasetHash, /^[a-f0-9]{64}$/)
  assert.ok(report.results.every(row => row.disposition === 'CLASS_APPROVAL_ELIGIBLE' && row.proofs.every(proof =>
    proof.rule === `FROZEN_S1_S4_${proof.field}` && proof.method === 'QUERY_GRAMMAR_AND_EXISTING_DETERMINISTIC_VALIDATION')))
  assert.ok(records.every(row => row.truth.status === 'PROPOSED'))
})
test('wrong role span and absent-field invention move the case to review without rewriting labels', () => {
  const role = deterministic.find(row => row.truth.expected.pickupSpans.value.length)
  const bad = replace(role.id, row => { row.truth.expected.pickupSpans.value[0].exactText = 'invented' })
  const report = validateDeterministicApproval(bad)
  assert.equal(report.movedToReview, 1); assert.equal(report.stillDeterministic, 177)
  assert.ok(report.results.find(row => row.caseId === role.id).failures.includes('INVALID_GOLD_SOURCE_SPAN'))
  assert.equal(bad.find(row => row.id === role.id).truth.expected.pickupSpans.value[0].exactText, 'invented')
  const invented = replace(deterministic[0].id, row => { row.truth.expected.missingFields.value = ['wrong-field'] })
  assert.equal(validateDeterministicApproval(invented).movedToReview, 1)
  const unlabelled = replace(deterministic[0].id, row => { row.truth.expected.vehicle = { status: 'NOT_LABELLED', reason: 'Not reviewed' } })
  const rejected = validateDeterministicApproval(unlabelled).results.find(row => row.caseId === deterministic[0].id)
  assert.equal(rejected.disposition, 'REVIEW_REQUIRED')
  assert.ok(rejected.failures.includes('vehicle:INDEPENDENT_DERIVATION_MISMATCH'))
  const timestamp = replace(deterministic[0].id, row => { row.truth.expected.resolvedDate = { status: 'LABELLED', value: '2026-10-05' } })
  assert.ok(validateDeterministicApproval(timestamp).results.find(row => row.caseId === deterministic[0].id).failures.includes('resolvedDate:TIMESTAMP_NOT_PROVABLE'))
})
test('approval certificate excludes exploratory records and names policy/provenance rejection reasons', () => {
  const id = deterministic[0].id
  const exploratory = replace(id, row => { row.cohort = 'EXPLORATORY'; row.split = 'EXPLORATORY_ONLY'; row.ordinaryOrAdversarial = 'EXPLORATORY' })
  const report = validateDeterministicApproval(exploratory)
  assert.equal(report.originalDeterministic, 177)
  assert.equal(report.results.some(row => row.caseId === id), false)
  const policy = validateDeterministicApproval(replace(id, row => { row.truth.reviewReasons = ['JUDGMENT_REQUIRED'] }))
  assert.ok(policy.results.find(row => row.caseId === id).failures.includes('POLICY_OR_JUDGMENT_PRESENT'))
  const provenance = validateDeterministicApproval(replace(id, row => { row.truth.provenance = 'FROZEN_SPEC_REVIEWED_SYNTHETIC' }))
  assert.ok(provenance.results.find(row => row.caseId === id).failures.includes('UNEXPECTED_LABEL_PROVENANCE'))
})
test('class proof preserves exact endpoint phrases through harmless spacing, courtesy and time-order variants', () => {
  const base = records.find(row => row.id === 'core-complete-simple-001')
  for (const query of [
    'Book a hatchback from  Pari Chowk to  Sunrise Metro tomorrow at 5 PM, no sedan',
    'pickup : Pari Chowk; destination : Sunrise Metro; hatchback tomorrow 5 PM, no sedan',
    'Book a hatchback from Pari Chowk and continue to Sunrise Metro tomorrow at 5 PM, no sedan',
    'please, Pari Chowk to Sunrise Metro, hatchback tomorrow at 5 PM, no sedan',
    'Book a hatchback from Pari Chowk to Sunrise Metro at 5 PM tomorrow, no sedan',
    "Book a hatchback from Pari Chowk to Sunrise Metro tomorrow at 5 PM, don't send a sedan",
    'Book a hatchback from Pari Chowk to Sunrise Metro tomorrow at 5 PM, no   sedan',
  ]) {
    const revised = replace(base.id, row => { row.modelInput.query = query
      for (const [role, text] of [['pickup', 'Pari Chowk'], ['drop', 'Sunrise Metro']]) {
        const start = query.indexOf(text)
        row.truth.expected[`${role}Spans`].value = [{ start, end: start + text.length, exactText: text }]
      }
    })
    const result = validateDeterministicApproval(revised).results.find(row => row.caseId === base.id)
    assert.equal(result.eligible, true, `${query}: ${result.failures.join(', ')}`)
  }
})
test('policy, semantic judgment, model-derived provenance, invented timestamps and unknown labels cannot receive class approval', () => {
  const id = deterministic[0].id
  for (const mutate of [
    row => row.truth.unresolvedPolicies.push('OMITTED_YEAR_SEMANTICS'),
    row => row.truth.reviewReasons.push('JUDGMENT_REQUIRED'),
    row => { row.truth.provenance = 'HUMAN_REVIEWED_SYNTHETIC' },
    row => { row.truth.expected.resolvedDate = { status: 'LABELLED', value: '2026-10-05' } },
    row => { row.truth.expected.fake = { status: 'LABELLED', value: true } },
    row => { row.truth.expected.fake = { status: 'NOT_LABELLED', reason: 'Not a supported semantic field' } },
    row => { row.truth.expected.vehicle = { status: 'NOT_LABELLED', reason: 'unknown' } },
    row => { row.modelInput.query = 'SUV only but no SUV' },
    row => { row.modelInput.query = 'any car SUV only' },
    row => { row.modelInput.query = 'sedan or SUV' },
    row => { row.modelInput.query = 'not SUV' },
    row => { row.modelInput.query = 'tomorrow at 6 PM and at 8 PM' },
    row => { row.modelInput.query = 'cab Friday' },
    row => { row.modelInput.query = 'cab on 5 December' },
    row => { row.modelInput.query = 'cab evening' },
    row => { row.modelInput.query = 'cab around 7' },
    row => { row.modelInput.query = 'cab now tomorrow' },
    row => { row.modelInput.query = '3 people' },
    row => { row.modelInput.query = 'private sharing' },
    row => { row.modelInput.query = 'book me a ride' },
    row => { row.modelInput.query = 'something vague' },
    row => { row.modelInput.query = 'from campus to airport from Delta 1' },
  ]) assert.ok(validateDeterministicApproval(replace(id, mutate)).results.find(row => row.caseId === id).failures.length)
})
test('proof grammar rejects supplied ambiguity rather than mistaking failed source validation for a semantic proof', () => {
  const id = deterministic[0].id
  for (const [query, reason] of [
    ['SUV sedan', 'VEHICLE_JUDGMENT_REQUIRED'], ['SUV only no SUV', 'VEHICLE_JUDGMENT_REQUIRED'],
    ['any car SUV only', 'VEHICLE_JUDGMENT_REQUIRED'], ['not SUV', 'SUV_POLICY_UNRESOLVED'],
    ['from campus to airport from Delta 1', 'DIRECTION_JUDGMENT_REQUIRED'],
    ['tomorrow today', 'SEMANTIC_REVIEW_REQUIRED'], ['cab at 6 PM and at 8 PM', 'SEMANTIC_REVIEW_REQUIRED'],
    ['3 people', 'SEMANTIC_REVIEW_REQUIRED'], ['AC car', 'SEMANTIC_REVIEW_REQUIRED'],
    ['cab Friday', 'DATE_POLICY_UNRESOLVED'], ['cab on 5 December', 'DATE_POLICY_UNRESOLVED'],
    ['cab evening', 'TIME_CLARIFICATION_REQUIRED'], ['cab at 7', 'time:INDEPENDENT_DERIVATION_MISMATCH'],
    ['cab around 7 PM', 'TIME_CLARIFICATION_REQUIRED'], ['cab now at 7 PM', 'TEMPORAL_CONFLICT'],
    ['private sharing', 'FLAG_CONFLICT'], ['book me a ride', 'QUERY_CLASS_JUDGMENT_REQUIRED'],
    ['something vague', 'LOCATION_CLASS_JUDGMENT_REQUIRED'], ['cab if available', 'INTERPRETATION_OUTSIDE_PROOF_GRAMMAR'],
  ]) {
    const changed = replace(id, row => { row.modelInput.query = query
      for (const key of ['pickupSpans', 'dropSpans', 'stopSpans', 'locationSearchSpans']) row.truth.expected[key].value = [] })
    const result = validateDeterministicApproval(changed).results.find(row => row.caseId === id)
    assert.ok(result.failures.includes(reason), `${query}: ${result.failures.join(', ')}`)
  }
  const duplicated = structuredClone(records); duplicated[1] = structuredClone(duplicated[0])
  const report = validateDeterministicApproval(duplicated)
  assert.equal(report.datasetValidationError, 'DUPLICATE_SEARCH_RECORD')
  assert.ok(report.results.every(row => row.failures.includes('DATASET_STRUCTURE_INVALID')))
})
test('risk pack reviews only 142 core cases, leaves exploratory unscored and identifies policy-specific fields', () => {
  const pack = buildClassReviewPack(records)
  assert.equal(pack.status, 'PROPOSED_NOT_FROZEN')
  assert.equal(pack.coreReview.length, 142); assert.equal(pack.exploratory.length, 40); assert.equal(pack.policyCases.length, 21)
  assert.ok(pack.coreReview.every(row => row.status === 'PROPOSED_REVIEW_REQUIRED' && Object.keys(row.proposedLabelsForReview).length > 0))
  assert.ok(pack.coreReview.every(row => row.decisions.every(decision => decision.reason !== 'DETERMINISTIC_CERTIFICATE_FAILED')))
  assert.ok(pack.coreReview.every(row => row.decisions.every(decision => decision.decision.trim() && decision.recommendation.trim() && decision.alternative.trim())))
  assert.ok(pack.policyCases.every(row => row.policies.every(policy => policy.options.every(option => option.trim()) && policy.decision.trim() && policy.effect.trim())))
  assert.ok(pack.exploratory.every(row => row.evaluationDisposition === 'EXPLORATORY_UNSCORED' && row.split === 'EXPLORATORY_ONLY'))
  assert.ok(pack.coreReview.every((row, index) => !index || row.priority >= pack.coreReview[index - 1].priority))
  assert.ok(pack.policyCases.every(row => row.policies.every(policy => policy.options.length > 1 && policy.effect && policy.fields.length)))
  assert.ok(pack.policyCases.every(row => row.priority === 1))
  for (const family of ['role-at-drop', 'role-drop-before-from', 'role-hinglish-order', 'role-repeated-place', 'role-reversed-clause',
    'stop-friend', 'stop-via', 'return-complicated', 'rental-duration', 'conditional-alternative', 'conflicting-times', 'changed-mind']) {
    const rows = pack.coreReview.filter(row => row.templateFamily === family)
    assert.ok(rows.length > 0, family); assert.ok(rows.every(row => row.priority === 1), family)
  }
  assert.ok(pack.coreReview.filter(row => ['noisy-route', 'overlap-location'].includes(row.templateFamily)).every(row => row.priority === 2))
  assert.equal(pack.humanReviewComplete, false); assert.equal(pack.finalHeldOutRun, false)
  const text = renderCoreClassReview(pack)
  assert.ok(pack.coreReview.every(row => text.includes(row.caseId)))
  assert.ok(text.includes('Fields:')); assert.ok(text.includes('Options:'))
  const moved = buildClassReviewPack(replace(deterministic[0].id, row => { row.truth.expected.queryType.value = 'WRONG' }))
  assert.equal(moved.coreReview.length, 143)
  assert.ok(moved.coreReview.find(row => row.caseId === deterministic[0].id).decisions.some(d => d.reason === 'DETERMINISTIC_CERTIFICATE_FAILED'))
  const failedCase = moved.coreReview.find(row => row.caseId === deterministic[0].id)
  assert.deepEqual(failedCase.proofFailures, ['queryType:INDEPENDENT_DERIVATION_MISMATCH'])
  assert.deepEqual(failedCase.decisions[0].fields, ['queryType'])
  assert.ok(failedCase.decisions[0].decision.trim() && failedCase.decisions[0].recommendation.trim() && failedCase.decisions[0].alternative.trim())
  assert.deepEqual(Object.keys(failedCase.proposedLabelsForReview), ['queryType'])
  const brokenSpan = buildClassReviewPack(replace(deterministic[0].id, row => { row.truth.expected.locationSearchSpans.value[0].exactText = 'wrong' }))
  assert.deepEqual(brokenSpan.coreReview.find(row => row.caseId === deterministic[0].id).proposedLabelsForReview, {})
  assert.doesNotThrow(() => renderCoreClassReview(brokenSpan))
  const review = records.find(row => row.cohort === 'CORE' && row.truth.reviewReasons.length)
  assert.throws(() => buildClassReviewPack(replace(review.id, row => { row.truth.reviewReasons = ['UNMAPPED'] })), /REVIEW_REASON_UNMAPPED/)
  assert.throws(() => buildClassReviewPack(replace(review.id, row => { row.truth.unresolvedPolicies = ['UNMAPPED'] })), /CORE_POLICY_UNMAPPED/)
  const nullable = structuredClone(pack)
  nullable.coreReview[0].proposedLabelsForReview.nullableAdvisory = { status: 'LABELLED', value: null }
  nullable.coreReview[0].proposedLabelsForReview.absentAdvisory = { status: 'LABELLED', value: { state: 'UNSPECIFIED' } }
  assert.ok(renderCoreClassReview(nullable).includes('nullableAdvisory: null'))
  assert.ok(renderCoreClassReview(nullable).includes('absentAdvisory: UNSPECIFIED'))
  const mixedRisk = replace(review.id, row => { row.truth.unresolvedPolicies = []; row.truth.reviewReasons = ['NONTRIVIAL_DIRECTION', 'UNSUPPORTED_PASSENGER_ENFORCEMENT'] })
  assert.equal(buildClassReviewPack(mixedRisk).coreReview.find(row => row.caseId === review.id).priority, 1)
  const mixedPreference = replace(review.id, row => { row.truth.unresolvedPolicies = []; row.truth.reviewReasons = ['JUDGMENT_REQUIRED', 'UNSUPPORTED_PASSENGER_ENFORCEMENT'] })
  assert.equal(buildClassReviewPack(mixedPreference).coreReview.find(row => row.caseId === review.id).priority, 2)
})
