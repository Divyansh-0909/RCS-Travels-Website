import { systemClock } from '../lib/clock.js'
import { responsibilityCaseState } from './responsibilityCaseState.js'
import { createPrismaResponsibilityLifecycleRepository } from './responsibilityLifecycleRepository.js'
import { lifecycleError } from './responsibilityLifecycleErrors.js'
import { responsibilityClassification } from './responsibilityContracts.js'
import { assertReviewEvidence } from './responsibilityReviewEvidence.js'
import {
  persistFinalOutcomeLocked,
  processFinalizationHandoff,
  resolveFinalConsequenceLevel,
} from './responsibilityFinalizationService.js'

const APPEAL_REVIEW_OUTCOMES = new Set(['UPHOLD', 'WAIVE'])

export async function submitDriverAppeal({
  caseId,
  driverId,
  reason,
  additionalEvidence = /** @type {string[]} */ ([]),
}, {
  repository = createPrismaResponsibilityLifecycleRepository(),
  clock = systemClock,
} = {}) {
  if (!driverId) throw lifecycleError('DRIVER_ID_REQUIRED', 'Authenticated driver identity is required', 401)
  if (typeof reason !== 'string' || reason.trim().length < 3) {
    throw lifecycleError('APPEAL_REASON_REQUIRED', 'Appeal reason is required', 400)
  }
  if (!Array.isArray(additionalEvidence)) {
    throw lifecycleError('INVALID_APPEAL_EVIDENCE', 'Additional appeal evidence must be a list', 400)
  }

  return repository.withLockedCase(caseId, async (lockedRepository, responsibilityCase) => {
    if (!responsibilityCase) throw lifecycleError('CASE_NOT_FOUND', 'Responsibility case not found', 404)
    const booking = lockedRepository.findCaseDriver
      ? await lockedRepository.findCaseDriver(responsibilityCase)
      : await lockedRepository.findBookingDriver(responsibilityCase.bookingId)
    if (!booking || booking.driverId !== driverId) {
      throw lifecycleError('APPEAL_FORBIDDEN', 'This responsibility case does not belong to the authenticated driver', 403)
    }

    const existing = await lockedRepository.findAppeal(caseId)
    if (existing) {
      if (existing.driverId !== driverId) throw lifecycleError('APPEAL_FORBIDDEN', 'Appeal belongs to another driver', 403)
      return { appeal: existing, reused: true }
    }
    if (responsibilityCase.state !== responsibilityCaseState.APPEAL_WINDOW) {
      throw lifecycleError('APPEAL_NOT_ELIGIBLE', 'Case is not in an active appeal window')
    }

    const window = await lockedRepository.findAppealWindow(caseId)
    if (!window?.appealStartedAt || !window.appealDeadline) {
      throw lifecycleError('APPEAL_WINDOW_NOT_STARTED', 'Confirmed notice delivery has not started the appeal window')
    }
    const submittedAt = clock.now()
    if (submittedAt.getTime() > new Date(window.appealDeadline).getTime()) {
      throw lifecycleError('APPEAL_EXPIRED', 'Appeal deadline has expired', 409)
    }

    const appeal = await lockedRepository.createAppeal({
      caseId,
      appealWindowId: window.id,
      driverId,
      submittedAt,
      reason: reason.trim(),
      status: 'OPEN',
      additionalEvidence,
    })
    await lockedRepository.setCaseState(caseId, responsibilityCaseState.APPEAL_OPEN)
    return { appeal, reused: false }
  })
}

async function policyVersionForCase(repository, caseId) {
  const adminReview = await repository.findAdminReview(caseId)
  if (adminReview) return adminReview.policyVersion
  const provisional = await repository.findProvisionalDecision(caseId)
  if (provisional) return provisional.policyVersion
  return null
}

