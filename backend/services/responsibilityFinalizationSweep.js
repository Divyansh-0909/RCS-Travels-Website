import { systemClock } from '../lib/clock.js'
import {
  DEFAULT_HANDOFF_LEASE_MS,
  finalizeNoAppeal,
  processFinalizationHandoff,
} from './responsibilityFinalizationService.js'
import { createPrismaResponsibilityLifecycleRepository } from './responsibilityLifecycleRepository.js'

const DEFAULT_BATCH_SIZE = 50

const failure = (caseId, error) => ({
  caseId,
  error: error instanceof Error ? error.message : 'Unknown responsibility finalization failure',
})

export async function sweepResponsibilityFinalization({
  repository = createPrismaResponsibilityLifecycleRepository(),
  clock = systemClock,
  batchSize = DEFAULT_BATCH_SIZE,
  handoffLeaseMs = DEFAULT_HANDOFF_LEASE_MS,
  finalize = finalizeNoAppeal,
  processHandoff = processFinalizationHandoff,
} = {}) {
  const now = clock.now()
  const expiredWindows = await repository.findExpiredAppealWindows(now, batchSize)
  const finalizations = []

  for (const { caseId } of expiredWindows) {
    try {
      await finalize(caseId, { repository, clock, authorize: false })
      finalizations.push({ caseId, status: 'FINALIZED' })
    } catch (error) {
      finalizations.push({ caseId, status: 'SKIPPED', ...failure(caseId, error) })
    }
  }

  const staleBefore = new Date(now.getTime() - handoffLeaseMs)
  const recoverableHandoffs = await repository.findRecoverableHandoffs(staleBefore, batchSize)
  const handoffs = []

  for (const { caseId } of recoverableHandoffs) {
    try {
      const result = await processHandoff(caseId, { repository, clock, handoffLeaseMs })
      handoffs.push({ caseId, status: result.inProgress ? 'IN_PROGRESS' : 'PROCESSED' })
    } catch (error) {
      handoffs.push({ caseId, status: 'FAILED', ...failure(caseId, error) })
    }
  }

  return {
    expiredWindows: expiredWindows.length,
    finalizations,
    recoverableHandoffs: recoverableHandoffs.length,
    handoffs,
  }
}
