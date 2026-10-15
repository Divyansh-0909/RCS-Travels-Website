import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

import { createTestDatabase } from '../helpers/database.js'
import { createScheduledScenario } from '../helpers/scheduledScenario.js'
import { createTestClock } from '../helpers/testClock.js'
import { responsibilityCaseState } from '../../services/responsibilityCaseState.js'
import { responsibilityClassification } from '../../services/responsibilityContracts.js'
import { createResponsibilityEvidence } from '../../services/responsibilityEvidence.js'
import { responsibilityEvidenceHash } from '../../services/responsibilityAnalyst.js'
import { createPrismaResponsibilityLifecycleRepository } from '../../services/responsibilityLifecycleRepository.js'
import {
  submitDriverAppeal,
  reviewResponsibilityAppeal,
} from '../../services/responsibilityAppealService.js'
import {
  finalizeNoAppeal,
  processFinalizationHandoff,
} from '../../services/responsibilityFinalizationService.js'
import {
  ADVERSE_NOTICE_PURPOSE,
  syncAppealWindowForProviderMessage,
} from '../../services/responsibilityNoticeService.js'

const POLICY_VERSION = 'phase6b-postgres-v1'
const EVIDENCE_VERSION = 'phase6b-evidence-v1'
const APPEAL_WINDOW_MS = 24 * 60 * 60 * 1000

const at = value => new Date(value)

async function seedCase(database, {
  state,
  appealStartedAt = null,
  appealDeadline = null,
  route = 'PROVISIONAL_AUTO_UPHELD',
} = {}) {
  // Phase 6B only needs a normal responsibility-case driver. The shared real-DB
  // test database enforces the production invariant that there is only one
  // `admin` (owner-driver) row, so keep this fixture out of that reserved group.
  const scenario = createScheduledScenario({ drivers: { admin: { group: 'partner' } } })
  await scenario.persist(database.client)

  const caseId = `phase6b-${randomUUID()}`
  const booking = scenario.bookingStates.current
  const cancellation = await database.client.driverCancellation.create({ data: {
    bookingId: booking.id, driverId: scenario.driversByGroup.rcs.id,
    fromStatus: booking.status, reason: 'phase6b-synthetic', createdAt: scenario.now,
  } })
  const builder = createResponsibilityEvidence({ caseId, bookingId: booking.id,
    caseType: 'DRIVER_CANCELLATION', clock: { now: () => scenario.now } })
  for (const [category, kind, value] of [
    ['assignment', 'assigned_driver_at_cancellation', { driverId: cancellation.driverId }],
    ['cancellation', 'driver_cancellation_recorded', { cancellationId: cancellation.id, initiator: 'driver' }],
  ]) builder.record({ category, kind, source: 'phase6b-authoritative-fixture',
    observedAt: scenario.now, receivedAt: scenario.now, value })
  const evidenceSnapshot = builder.snapshot()
  const evidenceHash = responsibilityEvidenceHash(evidenceSnapshot)
  const responsibilityCase = await database.client.responsibilityCase.create({
    data: {
      id: caseId,
      bookingId: booking.id,
      caseType: 'DRIVER_CANCELLATION',
      state,
      evidenceVersion: EVIDENCE_VERSION,
      evidenceHash,
      evidenceSnapshot,
      scheduledAt: booking.scheduledAt,
      occurredAt: scenario.now,
    },
  })
  const decision = await database.client.responsibilityProvisionalDecision.create({
    data: {
      caseId,
      evidenceVersion: EVIDENCE_VERSION,
      evidenceHash,
      analysisId: null,
      analysisVersion: 'phase5-contract-v1',
      policyVersion: POLICY_VERSION,
      route,
      reasons: [],
      passedGates: [],
      failedGates: [],
      humanReviewRequired: route === 'NEEDS_ADMIN_REVIEW',
      evaluatedAt: scenario.now,
    },
  })

  let appealWindow = null
  if ([
    responsibilityCaseState.PROVISIONAL_AUTO_UPHELD,
    responsibilityCaseState.APPEAL_WINDOW,
    responsibilityCaseState.APPEAL_OPEN,
    responsibilityCaseState.APPEAL_REVIEW,
  ].includes(state)) {
    appealWindow = await database.client.responsibilityAppealWindow.create({
      data: {
        caseId,
        sourceDecisionId: decision.id,
        sourceDecisionType: 'AUTO',
        noticeRetryKey: `responsibility-adverse:${caseId}:${decision.id}`,
        appealStartedAt,
        appealDeadline,
      },
    })
  }

  return {
    caseId,
    evidenceHash,
    responsibilityCase,
    decision,
    appealWindow,
    scenario,
    booking,
    driverId: scenario.driversByGroup.rcs.id,
  }
}

