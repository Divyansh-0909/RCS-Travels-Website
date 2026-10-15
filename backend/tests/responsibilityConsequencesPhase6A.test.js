import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyFinalizedResponsibilityConsequences,
  createPrismaResponsibilityConsequenceRepository,
  RESPONSIBILITY_CONSEQUENCE_STATUS,
} from '../services/responsibilityConsequences.js'
import { responsibilityCaseState } from '../services/responsibilityCaseState.js'

const CASE_ID = 'case-1'
const HASH = 'evidence-hash'
const FINALIZED_AT = new Date('2026-09-25T08:00:00.000Z')
const clock = { now: () => new Date('2026-09-25T09:00:00.000Z') }

function authorization({
  state = responsibilityCaseState.FINAL_UPHELD,
  outcome = responsibilityCaseState.FINAL_UPHELD,
  casePresent = true,
  decisionPresent = true,
  caseHash = HASH,
  decisionHash = HASH,
  policyVersion = 'phase6a-test-v1',
  finalizedAt = FINALIZED_AT,
} = {}) {
  return {
    responsibilityCase: casePresent ? { id: CASE_ID, state, evidenceHash: caseHash } : null,
    finalDecision: decisionPresent ? {
      id: 'final-1',
      caseId: CASE_ID,
      outcome,
      evidenceHash: decisionHash,
      policyVersion,
      finalizedAt,
    } : null,
  }
}

function repository(auth = authorization()) {
  let execution = null
  let writes = 0
  return {
    get writes() { return writes },
    findAuthorization: async () => auth,
    recordAuthorization: async record => {
      if (execution) return { execution, reused: true }
      writes += 1
      execution = { id: 'execution-1', attemptCount: 1, ...record }
      return { execution, reused: false }
    },
  }
}

const blockedStates = [
  responsibilityCaseState.EVIDENCE_COLLECTING,
  responsibilityCaseState.AI_REVIEW,
  responsibilityCaseState.POLICY_EVALUATION,
  responsibilityCaseState.PROVISIONAL_AUTO_UPHELD,
  responsibilityCaseState.PROVISIONAL_AUTO_WAIVED,
  responsibilityCaseState.NEEDS_ADMIN_REVIEW,
  responsibilityCaseState.PROVISIONAL_ADMIN_UPHELD,
  responsibilityCaseState.PROVISIONAL_ADMIN_WAIVED,
  responsibilityCaseState.APPEAL_WINDOW,
  responsibilityCaseState.APPEAL_OPEN,
  responsibilityCaseState.APPEAL_REVIEW,
  responsibilityCaseState.FINAL_WAIVED,
]

test('missing case id fails closed before repository access', async () => {
  let reads = 0
  const repo = {
    findAuthorization: async () => { reads += 1 },
    recordAuthorization: async () => { throw new Error('must not write') },
  }
  const result = await applyFinalizedResponsibilityConsequences('', { repository: repo, clock })
  assert.deepEqual(result, { status: 'BLOCKED', caseId: null, reason: 'CASE_ID_REQUIRED' })
  assert.equal(reads, 0)
})

test('Prisma consequence repository reads the authoritative case and final decision', async () => {
  const calls = []
  const db = {
    responsibilityCase: {
      findUnique: async query => {
        calls.push(['case', query])
        return { id: CASE_ID }
      },
    },
    responsibilityFinalDecision: {
      findUnique: async query => {
        calls.push(['decision', query])
        return { id: 'final-1' }
      },
    },
    responsibilityConsequenceExecution: {},
  }
  const repo = createPrismaResponsibilityConsequenceRepository(db)
  assert.deepEqual(await repo.findAuthorization(CASE_ID), {
    responsibilityCase: { id: CASE_ID },
    finalDecision: { id: 'final-1' },
  })
  assert.deepEqual(calls, [
    ['case', { where: { id: CASE_ID } }],
    ['decision', { where: { caseId: CASE_ID } }],
  ])
})

test('Prisma consequence repository does not query final decision when case is missing', async () => {
  let decisionReads = 0
  const db = {
    responsibilityCase: { findUnique: async () => null },
    responsibilityFinalDecision: { findUnique: async () => { decisionReads += 1 } },
    responsibilityConsequenceExecution: {},
  }
  const repo = createPrismaResponsibilityConsequenceRepository(db)
  assert.deepEqual(await repo.findAuthorization(CASE_ID), { responsibilityCase: null, finalDecision: null })
  assert.equal(decisionReads, 0)
})

test('Prisma consequence repository creates once and reuses the unique execution on retry', async () => {
  const stored = { id: 'execution-1', caseId: CASE_ID, attemptCount: 1 }
  let mode = 'create'
  const createCalls = []
  const updateCalls = []
  const db = {
    responsibilityCase: {},
    responsibilityFinalDecision: {},
    responsibilityConsequenceExecution: {
      create: async ({ data }) => {
        createCalls.push(data)
        if (mode === 'duplicate') throw Object.assign(new Error('duplicate'), { code: 'P2002' })
        return { ...stored, ...data }
      },
      update: async ({ where, data }) => {
        updateCalls.push({ where, data })
        return { ...stored, ...where, attemptCount: 1 + data.attemptCount.increment }
      },
    },
  }
  const repo = createPrismaResponsibilityConsequenceRepository(db)
  const record = { caseId: CASE_ID, status: RESPONSIBILITY_CONSEQUENCE_STATUS }
  const created = await repo.recordAuthorization(record)
  assert.equal(created.reused, false)
  assert.deepEqual(createCalls, [record])
  mode = 'duplicate'
  const reused = await repo.recordAuthorization(record)
  assert.equal(reused.reused, true)
  assert.equal(reused.execution.attemptCount, 2)
  assert.deepEqual(updateCalls, [{
    where: { caseId: CASE_ID },
    data: { attemptCount: { increment: 1 } },
  }])
})

