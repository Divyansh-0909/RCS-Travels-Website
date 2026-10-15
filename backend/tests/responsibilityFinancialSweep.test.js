import test from 'node:test'
import assert from 'node:assert/strict'
import { sweepResponsibilityFinancialConsequences } from '../services/responsibilityFinancialConsequences.js'
import { RESPONSIBILITY_CONSEQUENCE_STATUS } from '../services/responsibilityConsequences.js'
import {
  financialPolicyForCaseType,
  responsibilityFinancialDisposition,
  responsibilityFinancialPolicyByCaseType,
  durableFinancialBlockedReasons,
} from '../services/responsibilityFinancialPolicy.js'
import { responsibilityCaseType } from '../services/responsibilityEvidence.js'

test('every responsibility case type has an explicit financial disposition', () => {
  assert.deepEqual(responsibilityFinancialDisposition, {
    FINANCIALLY_SUPPORTED_DRIVER_INCIDENT: 'FINANCIALLY_SUPPORTED_DRIVER_INCIDENT',
    EXPLICITLY_NON_FINANCIAL: 'EXPLICITLY_NON_FINANCIAL',
    NOT_YET_SAFE: 'NOT_YET_SAFE',
  })
  assert.deepEqual(Object.keys(responsibilityFinancialPolicyByCaseType).sort(), Object.values(responsibilityCaseType).sort())
  const driverCancellationPolicy = financialPolicyForCaseType(responsibilityCaseType.DRIVER_CANCELLATION)
  assert.equal(driverCancellationPolicy.disposition,
    responsibilityFinancialDisposition.FINANCIALLY_SUPPORTED_DRIVER_INCIDENT)
  assert.equal(driverCancellationPolicy.fareSource, 'booking_state_at_driver_cancellation.authoritativeFarePaise')
  for (const caseType of [responsibilityCaseType.PLATFORM_ASSIGNMENT_FAILURE]) {
    assert.equal(financialPolicyForCaseType(caseType).disposition, responsibilityFinancialDisposition.EXPLICITLY_NON_FINANCIAL)
  }
  for (const caseType of [
    responsibilityCaseType.FAILED_PICKUP,
    responsibilityCaseType.DRIVER_LATE,
    responsibilityCaseType.DRIVER_OFFLINE,
    responsibilityCaseType.RIDER_CANCELLATION,
    responsibilityCaseType.REPLACEMENT_FAILURE,
  ]) {
    assert.equal(financialPolicyForCaseType(caseType).disposition, responsibilityFinancialDisposition.NOT_YET_SAFE)
  }
  assert.equal(financialPolicyForCaseType(responsibilityCaseType.RIDER_CANCELLATION).blockedReason,
    'FINANCIAL_SEMANTICS_UNSUPPORTED_RIDER_CANCELLATION')
  assert.equal(financialPolicyForCaseType(responsibilityCaseType.FAILED_PICKUP).blockedReason,
    'FINANCIAL_SEMANTICS_UNSUPPORTED_FAILED_PICKUP')
  assert.equal(financialPolicyForCaseType(responsibilityCaseType.DRIVER_LATE).blockedReason,
    'FINANCIAL_SEMANTICS_UNSUPPORTED_DRIVER_LATE')
  assert.equal(financialPolicyForCaseType(responsibilityCaseType.PLATFORM_ASSIGNMENT_FAILURE).blockedReason,
    'FINANCIAL_CASE_TYPE_NON_FINANCIAL')
  assert.equal(financialPolicyForCaseType(responsibilityCaseType.REPLACEMENT_FAILURE).blockedReason,
    'FINANCIAL_SEMANTICS_UNSUPPORTED_REPLACEMENT_FAILURE')
  assert.equal(financialPolicyForCaseType('FUTURE_CASE').blockedReason, 'FINANCIAL_CASE_TYPE_UNCLASSIFIED')
  assert.ok(durableFinancialBlockedReasons.includes('FINANCIAL_CASE_TYPE_UNCLASSIFIED'))
  assert.ok(durableFinancialBlockedReasons.includes('FINANCIAL_SEMANTICS_UNSUPPORTED_DRIVER_OFFLINE'))
  assert.ok(durableFinancialBlockedReasons.includes('FINALIZED_DRIVER_CLASSIFICATION_MISSING'))
  assert.equal(durableFinancialBlockedReasons.includes(undefined), false)
})

