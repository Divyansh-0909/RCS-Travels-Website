import test from 'node:test'
import assert from 'node:assert/strict'

import { responsibilityEvidenceHash } from '../services/responsibilityAnalyst.js'
import {
  createResponsibilityEvidence,
  evidenceCategory,
  responsibilityCaseType,
} from '../services/responsibilityEvidence.js'
import { RESPONSIBILITY_CONSEQUENCE_STATUS } from '../services/responsibilityConsequences.js'
import {
  applyAuthorizedResponsibilityReliabilityConsequences,
  RELIABILITY_TEMPORARY_BLOCK_MS,
  sweepResponsibilityReliabilityConsequences,
} from '../services/responsibilityReliabilityConsequences.js'

const NOW = new Date('2026-09-29T08:00:00.000Z')

function evidenceFor(caseId, bookingId, driverId) {
  const journal = createResponsibilityEvidence({
    caseId,
    caseType: responsibilityCaseType.DRIVER_CANCELLATION,
    bookingId,
    occurredAt: NOW,
    clock: { now: () => new Date(NOW) },
  })
  journal.record({
    category: evidenceCategory.ASSIGNMENT,
    kind: 'assigned_driver_for_incident',
    source: `driver:${driverId}`,
    value: { driverId },
  })
  return structuredClone(journal.snapshot())
}

function createHarness({ level = 'LEVEL_2', classification = 'DRIVER_CAUSED', strikeCount = 0 } = {}) {
  const caseId = 'case-1'
  const bookingId = 'booking-1'
  const driverId = 'driver-1'
  const snapshot = evidenceFor(caseId, bookingId, driverId)
  const evidenceHash = responsibilityEvidenceHash(snapshot)
  const state = {
    responsibilityCase: {
      id: caseId,
      bookingId,
      caseType: responsibilityCaseType.DRIVER_CANCELLATION,
      state: 'FINAL_UPHELD',
      evidenceHash,
      evidenceSnapshot: snapshot,
    },
    decision: {
      id: 'decision-1',
      outcome: 'FINAL_UPHELD',
      classification,
      consequenceLevel: level,
      evidenceHash,
      policyVersion: 'policy-v1',
      finalizedAt: new Date(NOW),
    },
    authorization: {
      id: 'authorization-1',
      caseId,
      finalDecisionId: 'decision-1',
      policyVersion: 'policy-v1',
      finalizedAt: new Date(NOW),
      status: RESPONSIBILITY_CONSEQUENCE_STATUS,
      reliabilityAppliedAt: null,
      reliabilityAttemptedAt: null,
      reliabilityLastError: null,
    },
    driverExists: true,
    strikes: Array.from({ length: strikeCount }, (_, index) => ({
      id: `old-strike-${index + 1}`,
      driverId,
      responsibilityCaseId: `old-case-${index + 1}`,
      finalDecisionId: `old-decision-${index + 1}`,
      consequenceExecutionId: `old-auth-${index + 1}`,
      consequenceLevel: 'LEVEL_2',
      incidentType: responsibilityCaseType.DRIVER_CANCELLATION,
      policyVersion: 'policy-v1',
      sourceKey: `reliability-strike:old-decision-${index + 1}`,
      status: 'UPHELD',
      createdAt: new Date(NOW.getTime() - (strikeCount - index) * 1000),
    })),
    blocks: [],
    queries: [],
    executionUpdates: [],
    caseFindQueries: [],
    decisionFindQueries: [],
    authorizationFindQueries: [],
    executionUpdateQueries: [],
    outerExecutionUpdateQueries: [],
    strikeFindQueries: [],
    strikeCountQueries: [],
  }
  const tx = {
    $queryRaw: async (strings, ...values) => {
      const sql = strings.join('?')
      state.queries.push({ sql, values })
      if (sql.includes('responsibility_cases')) return state.responsibilityCase ? [{ id: caseId }] : []
      if (sql.includes('drivers')) return state.driverExists ? [{ id: driverId }] : []
      return []
    },
    responsibilityCase: { findUniqueOrThrow: async query => {
      state.caseFindQueries.push(query)
      return state.responsibilityCase
    } },
    responsibilityFinalDecision: { findUnique: async query => {
      state.decisionFindQueries.push(query)
      return state.decision
    } },
    responsibilityConsequenceExecution: {
      findUnique: async query => {
        state.authorizationFindQueries.push(query)
        return state.authorization
      },
      updateMany: async query => {
        state.executionUpdateQueries.push(query)
        const { data } = query
        state.executionUpdates.push(data)
        if (state.authorization) Object.assign(state.authorization, data)
        return { count: 1 }
      },
    },
    reliabilityStrike: {
      findUnique: async query => {
        state.strikeFindQueries.push(query)
        return state.strikes.find(strike => strike.finalDecisionId === query.where.finalDecisionId) ?? null
      },
      create: async ({ data }) => {
        const row = { id: `strike-${state.strikes.length + 1}`, ...data }
        state.strikes.push(row)
        return row
      },
      count: async query => {
        state.strikeCountQueries.push(query)
        const { where } = query
        return state.strikes.filter(strike => strike.driverId === where.driverId && strike.status === where.status).length
      },
    },
    reliabilityBlock: {
      findFirst: async ({ where }) => state.blocks.find(block =>
        block.driverId === where.driverId && block.type === where.type && block.removedAt === null) ?? null,
      create: async ({ data }) => {
        const row = { id: `block-${state.blocks.length + 1}`, removedAt: null, removedBy: null, removalReason: null, ...data }
        state.blocks.push(row)
        return row
      },
    },
  }
  const db = {
    $transaction: async callback => callback(tx),
    responsibilityConsequenceExecution: {
      updateMany: async query => {
        state.outerExecutionUpdateQueries.push(query)
        const { data } = query
        state.executionUpdates.push(data)
        if (state.authorization) Object.assign(state.authorization, data)
        return { count: 1 }
      },
      findMany: async () => [],
    },
  }
  return { caseId, driverId, state, db, tx, clock: { now: () => new Date(NOW) } }
}

