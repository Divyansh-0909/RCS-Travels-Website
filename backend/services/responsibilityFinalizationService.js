import { systemClock } from '../lib/clock.js'
import { responsibilityCaseState, assertResponsibilityStateTransition } from './responsibilityCaseState.js'
import { applyFinalizedResponsibilityConsequences } from './responsibilityConsequences.js'
import { createPrismaResponsibilityLifecycleRepository } from './responsibilityLifecycleRepository.js'
import { lifecycleError } from './responsibilityLifecycleErrors.js'
import { responsibilityClassification } from './responsibilityContracts.js'

export const FINALIZATION_HANDOFF_PENDING = 'PENDING'
export const FINALIZATION_HANDOFF_PROCESSING = 'PROCESSING'
export const FINALIZATION_HANDOFF_COMPLETED = 'COMPLETED'
export const DEFAULT_HANDOFF_LEASE_MS = 5 * 60 * 1000

export const responsibilityConsequenceLevel = Object.freeze({
  LEVEL_0: 'LEVEL_0',
  LEVEL_1: 'LEVEL_1',
  LEVEL_2: 'LEVEL_2',
})

export function resolveFinalConsequenceLevel({ outcome, classification = null, consequenceLevel = null }) {
  if (consequenceLevel !== null && !Object.values(responsibilityConsequenceLevel).includes(consequenceLevel)) {
    throw lifecycleError('INVALID_CONSEQUENCE_LEVEL', 'Final consequence level is invalid', 400)
  }
  const resolved = consequenceLevel
    ?? (outcome === 'WAIVE' || (classification !== null && classification !== responsibilityClassification.DRIVER_CAUSED)
      ? responsibilityConsequenceLevel.LEVEL_0
      : responsibilityConsequenceLevel.LEVEL_1)
  if (outcome === 'WAIVE' && resolved !== responsibilityConsequenceLevel.LEVEL_0) {
    throw lifecycleError('WAIVED_CONSEQUENCE_LEVEL_INCOMPATIBLE', 'A waived outcome must use LEVEL_0', 400)
  }
  if (outcome === 'UPHOLD' && resolved === responsibilityConsequenceLevel.LEVEL_0) {
    throw lifecycleError('UPHELD_CONSEQUENCE_LEVEL_INCOMPATIBLE', 'An upheld outcome must use LEVEL_1 or LEVEL_2', 400)
  }
  return resolved
}

function finalState(outcome) {
  if (outcome === 'UPHOLD') return responsibilityCaseState.FINAL_UPHELD
  if (outcome === 'WAIVE') return responsibilityCaseState.FINAL_WAIVED
  throw lifecycleError('INVALID_FINAL_OUTCOME', 'Final outcome must be UPHOLD or WAIVE', 400)
}

async function policyForWaiver(repository, responsibilityCase) {
  if (responsibilityCase.state === responsibilityCaseState.PROVISIONAL_AUTO_WAIVED) {
    const decision = await repository.findProvisionalDecision(responsibilityCase.id)
    return decision && { policyVersion: decision.policyVersion, source: 'AUTO_WAIVER', actorId: null }
  }
  if (responsibilityCase.state === responsibilityCaseState.PROVISIONAL_ADMIN_WAIVED) {
    const review = await repository.findAdminReview(responsibilityCase.id)
    return review && {
      policyVersion: review.policyVersion,
      source: 'ADMIN_WAIVER',
      actorId: review.adminActorId,
      consequenceLevel: review.consequenceLevel ?? null,
    }
  }
  return null
}

async function policyForAdverse(repository, window) {
  if (window.sourceDecisionType === 'AUTO') {
    const decision = await repository.findProvisionalDecision(window.caseId)
    return decision && { policyVersion: decision.policyVersion, source: 'NO_APPEAL_AUTO', actorId: null,
      classification: responsibilityClassification.DRIVER_CAUSED }
  }
  if (window.sourceDecisionType === 'ADMIN') {
    const review = await repository.findAdminReview(window.caseId)
    return review && { policyVersion: review.policyVersion, source: 'NO_APPEAL_ADMIN', actorId: review.adminActorId,
      classification: review.classification ?? null, consequenceLevel: review.consequenceLevel ?? null }
  }
  return null
}

