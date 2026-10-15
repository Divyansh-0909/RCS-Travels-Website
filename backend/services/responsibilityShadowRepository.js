import { prisma } from '../db/prisma.js'
import { responsibilityCaseState } from './responsibilityCaseState.js'
import { AI_RESPONSIBILITY_CONTRACT_VERSION, responsibilityEvidenceBundleSchema } from './responsibilityContracts.js'
import { responsibilityEvidenceHash } from './responsibilityAnalyst.js'
import { RESPONSIBILITY_POLICY_VERSION } from './responsibilityPolicyGate.js'
import {
  RESPONSIBILITY_ANALYST_CONFIG_VERSION,
  RESPONSIBILITY_SHADOW_MAX_MANUAL_RETRIES,
  responsibilityShadowLogicalKey,
} from './responsibilityShadowConfig.js'

const mutableEvidenceStates = new Set([
  responsibilityCaseState.EVIDENCE_COLLECTING,
  responsibilityCaseState.AI_REVIEW,
  responsibilityCaseState.POLICY_EVALUATION,
  responsibilityCaseState.NEEDS_ADMIN_REVIEW,
])

const sameInstant = (left, right) => {
  if (!left || !right) return false
  return new Date(left).getTime() === new Date(right).getTime()
}

async function enqueueWithClient(db, evidenceInput) {
  const evidence = responsibilityEvidenceBundleSchema.parse(evidenceInput)
  const evidenceHash = responsibilityEvidenceHash(evidence)
  const responsibilityCase = await db.responsibilityCase.findUnique({ where: { id: evidence.caseId } })
  if (!responsibilityCase) throw new Error('RESPONSIBILITY_CASE_NOT_FOUND')
  if (responsibilityCase.bookingId !== evidence.bookingId || responsibilityCase.caseType !== evidence.caseType) {
    throw new Error('RESPONSIBILITY_EVIDENCE_CASE_MISMATCH')
  }

  const evidenceVersion = await db.responsibilityEvidenceVersion.upsert({
    where: { caseId_evidenceHash: { caseId: evidence.caseId, evidenceHash } },
    update: {},
    create: {
      caseId: evidence.caseId,
      evidenceVersion: evidence.evidenceVersion,
      evidenceHash,
      snapshot: evidence,
      generatedAt: new Date(evidence.generatedAt),
    },
  })

  const logicalKey = responsibilityShadowLogicalKey({ caseId: evidence.caseId, evidenceHash })
  const work = await db.responsibilityAdjudicationWork.upsert({
    where: { logicalKey },
    update: {},
    create: {
      caseId: evidence.caseId,
      evidenceVersionId: evidenceVersion.id,
      logicalKey,
      contractVersion: AI_RESPONSIBILITY_CONTRACT_VERSION,
      analystConfigVersion: RESPONSIBILITY_ANALYST_CONFIG_VERSION,
      policyVersion: RESPONSIBILITY_POLICY_VERSION,
      status: 'PENDING',
    },
  })

  if (responsibilityCase.evidenceHash !== evidenceHash && mutableEvidenceStates.has(responsibilityCase.state)) {
    await db.responsibilityCase.update({
      where: { id: evidence.caseId },
      data: {
        evidenceVersion: evidence.evidenceVersion,
        evidenceHash,
        evidenceSnapshot: evidence,
      },
    })
  }
  return { evidenceVersion, work, evidenceHash, logicalKey }
}

export async function enqueueResponsibilityShadowEvidence(evidence, { db = prisma } = {}) {
  if (typeof db.$transaction !== 'function') return enqueueWithClient(db, evidence)
  return db.$transaction(tx => enqueueWithClient(tx, evidence))
}