test('a blocked financial incident is audited and cannot starve a later authorized incident', async () => {
  const now = new Date('2026-09-27T10:00:00.000Z')
  const rows = [
    { id: '1', caseId: 'broken', financialAttemptedAt: null, financialAppliedAt: null },
    { id: '2', caseId: 'good', financialAttemptedAt: null, financialAppliedAt: null },
  ]
  const attempts = []
  const db = { responsibilityConsequenceExecution: {
    findMany: async query => {
      assert.equal(query.where.case, undefined)
      assert.ok(query.where.OR[1].financialLastError.notIn.includes('FINANCIAL_SEMANTICS_UNSUPPORTED_DRIVER_OFFLINE'))
      assert.equal(query.orderBy[0].financialAttemptedAt.nulls, 'first')
      return rows.filter(row => !row.financialAppliedAt)
        .sort((left, right) => Number(Boolean(left.financialAttemptedAt)) - Number(Boolean(right.financialAttemptedAt)))
        .slice(0, query.take)
        .map(row => ({ caseId: row.caseId }))
    },
    updateMany: async ({ where, data }) => {
      const row = rows.find(item => item.caseId === where.caseId)
      Object.assign(row, data)
      return { count: 1 }
    },
  } }
  const apply = async caseId => {
    attempts.push(caseId)
    if (caseId === 'broken') throw Object.assign(new Error('bad incident'), { code: 'EVIDENCE_HASH_MISMATCH' })
    rows.find(row => row.caseId === caseId).financialAppliedAt = now
    return { reused: false }
  }
  const options = { db, clock: { now: () => now }, batchSize: 1, apply }
  assert.deepEqual(await sweepResponsibilityFinancialConsequences(options), [
    { caseId: 'broken', status: 'BLOCKED', code: 'EVIDENCE_HASH_MISMATCH' },
  ])
  assert.equal(rows[0].financialAttemptedAt, now)
  assert.equal(rows[0].financialLastError, 'EVIDENCE_HASH_MISMATCH')
  assert.deepEqual(await sweepResponsibilityFinancialConsequences(options), [
    { caseId: 'good', status: 'APPLIED' },
  ])
  assert.deepEqual(attempts, ['broken', 'good'])
})

test('the sweep reports an already-created consequence as reused', async () => {
  const now = new Date('2026-09-27T11:00:00.000Z')
  const db = { responsibilityConsequenceExecution: {
    findMany: async () => [{ caseId: 'replayed' }],
    updateMany: async () => ({ count: 0 }),
  } }
  const result = await sweepResponsibilityFinancialConsequences({
    db,
    clock: { now: () => now },
    apply: async () => ({ reused: true }),
  })
  assert.deepEqual(result, [{ caseId: 'replayed', status: 'REUSED' }])
})

test('the sweep uses the safe queue projection, passes executor dependencies, and records fallback errors', async () => {
  const now = new Date('2026-09-27T12:00:00.000Z')
  let findManyQuery
  let updateManyQuery
  const db = { responsibilityConsequenceExecution: {
    findMany: async query => {
      findManyQuery = query
      return [{ caseId: 'missing-code' }]
    },
    updateMany: async query => {
      updateManyQuery = query
      return { count: 1 }
    },
  } }
  const clock = { now: () => now }
  const apply = async (...args) => {
    assert.deepEqual(args, ['missing-code', { db, clock }])
    throw new Error('unexpected executor failure')
  }

  assert.deepEqual(await sweepResponsibilityFinancialConsequences({ db, clock, batchSize: 7, apply }), [
    { caseId: 'missing-code', status: 'BLOCKED', code: 'FINANCIAL_EXECUTION_FAILED' },
  ])
  assert.deepEqual(findManyQuery, {
    where: {
      financialAppliedAt: null,
      status: RESPONSIBILITY_CONSEQUENCE_STATUS,
      OR: [
        { financialLastError: null },
        { financialLastError: { notIn: durableFinancialBlockedReasons } },
      ],
    },
    orderBy: [
      { financialAttemptedAt: { sort: 'asc', nulls: 'first' } },
      { authorizedAt: 'asc' },
      { id: 'asc' },
    ],
    take: 7,
    select: { caseId: true },
  })
  assert.deepEqual(updateManyQuery, {
    where: { caseId: 'missing-code', financialAppliedAt: null },
    data: {
      financialAttemptedAt: now,
      financialLastError: 'FINANCIAL_EXECUTION_FAILED',
    },
  })
})

test('the sweep preserves a fallback code when an executor throws no error object', async () => {
  const db = { responsibilityConsequenceExecution: {
    findMany: async () => [{ caseId: 'null-error' }],
    updateMany: async () => ({ count: 1 }),
  } }
  assert.deepEqual(await sweepResponsibilityFinancialConsequences({
    db,
    apply: async () => { throw null },
  }), [{ caseId: 'null-error', status: 'BLOCKED', code: 'FINANCIAL_EXECUTION_FAILED' }])
})
