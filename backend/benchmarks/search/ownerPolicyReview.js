import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { buildSearchBenchmarkDataset, labelled, notLabelled, searchBenchmarkDatasetHash, searchBenchmarkIndex } from './dataset.js'
import { validateDeterministicApproval } from './approval.js'
import { validateSearchDataset } from './validation.js'
import { parseScheduleTime } from '../../lib/scheduling.js'

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export const OWNER_POLICY_RECEIPT = Object.freeze({
  receiptId: 'product-owner-search-P1-P5-2026-10-05', reviewerIds: ['product-owner'], reviewedAt: '2026-10-05',
  source: 'attachment:b0a53b16-a379-42be-896a-c1cd13ba9022',
  originalDatasetHash: '3517a2aebdd38d2c19beb689abd0a8bfafa6ec8b8162d46da722e935936f4a6b',
  policyVersion: 'search-owner-policy-P1-P5-v1',
})
const policyIds = { 'vehicle-negated-suv': 'P5', 'omitted-year': 'P2', 'weekday-next': 'P3', 'non-ist': 'P4' }

function londonResolution(record) {
  const now = new Date(record.modelInput.context.clock)
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const component = name => parts.find(part => part.type === name).value
  const tomorrow = new Date(`${component('year')}-${component('month')}-${component('day')}T00:00:00Z`)
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  const clock = record.truth.expected.time.value.value
  const hour = clock.hour % 12 + 12
  // These five fixtures are explicitly October 2026, after noon, outside a DST fold/gap.
  // Derive the offset from ICU rather than assuming London always has UTC+1.
  const local = new Date(`${tomorrow.toISOString().slice(0, 10)}T${String(hour).padStart(2, '0')}:00:00Z`)
  const zoneParts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(local)
  const zoned = Object.fromEntries(zoneParts.map(part => [part.type, part.value]))
  const observed = Date.parse(`${zoned.year}-${zoned.month}-${zoned.day}T${zoned.hour}:${zoned.minute}:00Z`)
  const instant = new Date(local.getTime() - (observed - local.getTime()))
  const ist = new Date(instant.getTime() + 330 * 60_000).toISOString()
  return { date: ist.slice(0, 10), time: ist.slice(11, 16), sourceDate: tomorrow.toISOString().slice(0, 10),
    sourceTime: `${String(hour).padStart(2, '0')}:00`, sourceTimeZone: 'Europe/London', source: `Intl/ICU ${process.versions.icu}` }
}

function revisePolicyRecord(record) {
  const policy = policyIds[record.familyId]
  const expected = record.truth.expected
  if (policy === 'P5') expected.vehicle = labelled({ state: 'EXCLUDED', excluded: ['suv', 'suv_premium'] })
  if (policy === 'P2') {
    // This dataset's frozen clock is October 4; December 5 is the nearest future occurrence.
    expected.resolvedDate = labelled('2026-12-05')
    const hour = expected.time.value.value.hour % 12 + 12
    expected.resolvedTime = labelled(`${String(hour).padStart(2, '0')}:00`)
  }
  if (policy === 'P3') {
    // Owner froze qualifier semantics, not the calendar-week origin. No hidden Monday/Sunday default.
    expected.resolvedDate = notLabelled('CALENDAR_WEEK_ANCHOR_NOT_ESTABLISHED_BY_APPLICATION')
  }
  let conversion = null
  if (policy === 'P4') {
    conversion = londonResolution(record)
    expected.resolvedDate = labelled(conversion.date)
    expected.resolvedTime = labelled(conversion.time)
  }
  expected.ambiguities = labelled(expected.ambiguities.value.filter(value => !record.truth.unresolvedPolicies.includes(value)))
  record.truth.unresolvedPolicies = []
  record.truth.reviewReasons = record.truth.reviewReasons.filter(value => value !== 'PRODUCT_POLICY_UNRESOLVED')
  record.truth.derivation = 'FROZEN_SPEC_DETERMINISTIC'
  const scheduling = expected.resolvedDate.status === 'LABELLED' && expected.resolvedTime.status === 'LABELLED'
    ? parseScheduleTime(expected.resolvedDate.value, expected.resolvedTime.value, new Date(record.modelInput.context.clock)) : null
  return { policy, conversion, scheduling, resolutionLimitation: policy === 'P3' ? 'CALENDAR_WEEK_ANCHOR_NOT_ESTABLISHED_BY_APPLICATION' : null }
}

export function buildOwnerPolicyReview(baseline = buildSearchBenchmarkDataset()) {
  if (searchBenchmarkDatasetHash(baseline) !== OWNER_POLICY_RECEIPT.originalDatasetHash) throw new Error('OWNER_APPROVAL_BASELINE_CHANGED')
  const proof = validateDeterministicApproval(baseline)
  validateOwnerApprovalProof(proof)
  const approvedIds = new Set(proof.results.filter(row => row.eligible).map(row => row.caseId))
  const records = structuredClone(baseline); const approval = []; const changes = []
  for (const record of records) {
    const original = baseline.find(row => row.id === record.id)
    if (approvedIds.has(record.id)) {
      record.truth.status = 'APPROVED'; record.truth.provenance = 'HUMAN_REVIEWED_SYNTHETIC'; record.truth.disagreementResolved = true
      record.truth.reviewerMetadata = { ...OWNER_POLICY_RECEIPT, humanApprovalStatus: 'APPROVED_AS_SPEC_DERIVED_CLASS', approvedLabelHash: hash(original.truth.expected) }
      approval.push({ caseId: record.id, approvedLabelHash: hash(original.truth.expected), humanApprovalStatus: 'APPROVED_AS_SPEC_DERIVED_CLASS' })
    }
    if (policyIds[record.familyId]) {
      const resolution = revisePolicyRecord(record)
      changes.push({ caseId: record.id, familyId: record.familyId, policyVersion: OWNER_POLICY_RECEIPT.policyVersion,
        ...resolution, oldTruth: original.truth, newTruth: structuredClone(record.truth),
        reason: `Product owner ${resolution.policy}; provider outputs are not ground truth`,
        approvalTransferred: false, reviewDisposition: 'DETERMINISTIC_POLICY_DERIVATION' })
    }
    if (approvedIds.has(record.id)) validateApprovedLabels(original.truth.expected, record.truth.expected)
  }
  const validation = validateSearchDataset(records)
  const review = records.filter(row => row.cohort === 'CORE' && row.truth.reviewReasons.length)
  return { status: 'PARTIALLY_HUMAN_APPROVED_NOT_FROZEN', receipt: OWNER_POLICY_RECEIPT, records, approval, changes, review,
    summary: { ...searchBenchmarkIndex(records), humanApproved: approval.length, previousCoreReview: 142,
      policyResolved: 142 - review.length, coreReviewRemaining: review.length, familyReviewsRemaining: new Set(review.map(row => row.familyId)).size,
      calendarWeekAnchorUnscored: changes.filter(row => row.resolutionLimitation).length,
      validation, frozen: false, heldOutExecuted: false, exploratoryScored: false } }
}

export function validateOwnerApprovalProof(proof) {
  if (proof.stillDeterministic !== 178 || proof.movedToReview !== 0 || proof.datasetValidationError) throw new Error('OWNER_APPROVAL_PROOF_CHANGED')
}

export function validateApprovedLabels(approved, current) {
  if (!isDeepStrictEqual(approved, current)) throw new Error('APPROVED_LABEL_MATERIAL_CHANGE')
}