export async function persistFinalOutcomeLocked(repository, responsibilityCase, {
  outcome,
  policyVersion,
  source,
  reason,
  actorId = null,
  appealId = null,
  classification = null,
  consequenceLevel = null,
  finalizedAt,
}) {
  const targetState = finalState(outcome)
  const resolvedConsequenceLevel = resolveFinalConsequenceLevel({ outcome, classification, consequenceLevel })
  const existing = await repository.findFinalDecision(responsibilityCase.id)
  if (existing) {
    if (existing.outcome !== targetState) {
      throw lifecycleError('FINAL_OUTCOME_CONFLICT', 'A different final outcome already exists')
    }
    if (existing.consequenceLevel != null && existing.consequenceLevel !== resolvedConsequenceLevel) {
      throw lifecycleError('FINAL_CONSEQUENCE_LEVEL_CONFLICT', 'A different final consequence level already exists')
    }
    return { finalDecision: existing, reused: true }
  }

  assertResponsibilityStateTransition(responsibilityCase.state, targetState)
  const finalDecision = await repository.createFinalDecision({
    caseId: responsibilityCase.id,
    outcome: targetState,
    evidenceHash: responsibilityCase.evidenceHash,
    evidenceVersion: responsibilityCase.evidenceVersion,
    policyVersion,
    source,
    reason,
    actorId,
    appealId,
    previousState: responsibilityCase.state,
    finalizedAt,
    ...(classification ? { classification } : {}),
    consequenceLevel: resolvedConsequenceLevel,
  })
  await repository.setCaseState(responsibilityCase.id, targetState)
  if (targetState === responsibilityCaseState.FINAL_UPHELD) {
    await repository.createHandoff({
      caseId: responsibilityCase.id,
      finalDecisionId: finalDecision.id,
      status: FINALIZATION_HANDOFF_PENDING,
    })
  }
  return { finalDecision, reused: false }
}

export async function finalizeWaivedCase(caseId, {
  repository = createPrismaResponsibilityLifecycleRepository(),
  clock = systemClock,
} = {}) {
  return repository.withLockedCase(caseId, async (lockedRepository, responsibilityCase) => {
    if (!responsibilityCase) throw lifecycleError('CASE_NOT_FOUND', 'Responsibility case not found', 404)
    if (responsibilityCase.state === responsibilityCaseState.FINAL_WAIVED) {
      const finalDecision = await lockedRepository.findFinalDecision(caseId)
      if (!finalDecision) throw lifecycleError('FINAL_DECISION_MISSING', 'Final waived state has no decision record')
      return { finalDecision, reused: true }
    }
    const policy = await policyForWaiver(lockedRepository, responsibilityCase)
    if (!policy) throw lifecycleError('CASE_NOT_WAIVER_PROVISIONAL', 'Case is not eligible for waiver finalization')
    return persistFinalOutcomeLocked(lockedRepository, responsibilityCase, {
      outcome: 'WAIVE',
      policyVersion: policy.policyVersion,
      source: policy.source,
      reason: 'Provisional waiver finalized',
      actorId: policy.actorId,
      classification: policy.classification,
      consequenceLevel: policy.consequenceLevel,
      finalizedAt: clock.now(),
    })
  })
}