function refreshEvidenceHash(harness) {
  const evidenceHash = responsibilityEvidenceHash(harness.state.responsibilityCase.evidenceSnapshot)
  harness.state.responsibilityCase.evidenceHash = evidenceHash
  harness.state.decision.evidenceHash = evidenceHash
}

async function apply(harness, options = {}) {
  return applyAuthorizedResponsibilityReliabilityConsequences(harness.caseId, {
    db: harness.db,
    clock: harness.clock,
    ...options,
  })
}

test('reliability executor requires an authoritative finalized case and Phase 6A authorization', async () => {
  const missingId = createHarness()
  await assert.rejects(
    applyAuthorizedResponsibilityReliabilityConsequences('', { db: missingId.db, clock: missingId.clock }),
    { code: 'CASE_ID_REQUIRED' },
  )

  const provisional = createHarness()
  provisional.state.responsibilityCase.state = 'PROVISIONAL_AUTO_UPHELD'
  await assert.rejects(apply(provisional), { code: 'CASE_NOT_FINAL_UPHELD' })
  assert.equal(provisional.state.authorization.reliabilityLastError, 'CASE_NOT_FINAL_UPHELD')
  assert.deepEqual(provisional.state.outerExecutionUpdateQueries[0].where, { caseId: provisional.caseId })

  const inconsistent = createHarness()
  inconsistent.state.decision.evidenceHash = 'wrong'
  await assert.rejects(apply(inconsistent), { code: 'FINAL_DECISION_INCONSISTENT' })

  const unauthorized = createHarness()
  unauthorized.state.authorization.status = 'WRONG'
  await assert.rejects(apply(unauthorized), { code: 'FINALIZED_AUTHORIZATION_MISSING' })
})

test('every authoritative finalization field fails closed independently', async () => {
  const cases = [
    ['CASE_MISSING', harness => { harness.state.responsibilityCase = null }],
    ['CASE_NOT_FINAL_UPHELD', harness => { harness.state.decision = null }],
    ['CASE_NOT_FINAL_UPHELD', harness => { harness.state.decision.outcome = 'FINAL_WAIVED' }],
    ['FINAL_DECISION_INCONSISTENT', harness => { harness.state.decision.policyVersion = '' }],
    ['FINAL_DECISION_INCONSISTENT', harness => { harness.state.decision.finalizedAt = null }],
    ['FINALIZED_AUTHORIZATION_MISSING', harness => { harness.state.authorization = null }],
    ['FINALIZED_AUTHORIZATION_MISSING', harness => { harness.state.authorization.finalDecisionId = 'other' }],
    ['FINALIZED_AUTHORIZATION_MISSING', harness => { harness.state.authorization.policyVersion = 'other' }],
    ['FINALIZED_AUTHORIZATION_MISSING', harness => { harness.state.authorization.finalizedAt = new Date(NOW.getTime() + 1) }],
  ]
  for (const [code, mutate] of cases) {
    const harness = createHarness()
    mutate(harness)
    await assert.rejects(apply(harness), error => error.code === code)
  }
})

