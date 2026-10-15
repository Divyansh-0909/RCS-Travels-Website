import { systemClock } from '../lib/clock.js'
import { responsibilityCaseState } from './responsibilityCaseState.js'
import { createPrismaResponsibilityLifecycleRepository } from './responsibilityLifecycleRepository.js'
import { lifecycleError } from './responsibilityLifecycleErrors.js'
import { sendAdverseDecisionNotice } from './responsibilityNoticeService.js'
import { finalizeWaivedCase, resolveFinalConsequenceLevel } from './responsibilityFinalizationService.js'
import { responsibilityClassification } from './responsibilityContracts.js'
import { RESPONSIBILITY_POLICY_VERSION } from './responsibilityPolicyGate.js'
import { assertReviewEvidence } from './responsibilityReviewEvidence.js'

const ADMIN_DECISIONS = new Set(['UPHOLD', 'WAIVE'])

function assertExistingReviewCompatible(existing, { decision, classification, consequenceLevel }) {
  const conflicts = existing.decision !== decision
    || (existing.classification ?? null) !== classification
    || (consequenceLevel !== null && existing.consequenceLevel != null && existing.consequenceLevel !== consequenceLevel)
  if (conflicts) throw lifecycleError('ADMIN_REVIEW_CONFLICT', 'A different admin review already exists')
}

function assertDecisionClassificationCompatible({ decision, classification }) {
  if (decision === 'UPHOLD' && classification !== null && classification !== responsibilityClassification.DRIVER_CAUSED) {
    throw lifecycleError('UPHELD_CLASSIFICATION_INCOMPATIBLE', 'An upheld responsibility decision must be driver-caused', 400)
  }
  if (decision === 'WAIVE' && classification === responsibilityClassification.DRIVER_CAUSED) {
    throw lifecycleError('WAIVED_CLASSIFICATION_INCOMPATIBLE', 'A waived responsibility decision cannot be driver-caused', 400)
  }
}

async function reviewPolicyVersion(repository, caseId) {
  const provisional = await repository.findProvisionalDecision(caseId)
  if (provisional) return provisional.policyVersion
  const shadowResult = await repository.findLatestShadowResult(caseId)
  return shadowResult?.policyVersion ?? RESPONSIBILITY_POLICY_VERSION
}

async function persistLockedAdminReview(lockedRepository, responsibilityCase, {
  caseId,
  adminActorId,
  decision,
  reason,
  classification,
  consequenceLevel,
  expectedEvidence,
  clock,
}) {
  if (!responsibilityCase) throw lifecycleError('CASE_NOT_FOUND', 'Responsibility case not found', 404)
  assertReviewEvidence(responsibilityCase, expectedEvidence)
  const existing = await lockedRepository.findAdminReview(caseId)
  if (existing) {
    assertExistingReviewCompatible(existing, { decision, classification, consequenceLevel })
    return { review: existing, reused: true, state: responsibilityCase.state }
  }

  assertDecisionClassificationCompatible({ decision, classification })
  const resolvedConsequenceLevel = resolveFinalConsequenceLevel({ outcome: decision, classification, consequenceLevel })
  if (responsibilityCase.state !== responsibilityCaseState.NEEDS_ADMIN_REVIEW) {
    throw lifecycleError('ADMIN_REVIEW_NOT_ALLOWED', 'Case is not awaiting admin review')
  }
  const policyVersion = await reviewPolicyVersion(lockedRepository, caseId)
  if (decision === 'UPHOLD' && classification === null) {
    throw lifecycleError('FINAL_CLASSIFICATION_REQUIRED', 'An upheld responsibility decision requires a final classification', 400)
  }
  const review = await lockedRepository.createAdminReview({
    caseId,
    adminActorId,
    decision,
    reason: reason.trim(),
    decidedAt: clock.now(),
    evidenceVersion: responsibilityCase.evidenceVersion,
    evidenceHash: responsibilityCase.evidenceHash,
    policyVersion,
    previousState: responsibilityCase.state,
    ...(classification ? { classification } : {}),
    consequenceLevel: resolvedConsequenceLevel,
  })
  const state = decision === 'UPHOLD'
    ? responsibilityCaseState.PROVISIONAL_ADMIN_UPHELD
    : responsibilityCaseState.PROVISIONAL_ADMIN_WAIVED
  await lockedRepository.setCaseState(caseId, state)
  return { review, reused: false, state }
}

