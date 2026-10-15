import test from 'node:test'
import assert from 'node:assert/strict'

import { responsibilityEvidenceHash } from '../services/responsibilityAnalyst.js'
import {
  createResponsibilityEvidence,
  evidenceCategory,
  responsibilityCaseType,
} from '../services/responsibilityEvidence.js'
import { provisionalResponsibilityRoute } from '../services/responsibilityPolicyGate.js'
import { RESPONSIBILITY_CONSEQUENCE_STATUS } from '../services/responsibilityConsequences.js'
import {
  applyAuthorizedResponsibilityFinancialConsequences,
} from '../services/responsibilityFinancialConsequences.js'

const NOW = new Date('2026-09-27T08:00:00.000Z')
const POLICY_VERSION = 'phase6c-unit-v1'

function createHarness({ farePaise = 100_000, finalization = 'AUTO' } = {}) {
  const caseId = 'case-1'
  const bookingId = 'booking-1'
  const driverId = 'driver-1'
  const userId = 'user-1'
  const cancellationId = 'cancellation-1'
  const evidence = createResponsibilityEvidence({
    caseId,
    caseType: responsibilityCaseType.DRIVER_CANCELLATION,
    bookingId,
    occurredAt: NOW,
    clock: { now: () => new Date(NOW) },
  })
  evidence.record({
    category: evidenceCategory.BOOKING,
    kind: 'booking_state_at_driver_cancellation',
    source: 'booking',
    value: {
      bookingId,
      userId,
      fareBasis: 'BOOKING_FARE_AT_INCIDENT',
      authoritativeFarePaise: farePaise,
    },
  })
  evidence.record({
    category: evidenceCategory.ASSIGNMENT,
    kind: 'assigned_driver_at_cancellation',
    source: 'assignment',
    value: { driverId },
  })
  evidence.record({
    category: evidenceCategory.CANCELLATION,
    kind: 'driver_cancellation_recorded',
    source: 'cancellation',
    value: { cancellationId, initiator: 'driver' },
  })
  const evidenceSnapshot = structuredClone(evidence.snapshot())
  const evidenceHash = responsibilityEvidenceHash(evidenceSnapshot)
  const provisionalDecision = {
    id: 'provisional-1',
    route: finalization === 'AUTO' || finalization === 'APPEAL_AUTO'
      ? provisionalResponsibilityRoute.PROVISIONAL_AUTO_UPHELD
      : provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW,
    evidenceHash,
    policyVersion: POLICY_VERSION,
  }
  const adminReview = finalization === 'ADMIN' || finalization === 'APPEAL_ADMIN'
    ? {
        id: 'admin-review-1',
        decision: 'UPHOLD',
        classification: 'DRIVER_CAUSED',
        evidenceHash,
        policyVersion: POLICY_VERSION,
      }
    : null
  const appealId = finalization === 'APPEAL_AUTO' || finalization === 'APPEAL_ADMIN'
    ? 'appeal-1'
    : null
  const appealWindow = appealId
    ? {
        sourceDecisionType: adminReview ? 'ADMIN' : 'AUTO',
        sourceDecisionId: adminReview?.id ?? provisionalDecision.id,
      }
    : null
  const appealReview = appealId
    ? {
        outcome: 'UPHOLD',
        appealId,
        classification: 'DRIVER_CAUSED',
        evidenceHash,
        policyVersion: POLICY_VERSION,
      }
    : null
  const decision = {
    id: 'decision-1',
    outcome: 'FINAL_UPHELD',
    classification: 'DRIVER_CAUSED',
    evidenceHash,
    policyVersion: POLICY_VERSION,
    finalizedAt: new Date(NOW),
    source: appealId ? 'APPEAL_REVIEW' : adminReview ? 'NO_APPEAL_ADMIN' : 'NO_APPEAL_AUTO',
    appealId,
  }
  const authorization = {
    caseId,
    finalDecisionId: decision.id,
    policyVersion: POLICY_VERSION,
    finalizedAt: new Date(NOW),
    status: RESPONSIBILITY_CONSEQUENCE_STATUS,
    financialAppliedAt: null,
    financialAttemptedAt: null,
    financialLastError: null,
  }
  const state = {
    locked: true,
    responsibilityCase: {
      id: caseId,
      caseType: responsibilityCaseType.DRIVER_CANCELLATION,
      bookingId,
      state: 'FINAL_UPHELD',
      evidenceSnapshot,
      evidenceHash,
    },
    decision,
    authorization,
    provisionalDecision,
    adminReview,
    appealReview,
    appealWindow,
    booking: { userId },
    cancellation: { bookingId, driverId },
    liability: null,
    compensation: null,
    entry: null,
    creates: { liability: 0, compensation: 0, entry: 0 },
    updateManyCalls: 0,
    authorizationUpdates: [],
    queries: {},
  }
  const tx = {
    $queryRaw: async (strings, ...values) => {
      state.queries.lock = { sql: strings.join('?'), values }
      return state.locked ? [{ id: caseId }] : []
    },
    responsibilityCase: { findUniqueOrThrow: async query => {
      state.queries.responsibilityCase = query
      return state.responsibilityCase
    } },
    responsibilityFinalDecision: { findUnique: async query => {
      state.queries.finalDecision = query
      return state.decision
    } },
    responsibilityConsequenceExecution: {
      findUnique: async query => {
        state.queries.authorization = query
        return state.authorization
      },
      update: async ({ where, data }) => {
        state.authorizationUpdates.push({ where, data })
        Object.assign(state.authorization, data)
        return state.authorization
      },
      updateMany: async ({ where, data }) => {
        state.authorizationUpdates.push({ where, data })
        state.updateManyCalls += 1
        if (state.authorization.financialAppliedAt) return { count: 0 }
        Object.assign(state.authorization, data)
        return { count: 1 }
      },
    },
    responsibilityProvisionalDecision: { findUnique: async query => {
      state.queries.provisionalDecision = query
      return state.provisionalDecision
    } },
    responsibilityAdminReview: { findUnique: async query => {
      state.queries.adminReview = query
      return state.adminReview
    } },
    responsibilityAppealReview: { findUnique: async query => {
      state.queries.appealReview = query
      return state.appealReview
    } },
    responsibilityAppealWindow: { findUnique: async query => {
      state.queries.appealWindow = query
      return state.appealWindow
    } },
    booking: { findUnique: async query => {
      state.queries.booking = query
      return state.booking
    } },
    driverCancellation: { findUnique: async query => {
      state.queries.cancellation = query
      return state.cancellation
    } },
    responsibilityLiability: {
      findUnique: async query => {
        state.queries.liability = query
        return state.liability
      },
      create: async ({ data }) => {
        state.creates.liability += 1
        state.liability = { id: 'liability-1', ...data }
        return state.liability
      },
    },
    responsibilityCompensation: {
      findUnique: async query => {
        state.queries.compensation = query
        return state.compensation
      },
      create: async ({ data }) => {
        state.creates.compensation += 1
        state.compensation = { id: 'compensation-1', ...data }
        return state.compensation
      },
    },
    responsibilityLiabilityEntry: {
      findUnique: async query => {
        state.queries.entry = query
        return state.entry
      },
      create: async ({ data }) => {
        state.creates.entry += 1
        state.entry = { id: 'entry-1', earningBookingId: null, ...data }
        return state.entry
      },
    },
  }
  const db = { $transaction: async callback => callback(tx) }
  const clock = { now: () => new Date(NOW) }
  const refreshEvidenceHash = () => {
    const nextHash = responsibilityEvidenceHash(state.responsibilityCase.evidenceSnapshot)
    state.responsibilityCase.evidenceHash = nextHash
    state.decision.evidenceHash = nextHash
    state.provisionalDecision.evidenceHash = nextHash
    if (state.adminReview) state.adminReview.evidenceHash = nextHash
    if (state.appealReview) state.appealReview.evidenceHash = nextHash
  }
  return { caseId, db, clock, state, refreshEvidenceHash }
}

