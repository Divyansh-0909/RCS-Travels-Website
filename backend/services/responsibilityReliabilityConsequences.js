import { prisma } from '../db/prisma.js'
import { systemClock } from '../lib/clock.js'
import { responsibilityEvidenceHash } from './responsibilityAnalyst.js'
import { responsibilityCaseState } from './responsibilityCaseState.js'
import { RESPONSIBILITY_CONSEQUENCE_STATUS } from './responsibilityConsequences.js'
import { responsibilityClassification } from './responsibilityContracts.js'
import { responsibilityConsequenceLevel } from './responsibilityFinalizationService.js'
import { reliabilityBlockType } from './driverReliability.js'

export const RELIABILITY_TEMPORARY_BLOCK_MS = 7 * 24 * 60 * 60 * 1000

export class ResponsibilityReliabilityError extends Error {
  constructor(code) {
    super(code)
    this.code = code
  }
}

const errorCode = error => typeof error?.code === 'string' ? error.code : 'RELIABILITY_EXECUTION_FAILED'

function assertEvidenceIntegrity(responsibilityCase) {
  const snapshot = responsibilityCase.evidenceSnapshot
  if (!snapshot || !Array.isArray(snapshot.timeline) ||
      responsibilityEvidenceHash(snapshot) !== responsibilityCase.evidenceHash ||
      snapshot.caseId !== responsibilityCase.id || snapshot.bookingId !== responsibilityCase.bookingId ||
      snapshot.caseType !== responsibilityCase.caseType) {
    throw new ResponsibilityReliabilityError('EVIDENCE_SNAPSHOT_INCONSISTENT')
  }
  return snapshot
}

function authoritativeDriverId(responsibilityCase) {
  const snapshot = assertEvidenceIntegrity(responsibilityCase)
  const driverIds = new Set(snapshot.timeline
    .filter(entry => entry.category === 'assignment' && entry.basis === 'direct' &&
      entry.availability === 'available' && typeof entry.value?.driverId === 'string' && entry.value.driverId)
    .map(entry => entry.value.driverId))
  if (driverIds.size === 0) throw new ResponsibilityReliabilityError('DRIVER_EVIDENCE_MISSING')
  if (driverIds.size !== 1) throw new ResponsibilityReliabilityError('DRIVER_EVIDENCE_AMBIGUOUS')
  return [...driverIds][0]
}

async function loadAuthorizedCase(tx, caseId) {
  const locked = await tx.$queryRaw`SELECT id FROM responsibility_cases WHERE id = ${caseId} FOR UPDATE`
  if (locked.length !== 1) throw new ResponsibilityReliabilityError('CASE_MISSING')
  const [responsibilityCase, decision, authorization] = await Promise.all([
    tx.responsibilityCase.findUniqueOrThrow({ where: { id: caseId } }),
    tx.responsibilityFinalDecision.findUnique({ where: { caseId } }),
    tx.responsibilityConsequenceExecution.findUnique({ where: { caseId } }),
  ])
  if (responsibilityCase.state !== responsibilityCaseState.FINAL_UPHELD ||
      decision?.outcome !== responsibilityCaseState.FINAL_UPHELD) {
    throw new ResponsibilityReliabilityError('CASE_NOT_FINAL_UPHELD')
  }
  if (!decision.policyVersion || !decision.finalizedAt || decision.evidenceHash !== responsibilityCase.evidenceHash) {
    throw new ResponsibilityReliabilityError('FINAL_DECISION_INCONSISTENT')
  }
  if (!authorization || authorization.finalDecisionId !== decision.id ||
      authorization.policyVersion !== decision.policyVersion ||
      authorization.finalizedAt.getTime() !== decision.finalizedAt.getTime() ||
      authorization.status !== RESPONSIBILITY_CONSEQUENCE_STATUS) {
    throw new ResponsibilityReliabilityError('FINALIZED_AUTHORIZATION_MISSING')
  }
  return { responsibilityCase, decision, authorization }
}

async function markReliabilityHandled(tx, caseId, at) {
  await tx.responsibilityConsequenceExecution.updateMany({
    where: { caseId, reliabilityAppliedAt: null },
    data: { reliabilityAttemptedAt: at, reliabilityAppliedAt: at, reliabilityLastError: null },
  })
}

function strikeMatches(strike, { driverId, responsibilityCase, decision, authorization }) {
  return strike.driverId === driverId &&
    strike.responsibilityCaseId === responsibilityCase.id &&
    strike.finalDecisionId === decision.id &&
    strike.consequenceExecutionId === authorization.id &&
    strike.consequenceLevel === responsibilityConsequenceLevel.LEVEL_2 &&
    strike.incidentType === responsibilityCase.caseType &&
    strike.policyVersion === decision.policyVersion &&
    strike.sourceKey === `reliability-strike:${decision.id}` &&
    strike.status === 'UPHELD'
}

