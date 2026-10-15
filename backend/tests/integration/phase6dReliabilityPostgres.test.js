import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readdir } from 'node:fs/promises'

import { createTestDatabase } from '../helpers/database.js'
import { createScheduledScenario } from '../helpers/scheduledScenario.js'
import { createResponsibilityEvidence, evidenceCategory, responsibilityCaseType } from '../../services/responsibilityEvidence.js'
import { responsibilityEvidenceHash } from '../../services/responsibilityAnalyst.js'
import { responsibilityClassification } from '../../services/responsibilityContracts.js'
import {
  applyFinalizedResponsibilityConsequences,
  createPrismaResponsibilityConsequenceRepository,
} from '../../services/responsibilityConsequences.js'
import {
  applyAuthorizedResponsibilityReliabilityConsequences,
  RELIABILITY_TEMPORARY_BLOCK_MS,
} from '../../services/responsibilityReliabilityConsequences.js'
import {
  findActiveReliabilityBlock,
  removeIndefiniteReliabilityBlock,
} from '../../services/driverReliability.js'
import { newWorkEligibility } from '../../services/driverNewWorkEligibility.js'

const NOW = new Date('2026-09-29T08:00:00.000Z')
const POLICY = 'phase6d-postgres-v1'
const migrationsDirectory = new URL('../../prisma/migrations/', import.meta.url)
let driverSequence = 0

const clockAt = value => ({ now: () => new Date(value) })

async function createDriver(client, suffix) {
  driverSequence += 1
  return client.driver.create({ data: {
    id: `driver-${suffix}-${randomUUID()}`,
    name: `Phase 6D ${suffix}`,
    phone: `+9199${String(driverSequence).padStart(8, '0')}`,
  } })
}

async function seedAuthorizedCase(client, driver, {
  level = 'LEVEL_2',
  classification = responsibilityClassification.DRIVER_CAUSED,
  state = 'FINAL_UPHELD',
  caseType = responsibilityCaseType.DRIVER_CANCELLATION,
  now = NOW,
} = {}) {
  const caseId = `phase6d-${randomUUID()}`
  const bookingId = `booking-${randomUUID()}`
  const journal = createResponsibilityEvidence({
    caseId,
    caseType,
    bookingId,
    occurredAt: now,
    clock: clockAt(now),
  })
  journal.record({
    category: evidenceCategory.ASSIGNMENT,
    kind: 'assigned_driver_for_incident',
    source: `driver:${driver.id}`,
    value: { driverId: driver.id },
    observedAt: now,
    receivedAt: now,
  })
  const evidenceSnapshot = journal.snapshot()
  const evidenceHash = responsibilityEvidenceHash(evidenceSnapshot)
  await client.responsibilityCase.create({ data: {
    id: caseId,
    bookingId,
    caseType,
    state,
    evidenceVersion: evidenceSnapshot.evidenceVersion,
    evidenceHash,
    evidenceSnapshot,
    occurredAt: now,
  } })
  let decision = null
  if (state === 'FINAL_UPHELD') {
    decision = await client.responsibilityFinalDecision.create({ data: {
      caseId,
      outcome: 'FINAL_UPHELD',
      classification,
      consequenceLevel: level,
      evidenceHash,
      evidenceVersion: evidenceSnapshot.evidenceVersion,
      policyVersion: POLICY,
      source: 'PHASE6D_POSTGRES_FIXTURE',
      reason: 'Phase 6D PostgreSQL fixture',
      previousState: 'APPEAL_REVIEW',
      finalizedAt: now,
    } })
    await applyFinalizedResponsibilityConsequences(caseId, {
      repository: createPrismaResponsibilityConsequenceRepository(client),
      clock: clockAt(now),
    })
  }
  return { caseId, decision }
}

async function apply(client, seeded, now = NOW, hooks = {}) {
  return applyAuthorizedResponsibilityReliabilityConsequences(seeded.caseId, {
    db: client,
    clock: clockAt(now),
    hooks,
  })
}

function rendezvous(count) {
  let arrived = 0
  let release
  const gate = new Promise(resolve => { release = resolve })
  return async () => {
    arrived += 1
    if (arrived === count) release()
    await gate
  }
}

async function seedStrikes(client, driver, count) {
  const results = []
  for (let index = 0; index < count; index += 1) {
    const now = new Date(NOW.getTime() + index * 1000)
    const seeded = await seedAuthorizedCase(client, driver, { now })
    results.push(await apply(client, seeded, now))
  }
  return results
}