async function expectFinancialError(harness, code) {
  await assert.rejects(
    applyAuthorizedResponsibilityFinancialConsequences(harness.caseId, {
      db: harness.db,
      clock: harness.clock,
    }),
    error => error.code === code,
  )
  assert.equal(harness.state.creates.liability, 0)
  assert.equal(harness.state.creates.compensation, 0)
  assert.equal(harness.state.creates.entry, 0)
}

test('financial executor requires a case identity before opening a transaction', async () => {
  const harness = createHarness()
  await assert.rejects(
    applyAuthorizedResponsibilityFinancialConsequences('', { db: harness.db, clock: harness.clock }),
    { code: 'CASE_ID_REQUIRED' },
  )
  assert.deepEqual(harness.state.creates, { liability: 0, compensation: 0, entry: 0 })
})

test('finalized driver-caused auto/admin/appeal lineages create one auditable financial consequence', async () => {
  for (const finalization of ['AUTO', 'ADMIN', 'APPEAL_AUTO', 'APPEAL_ADMIN']) {
    const harness = createHarness({ finalization })
    const result = await applyAuthorizedResponsibilityFinancialConsequences(harness.caseId, {
      db: harness.db,
      clock: harness.clock,
    })
    assert.equal(result.reused, false, finalization)
    assert.equal(result.liability.amountPaise, 10_000, finalization)
    assert.equal(result.liability.authoritativeFarePaise, 100_000, finalization)
    assert.equal(result.liability.finalDecisionId, 'decision-1', finalization)
    assert.equal(result.liability.policyVersion, POLICY_VERSION, finalization)
    assert.equal(result.liability.rateBps, 1000, finalization)
    assert.equal(result.liability.capPaise, 10_000, finalization)
    assert.equal(result.compensation.amountPaise, 10_000, finalization)
    assert.equal(harness.state.entry.kind, 'CREATED', finalization)
    assert.equal(harness.state.entry.amountPaise, 10_000, finalization)
    assert.equal(harness.state.entry.sourceKey, 'liability-created:decision-1', finalization)
    assert.equal(harness.state.authorization.financialAppliedAt?.getTime(), NOW.getTime(), finalization)
    assert.deepEqual(harness.state.authorizationUpdates[0].where, { caseId: harness.caseId })
  }
})

