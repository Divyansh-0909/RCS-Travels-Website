import test from 'node:test'
import assert from 'node:assert/strict'

import { createTestClock } from './helpers/testClock.js'
import {
  createResponsibilityEvidence,
  evidenceCategory,
  responsibilityCaseType,
} from '../services/responsibilityEvidence.js'
import { responsibilityEvidenceHash } from '../services/responsibilityAnalyst.js'
import { responsibilityCaseState } from '../services/responsibilityCaseState.js'
import {
  createPrismaResponsibilityShadowRepository,
  enqueueResponsibilityShadowEvidence,
} from '../services/responsibilityShadowRepository.js'
import { RESPONSIBILITY_SHADOW_MAX_MANUAL_RETRIES } from '../services/responsibilityShadowConfig.js'
import { AI_RESPONSIBILITY_CONTRACT_VERSION } from '../services/responsibilityContracts.js'
import { RESPONSIBILITY_ANALYST_CONFIG_VERSION, responsibilityShadowLogicalKey } from '../services/responsibilityShadowConfig.js'
import { RESPONSIBILITY_POLICY_VERSION } from '../services/responsibilityPolicyGate.js'

const NOW = new Date('2026-09-29T10:00:00.000Z')

function snapshot(caseId = 'repo-case', bookingId = 'repo-booking') {
  const journal = createResponsibilityEvidence({
    caseId,
    caseType: responsibilityCaseType.DRIVER_CANCELLATION,
    bookingId,
    occurredAt: NOW,
    clock: createTestClock(NOW.toISOString()),
  })
  for (const category of [evidenceCategory.BOOKING, evidenceCategory.ASSIGNMENT, evidenceCategory.CANCELLATION]) {
    journal.record({ category, kind: `${category}-fact`, source: `source:${category}`, value: { ok: true } })
  }
  return journal.snapshot()
}