async function seedOpenAppeal(database, nowIso) {
  const now = at(nowIso)
  const seeded = await seedCase(database, {
    state: responsibilityCaseState.APPEAL_WINDOW,
    appealStartedAt: new Date(now.getTime() - 60 * 60 * 1000),
    appealDeadline: new Date(now.getTime() + 60 * 60 * 1000),
  })
  const repository = createPrismaResponsibilityLifecycleRepository(database.client)
  const result = await submitDriverAppeal({
    caseId: seeded.caseId,
    driverId: seeded.driverId,
    reason: 'The recorded circumstances are incomplete.',
  }, {
    repository,
    clock: createTestClock(nowIso),
  })
  return { ...seeded, appeal: result.appeal }
}

test('Phase 6B real PostgreSQL lifecycle preserves notice, appeal, finalization, and handoff races', async t => {
  const database = await createTestDatabase()
  t.after(() => database.close())

  await t.test('confirmed delivery starts the clock once and provider acceptance does not', async () => {
    const seeded = await seedCase(database, { state: responsibilityCaseState.PROVISIONAL_AUTO_UPHELD })
    const acceptedAt = at('2026-09-25T18:40:00.000Z')
    const deliveredAt = at('2026-09-25T18:42:00.000Z')
    const laterDeliveredAt = at('2026-09-25T18:50:00.000Z')

    await database.client.notificationDelivery.create({
      data: {
        provider: 'whatsapp',
        channel: 'whatsapp',
        recipient: seeded.scenario.driversByGroup.rcs.phone,
        providerMessageId: `wamid-${randomUUID()}`,
        status: 'accepted',
        bookingId: seeded.booking.id,
        purpose: ADVERSE_NOTICE_PURPOSE,
        retryKey: seeded.appealWindow.noticeRetryKey,
        attemptedAt: acceptedAt,
        providerAcceptedAt: acceptedAt,
      },
    })
    const accepted = await database.client.notificationDelivery.findFirstOrThrow({
      where: { retryKey: seeded.appealWindow.noticeRetryKey },
    })
    await syncAppealWindowForProviderMessage(accepted.providerMessageId, { db: database.client })
    let storedWindow = await database.client.responsibilityAppealWindow.findUniqueOrThrow({ where: { caseId: seeded.caseId } })
    assert.equal(storedWindow.appealStartedAt, null)
    assert.equal(storedWindow.appealDeadline, null)
    assert.equal((await database.client.responsibilityCase.findUniqueOrThrow({ where: { id: seeded.caseId } })).state, responsibilityCaseState.PROVISIONAL_AUTO_UPHELD)

    await database.client.notificationDelivery.update({
      where: { id: accepted.id },
      data: { status: 'delivered', deliveredAt },
    })
    await syncAppealWindowForProviderMessage(accepted.providerMessageId, { db: database.client })
    storedWindow = await database.client.responsibilityAppealWindow.findUniqueOrThrow({ where: { caseId: seeded.caseId } })
    assert.equal(storedWindow.appealStartedAt.toISOString(), deliveredAt.toISOString())
    assert.equal(storedWindow.appealDeadline.toISOString(), new Date(deliveredAt.getTime() + APPEAL_WINDOW_MS).toISOString())
    assert.equal((await database.client.responsibilityCase.findUniqueOrThrow({ where: { id: seeded.caseId } })).state, responsibilityCaseState.APPEAL_WINDOW)

    const later = await database.client.notificationDelivery.create({
      data: {
        provider: 'push',
        channel: 'push',
        recipient: seeded.driverId,
        providerMessageId: `push-${randomUUID()}`,
        status: 'delivered',
        bookingId: seeded.booking.id,
        purpose: ADVERSE_NOTICE_PURPOSE,
        retryKey: seeded.appealWindow.noticeRetryKey,
        attemptedAt: laterDeliveredAt,
        deliveredAt: laterDeliveredAt,
      },
    })
    await syncAppealWindowForProviderMessage(later.providerMessageId, { db: database.client })
    const unchanged = await database.client.responsibilityAppealWindow.findUniqueOrThrow({ where: { caseId: seeded.caseId } })
    assert.equal(unchanged.appealStartedAt.toISOString(), deliveredAt.toISOString())
    assert.equal(unchanged.appealDeadline.toISOString(), new Date(deliveredAt.getTime() + APPEAL_WINDOW_MS).toISOString())
  })

  await t.test('concurrent duplicate appeals create one logical appeal', async () => {
    const nowIso = '2026-09-26T12:00:00.000Z'
    const now = at(nowIso)
    const seeded = await seedCase(database, {
      state: responsibilityCaseState.APPEAL_WINDOW,
      appealStartedAt: new Date(now.getTime() - 60 * 60 * 1000),
      appealDeadline: new Date(now.getTime() + 60 * 60 * 1000),
    })
    const clientA = database.connect()
    const clientB = database.connect()
    const request = repository => submitDriverAppeal({
      caseId: seeded.caseId,
      driverId: seeded.driverId,
      reason: 'Please review the route and location evidence again.',
    }, { repository, clock: createTestClock(nowIso) })

    const results = await Promise.all([
      request(createPrismaResponsibilityLifecycleRepository(clientA)),
      request(createPrismaResponsibilityLifecycleRepository(clientB)),
    ])
    assert.equal(await database.client.responsibilityAppeal.count({ where: { caseId: seeded.caseId } }), 1)
    assert.equal(results.filter(result => result.reused === false).length, 1)
    assert.equal(results.filter(result => result.reused === true).length, 1)
    assert.equal(results[0].appeal.id, results[1].appeal.id)
  })

  await t.test('appeal and no-appeal finalization race cannot both win', async () => {
    const deadline = at('2026-09-26T18:42:00.000Z')
    const seeded = await seedCase(database, {
      state: responsibilityCaseState.APPEAL_WINDOW,
      appealStartedAt: new Date(deadline.getTime() - APPEAL_WINDOW_MS),
      appealDeadline: deadline,
    })
    const appealRepository = createPrismaResponsibilityLifecycleRepository(database.connect())
    const finalizationRepository = createPrismaResponsibilityLifecycleRepository(database.connect())

    const raced = await Promise.allSettled([
      submitDriverAppeal({
        caseId: seeded.caseId,
        driverId: seeded.driverId,
        reason: 'Appeal submitted at the inclusive deadline.',
      }, { repository: appealRepository, clock: createTestClock(deadline.toISOString()) }),
      finalizeNoAppeal(seeded.caseId, {
        repository: finalizationRepository,
        clock: createTestClock(new Date(deadline.getTime() + 1).toISOString()),
        authorize: false,
      }),
    ])

    const appealCount = await database.client.responsibilityAppeal.count({ where: { caseId: seeded.caseId } })
    const finalCount = await database.client.responsibilityFinalDecision.count({ where: { caseId: seeded.caseId } })
    assert.equal(appealCount + finalCount, 1)
    if (appealCount === 1) {
      assert.equal(raced[0].status, 'fulfilled')
      assert.equal(raced[1].status, 'rejected')
      assert.equal((await database.client.responsibilityCase.findUniqueOrThrow({ where: { id: seeded.caseId } })).state, responsibilityCaseState.APPEAL_OPEN)
    } else {
      assert.equal(raced[1].status, 'fulfilled')
      assert.equal(raced[0].status, 'rejected')
      assert.equal((await database.client.responsibilityCase.findUniqueOrThrow({ where: { id: seeded.caseId } })).state, responsibilityCaseState.FINAL_UPHELD)
    }
  })

  await t.test('duplicate finalization workers persist one final outcome and one handoff', async () => {
    const deadline = at('2026-09-26T18:42:00.000Z')
    const seeded = await seedCase(database, {
      state: responsibilityCaseState.APPEAL_WINDOW,
      appealStartedAt: new Date(deadline.getTime() - APPEAL_WINDOW_MS),
      appealDeadline: deadline,
    })
    const clock = createTestClock(new Date(deadline.getTime() + 1).toISOString())
    const calls = [database.connect(), database.connect()].map(client => finalizeNoAppeal(seeded.caseId, {
      repository: createPrismaResponsibilityLifecycleRepository(client),
      clock,
      authorize: false,
    }))
    const results = await Promise.all(calls)

    assert.equal(await database.client.responsibilityFinalDecision.count({ where: { caseId: seeded.caseId } }), 1)
    assert.equal(await database.client.responsibilityFinalizationHandoff.count({ where: { caseId: seeded.caseId } }), 1)
    assert.equal(results.filter(result => result.reused === false).length, 1)
    assert.equal(results.filter(result => result.reused === true).length, 1)
    assert.equal(results[0].finalDecision.id, results[1].finalDecision.id)
  })

  await t.test('conflicting concurrent appeal outcomes produce one immutable authoritative final result', async () => {
    const seeded = await seedOpenAppeal(database, '2026-09-26T13:00:00.000Z')
    const clock = createTestClock('2026-09-26T14:00:00.000Z')
    const makeReview = (client, outcome, reviewerId) => reviewResponsibilityAppeal({
      caseId: seeded.caseId,
      reviewerId,
      outcome,
      classification: outcome === 'UPHOLD' ? responsibilityClassification.DRIVER_CAUSED : null,
      reason: `Reviewer selected ${outcome.toLowerCase()} after examining the appeal.`,
    }, {
      repository: createPrismaResponsibilityLifecycleRepository(client),
      clock,
      authorize: false,
    })

    const raced = await Promise.allSettled([
      makeReview(database.connect(), 'UPHOLD', 'admin-uphold'),
      makeReview(database.connect(), 'WAIVE', 'admin-waive'),
    ])
    assert.equal(raced.filter(result => result.status === 'fulfilled').length, 1)
    assert.equal(raced.filter(result => result.status === 'rejected').length, 1)
    const rejection = raced.find(result => result.status === 'rejected')
    assert.equal(rejection.reason.code, 'FINAL_OUTCOME_CONFLICT')
    assert.equal(await database.client.responsibilityFinalDecision.count({ where: { caseId: seeded.caseId } }), 1)
    assert.equal(await database.client.responsibilityAppealReview.count({ where: { caseId: seeded.caseId } }), 1)

    const finalDecision = await database.client.responsibilityFinalDecision.findUniqueOrThrow({ where: { caseId: seeded.caseId } })
    const storedCase = await database.client.responsibilityCase.findUniqueOrThrow({ where: { id: seeded.caseId } })
    assert.equal(storedCase.state, finalDecision.outcome)
  })

  await t.test('final decision appeal references must exist and belong to the same case', async () => {
    const first = await seedOpenAppeal(database, '2026-09-26T13:00:00.000Z')
    const second = await seedOpenAppeal(database, '2026-09-26T13:01:00.000Z')
    const legacy = await seedCase(database, { state: responsibilityCaseState.NEEDS_ADMIN_REVIEW })
    const insertFinalDecision = (caseId, appealId) => database.client.$executeRawUnsafe(
      `INSERT INTO "responsibility_final_decisions" (
        "id", "case_id", "outcome", "consequence_level", "evidence_hash", "evidence_version",
        "policy_version", "source", "reason", "actor_id", "appeal_id",
        "previous_state", "finalized_at"
      ) VALUES ($1, $2, 'FINAL_UPHELD', 'LEVEL_1', $3, $4, 'phase6b-test-policy', 'APPEAL_REVIEW', 'test', 'admin-test', $5, 'APPEAL_REVIEW', $6)`,
      randomUUID(), caseId, `hash-${caseId}`, EVIDENCE_VERSION, appealId, at('2026-09-26T14:00:00.000Z'),
    )

    await assert.rejects(
      insertFinalDecision(first.caseId, randomUUID()),
      error => error?.code === 'P2010' && error.message.includes('responsibility_final_decisions_case_id_appeal_id_fkey'),
    )
    await assert.rejects(
      insertFinalDecision(first.caseId, second.appeal.id),
      error => error?.code === 'P2010' && error.message.includes('responsibility_final_decisions_case_id_appeal_id_fkey'),
    )
    await insertFinalDecision(first.caseId, first.appeal.id)
    await insertFinalDecision(legacy.caseId, null)
  })

  await t.test('only one worker claims a handoff and stale claim fencing rejects the superseded worker', async () => {
    const deadline = at('2026-09-26T18:42:00.000Z')
    const seeded = await seedCase(database, {
      state: responsibilityCaseState.APPEAL_WINDOW,
      appealStartedAt: new Date(deadline.getTime() - APPEAL_WINDOW_MS),
      appealDeadline: deadline,
    })
    await finalizeNoAppeal(seeded.caseId, {
      repository: createPrismaResponsibilityLifecycleRepository(database.client),
      clock: createTestClock(new Date(deadline.getTime() + 1).toISOString()),
      authorize: false,
    })

    let executorCalls = 0
    let releaseExecutor
    let signalExecutorStarted
    const executorStarted = new Promise(resolve => { signalExecutorStarted = resolve })
    const executorGate = new Promise(resolve => { releaseExecutor = resolve })
    const consequenceExecutor = async () => {
      executorCalls += 1
      signalExecutorStarted()
      await executorGate
      return { status: 'AUTHORIZED' }
    }
    const processClock = createTestClock('2026-09-26T19:00:00.000Z')
    const workerA = processFinalizationHandoff(seeded.caseId, {
      repository: createPrismaResponsibilityLifecycleRepository(database.connect()),
      consequenceExecutor,
      clock: processClock,
    })
    await executorStarted
    const workerB = await processFinalizationHandoff(seeded.caseId, {
      repository: createPrismaResponsibilityLifecycleRepository(database.connect()),
      consequenceExecutor,
      clock: processClock,
    })
    assert.equal(workerB.reused, true)
    assert.equal(workerB.inProgress, true)
    releaseExecutor()
    await workerA
    assert.equal(executorCalls, 1)
    assert.equal((await database.client.responsibilityFinalizationHandoff.findUniqueOrThrow({ where: { caseId: seeded.caseId } })).status, 'COMPLETED')

    const stale = await seedCase(database, {
      state: responsibilityCaseState.APPEAL_WINDOW,
      appealStartedAt: new Date(deadline.getTime() - APPEAL_WINDOW_MS),
      appealDeadline: deadline,
    })
    await finalizeNoAppeal(stale.caseId, {
      repository: createPrismaResponsibilityLifecycleRepository(database.client),
      clock: createTestClock(new Date(deadline.getTime() + 1).toISOString()),
      authorize: false,
    })
    const repository = createPrismaResponsibilityLifecycleRepository(database.client)
    const handoff = await repository.findHandoff(stale.caseId)
    const oldClaimedAt = at('2026-09-26T19:10:00.000Z')
    const newClaimedAt = at('2026-09-26T19:20:00.000Z')
    const oldClaim = await repository.claimHandoff(handoff.id, oldClaimedAt, at('2026-09-26T19:05:00.000Z'))
    assert.equal(oldClaim.count, 1)
    const reclaimed = await repository.claimHandoff(handoff.id, newClaimedAt, at('2026-09-26T19:15:00.000Z'))
    assert.equal(reclaimed.count, 1)
    assert.equal((await repository.markHandoffCompleted(handoff.id, oldClaimedAt, at('2026-09-26T19:21:00.000Z'))).count, 0)
    assert.equal((await repository.markHandoffCompleted(handoff.id, newClaimedAt, at('2026-09-26T19:22:00.000Z'))).count, 1)
  })

  await t.test('failed handoff remains retryable after durable finalization', async () => {
    const deadline = at('2026-09-26T18:42:00.000Z')
    const seeded = await seedCase(database, {
      state: responsibilityCaseState.APPEAL_WINDOW,
      appealStartedAt: new Date(deadline.getTime() - APPEAL_WINDOW_MS),
      appealDeadline: deadline,
    })
    const repository = createPrismaResponsibilityLifecycleRepository(database.client)
    await finalizeNoAppeal(seeded.caseId, {
      repository,
      clock: createTestClock(new Date(deadline.getTime() + 1).toISOString()),
      authorize: false,
    })
    await assert.rejects(processFinalizationHandoff(seeded.caseId, {
      repository,
      clock: createTestClock('2026-09-26T19:00:00.000Z'),
      consequenceExecutor: async () => { throw new Error('simulated handoff crash') },
    }), /simulated handoff crash/)
    let handoff = await repository.findHandoff(seeded.caseId)
    assert.equal(handoff.status, 'PENDING')
    assert.match(handoff.lastError, /simulated handoff crash/)

    let calls = 0
    await processFinalizationHandoff(seeded.caseId, {
      repository,
      clock: createTestClock('2026-09-26T19:01:00.000Z'),
      consequenceExecutor: async () => {
        calls += 1
        return { status: 'AUTHORIZED' }
      },
    })
    handoff = await repository.findHandoff(seeded.caseId)
    assert.equal(calls, 1)
    assert.equal(handoff.status, 'COMPLETED')
    assert.equal(handoff.attemptCount, 2)
  })

  await t.test('lifecycle transaction rollback leaves no partial admin decision or state change', async () => {
    const seeded = await seedCase(database, {
      state: responsibilityCaseState.NEEDS_ADMIN_REVIEW,
      route: 'NEEDS_ADMIN_REVIEW',
    })
    const repository = createPrismaResponsibilityLifecycleRepository(database.client)
    await assert.rejects(repository.withLockedCase(seeded.caseId, async (lockedRepository, responsibilityCase) => {
      await lockedRepository.createAdminReview({
        caseId: seeded.caseId,
        adminActorId: 'admin-rollback',
        decision: 'UPHOLD',
        reason: 'This write should roll back with the enclosing transaction.',
        decidedAt: at('2026-09-26T15:00:00.000Z'),
        evidenceVersion: responsibilityCase.evidenceVersion,
        evidenceHash: responsibilityCase.evidenceHash,
        policyVersion: POLICY_VERSION,
        previousState: responsibilityCase.state,
        classification: responsibilityClassification.DRIVER_CAUSED,
        consequenceLevel: 'LEVEL_1',
      })
      await lockedRepository.setCaseState(seeded.caseId, responsibilityCaseState.PROVISIONAL_ADMIN_UPHELD)
      throw new Error('intentional rollback')
    }), /intentional rollback/)
    assert.equal(await database.client.responsibilityAdminReview.count({ where: { caseId: seeded.caseId } }), 0)
    assert.equal((await database.client.responsibilityCase.findUniqueOrThrow({ where: { id: seeded.caseId } })).state, responsibilityCaseState.NEEDS_ADMIN_REVIEW)
  })
})
