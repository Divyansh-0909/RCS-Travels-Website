import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readdir } from 'node:fs/promises'

import { createTestDatabase } from '../helpers/database.js'
import { createScheduledScenario } from '../helpers/scheduledScenario.js'
import { createTestClock } from '../helpers/testClock.js'
import { createResponsibilityAnalystFake } from '../helpers/responsibilityAnalystFake.js'
import { cancelDriverRideInTransaction } from '../../services/driverRideCancellation.js'
import {
  createResponsibilityEvidence,
  evidenceCategory,
  responsibilityCaseType,
} from '../../services/responsibilityEvidence.js'
import { responsibilityEvidenceHash } from '../../services/responsibilityAnalyst.js'
import {
  createResponsibilityShadowAdjudicator,
  sweepResponsibilityShadowAdjudication,
} from '../../services/responsibilityShadowAdjudication.js'
import {
  createPrismaResponsibilityShadowRepository,
  enqueueResponsibilityShadowEvidence,
} from '../../services/responsibilityShadowRepository.js'
import { RESPONSIBILITY_SHADOW_LEASE_MS } from '../../services/responsibilityShadowConfig.js'
import { reviewResponsibilityCase } from '../../services/responsibilityReviewService.js'
import { createPrismaResponsibilityLifecycleRepository } from '../../services/responsibilityLifecycleRepository.js'
import { assertIndependentReview, consequenceState } from '../helpers/phase9dCurrentPolicyWitness.js'

// Current-policy regression v1. Historical source/failed executions are retained;
// generic cancellation observations never authorize the fake analyst's blame.

const NOW = new Date('2026-09-29T10:00:00.000Z')
const migrationsDirectory = new URL('../../prisma/migrations/', import.meta.url)

const clockAt = value => ({ now: () => new Date(value) })
const record = (journal, category, kind, options = {}) => journal.record({
  category,
  kind,
  source: options.source ?? `phase7:${category}`,
  value: options.value ?? { recorded: true },
  quality: options.quality ?? { fresh: true },
  availability: options.availability ?? 'available',
  claimKey: options.claimKey ?? null,
})

function cancellationEvidence(caseId, { extra = false } = {}) {
  const journal = createResponsibilityEvidence({
    caseId,
    caseType: responsibilityCaseType.DRIVER_CANCELLATION,
    bookingId: `booking-${caseId}`,
    occurredAt: NOW,
    scheduledAt: new Date(NOW.getTime() + 60_000),
    clock: clockAt(NOW),
  })
  record(journal, evidenceCategory.BOOKING, 'booking')
  record(journal, evidenceCategory.ASSIGNMENT, 'assignment')
  record(journal, evidenceCategory.CANCELLATION, 'cancellation')
  if (extra) record(journal, evidenceCategory.NOTIFICATION, 'late-notification')
  return journal.snapshot()
}

async function seedShadowCase(db, suffix, evidence = null) {
  const caseId = `phase7-${suffix}-${randomUUID()}`
  const snapshot = evidence ?? cancellationEvidence(caseId)
  const hash = responsibilityEvidenceHash(snapshot)
  await db.responsibilityCase.create({ data: {
    id: snapshot.caseId,
    sourceKey: `phase7-source:${snapshot.caseId}`,
    bookingId: snapshot.bookingId,
    caseType: snapshot.caseType,
    state: 'NEEDS_ADMIN_REVIEW',
    evidenceVersion: snapshot.evidenceVersion,
    evidenceHash: hash,
    evidenceSnapshot: snapshot,
    scheduledAt: snapshot.scheduledAt ? new Date(snapshot.scheduledAt) : null,
    occurredAt: snapshot.occurredAt ? new Date(snapshot.occurredAt) : null,
  } })
  const queued = await enqueueResponsibilityShadowEvidence(snapshot, { db })
  return { caseId: snapshot.caseId, snapshot, ...queued }
}