function fakeDatabase({ evidence = snapshot() } = {}) {
  const evidenceHash = responsibilityEvidenceHash(evidence)
  const state = {
    responsibilityCase: {
      id: evidence.caseId,
      bookingId: evidence.bookingId,
      caseType: evidence.caseType,
      state: responsibilityCaseState.NEEDS_ADMIN_REVIEW,
      evidenceHash: 'older-hash',
      evidenceVersion: 'older-version',
      evidenceSnapshot: { old: true },
    },
    evidenceHash,
    caseUpdates: [],
    caseUpdateMany: [],
    caseFindUniqueArgs: [],
    evidenceUpserts: [],
    workUpserts: [],
    workUpdates: [],
    workUpdateMany: [],
    workFindUniqueArgs: [],
    workFindFirstArgs: [],
    workGroupByArgs: [],
    workCountArgs: [],
    shadowUpserts: [],
    shadowFindUniqueArgs: [],
    shadowFindFirstArgs: [],
    shadowFindManyArgs: [],
    shadowGroupByArgs: [],
    shadowAggregateArgs: [],
    shadowCountArgs: [],
    rawCalls: [],
    workUpdateManyCount: 1,
    claimRows: [],
    manualRows: [],
    currentWork: null,
    existingShadow: null,
    manualWork: null,
    createdShadow: null,
    groups: [],
    oldest: null,
    expired: 0,
    completedCount: 0,
    routeGroups: [],
    errorGroups: [],
    averageLatency: null,
    transactionCalls: 0,
  }

  const tx = {
    responsibilityCase: {
      findUnique: async args => {
        state.caseFindUniqueArgs.push(args)
        return args.where.id === state.responsibilityCase?.id ? state.responsibilityCase : null
      },
      update: async ({ where, data }) => {
        state.caseUpdates.push({ where, data })
        state.responsibilityCase = { ...state.responsibilityCase, ...data }
        return state.responsibilityCase
      },
      updateMany: async args => {
        state.caseUpdateMany.push(args)
        return { count: 1 }
      },
    },
    responsibilityEvidenceVersion: {
      upsert: async args => {
        state.evidenceUpserts.push(args)
        return { id: 'evidence-version-1', ...args.create }
      },
    },
    responsibilityAdjudicationWork: {
      upsert: async args => {
        state.workUpserts.push(args)
        return { id: 'work-1', attemptCount: 0, manualRetryCount: 0, ...args.create }
      },
      update: async ({ where, data }) => {
        state.workUpdates.push({ where, data })
        const base = state.currentWork ?? state.manualWork ?? { id: where.id }
        const updated = {
          ...base,
          ...data,
          attemptCount: data.attemptCount?.increment ? (base.attemptCount ?? 0) + data.attemptCount.increment : (data.attemptCount ?? base.attemptCount),
          manualRetryCount: data.manualRetryCount?.increment
            ? (base.manualRetryCount ?? 0) + data.manualRetryCount.increment
            : (data.manualRetryCount ?? base.manualRetryCount),
        }
        state.currentWork = updated
        state.manualWork = updated
        return updated
      },
      updateMany: async args => { state.workUpdateMany.push(args); return { count: state.workUpdateManyCount } },
      findUniqueOrThrow: async args => { state.workFindUniqueArgs.push(args); return state.currentWork ?? state.manualWork },
      findFirst: async args => {
        state.workFindFirstArgs.push(args)
        return args?.where?.status?.in ? state.oldest : state.currentWork
      },
      groupBy: async args => {
        state.workGroupByArgs.push(args)
        return args.by.includes('lastErrorCategory') ? state.errorGroups : state.groups
      },
      count: async args => { state.workCountArgs.push(args); return state.expired },
    },
    responsibilityShadowResult: {
      upsert: async args => {
        state.shadowUpserts.push(args)
        state.createdShadow = { id: 'shadow-1', ...args.create }
        return state.createdShadow
      },
      findUnique: async args => { state.shadowFindUniqueArgs.push(args); return state.existingShadow },
      findFirst: async args => { state.shadowFindFirstArgs.push(args); return state.existingShadow },
      findMany: async args => { state.shadowFindManyArgs.push(args); return state.existingShadow ? [state.existingShadow] : [] },
      count: async (...args) => { state.shadowCountArgs.push(args); return state.completedCount },
      groupBy: async args => { state.shadowGroupByArgs.push(args); return state.routeGroups },
      aggregate: async args => { state.shadowAggregateArgs.push(args); return { _avg: { processingLatencyMs: state.averageLatency } } },
    },
    $queryRawUnsafe: async (sql, ...params) => {
      state.rawCalls.push({ sql: String(sql), params })
      if (String(sql).includes('SKIP LOCKED')) return state.claimRows
      if (String(sql).includes('ORDER BY "created_at" DESC')) return state.manualRows
      return []
    },
  }
  const db = {
    ...tx,
    $transaction: async operation => {
      state.transactionCalls += 1
      return operation(tx)
    },
  }
  return { db, tx, state }
}