test('LEVEL_1 and non-driver outcomes are handled without a strike', async () => {
  for (const harness of [
    createHarness({ level: 'LEVEL_1' }),
    createHarness({ classification: 'PLATFORM_CAUSED' }),
  ]) {
    const result = await apply(harness)
    assert.equal(result.disposition, 'NOT_APPLICABLE')
    assert.equal(result.reused, false)
    assert.equal(harness.state.strikes.length, 0)
    assert.equal(harness.state.authorization.reliabilityAppliedAt.getTime(), NOW.getTime())
    assert.equal(harness.state.authorization.reliabilityLastError, null)
  }
})

test('final driver-caused LEVEL_2 creates exactly one auditable strike and reuses it on retry', async () => {
  const harness = createHarness()
  const first = await apply(harness)
  const retry = await apply(harness)
  assert.equal(first.disposition, 'STRIKE')
  assert.equal(retry.disposition, 'STRIKE')
  assert.equal(first.reused, false)
  assert.equal(retry.reused, true)
  assert.equal(harness.state.strikes.length, 1)
  assert.deepEqual(harness.state.strikes[0], {
    id: 'strike-1',
    driverId: harness.driverId,
    responsibilityCaseId: harness.caseId,
    finalDecisionId: 'decision-1',
    consequenceExecutionId: 'authorization-1',
    consequenceLevel: 'LEVEL_2',
    incidentType: responsibilityCaseType.DRIVER_CANCELLATION,
    policyVersion: 'policy-v1',
    sourceKey: 'reliability-strike:decision-1',
    status: 'UPHELD',
    createdAt: NOW,
  })
  assert.match(harness.state.queries[0].sql, /responsibility_cases/)
  assert.match(harness.state.queries[1].sql, /drivers/)
  assert.deepEqual(harness.state.caseFindQueries[0], { where: { id: harness.caseId } })
  assert.deepEqual(harness.state.decisionFindQueries[0], { where: { caseId: harness.caseId } })
  assert.deepEqual(harness.state.authorizationFindQueries[0], { where: { caseId: harness.caseId } })
  assert.deepEqual(harness.state.strikeFindQueries[0], { where: { finalDecisionId: 'decision-1' } })
  assert.deepEqual(harness.state.strikeCountQueries[0], { where: { driverId: harness.driverId, status: 'UPHELD' } })
  assert.deepEqual(harness.state.executionUpdateQueries[0].where, {
    caseId: harness.caseId,
    reliabilityAppliedAt: null,
  })
})

