import { systemClock } from '../lib/clock.js'
import { responsibilityCaseState } from './responsibilityCaseState.js'
import { finalizeWaivedCase } from './responsibilityFinalizationService.js'
import { lifecycleError } from './responsibilityLifecycleErrors.js'
import { createPrismaResponsibilityLifecycleRepository } from './responsibilityLifecycleRepository.js'
import { sendAdverseDecisionNotice } from './responsibilityNoticeService.js'

export async function processProvisionalResponsibilityDecision(caseId, {
  repository = createPrismaResponsibilityLifecycleRepository(),
  clock = systemClock,
  noticeSender = sendAdverseDecisionNotice,
  waiverFinalizer = finalizeWaivedCase,
} = {}) {
  const responsibilityCase = await repository.findCase(caseId)
  if (!responsibilityCase) throw lifecycleError('CASE_NOT_FOUND', 'Responsibility case not found', 404)

  if (responsibilityCase.state === responsibilityCaseState.PROVISIONAL_AUTO_UPHELD) {
    const notice = await noticeSender(caseId, { repository })
    return { action: 'ADVERSE_NOTICE', state: responsibilityCase.state, notice }
  }

  if (responsibilityCase.state === responsibilityCaseState.PROVISIONAL_AUTO_WAIVED) {
    const finalization = await waiverFinalizer(caseId, { repository, clock })
    return { action: 'FINALIZE_WAIVER', state: responsibilityCase.state, finalization }
  }

  if (responsibilityCase.state === responsibilityCaseState.NEEDS_ADMIN_REVIEW) {
    return { action: 'ADMIN_REVIEW_REQUIRED', state: responsibilityCase.state }
  }

  if (
    responsibilityCase.state === responsibilityCaseState.APPEAL_WINDOW
    || responsibilityCase.state === responsibilityCaseState.FINAL_WAIVED
  ) {
    return { action: 'ALREADY_ADVANCED', state: responsibilityCase.state }
  }

  throw lifecycleError(
    'PROVISIONAL_LIFECYCLE_NOT_READY',
    `Case state ${responsibilityCase.state} is not ready for provisional lifecycle processing`,
    409,
  )
}