test('enqueue validates authoritative case identity and preserves immutable evidence versions', async () => {
  const evidence = snapshot()
  const { db, tx, state } = fakeDatabase({ evidence })
  const result = await enqueueResponsibilityShadowEvidence(evidence, { db })
  assert.equal(result.evidenceHash, state.evidenceHash)
  assert.equal(state.caseUpdates.length, 1)
  assert.deepEqual(state.caseUpdates[0], {
    where: { id: evidence.caseId },
    data: { evidenceHash: state.evidenceHash, evidenceVersion: evidence.evidenceVersion, evidenceSnapshot: evidence },
  })
  assert.equal(state.transactionCalls, 1)
  assert.deepEqual(state.evidenceUpserts[0], {
    where: { caseId_evidenceHash: { caseId: evidence.caseId, evidenceHash: state.evidenceHash } },
    update: {},
    create: {
      caseId: evidence.caseId,
      evidenceVersion: evidence.evidenceVersion,
      evidenceHash: state.evidenceHash,
      snapshot: evidence,
      generatedAt: new Date(evidence.generatedAt),
    },
  })
  const expectedLogicalKey = responsibilityShadowLogicalKey({ caseId: evidence.caseId, evidenceHash: state.evidenceHash })
  assert.deepEqual(state.workUpserts[0], {
    where: { logicalKey: expectedLogicalKey },
    update: {},
    create: {
      caseId: evidence.caseId,
      evidenceVersionId: 'evidence-version-1',
      logicalKey: expectedLogicalKey,
      contractVersion: AI_RESPONSIBILITY_CONTRACT_VERSION,
      analystConfigVersion: RESPONSIBILITY_ANALYST_CONFIG_VERSION,
      policyVersion: RESPONSIBILITY_POLICY_VERSION,
      status: 'PENDING',
    },
  })
  const repository = createPrismaResponsibilityShadowRepository(db)
  assert.equal((await repository.enqueueEvidence(evidence)).evidenceHash, state.evidenceHash)
  assert.equal(state.transactionCalls, 2)

  state.responsibilityCase.evidenceHash = state.evidenceHash
  state.responsibilityCase.state = responsibilityCaseState.FINAL_WAIVED
  await enqueueResponsibilityShadowEvidence(evidence, { db: tx })
  assert.equal(state.caseUpdates.length, 1)
  state.responsibilityCase.evidenceHash = 'different-hash'
  await enqueueResponsibilityShadowEvidence(evidence, { db: tx })
  assert.equal(state.caseUpdates.length, 1)
  state.responsibilityCase.evidenceHash = state.evidenceHash
  state.responsibilityCase.state = responsibilityCaseState.AI_REVIEW
  await enqueueResponsibilityShadowEvidence(evidence, { db: tx })
  assert.equal(state.caseUpdates.length, 1)

  state.responsibilityCase = null
  await assert.rejects(enqueueResponsibilityShadowEvidence(evidence, { db: tx }), /RESPONSIBILITY_CASE_NOT_FOUND/)
  state.responsibilityCase = { id: evidence.caseId, bookingId: 'wrong-booking', caseType: evidence.caseType }
  await assert.rejects(enqueueResponsibilityShadowEvidence(evidence, { db: tx }), /RESPONSIBILITY_EVIDENCE_CASE_MISMATCH/)
  state.responsibilityCase = { id: evidence.caseId, bookingId: evidence.bookingId, caseType: responsibilityCaseType.FAILED_PICKUP }
  await assert.rejects(enqueueResponsibilityShadowEvidence(evidence, { db: tx }), /RESPONSIBILITY_EVIDENCE_CASE_MISMATCH/)
})

test('claiming requires a root client, returns empty safely, and persists a fenced lease', async () => {
  const { db, tx, state } = fakeDatabase()
  const rootRepository = createPrismaResponsibilityShadowRepository(db)
  const transactionRepository = createPrismaResponsibilityShadowRepository(tx)
  await assert.rejects(transactionRepository.claimNext({ now: NOW, leaseUntil: new Date(NOW.getTime() + 1000), maxAttempts: 3 }), /Root Prisma client/)
  assert.equal(await rootRepository.claimNext({ now: NOW, leaseUntil: new Date(NOW.getTime() + 1000), maxAttempts: 3 }), null)

  state.claimRows = [{ id: 'work-claim' }]
  state.currentWork = { id: 'work-claim', attemptCount: 0, claimedAt: NOW }
  const claimed = await rootRepository.claimNext({ now: NOW, leaseUntil: new Date(NOW.getTime() + 1000), maxAttempts: 3 })
  assert.equal(claimed.id, 'work-claim')
  assert.match(state.rawCalls.at(-1).sql, /"attempt_count" < \$1/)
  assert.match(state.rawCalls.at(-1).sql, /"status" = 'PENDING'/)
  assert.match(state.rawCalls.at(-1).sql, /"status" = 'RETRYABLE'.*"next_retry_at"/s)
  assert.match(state.rawCalls.at(-1).sql, /"status" = 'PROCESSING'.*"lease_until"/s)
  assert.match(state.rawCalls.at(-1).sql, /ORDER BY "created_at" ASC/)
  assert.match(state.rawCalls.at(-1).sql, /FOR UPDATE SKIP LOCKED/)
  assert.match(state.rawCalls.at(-1).sql, /LIMIT 1/)
  assert.deepEqual(state.rawCalls.at(-1).params, [3, NOW])
  assert.deepEqual(state.workUpdates.at(-1), {
    where: { id: 'work-claim' },
    data: {
      status: 'PROCESSING',
      attemptCount: { increment: 1 },
      claimedAt: NOW,
      leaseUntil: new Date(NOW.getTime() + 1000),
      lastAttemptedAt: NOW,
      nextRetryAt: null,
      lastErrorCategory: null,
      lastErrorDetail: null,
    },
  })
  assert.deepEqual(state.workFindUniqueArgs.at(-1), { where: { id: 'work-claim' }, include: { evidenceVersion: true } })
})

