import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { buildOwnerPolicyReview } from './ownerPolicyReview.js'
import { labelled, searchBenchmarkIndex } from './dataset.js'
import { validateSearchDataset } from './validation.js'
import { verifyFamilyDefinition } from './familyDefinitionProof.js'

export const FAMILY_APPROVAL_RECEIPT = Object.freeze({ receiptId: 'owner-search-P1-P11-families-2026-10-06',
  source: 'attachment:b37377e0-7a7f-474f-8e32-085c756e9d36', reviewerIds: ['product-owner'],
  policyVersion: 'search-owner-policy-P1-P11-v2', calendarWeek: 'MONDAY-SUNDAY', bareH12: 'PM', frozen: false })
export const APPROVED_FAMILIES = ['partial-passengers', 'time-daypart', 'time-approximate', 'role-hinglish-order',
  'role-at-drop', 'role-drop-before-from', 'role-repeated-place', 'role-reversed-clause', 'stop-via', 'stop-friend',
  'return-complicated', 'rental-duration', 'conditional-alternative', 'conditional-ac', 'conflicting-times',
  'vehicle-self-conflict', 'noisy-route', 'overlap-location', 'changed-mind']
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const span = (text, exactText, start = text.indexOf(exactText)) => ({ start, end: start + exactText.length, exactText })
// Re-derive approval independently; caller-supplied hashes cannot authorize rewritten original labels.
const protectedApprovals = new Map(buildOwnerPolicyReview().approval.map(a => [a.caseId, a.approvedLabelHash]))

function applyFamilyDecision(record) {
  const e = record.truth.expected; const q = record.modelInput.query; const f = record.familyId
  if (f === 'time-approximate') {
    e.time.value.value.period = 'PM'; e.ambiguities = labelled(['EXACT_TIME_CONFIRMATION_REQUIRED'])
  }
  if (f === 'conditional-ac') {
    e.complexity = labelled('SIMPLE'); e.fallbackExpected = labelled('NOT_REQUIRED'); e.routing = labelled('JEV_SIMPLE')
    e.capabilityDisposition = labelled('ADVISORY_NO_AC_ENFORCEMENT')
  }
  if (f === 'noisy-route') {
    e.fallbackExpected = labelled('CONDITIONAL'); e.runtimeFallbackCondition = labelled('CANDIDATE_OR_ROLE_FAILURE_ONLY')
    e.routing = labelled('JEV_SIMPLE_OR_CANDIDATE_FAILURE_FALLBACK')
  }
  if (f === 'vehicle-self-conflict') e.vehicle.value.excluded = ['suv', 'suv_premium']
  if (f === 'conditional-alternative') {
    const alternative = /take me to (.+)$/.exec(q)[1]
    e.dropSpans.value.push(span(q, alternative, q.lastIndexOf(alternative)))
    e.ambiguities = labelled(['DESTINATION_SELECTION_REQUIRED'])
  }
  if (f === 'conflicting-times') {
    e.time = labelled({ state: 'AMBIGUOUS', alternatives: [6, 8].map(hour => ({ kind: 'CLOCK', hour, minute: 0,
      notation: 'H12', period: 'PM', precision: 'EXACT' })) })
    e.ambiguities = labelled(['TIME_SELECTION_REQUIRED'])
  }
  if (f.startsWith('stop-')) e.capabilityDisposition = labelled('PLANNED_PRODUCT_FEATURE')
  if (f === 'rental-duration') e.rentalDurationHours = labelled(Number(/for (\d+) hours/.exec(q)[1]))
  if (f === 'changed-mind') {
    const earlier = /from .+? to (.+?), actually/.exec(q)[1]
    e.supersededDropSpans = labelled([span(q, earlier)])
  }
  if (f === 'overlap-location' && e.pickupSpans.value[0].exactText === e.dropSpans.value[0].exactText) {
    // Identical text does not prove identical geography. Existing grounded-endpoint validation is mandatory.
    e.groundingConflictCheckRequired = labelled(true)
  }
}