test('evidence and authoritative driver identity fail closed before strike creation', async () => {
  const noSnapshot = createHarness()
  noSnapshot.state.responsibilityCase.evidenceSnapshot = null
  await assert.rejects(apply(noSnapshot), { code: 'EVIDENCE_SNAPSHOT_INCONSISTENT' })

  const badHash = createHarness()
  badHash.state.responsibilityCase.evidenceHash = 'wrong'
  badHash.state.decision.evidenceHash = 'wrong'
  await assert.rejects(apply(badHash), { code: 'EVIDENCE_SNAPSHOT_INCONSISTENT' })
  assert.equal(badHash.state.strikes.length, 0)

  for (const mutate of [
    snapshot => { snapshot.caseId = 'wrong-case' },
    snapshot => { snapshot.bookingId = 'wrong-booking' },
    snapshot => { snapshot.caseType = responsibilityCaseType.FAILED_PICKUP },
  ]) {
    const harness = createHarness()
    mutate(harness.state.responsibilityCase.evidenceSnapshot)
    refreshEvidenceHash(harness)
    await assert.rejects(apply(harness), { code: 'EVIDENCE_SNAPSHOT_INCONSISTENT' })
  }

  const invalidTimeline = createHarness()
  invalidTimeline.state.responsibilityCase.evidenceSnapshot.timeline = {}
  await assert.rejects(apply(invalidTimeline), { code: 'EVIDENCE_SNAPSHOT_INCONSISTENT' })

  const missing = createHarness()
  missing.state.responsibilityCase.evidenceSnapshot.timeline = []
  const missingHash = responsibilityEvidenceHash(missing.state.responsibilityCase.evidenceSnapshot)
  missing.state.responsibilityCase.evidenceHash = missingHash
  missing.state.decision.evidenceHash = missingHash
  await assert.rejects(apply(missing), { code: 'DRIVER_EVIDENCE_MISSING' })

  const ambiguous = createHarness()
  ambiguous.state.responsibilityCase.evidenceSnapshot.timeline.push({
    ...ambiguous.state.responsibilityCase.evidenceSnapshot.timeline[0],
    id: 'ev_9999',
    value: { driverId: 'driver-2' },
  })
  const ambiguousHash = responsibilityEvidenceHash(ambiguous.state.responsibilityCase.evidenceSnapshot)
  ambiguous.state.responsibilityCase.evidenceHash = ambiguousHash
  ambiguous.state.decision.evidenceHash = ambiguousHash
  await assert.rejects(apply(ambiguous), { code: 'DRIVER_EVIDENCE_AMBIGUOUS' })

  const distractors = createHarness()
  const base = distractors.state.responsibilityCase.evidenceSnapshot.timeline[0]
  distractors.state.responsibilityCase.evidenceSnapshot.timeline.push(
    { ...base, id: 'ev_1001', category: evidenceCategory.CANCELLATION, value: { driverId: 'driver-2' } },
    { ...base, id: 'ev_1002', basis: 'derived', derivedFrom: [base.id], value: { driverId: 'driver-2' } },
    { ...base, id: 'ev_1003', availability: 'unknown', value: { driverId: 'driver-2' } },
    { ...base, id: 'ev_1004', value: { driverId: 2 } },
    { ...base, id: 'ev_1005', value: null },
  )
  refreshEvidenceHash(distractors)
  const distractorResult = await apply(distractors)
  assert.equal(distractorResult.strike.driverId, 'driver-1')
  assert.equal(distractors.state.strikes.length, 1)

  const gone = createHarness()
  gone.state.driverExists = false
  await assert.rejects(apply(gone), { code: 'DRIVER_MISSING' })
})

test('existing strike data must match the authoritative final decision', async () => {
  const mismatches = [
    ['driverId', 'other-driver'],
    ['responsibilityCaseId', 'other-case'],
    ['finalDecisionId', 'other-decision'],
    ['consequenceExecutionId', 'other-auth'],
    ['consequenceLevel', 'LEVEL_1'],
    ['incidentType', responsibilityCaseType.FAILED_PICKUP],
    ['policyVersion', 'other-policy'],
    ['sourceKey', 'other-key'],
    ['status', 'REVERSED'],
  ]
  for (const [field, value] of mismatches) {
    const harness = createHarness()
    harness.state.strikes.push({
      id: 'strike-existing',
      driverId: harness.driverId,
      responsibilityCaseId: harness.caseId,
      finalDecisionId: 'decision-1',
      consequenceExecutionId: 'authorization-1',
      consequenceLevel: 'LEVEL_2',
      incidentType: responsibilityCaseType.DRIVER_CANCELLATION,
      policyVersion: 'policy-v1',
      sourceKey: 'reliability-strike:decision-1',
      status: 'UPHELD',
      [field]: value,
    })
    if (field === 'finalDecisionId') {
      harness.tx.reliabilityStrike.findUnique = async () => harness.state.strikes[0]
    }
    await assert.rejects(apply(harness), { code: 'RELIABILITY_STRIKE_INCONSISTENT' })
  }
})