test('completion and failure honor claim fencing and manual-review escalation', async () => {
  const { db, state } = fakeDatabase()
  const repository = createPrismaResponsibilityShadowRepository(db)
  const claim = { id: 'work-1', caseId: 'repo-case', claimedAt: NOW }
  state.currentWork = { id: 'work-1', status: 'PENDING', claimedAt: NOW }
  state.existingShadow = { id: 'shadow-existing', workId: 'work-1' }
  assert.deepEqual(await repository.complete(claim, { workId: 'work-1' }, NOW), {
    completed: false,
    result: state.existingShadow,
  })
  assert.deepEqual(state.shadowFindUniqueArgs.at(-1), { where: { workId: 'work-1' } })
  assert.match(state.rawCalls.at(-1).sql, /WHERE id = \$1 FOR UPDATE/)
  assert.deepEqual(state.rawCalls.at(-1).params, ['work-1'])
  assert.deepEqual(state.workFindUniqueArgs.at(-1), { where: { id: 'work-1' } })

  state.currentWork = { id: 'work-1', status: 'PROCESSING', claimedAt: new Date(NOW.getTime() + 1) }
  assert.equal((await repository.complete(claim, { workId: 'work-1' }, NOW)).completed, false)
  state.currentWork = { id: 'work-1', status: 'PROCESSING', claimedAt: null }
  assert.equal((await repository.complete(claim, { workId: 'work-1' }, NOW)).completed, false)
  const nullClaim = { ...claim, claimedAt: null }
  state.currentWork = { id: 'work-1', status: 'PROCESSING', claimedAt: null }
  assert.equal((await repository.complete(nullClaim, { workId: 'work-1' }, NOW)).completed, false)
  state.currentWork = { id: 'work-1', status: 'PROCESSING', claimedAt: NOW }
  assert.equal((await repository.complete(nullClaim, { workId: 'work-1' }, NOW)).completed, false)
  state.currentWork = { id: 'work-1', status: 'PROCESSING', claimedAt: new Date(0) }
  assert.equal((await repository.complete(nullClaim, { workId: 'work-1' }, NOW)).completed, false)

  state.currentWork = { id: 'work-1', status: 'PROCESSING', claimedAt: new Date(NOW) }
  const completed = await repository.complete(claim, { workId: 'work-1', caseId: 'repo-case' }, NOW)
  assert.equal(completed.completed, true)
  assert.equal(completed.result.id, 'shadow-1')
  assert.deepEqual(state.shadowUpserts.at(-1), {
    where: { workId: 'work-1' }, update: {}, create: { workId: 'work-1', caseId: 'repo-case' },
  })
  assert.deepEqual(state.workUpdates.at(-1), {
    where: { id: 'work-1' },
    data: {
      status: 'COMPLETED', completedAt: NOW, leaseUntil: null, nextRetryAt: null, lastErrorCategory: null, lastErrorDetail: null,
    },
  })
  assert.deepEqual(state.caseUpdateMany.at(-1), {
    where: { id: 'repo-case', state: { in: [
      responsibilityCaseState.EVIDENCE_COLLECTING,
      responsibilityCaseState.AI_REVIEW,
      responsibilityCaseState.POLICY_EVALUATION,
      responsibilityCaseState.NEEDS_ADMIN_REVIEW,
    ] } },
    data: { state: responsibilityCaseState.NEEDS_ADMIN_REVIEW },
  })

  state.currentWork = { id: 'work-1', status: 'PROCESSING', claimedAt: NOW }
  state.workUpdateManyCount = 1
  const caseUpdatesBeforeRetry = state.caseUpdateMany.length
  const retry = await repository.fail(claim, {
    status: 'RETRYABLE', now: NOW, nextRetryAt: new Date(NOW.getTime() + 1000), errorCategory: 'TIMEOUT', errorDetail: 'safe',
  })
  assert.equal(retry.changed, true)
  assert.deepEqual(state.workUpdateMany.at(-1), {
    where: { id: 'work-1', status: 'PROCESSING', claimedAt: NOW },
    data: { status: 'RETRYABLE', leaseUntil: null, nextRetryAt: new Date(NOW.getTime() + 1000), lastErrorCategory: 'TIMEOUT', lastErrorDetail: 'safe' },
  })
  assert.equal(state.caseUpdateMany.length, caseUpdatesBeforeRetry)
  const updatesBeforeManual = state.caseUpdateMany.length
  await repository.fail(claim, {
    status: 'MANUAL_REVIEW', now: NOW, errorCategory: 'SCHEMA', errorDetail: 'safe',
  })
  assert.equal(state.caseUpdateMany.length, updatesBeforeManual + 1)
  assert.deepEqual(state.caseUpdateMany.at(-1), {
    where: { id: 'repo-case', state: { in: [
      responsibilityCaseState.EVIDENCE_COLLECTING,
      responsibilityCaseState.AI_REVIEW,
      responsibilityCaseState.POLICY_EVALUATION,
      responsibilityCaseState.NEEDS_ADMIN_REVIEW,
    ] } },
    data: { state: responsibilityCaseState.NEEDS_ADMIN_REVIEW },
  })
  state.workUpdateManyCount = 0
  const updatesBeforeStaleManual = state.caseUpdateMany.length
  assert.equal((await repository.fail(claim, {
    status: 'MANUAL_REVIEW', now: NOW, errorCategory: 'SCHEMA', errorDetail: 'safe',
  })).changed, false)
  assert.equal(state.caseUpdateMany.length, updatesBeforeStaleManual)
})