export async function getResponsibilityReviewContext(caseId, {
  repository = createPrismaResponsibilityLifecycleRepository(),
} = {}) {
  const responsibilityCase = await repository.findCase(caseId)
  if (!responsibilityCase) throw lifecycleError('CASE_NOT_FOUND', 'Responsibility case not found', 404)
  const [analysis, provisionalDecision, shadowResult, shadowHistory, adjudicationWork, evidenceVersions,
    adminReview, appealWindow, appeal, appealReview, finalDecision] = await Promise.all([
    repository.findLatestAnalysis(caseId),
    repository.findProvisionalDecision(caseId),
    repository.findLatestShadowResult(caseId),
    repository.findShadowResults(caseId),
    repository.findLatestAdjudicationWork(caseId),
    repository.findEvidenceVersions(caseId),
    repository.findAdminReview(caseId),
    repository.findAppealWindow(caseId),
    repository.findAppeal(caseId),
    repository.findAppealReview(caseId),
    repository.findFinalDecision(caseId),
  ])
  return {
    case: responsibilityCase,
    evidence: responsibilityCase.evidenceSnapshot,
    analysis: analysis ? { envelope: analysis.envelope, validation: analysis.validation } : null,
    provisionalDecision,
    shadowResult,
    shadowHistory,
    adjudicationWork,
    evidenceVersions,
    adminReview,
    appealWindow,
    appeal,
    appealReview,
    finalDecision,
  }
}

export async function reviewResponsibilityCase({
  caseId,
  adminActorId,
  decision,
  reason,
  classification = /** @type {string | null} */ (null),
  consequenceLevel = /** @type {string | null} */ (null),
  expectedEvidence = /** @type {{version: string, hash: string} | undefined} */ (undefined),
}, {
  repository = createPrismaResponsibilityLifecycleRepository(),
  clock = systemClock,
  noticeSender = sendAdverseDecisionNotice,
  notify = true,
} = {}) {
  if (!adminActorId) throw lifecycleError('ADMIN_ID_REQUIRED', 'Authenticated admin identity is required', 401)
  if (!ADMIN_DECISIONS.has(decision)) throw lifecycleError('INVALID_ADMIN_DECISION', 'Decision must be UPHOLD or WAIVE', 400)
  if (typeof reason !== 'string' || reason.trim().length < 3) {
    throw lifecycleError('ADMIN_REASON_REQUIRED', 'Admin review reason is required', 400)
  }
  if (classification !== null && !Object.values(responsibilityClassification).includes(classification)) {
    throw lifecycleError('INVALID_FINAL_CLASSIFICATION', 'Final responsibility classification is invalid', 400)
  }
  const result = await repository.withLockedCase(caseId, (lockedRepository, responsibilityCase) => persistLockedAdminReview(
    lockedRepository,
    responsibilityCase,
    { caseId, adminActorId, decision, reason, classification, consequenceLevel, expectedEvidence, clock },
  ))

  if (decision === 'WAIVE') {
    if (![responsibilityCaseState.PROVISIONAL_ADMIN_WAIVED, responsibilityCaseState.FINAL_WAIVED].includes(result.state)) {
      return result
    }
    const finalization = await finalizeWaivedCase(caseId, { repository, clock })
    return { ...result, finalization }
  }
  if (!notify || ![
    responsibilityCaseState.PROVISIONAL_ADMIN_UPHELD,
    responsibilityCaseState.APPEAL_WINDOW,
  ].includes(result.state)) return result
  const notice = await noticeSender(caseId, { repository })
  return { ...result, notice }
}