export async function processFinalizationHandoff(caseId, {
  repository = createPrismaResponsibilityLifecycleRepository(),
  consequenceExecutor = applyFinalizedResponsibilityConsequences,
  clock = systemClock,
  hooks = {},
  handoffLeaseMs = DEFAULT_HANDOFF_LEASE_MS,
} = {}) {
  const handoff = await repository.findHandoff(caseId)
  if (!handoff) throw lifecycleError('HANDOFF_MISSING', 'Finalized upheld case has no consequence handoff')
  if (handoff.status === FINALIZATION_HANDOFF_COMPLETED) return { handoff, reused: true }

  const attemptedAt = clock.now()
  const staleBefore = new Date(attemptedAt.getTime() - handoffLeaseMs)
  const claim = await repository.claimHandoff(handoff.id, attemptedAt, staleBefore)
  if (claim.count !== 1) {
    const current = await repository.findHandoff(caseId)
    if (!current) throw lifecycleError('HANDOFF_MISSING', 'Finalized upheld case has no consequence handoff')
    if (current.status === FINALIZATION_HANDOFF_COMPLETED) return { handoff: current, reused: true }
    return { handoff: current, reused: true, inProgress: current.status === FINALIZATION_HANDOFF_PROCESSING }
  }

  try {
    const authorization = await consequenceExecutor(caseId)
    if (authorization?.status !== 'AUTHORIZED') {
      throw lifecycleError('CONSEQUENCE_AUTHORIZATION_BLOCKED', authorization?.reason ?? 'Consequence authorization blocked')
    }
    if (hooks.afterAuthorization) await hooks.afterAuthorization(authorization)
    const completed = await repository.markHandoffCompleted(handoff.id, attemptedAt, clock.now())
    if (completed.count === 1) {
      const current = await repository.findHandoff(caseId)
      return { handoff: current, authorization, reused: false }
    }
    const current = await repository.findHandoff(caseId)
    if (!current) throw lifecycleError('HANDOFF_MISSING', 'Finalized upheld case has no consequence handoff')
    return {
      handoff: current,
      authorization,
      reused: true,
      claimLost: true,
      inProgress: current.status === FINALIZATION_HANDOFF_PROCESSING,
    }
  } catch (error) {
    await repository.markHandoffFailed(
      handoff.id,
      attemptedAt,
      error instanceof Error ? error.message : 'Unknown handoff failure',
    )
    throw error
  }
}

export async function finalizeNoAppeal(caseId, {
  repository = createPrismaResponsibilityLifecycleRepository(),
  clock = systemClock,
  consequenceExecutor = applyFinalizedResponsibilityConsequences,
  authorize = true,
} = {}) {
  const result = await repository.withLockedCase(caseId, async (lockedRepository, responsibilityCase) => {
    if (!responsibilityCase) throw lifecycleError('CASE_NOT_FOUND', 'Responsibility case not found', 404)
    if (responsibilityCase.state === responsibilityCaseState.FINAL_UPHELD) {
      const finalDecision = await lockedRepository.findFinalDecision(caseId)
      if (!finalDecision) throw lifecycleError('FINAL_DECISION_MISSING', 'Final upheld state has no decision record')
      return { finalDecision, reused: true }
    }
    if (responsibilityCase.state !== responsibilityCaseState.APPEAL_WINDOW) {
      throw lifecycleError('APPEAL_WINDOW_NOT_ACTIVE', 'Case is not in the no-appeal finalization window')
    }
    const window = await lockedRepository.findAppealWindow(caseId)
    if (!window?.appealStartedAt || !window.appealDeadline) {
      throw lifecycleError('NOTICE_NOT_DELIVERED', 'Confirmed notice delivery is required before adverse finalization')
    }
    if (clock.now().getTime() <= new Date(window.appealDeadline).getTime()) {
      throw lifecycleError('APPEAL_DEADLINE_ACTIVE', 'Appeal deadline has not expired')
    }
    const appeal = await lockedRepository.findAppeal(caseId)
    if (appeal) throw lifecycleError('TIMELY_APPEAL_EXISTS', 'An appeal prevents no-appeal finalization')
    const policy = await policyForAdverse(lockedRepository, window)
    if (!policy) throw lifecycleError('SOURCE_DECISION_MISSING', 'Adverse decision source is unavailable')
    return persistFinalOutcomeLocked(lockedRepository, responsibilityCase, {
      outcome: 'UPHOLD',
      policyVersion: policy.policyVersion,
      source: policy.source,
      reason: 'Appeal window expired without a timely appeal',
      actorId: policy.actorId,
      classification: policy.classification,
      consequenceLevel: policy.consequenceLevel,
      finalizedAt: clock.now(),
    })
  })
  if (!authorize) return result
  const handoff = await processFinalizationHandoff(caseId, { repository, consequenceExecutor, clock })
  return { ...result, handoff }
}