test('locks the case and reads only authoritative records for that exact case', async () => {
  const harness = createHarness()
  await applyAuthorizedResponsibilityFinancialConsequences(harness.caseId, {
    db: harness.db,
    clock: harness.clock,
  })

  assert.deepEqual(harness.state.queries.lock, {
    sql: 'SELECT id FROM responsibility_cases WHERE id = ? FOR UPDATE',
    values: [harness.caseId],
  })
  for (const query of [
    harness.state.queries.finalDecision,
    harness.state.queries.authorization,
    harness.state.queries.provisionalDecision,
    harness.state.queries.adminReview,
    harness.state.queries.appealReview,
    harness.state.queries.appealWindow,
  ]) assert.deepEqual(query, { where: { caseId: harness.caseId } })
  assert.deepEqual(harness.state.queries.responsibilityCase, { where: { id: harness.caseId } })
  assert.deepEqual(harness.state.queries.booking, {
    where: { id: 'booking-1' },
    select: { userId: true },
  })
  assert.deepEqual(harness.state.queries.cancellation, {
    where: { id: 'cancellation-1' },
    select: { bookingId: true, driverId: true },
  })
})

test('replay reuses the existing consequence and repairs a missing applied marker without duplicating rows', async () => {
  const harness = createHarness()
  await applyAuthorizedResponsibilityFinancialConsequences(harness.caseId, {
    db: harness.db,
    clock: harness.clock,
  })
  assert.equal((await applyAuthorizedResponsibilityFinancialConsequences(harness.caseId, {
    db: harness.db,
    clock: harness.clock,
  })).reused, true)
  assert.deepEqual(harness.state.creates, { liability: 1, compensation: 1, entry: 1 })
  assert.equal(harness.state.updateManyCalls, 0)

  harness.state.authorization.financialAppliedAt = null
  assert.equal((await applyAuthorizedResponsibilityFinancialConsequences(harness.caseId, {
    db: harness.db,
    clock: harness.clock,
  })).reused, true)
  assert.equal(harness.state.updateManyCalls, 1)
  assert.deepEqual(harness.state.authorizationUpdates.at(-1).where, {
    caseId: harness.caseId, financialAppliedAt: null,
  })
  assert.equal(harness.state.authorization.financialAppliedAt?.getTime(), NOW.getTime())
})