test('Prisma consequence repository surfaces non-uniqueness persistence failures', async () => {
  const db = {
    responsibilityCase: {},
    responsibilityFinalDecision: {},
    responsibilityConsequenceExecution: {
      create: async () => { throw new Error('database unavailable') },
    },
  }
  const repo = createPrismaResponsibilityConsequenceRepository(db)
  await assert.rejects(() => repo.recordAuthorization({ caseId: CASE_ID }), /database unavailable/)
})

test('Prisma consequence repository preserves non-Error persistence failures', async () => {
  const db = {
    responsibilityCase: {},
    responsibilityFinalDecision: {},
    responsibilityConsequenceExecution: {
      create: async () => { throw null },
    },
  }
  const repo = createPrismaResponsibilityConsequenceRepository(db)
  let caught = 'not-thrown'
  try {
    await repo.recordAuthorization({ caseId: CASE_ID })
  } catch (error) {
    caught = error
  }
  assert.equal(caught, null)
})

for (const state of blockedStates) {
  test(`${state} cannot authorize a responsibility consequence`, async () => {
    const repo = repository(authorization({ state, outcome: state }))
    const result = await applyFinalizedResponsibilityConsequences(CASE_ID, { repository: repo, clock })
    assert.equal(result.status, 'BLOCKED')
    assert.equal(repo.writes, 0)
  })
}

test('persisted case state independently requires FINAL_UPHELD', async () => {
  const repo = repository(authorization({
    state: responsibilityCaseState.PROVISIONAL_AUTO_UPHELD,
    outcome: responsibilityCaseState.FINAL_UPHELD,
  }))
  const result = await applyFinalizedResponsibilityConsequences(CASE_ID, { repository: repo, clock })
  assert.deepEqual(result, { status: 'BLOCKED', caseId: CASE_ID, reason: 'CASE_NOT_FINAL_UPHELD' })
  assert.equal(repo.writes, 0)
})

test('FINAL_UPHELD authorizes the single consequence boundary without applying a consequence', async () => {
  const repo = repository()
  const result = await applyFinalizedResponsibilityConsequences(CASE_ID, { repository: repo, clock })
  assert.equal(result.status, 'AUTHORIZED')
  assert.equal(RESPONSIBILITY_CONSEQUENCE_STATUS, 'AUTHORIZED_PENDING_IMPLEMENTATION')
  assert.equal(result.execution.status, 'AUTHORIZED_PENDING_IMPLEMENTATION')
  assert.equal(result.execution.appliedAt, null)
  assert.equal(repo.writes, 1)
})

test('missing or inconsistent finalization data fails closed', async t => {
  const cases = [
    ['missing case', authorization({ casePresent: false }), 'CASE_MISSING'],
    ['missing decision', authorization({ decisionPresent: false }), 'FINAL_DECISION_MISSING'],
    ['waived decision', authorization({ outcome: responsibilityCaseState.FINAL_WAIVED }), 'FINAL_DECISION_NOT_UPHELD'],
    ['evidence mismatch', authorization({ decisionHash: 'different' }), 'FINAL_DECISION_EVIDENCE_MISMATCH'],
    ['missing policy', authorization({ policyVersion: '' }), 'FINAL_DECISION_INCOMPLETE'],
    ['missing finalized timestamp', authorization({ finalizedAt: null }), 'FINAL_DECISION_INCOMPLETE'],
  ]
  for (const [name, auth, reason] of cases) {
    await t.test(name, async () => {
      const repo = repository(auth)
      const result = await applyFinalizedResponsibilityConsequences(CASE_ID, { repository: repo, clock })
      assert.deepEqual(result, { status: 'BLOCKED', caseId: CASE_ID, reason })
      assert.equal(repo.writes, 0)
    })
  }
})

test('duplicate execution reuses one logical authorization', async () => {
  const repo = repository()
  const first = await applyFinalizedResponsibilityConsequences(CASE_ID, { repository: repo, clock })
  const second = await applyFinalizedResponsibilityConsequences(CASE_ID, { repository: repo, clock })
  assert.equal(first.execution.id, second.execution.id)
  assert.equal(second.reused, true)
  assert.equal(repo.writes, 1)
})

test('concurrent execution has one logical authorization', async () => {
  const auth = authorization()
  let execution = null
  let writes = 0
  const repo = {
    findAuthorization: async () => auth,
    recordAuthorization: async record => {
      await Promise.resolve()
      if (!execution) {
        writes += 1
        execution = { id: 'execution-1', attemptCount: 1, ...record }
        return { execution, reused: false }
      }
      return { execution, reused: true }
    },
  }
  const [a, b] = await Promise.all([
    applyFinalizedResponsibilityConsequences(CASE_ID, { repository: repo, clock }),
    applyFinalizedResponsibilityConsequences(CASE_ID, { repository: repo, clock }),
  ])
  assert.equal(a.execution.id, b.execution.id)
  assert.equal(writes, 1)
})