export function createPrismaResponsibilityShadowRepository(db = prisma) {
  return {
    enqueueEvidence: evidence => enqueueResponsibilityShadowEvidence(evidence, { db }),

    async claimNext({ now, leaseUntil, maxAttempts }) {
      if (typeof db.$transaction !== 'function') throw new Error('Root Prisma client required for adjudication claim')
      return db.$transaction(async tx => {
        const rows = await tx.$queryRawUnsafe(
          `SELECT id FROM "responsibility_adjudication_work"
           WHERE "attempt_count" < $1 AND (
             "status" = 'PENDING'
             OR ("status" = 'RETRYABLE' AND ("next_retry_at" IS NULL OR "next_retry_at" <= $2))
             OR ("status" = 'PROCESSING' AND "lease_until" <= $2)
           )
           ORDER BY "created_at" ASC
           FOR UPDATE SKIP LOCKED
           LIMIT 1`,
          maxAttempts,
          now,
        )
        if (rows.length === 0) return null
        const id = rows[0].id
        await tx.responsibilityAdjudicationWork.update({
          where: { id },
          data: {
            status: 'PROCESSING',
            attemptCount: { increment: 1 },
            claimedAt: now,
            leaseUntil,
            lastAttemptedAt: now,
            nextRetryAt: null,
            lastErrorCategory: null,
            lastErrorDetail: null,
          },
        })
        return tx.responsibilityAdjudicationWork.findUniqueOrThrow({
          where: { id },
          include: { evidenceVersion: true },
        })
      })
    },

    async complete(work, result, completedAt) {
      return db.$transaction(async tx => {
        await tx.$queryRawUnsafe(
          'SELECT id FROM "responsibility_adjudication_work" WHERE id = $1 FOR UPDATE',
          work.id,
        )
        const current = await tx.responsibilityAdjudicationWork.findUniqueOrThrow({ where: { id: work.id } })
        if (current.status !== 'PROCESSING' || !sameInstant(current.claimedAt, work.claimedAt)) {
          return { completed: false, result: await tx.responsibilityShadowResult.findUnique({ where: { workId: work.id } }) }
        }
        const shadowResult = await tx.responsibilityShadowResult.upsert({
          where: { workId: work.id },
          update: {},
          create: result,
        })
        await tx.responsibilityAdjudicationWork.update({
          where: { id: work.id },
          data: {
            status: 'COMPLETED',
            completedAt,
            leaseUntil: null,
            nextRetryAt: null,
            lastErrorCategory: null,
            lastErrorDetail: null,
          },
        })
        await tx.responsibilityCase.updateMany({
          where: { id: work.caseId, state: { in: [...mutableEvidenceStates] } },
          data: { state: responsibilityCaseState.NEEDS_ADMIN_REVIEW },
        })
        return { completed: true, result: shadowResult }
      })
    },

    async fail(work, { status, now, nextRetryAt = null, errorCategory, errorDetail }) {
      return db.$transaction(async tx => {
        const changed = await tx.responsibilityAdjudicationWork.updateMany({
          where: { id: work.id, status: 'PROCESSING', claimedAt: work.claimedAt },
          data: {
            status,
            leaseUntil: null,
            nextRetryAt,
            lastErrorCategory: errorCategory,
            lastErrorDetail: errorDetail,
          },
        })
        if (changed.count && status === 'MANUAL_REVIEW') {
          await tx.responsibilityCase.updateMany({
            where: { id: work.caseId, state: { in: [...mutableEvidenceStates] } },
            data: { state: responsibilityCaseState.NEEDS_ADMIN_REVIEW },
          })
        }
        return { changed: changed.count === 1, at: now }
      })
    },

    findCase: caseId => db.responsibilityCase.findUnique({ where: { id: caseId } }),
    findLatestWork: caseId => db.responsibilityAdjudicationWork.findFirst({
      where: { caseId }, orderBy: { createdAt: 'desc' }, include: { evidenceVersion: true },
    }),
    findLatestShadowResult: caseId => db.responsibilityShadowResult.findFirst({
      where: { caseId }, orderBy: { createdAt: 'desc' },
    }),
    findShadowResults: caseId => db.responsibilityShadowResult.findMany({
      where: { caseId }, orderBy: { createdAt: 'asc' },
    }),

    async resetLatestManualWork(caseId, now) {
      return db.$transaction(async tx => {
        const rows = await tx.$queryRawUnsafe(
          `SELECT id FROM "responsibility_adjudication_work"
           WHERE "case_id" = $1 ORDER BY "created_at" DESC LIMIT 1 FOR UPDATE`,
          caseId,
        )
        if (!rows.length) return { status: 'NO_WORK' }
        const work = await tx.responsibilityAdjudicationWork.findUniqueOrThrow({ where: { id: rows[0].id } })
        if (work.status !== 'MANUAL_REVIEW') return { status: 'NOT_MANUAL_REVIEW', work }
        if (work.manualRetryCount >= RESPONSIBILITY_SHADOW_MAX_MANUAL_RETRIES) {
          return { status: 'RETRY_LIMIT', work }
        }
        const updated = await tx.responsibilityAdjudicationWork.update({
          where: { id: work.id },
          data: {
            status: 'PENDING',
            attemptCount: 0,
            manualRetryCount: { increment: 1 },
            claimedAt: null,
            leaseUntil: null,
            nextRetryAt: now,
            lastErrorCategory: null,
            lastErrorDetail: null,
            completedAt: null,
          },
        })
        return { status: 'REQUEUED', work: updated }
      })
    },

    async health(now) {
      const [groups, oldest, expired, completed, routeGroups, errorGroups, latency] = await Promise.all([
        db.responsibilityAdjudicationWork.groupBy({ by: ['status'], _count: { _all: true } }),
        db.responsibilityAdjudicationWork.findFirst({
          where: { status: { in: ['PENDING', 'RETRYABLE'] } }, orderBy: { createdAt: 'asc' }, select: { createdAt: true },
        }),
        db.responsibilityAdjudicationWork.count({ where: { status: 'PROCESSING', leaseUntil: { lt: now } } }),
        db.responsibilityShadowResult.count(),
        db.responsibilityShadowResult.groupBy({ by: ['route'], _count: { _all: true } }),
        db.responsibilityAdjudicationWork.groupBy({
          by: ['lastErrorCategory'],
          where: { lastErrorCategory: { not: null } },
          _count: { _all: true },
        }),
        db.responsibilityShadowResult.aggregate({ _avg: { processingLatencyMs: true } }),
      ])
      return {
        work: Object.fromEntries(groups.map(item => [item.status, item._count._all])),
        oldestPendingAgeMs: oldest ? Math.max(0, now.getTime() - oldest.createdAt.getTime()) : null,
        expiredLeases: expired,
        completedShadowAnalyses: completed,
        routes: Object.fromEntries(routeGroups.map(item => [item.route, item._count._all])),
        errors: Object.fromEntries(errorGroups.map(item => [item.lastErrorCategory, item._count._all])),
        averageProcessingLatencyMs: latency._avg.processingLatencyMs ?? null,
      }
    },
  }
}