test('read helpers, bounded manual retry, and health metrics expose every durable work state', async () => {
  const { db, state } = fakeDatabase()
  const repository = createPrismaResponsibilityShadowRepository(db)
  state.currentWork = { id: 'work-current', caseId: 'repo-case', status: 'COMPLETED' }
  state.existingShadow = { id: 'shadow-current', caseId: 'repo-case', route: 'NEEDS_ADMIN_REVIEW' }
  assert.equal((await repository.findCase('repo-case')).id, 'repo-case')
  assert.deepEqual(state.caseFindUniqueArgs.at(-1), { where: { id: 'repo-case' } })
  assert.equal((await repository.findLatestWork('repo-case')).id, 'work-current')
  assert.equal((await repository.findLatestShadowResult('repo-case')).id, 'shadow-current')
  assert.equal((await repository.findShadowResults('repo-case')).length, 1)
  assert.deepEqual(state.workFindFirstArgs.at(-1), { where: { caseId: 'repo-case' }, orderBy: { createdAt: 'desc' }, include: { evidenceVersion: true } })
  assert.deepEqual(state.shadowFindFirstArgs.at(-1), { where: { caseId: 'repo-case' }, orderBy: { createdAt: 'desc' } })
  assert.deepEqual(state.shadowFindManyArgs.at(-1), { where: { caseId: 'repo-case' }, orderBy: { createdAt: 'asc' } })

  state.manualRows = []
  assert.deepEqual(await repository.resetLatestManualWork('repo-case', NOW), { status: 'NO_WORK' })
  assert.match(state.rawCalls.at(-1).sql, /WHERE "case_id" = \$1/)
  assert.match(state.rawCalls.at(-1).sql, /ORDER BY "created_at" DESC LIMIT 1 FOR UPDATE/)
  assert.deepEqual(state.rawCalls.at(-1).params, ['repo-case'])
  state.manualRows = [{ id: 'manual-1' }]
  state.manualWork = { id: 'manual-1', status: 'COMPLETED', manualRetryCount: 0, attemptCount: 1 }
  state.currentWork = null
  assert.equal((await repository.resetLatestManualWork('repo-case', NOW)).status, 'NOT_MANUAL_REVIEW')
  assert.deepEqual(state.workFindUniqueArgs.at(-1), { where: { id: 'manual-1' } })
  state.manualWork = { id: 'manual-1', status: 'MANUAL_REVIEW', manualRetryCount: RESPONSIBILITY_SHADOW_MAX_MANUAL_RETRIES, attemptCount: 1 }
  assert.equal((await repository.resetLatestManualWork('repo-case', NOW)).status, 'RETRY_LIMIT')
  state.manualWork = { id: 'manual-1', status: 'MANUAL_REVIEW', manualRetryCount: 0, attemptCount: 3 }
  const requeued = await repository.resetLatestManualWork('repo-case', NOW)
  assert.equal(requeued.status, 'REQUEUED')
  assert.equal(requeued.work.status, 'PENDING')
  assert.equal(requeued.work.attemptCount, 0)
  assert.deepEqual(state.workUpdates.at(-1), {
    where: { id: 'manual-1' },
    data: {
      status: 'PENDING', attemptCount: 0, manualRetryCount: { increment: 1 }, claimedAt: null, leaseUntil: null,
      nextRetryAt: NOW, lastErrorCategory: null, lastErrorDetail: null, completedAt: null,
    },
  })

  state.groups = [{ status: 'PENDING', _count: { _all: 2 } }]
  state.oldest = { createdAt: new Date(NOW.getTime() - 5000) }
  state.expired = 1
  state.completedCount = 3
  state.routeGroups = [{ route: 'NEEDS_ADMIN_REVIEW', _count: { _all: 2 } }]
  state.errorGroups = [{ lastErrorCategory: 'TIMEOUT', _count: { _all: 1 } }]
  state.averageLatency = 42
  const health = await repository.health(NOW)
  assert.deepEqual(health.work, { PENDING: 2 })
  assert.equal(health.oldestPendingAgeMs, 5000)
  assert.equal(health.expiredLeases, 1)
  assert.equal(health.completedShadowAnalyses, 3)
  assert.deepEqual(health.routes, { NEEDS_ADMIN_REVIEW: 2 })
  assert.deepEqual(health.errors, { TIMEOUT: 1 })
  assert.equal(health.averageProcessingLatencyMs, 42)
  assert.deepEqual(state.workGroupByArgs.at(-2), { by: ['status'], _count: { _all: true } })
  assert.deepEqual(state.workFindFirstArgs.at(-1), {
    where: { status: { in: ['PENDING', 'RETRYABLE'] } }, orderBy: { createdAt: 'asc' }, select: { createdAt: true },
  })
  assert.deepEqual(state.workCountArgs.at(-1), { where: { status: 'PROCESSING', leaseUntil: { lt: NOW } } })
  assert.deepEqual(state.shadowCountArgs.at(-1), [])
  assert.deepEqual(state.shadowGroupByArgs.at(-1), { by: ['route'], _count: { _all: true } })
  assert.deepEqual(state.workGroupByArgs.at(-1), {
    by: ['lastErrorCategory'], where: { lastErrorCategory: { not: null } }, _count: { _all: true },
  })
  assert.deepEqual(state.shadowAggregateArgs.at(-1), { _avg: { processingLatencyMs: true } })

  state.oldest = null
  state.averageLatency = null
  const emptyAge = await repository.health(NOW)
  assert.equal(emptyAge.oldestPendingAgeMs, null)
  assert.equal(emptyAge.averageProcessingLatencyMs, null)
  state.oldest = { createdAt: new Date(NOW.getTime() + 5000) }
  assert.equal((await repository.health(NOW)).oldestPendingAgeMs, 0)
})