test('authoritative finality and authorization mismatches fail closed', async () => {
  const cases = [
    ['CASE_MISSING', harness => { harness.state.locked = false }],
    ['CASE_NOT_FINAL_UPHELD', harness => { harness.state.responsibilityCase.state = 'PROVISIONAL_AUTO_UPHELD' }],
    ['CASE_NOT_FINAL_UPHELD', harness => { harness.state.decision.outcome = 'FINAL_WAIVED' }],
    ['CASE_NOT_FINAL_UPHELD', harness => { harness.state.decision = null }],
    ['FINAL_DECISION_INCONSISTENT', harness => { harness.state.decision.policyVersion = null }],
    ['FINAL_DECISION_INCONSISTENT', harness => { harness.state.decision.finalizedAt = null }],
    ['FINAL_DECISION_INCONSISTENT', harness => { harness.state.decision.evidenceHash = 'wrong' }],
    ['FINALIZED_AUTHORIZATION_MISSING', harness => { harness.state.authorization = null }],
    ['FINALIZED_AUTHORIZATION_MISSING', harness => { harness.state.authorization.finalDecisionId = 'wrong' }],
    ['FINALIZED_AUTHORIZATION_MISSING', harness => { harness.state.authorization.policyVersion = 'wrong' }],
    ['FINALIZED_AUTHORIZATION_MISSING', harness => { harness.state.authorization.finalizedAt = new Date(NOW.getTime() + 1) }],
    ['FINALIZED_AUTHORIZATION_MISSING', harness => { harness.state.authorization.status = 'WRONG' }],
  ]
  for (const [code, mutate] of cases) {
    const harness = createHarness()
    mutate(harness)
    await expectFinancialError(harness, code)
  }
})

test('classification and finalization lineage mismatches fail closed', async () => {
  const cases = [
    ['AUTO', harness => { harness.state.decision.classification = 'PLATFORM_CAUSED' }],
    ['AUTO', harness => { harness.state.provisionalDecision.evidenceHash = 'wrong' }],
    ['AUTO', harness => { harness.state.provisionalDecision.policyVersion = 'wrong' }],
    ['AUTO', harness => { harness.state.provisionalDecision = null }],
    ['AUTO', harness => { harness.state.decision.source = 'NO_APPEAL_ADMIN' }],
    ['AUTO', harness => { harness.state.provisionalDecision.route = provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW }],
    ['ADMIN', harness => { harness.state.adminReview.decision = 'WAIVE' }],
    ['ADMIN', harness => { harness.state.adminReview.classification = 'PLATFORM_CAUSED' }],
    ['ADMIN', harness => { harness.state.adminReview.evidenceHash = 'wrong' }],
    ['ADMIN', harness => { harness.state.adminReview.policyVersion = 'wrong' }],
    ['ADMIN', harness => { harness.state.provisionalDecision.route = provisionalResponsibilityRoute.PROVISIONAL_AUTO_UPHELD }],
    ['APPEAL_AUTO', harness => { harness.state.appealReview.outcome = 'WAIVE' }],
    ['APPEAL_AUTO', harness => { harness.state.appealReview = null }],
    ['APPEAL_AUTO', harness => { harness.state.appealReview.appealId = 'wrong' }],
    ['APPEAL_AUTO', harness => { harness.state.appealReview.classification = 'PLATFORM_CAUSED' }],
    ['APPEAL_AUTO', harness => { harness.state.appealReview.evidenceHash = 'wrong' }],
    ['APPEAL_AUTO', harness => { harness.state.appealReview.policyVersion = 'wrong' }],
    ['APPEAL_AUTO', harness => { harness.state.appealWindow.sourceDecisionType = 'ADMIN' }],
    ['APPEAL_AUTO', harness => { harness.state.appealWindow.sourceDecisionId = 'wrong' }],
    ['APPEAL_AUTO', harness => { harness.state.provisionalDecision.route = provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW }],
    ['APPEAL_AUTO', harness => { harness.state.decision.source = 'UNSUPPORTED' }],
    ['APPEAL_ADMIN', harness => { harness.state.appealWindow.sourceDecisionId = 'wrong' }],
  ]
  for (const [finalization, mutate] of cases) {
    const harness = createHarness({ finalization })
    mutate(harness)
    await expectFinancialError(harness, 'FINALIZED_DRIVER_CLASSIFICATION_MISSING')
  }
})

