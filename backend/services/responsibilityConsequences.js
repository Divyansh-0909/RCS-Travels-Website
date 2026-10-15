import { prisma } from '../db/prisma.js'
import { systemClock } from '../lib/clock.js'
import { responsibilityCaseState } from './responsibilityCaseState.js'

export const RESPONSIBILITY_CONSEQUENCE_STATUS = 'AUTHORIZED_PENDING_IMPLEMENTATION'

export function createPrismaResponsibilityConsequenceRepository(db = prisma) {
  return {
    findAuthorization: async caseId => {
      const responsibilityCase = await db.responsibilityCase.findUnique({ where: { id: caseId } })
      if (!responsibilityCase) return { responsibilityCase: null, finalDecision: null }
      const finalDecision = await db.responsibilityFinalDecision.findUnique({ where: { caseId } })
      return { responsibilityCase, finalDecision }
    },
    recordAuthorization: async record => {
      try {
        const execution = await db.responsibilityConsequenceExecution.create({ data: record })
        return { execution, reused: false }
      } catch (error) {
        if (error?.code !== 'P2002') throw error
        const execution = await db.responsibilityConsequenceExecution.update({
          where: { caseId: record.caseId },
          data: { attemptCount: { increment: 1 } },
        })
        return { execution, reused: true }
      }
    },
  }
}

const blocked = (caseId, reason) => ({ status: 'BLOCKED', caseId, reason })

/**
 * The only boundary future responsibility consequences may cross.
 * This phase records authorization only; it does not debit, strike, suspend,
 * compensate, alter payouts, or perform any other punitive effect.
 */
export async function applyFinalizedResponsibilityConsequences(caseId, {
  repository = createPrismaResponsibilityConsequenceRepository(),
  clock = systemClock,
} = {}) {
  if (!caseId) return blocked(null, 'CASE_ID_REQUIRED')
  const { responsibilityCase, finalDecision } = await repository.findAuthorization(caseId)
  if (!responsibilityCase) return blocked(caseId, 'CASE_MISSING')
  if (responsibilityCase.state !== responsibilityCaseState.FINAL_UPHELD) {
    return blocked(caseId, 'CASE_NOT_FINAL_UPHELD')
  }
  if (!finalDecision) return blocked(caseId, 'FINAL_DECISION_MISSING')
  if (finalDecision.outcome !== responsibilityCaseState.FINAL_UPHELD) {
    return blocked(caseId, 'FINAL_DECISION_NOT_UPHELD')
  }
  if (!responsibilityCase.evidenceHash || finalDecision.evidenceHash !== responsibilityCase.evidenceHash) {
    return blocked(caseId, 'FINAL_DECISION_EVIDENCE_MISMATCH')
  }
  if (!finalDecision.policyVersion || !finalDecision.finalizedAt) {
    return blocked(caseId, 'FINAL_DECISION_INCOMPLETE')
  }

  const authorizedAt = clock.now()
  const result = await repository.recordAuthorization({
    caseId,
    finalDecisionId: finalDecision.id,
    policyVersion: finalDecision.policyVersion,
    finalizedAt: finalDecision.finalizedAt,
    status: RESPONSIBILITY_CONSEQUENCE_STATUS,
    authorizedAt,
    appliedAt: null,
  })
  return {
    status: 'AUTHORIZED',
    caseId,
    execution: result.execution,
    reused: result.reused,
  }
}