export async function reviewResponsibilityAppeal({
  caseId,
  reviewerId,
  outcome,
  reason,
  classification = /** @type {string | null} */ (null),
  consequenceLevel = /** @type {string | null} */ (null),
  expectedEvidence = /** @type {{version: string, hash: string} | undefined} */ (undefined),
}, {
  repository = createPrismaResponsibilityLifecycleRepository(),
  clock = systemClock,
  consequenceExecutor,
  authorize = true,
} = {}) {
  if (!reviewerId) throw lifecycleError('REVIEWER_ID_REQUIRED', 'Authenticated reviewer identity is required', 401)
  if (!APPEAL_REVIEW_OUTCOMES.has(outcome)) {
    throw lifecycleError('INVALID_APPEAL_OUTCOME', 'Appeal outcome must be UPHOLD or WAIVE', 400)
  }
  if (typeof reason !== 'string' || reason.trim().length < 3) {
    throw lifecycleError('APPEAL_REVIEW_REASON_REQUIRED', 'Appeal review reason is required', 400)
  }
  if (classification !== null && !Object.values(responsibilityClassification).includes(classification)) {
    throw lifecycleError('INVALID_FINAL_CLASSIFICATION', 'Final responsibility classification is invalid', 400)
  }
  const result = await repository.withLockedCase(caseId, async (lockedRepository, responsibilityCase) => {
    if (!responsibilityCase) throw lifecycleError('CASE_NOT_FOUND', 'Responsibility case not found', 404)
    assertReviewEvidence(responsibilityCase, expectedEvidence)
    const targetState = outcome === 'UPHOLD' ? responsibilityCaseState.FINAL_UPHELD : responsibilityCaseState.FINAL_WAIVED
    const existingFinal = await lockedRepository.findFinalDecision(caseId)
    if (existingFinal) {
      if (
        existingFinal.outcome !== targetState
        || (existingFinal.classification ?? null) !== classification
        || (consequenceLevel !== null && existingFinal.consequenceLevel != null && existingFinal.consequenceLevel !== consequenceLevel)
      ) {
        throw lifecycleError('FINAL_OUTCOME_CONFLICT', 'A different final outcome already exists')
      }
      return { finalDecision: existingFinal, reused: true }
    }
    if (outcome === 'UPHOLD' && classification !== null && classification !== responsibilityClassification.DRIVER_CAUSED) {
      throw lifecycleError('UPHELD_CLASSIFICATION_INCOMPATIBLE', 'An upheld responsibility decision must be driver-caused', 400)
    }
    if (outcome === 'WAIVE' && classification === responsibilityClassification.DRIVER_CAUSED) {
      throw lifecycleError('WAIVED_CLASSIFICATION_INCOMPATIBLE', 'A waived responsibility decision cannot be driver-caused', 400)
    }
    const resolvedConsequenceLevel = resolveFinalConsequenceLevel({
      outcome,
      classification,
      consequenceLevel,
    })
    if (![responsibilityCaseState.APPEAL_OPEN, responsibilityCaseState.APPEAL_REVIEW].includes(responsibilityCase.state)) {
      throw lifecycleError('APPEAL_REVIEW_NOT_ALLOWED', 'Case is not awaiting appeal review')
    }
    const appeal = await lockedRepository.findAppeal(caseId)
    if (!appeal) throw lifecycleError('APPEAL_MISSING', 'Appeal record is missing')
    if (outcome === 'UPHOLD' && classification === null) {
      throw lifecycleError('FINAL_CLASSIFICATION_REQUIRED', 'An upheld responsibility decision requires a final classification', 400)
    }
    const policyVersion = await policyVersionForCase(lockedRepository, caseId)
    if (!policyVersion) throw lifecycleError('POLICY_VERSION_MISSING', 'Policy version is unavailable')

    if (responsibilityCase.state === responsibilityCaseState.APPEAL_OPEN) {
      await lockedRepository.setCaseState(caseId, responsibilityCaseState.APPEAL_REVIEW)
    }
    const review = await lockedRepository.createAppealReview({
      caseId,
      appealId: appeal.id,
      reviewerId,
      outcome,
      reason: reason.trim(),
      reviewedAt: clock.now(),
      evidenceVersion: responsibilityCase.evidenceVersion,
      evidenceHash: responsibilityCase.evidenceHash,
      policyVersion,
      ...(classification ? { classification } : {}),
      consequenceLevel: resolvedConsequenceLevel,
    })
    await lockedRepository.setAppealStatus(appeal.id, 'REVIEWED')
    const finalization = await persistFinalOutcomeLocked(
      lockedRepository,
      { ...responsibilityCase, state: responsibilityCaseState.APPEAL_REVIEW },
      {
        outcome,
        policyVersion,
        source: 'APPEAL_REVIEW',
        reason: reason.trim(),
        actorId: reviewerId,
        appealId: appeal.id,
        classification,
        consequenceLevel: resolvedConsequenceLevel,
        finalizedAt: clock.now(),
      },
    )
    return { review, ...finalization }
  })

  if (outcome !== 'UPHOLD' || !authorize) return result
  const handoff = await processFinalizationHandoff(caseId, {
    repository,
    clock,
    ...(consequenceExecutor ? { consequenceExecutor } : {}),
  })
  return { ...result, handoff }
}