test('Phase 7 shadow orchestration is durable, concurrent, versioned, and consequence-free on real PostgreSQL', async t => {
  const database = await createTestDatabase()
  t.after(() => database.close())

  await t.test('fresh migration chain includes Phase 7 shadow tables after all Phase 5/6 migrations', async () => {
    const directories = (await readdir(migrationsDirectory, { withFileTypes: true }))
      .filter(entry => entry.isDirectory()).map(entry => entry.name).sort()
    const applied = await database.client.$queryRawUnsafe(
      'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name',
    )
    assert.deepEqual(applied.map(row => row.migration_name), directories)
    assert.ok(applied.some(row => row.migration_name === '20260929150000_phase7_shadow_adjudication'))
  })

  await t.test('current-policy v1 cancellation retries to review, then accepts only explicit human waiver', async () => {
    const scenario = createScheduledScenario({ now: NOW.toISOString() })
    await scenario.persist(database.client)
    const booking = scenario.bookingStates.current
    const driver = scenario.driversByGroup.rcs

    const first = await database.client.$transaction(tx => cancelDriverRideInTransaction(tx, booking, driver, {
      reason: 'rider_unreachable',
    }))
    assert.equal(first.status, 'confirmed')
    assert.equal(first.responsibilityCaseId, `driver-cancellation:${booking.id}:${driver.id}`)
    assert.equal((await database.client.booking.findUniqueOrThrow({ where: { id: booking.id } })).status, 'confirmed')
    assert.equal(await database.client.responsibilityCase.count({ where: { sourceKey: first.responsibilityCaseId } }), 1)
    assert.equal(await database.client.responsibilityEvidenceVersion.count({ where: { caseId: first.responsibilityCaseId } }), 1)
    assert.equal(await database.client.responsibilityAdjudicationWork.count({ where: { caseId: first.responsibilityCaseId } }), 1)
    assert.equal(await database.client.responsibilityShadowResult.count({ where: { caseId: first.responsibilityCaseId } }), 0)

    const duplicate = await database.client.$transaction(tx => cancelDriverRideInTransaction(tx, booking, driver, {
      reason: 'rider_unreachable',
    }))
    assert.equal(duplicate, null)
    assert.equal(await database.client.responsibilityCase.count({ where: { sourceKey: first.responsibilityCaseId } }), 1)
    assert.equal(await database.client.responsibilityAdjudicationWork.count({ where: { caseId: first.responsibilityCaseId } }), 1)

    const timeoutClock = createTestClock(NOW.toISOString())
    const beforeAnalysisConsequences = await consequenceState(database.client)
    const outage = await sweepResponsibilityShadowAdjudication({
      db: database.client,
      clock: timeoutClock,
      analyst: createResponsibilityAnalystFake('timeout'),
      batchSize: 1,
      env: { RESPONSIBILITY_ADJUDICATION_MODE: 'shadow' },
    })
    assert.equal(outage.outcomes[0].status, 'RETRYABLE')
    assert.equal((await database.client.booking.findUniqueOrThrow({ where: { id: booking.id } })).status, 'confirmed')
    assert.equal(await database.client.responsibilityFinalDecision.count({ where: { caseId: first.responsibilityCaseId } }), 0)

    timeoutClock.advance(31_000)
    const recovered = await sweepResponsibilityShadowAdjudication({
      db: database.client,
      clock: timeoutClock,
      analyst: createResponsibilityAnalystFake('driver_caused'),
      batchSize: 1,
      env: { RESPONSIBILITY_ADJUDICATION_MODE: 'shadow' },
    })
    assert.equal(recovered.outcomes[0].status, 'COMPLETED')
    const shadow = await database.client.responsibilityShadowResult.findFirstOrThrow({
      where: { caseId: first.responsibilityCaseId },
    })
    assert.equal(shadow.mode, 'SHADOW')
    assertIndependentReview(shadow,await database.client.responsibilityCase.findUniqueOrThrow({where:{id:shadow.caseId}}))
    assert.equal(shadow.suggestedClassification,'DRIVER_CAUSED')
    assert.equal(shadow.analysisEnvelope.output.suggestedActionCategory,'AUTO_UPHOLD_CANDIDATE')
    assert.deepEqual(await consequenceState(database.client), beforeAnalysisConsequences)

    for (const count of await Promise.all([
      database.client.responsibilityFinalDecision.count({ where: { caseId: first.responsibilityCaseId } }),
      database.client.responsibilityLiability.count({ where: { caseId: first.responsibilityCaseId } }),
      database.client.responsibilityCompensation.count({ where: { caseId: first.responsibilityCaseId } }),
      database.client.reliabilityStrike.count({ where: { responsibilityCaseId: first.responsibilityCaseId } }),
      database.client.responsibilityAppealWindow.count({ where: { caseId: first.responsibilityCaseId } }),
    ])) assert.equal(count, 0)
    assert.equal(await database.client.reliabilityBlock.count({ where: { sourceStrike: { responsibilityCaseId: first.responsibilityCaseId } } }), 0)

    const human = await reviewResponsibilityCase({
      caseId: first.responsibilityCaseId,
      adminActorId: 'phase7-admin',
      decision: 'WAIVE',
      classification: 'VALID_WAIVED',
      reason: 'Human review independently waived this case',
      expectedEvidence: {version:shadow.evidenceVersion,hash:shadow.evidenceHash},
    }, {
      repository: createPrismaResponsibilityLifecycleRepository(database.client),
      clock: timeoutClock,
      notify: false,
    })
    assert.equal(human.state, 'PROVISIONAL_ADMIN_WAIVED')
    assert.equal((await database.client.responsibilityFinalDecision.findUniqueOrThrow({
      where: { caseId: first.responsibilityCaseId },
    })).source, 'ADMIN_WAIVER')
    assert.equal(await database.client.responsibilityShadowResult.count({ where: { id: shadow.id } }), 1)
    assert.deepEqual(await consequenceState(database.client), beforeAnalysisConsequences)
  })

  await t.test('duplicate workers cannot claim the same analysis version', async () => {
    const seeded = await seedShadowCase(database.client, 'duplicate-worker')
    const now = new Date(NOW.getTime() + 100_000)
    const leaseUntil = new Date(now.getTime() + RESPONSIBILITY_SHADOW_LEASE_MS)
    const left = createPrismaResponsibilityShadowRepository(database.connect())
    const right = createPrismaResponsibilityShadowRepository(database.connect())
    const claims = await Promise.all([
      left.claimNext({ now, leaseUntil, maxAttempts: 4 }),
      right.claimNext({ now, leaseUntil, maxAttempts: 4 }),
    ])
    assert.equal(claims.filter(Boolean).length, 1)
    assert.equal(claims.find(Boolean).id, seeded.work.id)
    const claimed = claims.find(Boolean)
    const adjudicator = createResponsibilityShadowAdjudicator({
      repository: createPrismaResponsibilityShadowRepository(database.client),
      analyst: createResponsibilityAnalystFake('driver_caused'),
      mode: 'shadow',
      clock: clockAt(now),
    })
    assert.equal((await adjudicator.processWork(claimed)).status, 'COMPLETED')
    assert.equal(await database.client.responsibilityShadowResult.count({ where: { workId: seeded.work.id } }), 1)
  })

  await t.test('different cases process concurrently without a global lock', async () => {
    const a = await seedShadowCase(database.client, 'concurrent-a')
    const b = await seedShadowCase(database.client, 'concurrent-b')
    const env = { RESPONSIBILITY_ADJUDICATION_MODE: 'shadow' }
    const [left, right] = await Promise.all([
      sweepResponsibilityShadowAdjudication({ db: database.connect(), analyst: createResponsibilityAnalystFake(), batchSize: 1, env }),
      sweepResponsibilityShadowAdjudication({ db: database.connect(), analyst: createResponsibilityAnalystFake(), batchSize: 1, env }),
    ])
    assert.equal(left.processed, 1)
    assert.equal(right.processed, 1)
    assert.equal(await database.client.responsibilityShadowResult.count({ where: { caseId: { in: [a.caseId, b.caseId] } } }), 2)
  })

  await t.test('expired lease recovers a crashed worker and preserves one logical result', async () => {
    const seeded = await seedShadowCase(database.client, 'lease-recovery')
    const repo = createPrismaResponsibilityShadowRepository(database.client)
    const firstAt = new Date(NOW.getTime() + 200_000)
    const first = await repo.claimNext({
      now: firstAt,
      leaseUntil: new Date(firstAt.getTime() + RESPONSIBILITY_SHADOW_LEASE_MS),
      maxAttempts: 4,
    })
    assert.equal(first.id, seeded.work.id)
    const recoveredAt = new Date(firstAt.getTime() + RESPONSIBILITY_SHADOW_LEASE_MS + 1)
    const recovered = await repo.claimNext({
      now: recoveredAt,
      leaseUntil: new Date(recoveredAt.getTime() + RESPONSIBILITY_SHADOW_LEASE_MS),
      maxAttempts: 4,
    })
    assert.equal(recovered.id, seeded.work.id)
    assert.equal(recovered.attemptCount, 2)
    const adjudicator = createResponsibilityShadowAdjudicator({
      repository: repo,
      analyst: createResponsibilityAnalystFake(),
      mode: 'shadow',
      clock: clockAt(recoveredAt),
    })
    await adjudicator.processWork(recovered)
    assert.equal(await database.client.responsibilityShadowResult.count({ where: { workId: seeded.work.id } }), 1)
  })

  await t.test('same evidence is idempotent while materially new late evidence creates a preserved second analysis version', async () => {
    const first = await seedShadowCase(database.client, 'versioning')
    await enqueueResponsibilityShadowEvidence(first.snapshot, { db: database.client })
    assert.equal(await database.client.responsibilityEvidenceVersion.count({ where: { caseId: first.caseId } }), 1)
    assert.equal(await database.client.responsibilityAdjudicationWork.count({ where: { caseId: first.caseId } }), 1)

    const secondSnapshot = cancellationEvidence(first.caseId, { extra: true })
    await enqueueResponsibilityShadowEvidence(secondSnapshot, { db: database.client })
    assert.equal(await database.client.responsibilityEvidenceVersion.count({ where: { caseId: first.caseId } }), 2)
    assert.equal(await database.client.responsibilityAdjudicationWork.count({ where: { caseId: first.caseId } }), 2)

    await sweepResponsibilityShadowAdjudication({
      db: database.client,
      analyst: createResponsibilityAnalystFake(),
      batchSize: 2,
      env: { RESPONSIBILITY_ADJUDICATION_MODE: 'shadow' },
    })
    const results = await database.client.responsibilityShadowResult.findMany({
      where: { caseId: first.caseId }, orderBy: { createdAt: 'asc' },
    })
    assert.equal(results.length, 2)
    assert.notEqual(results[0].evidenceHash, results[1].evidenceHash)
  })

  await t.test('poison evidence becomes manual review without starving the valid case behind it', async () => {
    const poison = await seedShadowCase(database.client, 'poison')
    const good = await seedShadowCase(database.client, 'after-poison')
    await database.client.responsibilityEvidenceVersion.update({
      where: { id: poison.evidenceVersion.id },
      data: { snapshot: { malformed: true } },
    })
    const summary = await sweepResponsibilityShadowAdjudication({
      db: database.client,
      analyst: createResponsibilityAnalystFake(),
      batchSize: 2,
      env: { RESPONSIBILITY_ADJUDICATION_MODE: 'shadow' },
    })
    assert.equal(summary.outcomes.some(item => item.caseId === poison.caseId && item.status === 'MANUAL_REVIEW'), true)
    assert.equal(summary.outcomes.some(item => item.caseId === good.caseId && item.status === 'COMPLETED'), true)
    assert.equal(await database.client.responsibilityShadowResult.count({ where: { caseId: good.caseId } }), 1)
  })

  await t.test('kill switch leaves backlog untouched and shadow re-enable processes it', async () => {
    const seeded = await seedShadowCase(database.client, 'kill-switch')
    const disabled = await sweepResponsibilityShadowAdjudication({
      db: database.client,
      analyst: createResponsibilityAnalystFake(),
      env: { RESPONSIBILITY_ADJUDICATION_MODE: 'disabled' },
    })
    assert.equal(disabled.status, 'DISABLED')
    assert.equal((await database.client.responsibilityAdjudicationWork.findUniqueOrThrow({ where: { id: seeded.work.id } })).status, 'PENDING')
    const enabled = await sweepResponsibilityShadowAdjudication({
      db: database.client,
      analyst: createResponsibilityAnalystFake(),
      batchSize: 1,
      env: { RESPONSIBILITY_ADJUDICATION_MODE: 'shadow' },
    })
    assert.equal(enabled.outcomes[0].status, 'COMPLETED')
  })
})