test('fifth strike creates one seven-day temporary block and sixth creates no new punishment', async () => {
  assert.equal(RELIABILITY_TEMPORARY_BLOCK_MS, 604_800_000)
  const fifth = createHarness({ strikeCount: 4 })
  let beforeDriverLock = 0
  let afterStrike = 0
  let afterBlock = 0
  const result = await apply(fifth, { hooks: {
    beforeDriverLock: async ({ driverId }) => {
      beforeDriverLock += 1
      assert.equal(driverId, fifth.driverId)
    },
    afterStrikeCreated: async () => { afterStrike += 1 },
    afterBlockCreated: async () => { afterBlock += 1 },
  } })
  assert.equal(result.strikeCount, 5)
  assert.equal(result.block.type, 'TEMPORARY')
  assert.equal(result.block.threshold, 5)
  assert.equal(result.block.sourceKey, `reliability-block:temporary:${result.strike.id}`)
  assert.equal(result.block.blockedUntil.getTime(), NOW.getTime() + RELIABILITY_TEMPORARY_BLOCK_MS)
  assert.equal(beforeDriverLock, 1)
  assert.equal(afterStrike, 1)
  assert.equal(afterBlock, 1)

  const fifthWithoutHooks = createHarness({ strikeCount: 4 })
  const noHookTemporary = await apply(fifthWithoutHooks)
  assert.equal(noHookTemporary.block.type, 'TEMPORARY')

  const sixth = createHarness({ strikeCount: 5 })
  const sixthResult = await apply(sixth)
  assert.equal(sixthResult.strikeCount, 6)
  assert.equal(sixthResult.block, null)
  assert.equal(sixth.state.blocks.length, 0)

  const fifthWithIndefinite = createHarness({ strikeCount: 4 })
  fifthWithIndefinite.state.blocks.push({
    id: 'existing-indefinite', driverId: fifthWithIndefinite.driverId, type: 'INDEFINITE', removedAt: null,
  })
  const protectedResult = await apply(fifthWithIndefinite)
  assert.equal(protectedResult.strikeCount, 5)
  assert.equal(protectedResult.block, null)
})

test('seventh strike creates an indefinite block and an existing indefinite block dominates later strikes', async () => {
  const seventh = createHarness({ strikeCount: 6 })
  let indefiniteHook = 0
  const result = await apply(seventh, { hooks: { afterBlockCreated: async () => { indefiniteHook += 1 } } })
  assert.equal(result.block.type, 'INDEFINITE')
  assert.equal(indefiniteHook, 1)
  assert.equal(result.block.threshold, 7)
  assert.equal(result.block.sourceKey, `reliability-block:indefinite:${result.strike.id}`)
  assert.equal(result.block.blockedUntil, null)

  const seventhWithoutHooks = createHarness({ strikeCount: 6 })
  const noHookIndefinite = await apply(seventhWithoutHooks)
  assert.equal(noHookIndefinite.block.type, 'INDEFINITE')

  const later = createHarness({ strikeCount: 7 })
  later.state.blocks.push({
    id: 'existing-indefinite', driverId: later.driverId, type: 'INDEFINITE', removedAt: null,
  })
  const laterResult = await apply(later)
  assert.equal(laterResult.strikeCount, 8)
  assert.equal(laterResult.block, null)
  assert.equal(later.state.blocks.length, 1)
})

test('sweep reports applied and blocked components independently', async () => {
  const queries = []
  const applyCalls = []
  const clock = { now: () => new Date(NOW) }
  const db = {
    responsibilityConsequenceExecution: {
      findMany: async query => {
        queries.push(query)
        return [{ caseId: 'a' }, { caseId: 'b' }, { caseId: 'c' }, { caseId: 'd' }]
      },
    },
  }
  const result = await sweepResponsibilityReliabilityConsequences({
    db,
    clock,
    batchSize: 4,
    apply: async (caseId, options) => {
      applyCalls.push({ caseId, options })
      if (caseId === 'b') throw Object.assign(new Error('blocked'), { code: 'TEST_BLOCK' })
      if (caseId === 'c') throw new Error('unknown')
      if (caseId === 'd') throw null
      return { disposition: 'STRIKE' }
    },
  })
  assert.deepEqual(result.map(item => [item.caseId, item.status, item.reason ?? null]), [
    ['a', 'APPLIED', null],
    ['b', 'BLOCKED', 'TEST_BLOCK'],
    ['c', 'BLOCKED', 'RELIABILITY_EXECUTION_FAILED'],
    ['d', 'BLOCKED', 'RELIABILITY_EXECUTION_FAILED'],
  ])
  assert.deepEqual(queries[0], {
    where: { status: RESPONSIBILITY_CONSEQUENCE_STATUS, reliabilityAppliedAt: null },
    orderBy: { authorizedAt: 'asc' },
    take: 4,
    select: { caseId: true },
  })
  assert.equal(applyCalls.length, 4)
  for (const call of applyCalls) assert.deepEqual(call.options, { db, clock })
})