test('Phase 6D real PostgreSQL reliability consequences preserve thresholds, retries, and concurrency', async t => {
  const database = await createTestDatabase()
  t.after(() => database.close())

  await t.test('fresh migration chain includes consequence-level lineage and reliability integrity', async () => {
    const migrationDirectories = (await readdir(migrationsDirectory, { withFileTypes: true }))
      .filter(entry => entry.isDirectory()).map(entry => entry.name).sort()
    const applied = await database.client.$queryRawUnsafe(`
      SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY migration_name
    `)
    assert.deepEqual(applied.map(row => row.migration_name), migrationDirectories)
    assert.ok(applied.some(row => row.migration_name === '20260929010000_phase6d_consequence_level_lineage'))
    assert.ok(applied.some(row => row.migration_name === '20260929011000_phase6d_reliability_consequences'))
  })

  await t.test('LEVEL_1 never strikes while LEVEL_2 creates one idempotent strike', async () => {
    const driver = await createDriver(database.client, 'levels')
    const level1 = await seedAuthorizedCase(database.client, driver, { level: 'LEVEL_1' })
    const skipped = await apply(database.client, level1)
    assert.equal(skipped.disposition, 'NOT_APPLICABLE')
    assert.equal(await database.client.reliabilityStrike.count({ where: { driverId: driver.id } }), 0)

    const level2 = await seedAuthorizedCase(database.client, driver)
    const first = await apply(database.client, level2)
    const retry = await apply(database.client, level2)
    assert.equal(first.disposition, 'STRIKE')
    assert.equal(first.reused, false)
    assert.equal(retry.reused, true)
    assert.equal(await database.client.reliabilityStrike.count({ where: { finalDecisionId: level2.decision.id } }), 1)
  })

  await t.test('concurrent duplicate workers for the same finalized incident create one strike', async () => {
    const driver = await createDriver(database.client, 'duplicate-worker')
    const seeded = await seedAuthorizedCase(database.client, driver)
    const [left, right] = [database.connect(), database.connect()]
    const results = await Promise.allSettled([
      apply(left, seeded),
      apply(right, seeded),
    ])
    assert.ok(results.every(result => result.status === 'fulfilled'))
    const authorization = await database.client.responsibilityConsequenceExecution.findUniqueOrThrow({
      where: { caseId: seeded.caseId },
    })
    assert.equal(await database.client.reliabilityStrike.count({ where: { driverId: driver.id } }), 1)
    assert.equal(await database.client.reliabilityStrike.count({ where: { responsibilityCaseId: seeded.caseId } }), 1)
    assert.equal(await database.client.reliabilityStrike.count({ where: { finalDecisionId: seeded.decision.id } }), 1)
    assert.equal(await database.client.reliabilityStrike.count({
      where: { consequenceExecutionId: authorization.id },
    }), 1)
  })

  await t.test('failed pickup can strike independently of financial support when final Level 2 is authoritative', async () => {
    const driver = await createDriver(database.client, 'failed-pickup')
    const seeded = await seedAuthorizedCase(database.client, driver, { caseType: responsibilityCaseType.FAILED_PICKUP })
    await apply(database.client, seeded)
    const strike = await database.client.reliabilityStrike.findUnique({ where: { finalDecisionId: seeded.decision.id } })
    assert.equal(strike?.incidentType, responsibilityCaseType.FAILED_PICKUP)
  })

  await t.test('4 to 5 creates exactly seven calendar days, 6 adds nothing, 7 becomes indefinite', async () => {
    const driver = await createDriver(database.client, 'thresholds')
    await seedStrikes(database.client, driver, 4)
    const fifthAt = new Date(NOW.getTime() + 10_000)
    const fifth = await seedAuthorizedCase(database.client, driver, { now: fifthAt })
    await apply(database.client, fifth, fifthAt)
    const temporary = await database.client.reliabilityBlock.findFirst({ where: { driverId: driver.id, type: 'TEMPORARY' } })
    assert.equal(temporary?.blockedUntil?.getTime(), fifthAt.getTime() + RELIABILITY_TEMPORARY_BLOCK_MS)
    assert.ok(await findActiveReliabilityBlock(driver.id, { db: database.client, now: new Date(temporary.blockedUntil.getTime() - 1) }))
    assert.equal(await findActiveReliabilityBlock(driver.id, { db: database.client, now: temporary.blockedUntil }), null)
    assert.equal(await findActiveReliabilityBlock(driver.id, { db: database.client, now: new Date(temporary.blockedUntil.getTime() + 1) }), null)
    assert.equal((await apply(database.client, fifth, fifthAt)).reused, true)
    assert.equal(await database.client.reliabilityStrike.count({ where: { driverId: driver.id } }), 5)
    assert.equal(await database.client.reliabilityBlock.count({ where: { driverId: driver.id, type: 'TEMPORARY' } }), 1)

    const sixth = await seedAuthorizedCase(database.client, driver, { now: new Date(fifthAt.getTime() + 1000) })
    await apply(database.client, sixth, new Date(fifthAt.getTime() + 1000))
    assert.equal(await database.client.reliabilityBlock.count({ where: { driverId: driver.id } }), 1)

    const seventh = await seedAuthorizedCase(database.client, driver, { now: new Date(fifthAt.getTime() + 2000) })
    await apply(database.client, seventh, new Date(fifthAt.getTime() + 2000))
    const active = await findActiveReliabilityBlock(driver.id, { db: database.client, now: new Date(fifthAt.getTime() + 3000) })
    assert.equal(active?.type, 'INDEFINITE')
    assert.equal(await database.client.reliabilityBlock.count({ where: { driverId: driver.id, type: 'INDEFINITE' } }), 1)
    assert.equal(await database.client.reliabilityBlock.count({ where: { driverId: driver.id, type: 'TEMPORARY' } }), 1)
  })

  await t.test('two distinct incidents racing from four strikes produce six strikes and one temporary block', async () => {
    const driver = await createDriver(database.client, 'race-five')
    await seedStrikes(database.client, driver, 4)
    const a = await seedAuthorizedCase(database.client, driver)
    const b = await seedAuthorizedCase(database.client, driver)
    const gate = rendezvous(2)
    const [left, right] = [database.connect(), database.connect()]
    const results = await Promise.allSettled([
      apply(left, a, NOW, { beforeDriverLock: gate }),
      apply(right, b, NOW, { beforeDriverLock: gate }),
    ])
    assert.ok(results.every(result => result.status === 'fulfilled'))
    assert.equal(await database.client.reliabilityStrike.count({ where: { driverId: driver.id } }), 6)
    assert.equal(await database.client.reliabilityBlock.count({ where: { driverId: driver.id, type: 'TEMPORARY' } }), 1)
  })

  await t.test('concurrent events around seven create one authoritative indefinite block', async () => {
    const driver = await createDriver(database.client, 'race-seven')
    await seedStrikes(database.client, driver, 6)
    const a = await seedAuthorizedCase(database.client, driver)
    const b = await seedAuthorizedCase(database.client, driver)
    const gate = rendezvous(2)
    const [left, right] = [database.connect(), database.connect()]
    const results = await Promise.allSettled([
      apply(left, a, NOW, { beforeDriverLock: gate }),
      apply(right, b, NOW, { beforeDriverLock: gate }),
    ])
    assert.ok(results.every(result => result.status === 'fulfilled'))
    assert.equal(await database.client.reliabilityStrike.count({ where: { driverId: driver.id } }), 8)
    assert.equal(await database.client.reliabilityBlock.count({ where: { driverId: driver.id, type: 'INDEFINITE', removedAt: null } }), 1)
  })

  await t.test('injected failures after strike or block insertion roll back and retry cleanly', async () => {
    const driver = await createDriver(database.client, 'crash')
    const first = await seedAuthorizedCase(database.client, driver)
    await assert.rejects(apply(database.client, first, NOW, {
      afterStrikeCreated: async () => { throw Object.assign(new Error('crash'), { code: 'CRASH_AFTER_STRIKE' }) },
    }))
    assert.equal(await database.client.reliabilityStrike.count({ where: { responsibilityCaseId: first.caseId } }), 0)
    await apply(database.client, first)
    assert.equal(await database.client.reliabilityStrike.count({ where: { responsibilityCaseId: first.caseId } }), 1)

    await seedStrikes(database.client, driver, 3)
    const fifth = await seedAuthorizedCase(database.client, driver)
    await assert.rejects(apply(database.client, fifth, NOW, {
      afterBlockCreated: async () => { throw Object.assign(new Error('crash'), { code: 'CRASH_AFTER_BLOCK' }) },
    }))
    assert.equal(await database.client.reliabilityStrike.count({ where: { responsibilityCaseId: fifth.caseId } }), 0)
    await apply(database.client, fifth)
    assert.equal(await database.client.reliabilityBlock.count({ where: { driverId: driver.id, type: 'TEMPORARY' } }), 1)
  })

  await t.test('admin removal preserves seven strikes, does not clear independent moderation, and a later strike can re-block', async () => {
    const scenario = createScheduledScenario()
    await scenario.persist(database.client)
    const driver = scenario.driversByGroup.rcs
    const liabilityCaseId = `phase6d-removal-liability-${randomUUID()}`
    const liabilityBooking = scenario.bookingStates.previous
    await database.client.responsibilityCase.create({ data: {
      id: liabilityCaseId,
      bookingId: liabilityBooking.id,
      caseType: responsibilityCaseType.DRIVER_CANCELLATION,
      state: 'FINAL_UPHELD',
      evidenceVersion: 'phase6d-removal-liability-v1',
      evidenceHash: 'phase6d-removal-liability-hash',
      evidenceSnapshot: { timeline: [] },
      occurredAt: NOW,
    } })
    const liabilityDecision = await database.client.responsibilityFinalDecision.create({ data: {
      caseId: liabilityCaseId,
      outcome: 'FINAL_UPHELD',
      classification: responsibilityClassification.DRIVER_CAUSED,
      consequenceLevel: 'LEVEL_1',
      evidenceHash: 'phase6d-removal-liability-hash',
      policyVersion: POLICY,
      finalizedAt: NOW,
    } })
    const liability = await database.client.responsibilityLiability.create({ data: {
      caseId: liabilityCaseId,
      finalDecisionId: liabilityDecision.id,
      driverId: driver.id,
      bookingId: liabilityBooking.id,
      authoritativeFarePaise: 100000,
      rateBps: 1000,
      capPaise: 10000,
      amountPaise: 10000,
      policyVersion: POLICY,
      calculatedAt: NOW,
    } })
    await seedStrikes(database.client, driver, 7)
    const block = await database.client.reliabilityBlock.findFirstOrThrow({
      where: { driverId: driver.id, type: 'INDEFINITE', removedAt: null },
    })
    await database.client.driver.update({ where: { id: driver.id }, data: {
      suspendedAt: NOW,
      suspensionScope: 'independent_safety_or_integrity',
      suspensionReason: 'Independent moderation fixture',
    } })
    await removeIndefiniteReliabilityBlock({
      driverId: driver.id,
      blockId: block.id,
      adminActorId: 'admin-phase6d',
      reason: 'Reviewed and reinstated after reliability review',
    }, { db: database.client, clock: clockAt(new Date(NOW.getTime() + 20_000)) })
    assert.equal(await database.client.reliabilityStrike.count({ where: { driverId: driver.id } }), 7)
    const removedBlock = await database.client.reliabilityBlock.findUniqueOrThrow({ where: { id: block.id } })
    assert.ok(removedBlock.removedAt)
    assert.equal(removedBlock.removedBy, 'admin-phase6d')
    assert.equal(removedBlock.removalReason, 'Reviewed and reinstated after reliability review')
    const preservedLiability = await database.client.responsibilityLiability.findUniqueOrThrow({ where: { id: liability.id } })
    assert.equal(preservedLiability.amountPaise, liability.amountPaise)
    assert.equal(preservedLiability.driverId, driver.id)
    const eligibility = await newWorkEligibility({
      id: driver.id,
      suspendedAt: NOW,
      suspensionExpiresAt: null,
    }, { db: database.client, now: new Date(NOW.getTime() + 21_000) })
    assert.equal(eligibility.code, 'INDEPENDENTLY_SUSPENDED')

    await database.client.driver.update({ where: { id: driver.id }, data: {
      suspendedAt: null, suspensionScope: null, suspensionReason: null,
    } })
    const eighth = await seedAuthorizedCase(database.client, driver, { now: new Date(NOW.getTime() + 22_000) })
    await apply(database.client, eighth, new Date(NOW.getTime() + 22_000))
    assert.equal(await database.client.reliabilityBlock.count({ where: { driverId: driver.id, type: 'INDEFINITE' } }), 2)
    assert.ok(await findActiveReliabilityBlock(driver.id, { db: database.client, now: new Date(NOW.getTime() + 23_000) }))
  })

  await t.test('database rejects strike mutation/truncation and block deletion/truncation', async () => {
    const driver = await createDriver(database.client, 'append-only')
    await seedStrikes(database.client, driver, 5)
    const strike = await database.client.reliabilityStrike.findFirstOrThrow({ where: { driverId: driver.id } })
    const block = await database.client.reliabilityBlock.findFirstOrThrow({ where: { driverId: driver.id } })
    await assert.rejects(database.client.reliabilityStrike.update({ where: { id: strike.id }, data: { status: 'REVERSED' } }))
    await assert.rejects(database.client.reliabilityStrike.delete({ where: { id: strike.id } }))
    await assert.rejects(database.client.$executeRawUnsafe('TRUNCATE TABLE "reliability_strikes"'))
    await assert.rejects(database.client.reliabilityBlock.delete({ where: { id: block.id } }))
    await assert.rejects(database.client.$executeRawUnsafe('TRUNCATE TABLE "reliability_blocks"'))
  })
})