test('incident evidence and links are independently required before any financial write', async () => {
  const evidenceCases = [
    ['BOOKING_FARE_EVIDENCE_MISSING', snapshot => { snapshot.timeline = snapshot.timeline.filter(item => item.kind !== 'booking_state_at_driver_cancellation') }],
    ['BOOKING_FARE_EVIDENCE_MISSING', snapshot => {
      snapshot.timeline[0].basis = 'derived'
      snapshot.timeline[0].derivedFrom = ['fixture-source']
    }],
    ['BOOKING_FARE_EVIDENCE_MISSING', snapshot => { snapshot.timeline[0].availability = 'unknown' }],
    ['DRIVER_EVIDENCE_MISSING', snapshot => { snapshot.timeline = snapshot.timeline.filter(item => item.kind !== 'assigned_driver_at_cancellation') }],
    ['CANCELLATION_EVIDENCE_MISSING', snapshot => { snapshot.timeline = snapshot.timeline.filter(item => item.kind !== 'driver_cancellation_recorded') }],
    ['INCIDENT_FINANCIAL_EVIDENCE_INVALID', snapshot => { snapshot.timeline[0].value.bookingId = 'wrong' }],
    ['INCIDENT_FINANCIAL_EVIDENCE_INVALID', snapshot => { snapshot.timeline[0].value.fareBasis = 'wrong' }],
    ['INCIDENT_FINANCIAL_EVIDENCE_INVALID', snapshot => { snapshot.timeline[0].value.authoritativeFarePaise = 1.5 }],
    ['INCIDENT_FINANCIAL_EVIDENCE_INVALID', snapshot => { snapshot.timeline[0].value.authoritativeFarePaise = 0 }],
    ['INCIDENT_FINANCIAL_EVIDENCE_INVALID', snapshot => { snapshot.timeline[0].value.userId = null }],
    ['INCIDENT_FINANCIAL_EVIDENCE_INVALID', snapshot => { snapshot.timeline[1].value.driverId = null }],
    ['INCIDENT_FINANCIAL_EVIDENCE_INVALID', snapshot => { snapshot.timeline[2].value.cancellationId = null }],
    ['INCIDENT_FINANCIAL_EVIDENCE_INVALID', snapshot => { snapshot.timeline[2].value.initiator = 'admin' }],
  ]
  for (const [code, mutate] of evidenceCases) {
    const harness = createHarness()
    mutate(harness.state.responsibilityCase.evidenceSnapshot)
    harness.refreshEvidenceHash()
    await expectFinancialError(harness, code)
  }

  const tampered = createHarness()
  tampered.state.responsibilityCase.evidenceHash = 'tampered'
  tampered.state.decision.evidenceHash = 'tampered'
  tampered.state.provisionalDecision.evidenceHash = 'tampered'
  await expectFinancialError(tampered, 'EVIDENCE_HASH_MISMATCH')

  for (const [caseType, reason] of [
    ['DRIVER_OFFLINE', 'FINANCIAL_SEMANTICS_UNSUPPORTED_DRIVER_OFFLINE'],
    ['DRIVER_LATE', 'FINANCIAL_SEMANTICS_UNSUPPORTED_DRIVER_LATE'],
    ['RIDER_CANCELLATION', 'FINANCIAL_SEMANTICS_UNSUPPORTED_RIDER_CANCELLATION'],
    ['FAILED_PICKUP', 'FINANCIAL_SEMANTICS_UNSUPPORTED_FAILED_PICKUP'],
    ['REPLACEMENT_FAILURE', 'FINANCIAL_SEMANTICS_UNSUPPORTED_REPLACEMENT_FAILURE'],
    ['PLATFORM_ASSIGNMENT_FAILURE', 'FINANCIAL_CASE_TYPE_NON_FINANCIAL'],
  ]) {
    const unsupported = createHarness()
    unsupported.state.responsibilityCase.caseType = caseType
    await expectFinancialError(unsupported, reason)
  }

  const tinyFare = createHarness({ farePaise: 1 })
  await expectFinancialError(tinyFare, 'LIABILITY_AMOUNT_INVALID')

  const linkCases = [
    harness => { harness.state.booking = null },
    harness => { harness.state.booking.userId = 'wrong' },
    harness => { harness.state.cancellation = null },
    harness => { harness.state.cancellation.bookingId = 'wrong' },
    harness => { harness.state.cancellation.driverId = 'wrong' },
  ]
  for (const mutate of linkCases) {
    const harness = createHarness()
    mutate(harness)
    await expectFinancialError(harness, 'INCIDENT_LINK_MISMATCH')
  }
})