export function familyDecisionExceptions(record) {
  const e = record.truth.expected; const q = record.modelInput.query
  const problems = verifyFamilyDefinition(record)
  if (e.queryType.value !== 'BOOKING_REQUEST') problems.push('FAMILY_QUERY_TYPE_MISMATCH')
  for (const role of ['pickupSpans', 'dropSpans', 'stopSpans']) {
    for (const s of e[role].value) if (q.slice(s.start, s.end) !== s.exactText) problems.push('FAMILY_SPAN_MISMATCH')
  }
  if (record.familyId === 'role-repeated-place' && new Set(e.pickupSpans.value.map(s => s.exactText)).size !== 1) problems.push('INCONSISTENT_REPEATED_PICKUP')
  if (record.familyId === 'time-approximate' && !/around \d+/.test(q)) problems.push('APPROXIMATE_PATTERN_MISMATCH')
  if (record.familyId === 'conditional-ac' && (!/^AC car if available from .+ to .+$/.test(q)
    || q.match(/\bif\b/g).length !== 1 || /\b(?:unless|provided|depending)\b/.test(q))) problems.push('CONDITIONAL_AC_NOT_STRAIGHTFORWARD')
  if (record.familyId === 'overlap-location' && !e.pickupSpans.value.some(s => s.exactText === 'hostel gate near the tea stall')) problems.push('LANDMARK_TRUNCATION')
  return problems
}

export function buildFamilyOwnerReview(previous = buildOwnerPolicyReview()) {
  if (previous.approval.length !== 178 || new Set(previous.approval.map(a => a.caseId)).size !== 178
    || previous.approval.some(a => a.approvedLabelHash !== protectedApprovals.get(a.caseId)
      || hash(previous.records.find(r => r.id === a.caseId)?.truth.expected) !== protectedApprovals.get(a.caseId))) {
    throw new Error('ORIGINAL_OWNER_APPROVAL_CHANGED')
  }
  const records = structuredClone(previous.records); const changes = []; const approvals = []; const exceptions = []
  for (const record of records.filter(r => r.cohort === 'CORE')) {
    const old = structuredClone(record.truth)
    if (record.familyId === 'weekday-next') {
      record.truth.expected.resolvedDate = labelled('2026-10-09')
      record.truth.expected.resolvedTime = labelled(`${record.truth.expected.time.value.value.hour % 12 + 12}:00`)
    }
    const family = APPROVED_FAMILIES.includes(record.familyId)
    if (family) {
      const problems = familyDecisionExceptions(record)
      if (problems.length) { exceptions.push({ caseId: record.id, problems }); continue }
      applyFamilyDecision(record)
    }
    if (record.truth.status !== 'APPROVED') {
      record.truth.status = 'APPROVED'; record.truth.provenance = 'HUMAN_REVIEWED_SYNTHETIC'; record.truth.disagreementResolved = true
      record.truth.reviewReasons = []; record.truth.unresolvedPolicies = []
      record.truth.reviewerMetadata = { ...FAMILY_APPROVAL_RECEIPT, approvedLabelHash: hash(record.truth.expected),
        humanApprovalStatus: family ? 'APPROVED_AT_FAMILY_LEVEL' : 'APPROVED_OWNER_POLICY_DERIVATION' }
      approvals.push({ caseId: record.id, familyId: record.familyId, family, labelHash: hash(record.truth.expected) })
    }
    const fieldsChanged = Object.keys(record.truth.expected).filter(key => !isDeepStrictEqual(old.expected[key], record.truth.expected[key]))
    if (fieldsChanged.length) changes.push({ caseId: record.id, familyId: record.familyId, oldProposal: old.expected,
      newExpected: record.truth.expected, fieldsChanged, decision: FAMILY_APPROVAL_RECEIPT.receiptId,
      reason: 'Frozen owner policy/family decision; never derived from provider outputs' })
  }
  const validation = validateSearchDataset(records)
  const review = records.filter(r => r.cohort === 'CORE' && r.truth.status !== 'APPROVED')
  return { records, approvals, changes, exceptions, receipt: FAMILY_APPROVAL_RECEIPT,
    summary: { ...searchBenchmarkIndex(records), validation, originalDeterministicUnchanged: records.filter(r => previous.approval.some(a => a.caseId === r.id))
      .every(r => isDeepStrictEqual(r.truth.expected, previous.records.find(p => p.id === r.id).truth.expected)),
      familyApproved: approvals.filter(a => a.family).length, coreHumanApproved: records.filter(r => r.cohort === 'CORE' && r.truth.status === 'APPROVED').length,
      coreReviewRemaining: review.length, readyToFreeze: review.length === 0, frozen: false, heldOutExecuted: false, exploratoryScored: false } }
}