async function createThresholdBlock(tx, { driverId, strike, strikeCount, now, hooks }) {
  const activeIndefinite = await tx.reliabilityBlock.findFirst({
    where: { driverId, type: reliabilityBlockType.INDEFINITE, removedAt: null },
  })
  if (strikeCount >= 7 && !activeIndefinite) {
    const block = await tx.reliabilityBlock.create({ data: {
      driverId,
      type: reliabilityBlockType.INDEFINITE,
      sourceStrikeId: strike.id,
      threshold: 7,
      sourceKey: `reliability-block:indefinite:${strike.id}`,
      blockedAt: now,
      blockedUntil: null,
    } })
    if (hooks.afterBlockCreated) await hooks.afterBlockCreated(block)
    return block
  }
  if (strikeCount === 5 && !activeIndefinite) {
    const block = await tx.reliabilityBlock.create({ data: {
      driverId,
      type: reliabilityBlockType.TEMPORARY,
      sourceStrikeId: strike.id,
      threshold: 5,
      sourceKey: `reliability-block:temporary:${strike.id}`,
      blockedAt: now,
      blockedUntil: new Date(now.getTime() + RELIABILITY_TEMPORARY_BLOCK_MS),
    } })
    if (hooks.afterBlockCreated) await hooks.afterBlockCreated(block)
    return block
  }
  return null
}

async function applyLocked(tx, caseId, clock, hooks) {
  const { responsibilityCase, decision, authorization } = await loadAuthorizedCase(tx, caseId)
  const attemptedAt = clock.now()
  if (decision.classification !== responsibilityClassification.DRIVER_CAUSED ||
      decision.consequenceLevel !== responsibilityConsequenceLevel.LEVEL_2) {
    await markReliabilityHandled(tx, caseId, attemptedAt)
    return { disposition: 'NOT_APPLICABLE', strike: null, block: null, reused: false }
  }

  const driverId = authoritativeDriverId(responsibilityCase)
  if (hooks.beforeDriverLock) await hooks.beforeDriverLock({ caseId, driverId })
  const lockedDriver = await tx.$queryRaw`SELECT id FROM drivers WHERE id = ${driverId} FOR UPDATE`
  if (lockedDriver.length !== 1) throw new ResponsibilityReliabilityError('DRIVER_MISSING')

  const existing = await tx.reliabilityStrike.findUnique({ where: { finalDecisionId: decision.id } })
  if (existing) {
    if (!strikeMatches(existing, { driverId, responsibilityCase, decision, authorization })) {
      throw new ResponsibilityReliabilityError('RELIABILITY_STRIKE_INCONSISTENT')
    }
    await markReliabilityHandled(tx, caseId, attemptedAt)
    return { disposition: 'STRIKE', strike: existing, block: null, reused: true }
  }

  const strike = await tx.reliabilityStrike.create({ data: {
    driverId,
    responsibilityCaseId: responsibilityCase.id,
    finalDecisionId: decision.id,
    consequenceExecutionId: authorization.id,
    consequenceLevel: decision.consequenceLevel,
    incidentType: responsibilityCase.caseType,
    policyVersion: decision.policyVersion,
    sourceKey: `reliability-strike:${decision.id}`,
    status: 'UPHELD',
    createdAt: attemptedAt,
  } })
  if (hooks.afterStrikeCreated) await hooks.afterStrikeCreated(strike)
  const strikeCount = await tx.reliabilityStrike.count({ where: { driverId, status: 'UPHELD' } })
  const block = await createThresholdBlock(tx, { driverId, strike, strikeCount, now: attemptedAt, hooks })
  await markReliabilityHandled(tx, caseId, attemptedAt)
  return { disposition: 'STRIKE', strike, strikeCount, block, reused: false }
}

export async function applyAuthorizedResponsibilityReliabilityConsequences(caseId, {
  db = prisma,
  clock = systemClock,
  hooks = {},
} = {}) {
  if (!caseId) throw new ResponsibilityReliabilityError('CASE_ID_REQUIRED')
  try {
    return await db.$transaction(tx => applyLocked(tx, caseId, clock, hooks))
  } catch (error) {
    await db.responsibilityConsequenceExecution.updateMany({
      where: { caseId },
      data: { reliabilityAttemptedAt: clock.now(), reliabilityLastError: errorCode(error) },
    })
    throw error
  }
}

export async function sweepResponsibilityReliabilityConsequences({
  db = prisma,
  clock = systemClock,
  batchSize = 50,
  apply = applyAuthorizedResponsibilityReliabilityConsequences,
} = {}) {
  const pending = await db.responsibilityConsequenceExecution.findMany({
    where: { status: RESPONSIBILITY_CONSEQUENCE_STATUS, reliabilityAppliedAt: null },
    orderBy: { authorizedAt: 'asc' },
    take: batchSize,
    select: { caseId: true },
  })
  const results = []
  for (const { caseId } of pending) {
    try {
      results.push({ caseId, status: 'APPLIED', result: await apply(caseId, { db, clock }) })
    } catch (error) {
      results.push({ caseId, status: 'BLOCKED', reason: errorCode(error) })
    }
  }
  return results
}