test('existing financial rows must exactly match the authoritative final decision', async () => {
  const mutations = [
    harness => { harness.state.liability.caseId = 'wrong' },
    harness => { harness.state.liability.finalDecisionId = 'wrong' },
    harness => { harness.state.liability.driverId = 'wrong' },
    harness => { harness.state.liability.bookingId = 'wrong' },
    harness => { harness.state.liability.authoritativeFarePaise = 1 },
    harness => { harness.state.liability.rateBps = 1 },
    harness => { harness.state.liability.capPaise = 1 },
    harness => { harness.state.liability.amountPaise = 1 },
    harness => { harness.state.liability.policyVersion = 'wrong' },
    harness => { harness.state.compensation.caseId = 'wrong' },
    harness => { harness.state.compensation.liabilityId = 'wrong' },
    harness => { harness.state.compensation.userId = 'wrong' },
    harness => { harness.state.compensation.amountPaise = 1 },
    harness => { harness.state.entry.liabilityId = 'wrong' },
    harness => { harness.state.entry.sourceKey = 'wrong' },
    harness => { harness.state.entry.earningBookingId = 'wrong' },
    harness => { harness.state.entry.amountPaise = 1 },
    harness => { harness.state.entry.kind = 'RECOVERY' },
    harness => { harness.state.compensation = null },
    harness => { harness.state.entry = null },
  ]
  for (const mutate of mutations) {
    const harness = createHarness()
    await applyAuthorizedResponsibilityFinancialConsequences(harness.caseId, {
      db: harness.db,
      clock: harness.clock,
    })
    mutate(harness)
    await assert.rejects(
      applyAuthorizedResponsibilityFinancialConsequences(harness.caseId, {
        db: harness.db,
        clock: harness.clock,
      }),
      error => error.code === 'FINANCIAL_CONSEQUENCE_INCONSISTENT',
    )
    assert.deepEqual(harness.state.creates, { liability: 1, compensation: 1, entry: 1 })
  }
})

test('replay loads existing financial rows by authoritative keys', async () => {
  const harness = createHarness()
  await applyAuthorizedResponsibilityFinancialConsequences(harness.caseId, {
    db: harness.db,
    clock: harness.clock,
  })
  await applyAuthorizedResponsibilityFinancialConsequences(harness.caseId, {
    db: harness.db,
    clock: harness.clock,
  })

  assert.deepEqual(harness.state.queries.liability, { where: { caseId: harness.caseId } })
  assert.deepEqual(harness.state.queries.compensation, { where: { caseId: harness.caseId } })
  assert.deepEqual(harness.state.queries.entry, {
    where: { sourceKey: 'liability-created:decision-1' },
  })
})
