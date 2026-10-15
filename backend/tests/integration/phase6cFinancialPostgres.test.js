import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readdir } from 'node:fs/promises'

import { createTestDatabase, raceTransactions } from '../helpers/database.js'
import { createScheduledScenario } from '../helpers/scheduledScenario.js'
import { createResponsibilityEvidence, evidenceCategory, responsibilityCaseType } from '../helpers/responsibilityEvidence.js'
import { responsibilityEvidenceHash } from '../../services/responsibilityAnalyst.js'
import { responsibilityClassification } from '../../services/responsibilityContracts.js'
import { provisionalResponsibilityRoute } from '../../services/responsibilityPolicyGate.js'
import {
  applyFinalizedResponsibilityConsequences,
  createPrismaResponsibilityConsequenceRepository,
} from '../../services/responsibilityConsequences.js'
import {
  applyAuthorizedResponsibilityFinancialConsequences,
  sweepResponsibilityFinancialConsequences,
} from '../../services/responsibilityFinancialConsequences.js'
import { recoverFinalizedLiabilitiesFromEarning } from '../../services/responsibilityLiabilityRecovery.js'
import { settleRideTransitionInTransaction } from '../../services/rideSettlement.js'
import {
  consumeReservedResponsibilityCompensation,
  reserveResponsibilityCompensation,
} from '../../services/responsibilityCompensation.js'

const NOW = new Date('2026-09-27T08:00:00.000Z')
const migrationsDirectory = new URL('../../prisma/migrations/', import.meta.url)

const clock = { now: () => new Date(NOW) }

async function seedFinalizedCase(client, scenario, booking, {
  caseId = `phase6c-${randomUUID()}`,
  analysisClassification = responsibilityClassification.DRIVER_CAUSED,
  finalClassification = responsibilityClassification.DRIVER_CAUSED,
  finalization = 'AUTO',
} = {}) {
  const driverId = scenario.driversByGroup.rcs.id
  const cancellation = await client.driverCancellation.create({ data: {
    driverId,
    bookingId: booking.id,
    fromStatus: 'assigned',
    reason: 'Phase 6C PostgreSQL fixture',
    createdAt: NOW,
  } })
  const journal = createResponsibilityEvidence({
    caseId,
    caseType: responsibilityCaseType.DRIVER_CANCELLATION,
    bookingId: booking.id,
    scheduledAt: booking.scheduledAt,
    occurredAt: NOW,
    clock,
  })
  journal.record({
    category: evidenceCategory.BOOKING,
    kind: 'booking_state_at_driver_cancellation',
    source: 'phase6c-postgres-fixture',
    value: {
      bookingId: booking.id,
      userId: scenario.customer.id,
      fareBasis: 'BOOKING_FARE_AT_INCIDENT',
      authoritativeFarePaise: Math.round(booking.fare * 100),
    },
  })
  journal.record({
    category: evidenceCategory.ASSIGNMENT,
    kind: 'assigned_driver_at_cancellation',
    source: 'phase6c-postgres-fixture',
    value: { driverId },
  })
  journal.record({
    category: evidenceCategory.CANCELLATION,
    kind: 'driver_cancellation_recorded',
    source: 'phase6c-postgres-fixture',
    value: { cancellationId: cancellation.id, initiator: 'driver' },
  })
  const evidenceSnapshot = journal.snapshot()
  const evidenceHash = responsibilityEvidenceHash(evidenceSnapshot)
  const responsibilityCase = await client.responsibilityCase.create({ data: {
    id: caseId,
    bookingId: booking.id,
    caseType: responsibilityCaseType.DRIVER_CANCELLATION,
    state: 'FINAL_UPHELD',
    evidenceVersion: evidenceSnapshot.evidenceVersion,
    evidenceHash,
    evidenceSnapshot,
    scheduledAt: booking.scheduledAt,
    occurredAt: NOW,
  } })
  const analysisId = `phase6c-analysis-${randomUUID()}`
  await client.responsibilityAnalysis.create({ data: {
    id: analysisId,
    logicalKey: `phase6c-analysis:${caseId}`,
    caseId,
    evidenceHash,
    contractVersion: 'phase6c-postgres-v1',
    provider: 'phase6c-postgres-fixture',
    model: 'phase6c-postgres-fixture',
    envelope: { output: { suggestedClassification: analysisClassification } },
    validation: { valid: true },
  } })
  const provisionalDecision = await client.responsibilityProvisionalDecision.create({ data: {
    caseId,
    evidenceVersion: evidenceSnapshot.evidenceVersion,
    evidenceHash,
    analysisId,
    analysisVersion: 'phase6c-postgres-v1',
    policyVersion: 'phase6c-postgres-v1',
    route: finalization === 'AUTO' || finalization === 'APPEAL_AUTO'
      ? provisionalResponsibilityRoute.PROVISIONAL_AUTO_UPHELD
      : provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW,
    reasons: [],
    passedGates: [],
    failedGates: [],
    humanReviewRequired: finalization !== 'AUTO' && finalization !== 'APPEAL_AUTO',
    evaluatedAt: NOW,
  } })
  let source = 'NO_APPEAL_AUTO'
  let appealId = null
  let adminReview = null
  if (finalization === 'ADMIN' || finalization === 'APPEAL_ADMIN') {
    adminReview = await client.responsibilityAdminReview.create({ data: {
      caseId, adminActorId: 'phase6c-admin', decision: 'UPHOLD', reason: 'Phase 6C human upheld fixture',
      decidedAt: NOW, classification: finalClassification, consequenceLevel: 'LEVEL_1', evidenceVersion: evidenceSnapshot.evidenceVersion, evidenceHash,
      policyVersion: 'phase6c-postgres-v1', previousState: 'NEEDS_ADMIN_REVIEW',
    } })
    source = 'NO_APPEAL_ADMIN'
  }
  if (finalization === 'APPEAL_AUTO' || finalization === 'APPEAL_ADMIN') {
    const sourceRecord = adminReview ?? provisionalDecision
    const window = await client.responsibilityAppealWindow.create({ data: {
      caseId, sourceDecisionId: sourceRecord.id, sourceDecisionType: adminReview ? 'ADMIN' : 'AUTO',
      noticeRetryKey: `phase6c-appeal:${caseId}`, appealStartedAt: NOW, appealDeadline: new Date(NOW.getTime() + 86_400_000),
    } })
    const appeal = await client.responsibilityAppeal.create({ data: {
      caseId, appealWindowId: window.id, driverId, submittedAt: NOW, reason: 'Phase 6C appeal fixture',
      status: 'REVIEWED', additionalEvidence: [],
    } })
    await client.responsibilityAppealReview.create({ data: {
      caseId, appealId: appeal.id, reviewerId: 'phase6c-reviewer', outcome: 'UPHOLD', reason: 'Phase 6C appeal upheld fixture',
      reviewedAt: NOW, classification: finalClassification, consequenceLevel: 'LEVEL_1', evidenceVersion: evidenceSnapshot.evidenceVersion, evidenceHash, policyVersion: 'phase6c-postgres-v1',
    } })
    appealId = appeal.id
    source = 'APPEAL_REVIEW'
  }
  const decision = await client.responsibilityFinalDecision.create({ data: {
    caseId,
    outcome: 'FINAL_UPHELD',
    classification: finalClassification,
    consequenceLevel: 'LEVEL_1',
    evidenceHash,
    evidenceVersion: evidenceSnapshot.evidenceVersion,
    policyVersion: 'phase6c-postgres-v1',
    source,
    reason: 'Phase 6C persistence fixture',
    appealId,
    finalizedAt: NOW,
  } })
  return { caseId, cancellationId: cancellation.id, driverId, userId: scenario.customer.id, booking, responsibilityCase, decision }
}

async function authorize(client, caseId) {
  return applyFinalizedResponsibilityConsequences(caseId, {
    repository: createPrismaResponsibilityConsequenceRepository(client),
    clock,
  })
}

async function replaceCaseEvidence(client, caseId, mutate) {
  const responsibilityCase = await client.responsibilityCase.findUniqueOrThrow({ where: { id: caseId } })
  const evidenceSnapshot = structuredClone(responsibilityCase.evidenceSnapshot)
  mutate(evidenceSnapshot)
  const evidenceHash = responsibilityEvidenceHash(evidenceSnapshot)
  await client.responsibilityCase.update({ where: { id: caseId }, data: { evidenceSnapshot, evidenceHash } })
  await Promise.all([
    client.responsibilityFinalDecision.update({ where: { caseId }, data: { evidenceHash } }),
    client.responsibilityProvisionalDecision.update({ where: { caseId }, data: { evidenceHash } }),
  ])
}

async function seedScenario(client, overrides = {}) {
  // `admin` is a production singleton; Phase 6C fixtures only need the RCS captain.
  const scenario = createScheduledScenario({ drivers: { admin: { group: 'partner' } }, ...overrides })
  await scenario.persist(client)
  return scenario
}

test('Phase 6C real PostgreSQL financial consequences preserve migration, retry, and concurrency boundaries', async t => {
  const database = await createTestDatabase()
  t.after(() => database.close())

  await t.test('fresh migration chain includes the Phase 6C financial migration', async () => {
    const migrationDirectories = (await readdir(migrationsDirectory, { withFileTypes: true }))
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort()
    const applied = await database.client.$queryRawUnsafe(`
      SELECT migration_name, finished_at, rolled_back_at
      FROM _prisma_migrations
      ORDER BY migration_name
    `)
    assert.deepEqual(applied.map(row => row.migration_name), migrationDirectories)
    assert.ok(applied.every(row => row.finished_at instanceof Date && row.rolled_back_at === null))
    assert.ok(applied.some(row => row.migration_name === '20260926010000_phase6c_financial_consequences'))
    assert.ok(applied.some(row => row.migration_name === '20260926011000_phase6c_financial_retry_audit'))
  })

  await t.test('provisional, waived, and unauthorized cases cannot create financial consequences', async () => {
    const scenario = await seedScenario(database.client)
    for (const state of ['PROVISIONAL_AUTO_UPHELD', 'PROVISIONAL_ADMIN_UPHELD', 'APPEAL_WINDOW', 'FINAL_WAIVED']) {
      const caseId = `phase6c-${randomUUID()}`
      await database.client.responsibilityCase.create({ data: {
        id: caseId,
        bookingId: scenario.bookingStates.current.id,
        caseType: responsibilityCaseType.DRIVER_CANCELLATION,
        state,
        evidenceVersion: 'phase6c-test',
        evidenceHash: 'unusable-unfinalized-evidence',
        evidenceSnapshot: {},
        scheduledAt: scenario.bookingStates.current.scheduledAt,
        occurredAt: NOW,
      } })
      await assert.rejects(
        applyAuthorizedResponsibilityFinancialConsequences(caseId, { db: database.client, clock }),
        error => error.code === 'CASE_NOT_FINAL_UPHELD',
      )
      assert.equal(await database.client.responsibilityLiability.count({ where: { caseId } }), 0)
      assert.equal(await database.client.responsibilityCompensation.count({ where: { caseId } }), 0)
    }
    const unauthorized = await seedFinalizedCase(database.client, scenario, scenario.bookingStates.next)
    await assert.rejects(
      applyAuthorizedResponsibilityFinancialConsequences(unauthorized.caseId, { db: database.client, clock }),
      error => error.code === 'FINALIZED_AUTHORIZATION_MISSING',
    )
    assert.equal(await database.client.responsibilityLiability.count({ where: { caseId: unauthorized.caseId } }), 0)
  })

  await t.test('input, evidence, finality, and incident-link guards fail closed before financial writes', async () => {
    await assert.rejects(
      applyAuthorizedResponsibilityFinancialConsequences('', { db: database.client, clock }),
      error => error.code === 'CASE_ID_REQUIRED',
    )
    await assert.rejects(
      applyAuthorizedResponsibilityFinancialConsequences(`phase6c-missing-${randomUUID()}`, { db: database.client, clock }),
      error => error.code === 'CASE_MISSING',
    )

    const scenario = await seedScenario(database.client)
    const evidenceHashMismatch = await seedFinalizedCase(database.client, scenario, scenario.bookingStates.current)
    await authorize(database.client, evidenceHashMismatch.caseId)
    await database.client.responsibilityCase.update({
      where: { id: evidenceHashMismatch.caseId }, data: { evidenceHash: 'tampered-evidence-hash' },
    })
    await Promise.all([
      database.client.responsibilityFinalDecision.update({
        where: { caseId: evidenceHashMismatch.caseId }, data: { evidenceHash: 'tampered-evidence-hash' },
      }),
      database.client.responsibilityProvisionalDecision.update({
        where: { caseId: evidenceHashMismatch.caseId }, data: { evidenceHash: 'tampered-evidence-hash' },
      }),
    ])
    await assert.rejects(
      applyAuthorizedResponsibilityFinancialConsequences(evidenceHashMismatch.caseId, { db: database.client, clock }),
      error => error.code === 'EVIDENCE_HASH_MISMATCH',
    )

    const unavailableBooking = await seedFinalizedCase(database.client, scenario, scenario.bookingStates.next)
    await authorize(database.client, unavailableBooking.caseId)
    await replaceCaseEvidence(database.client, unavailableBooking.caseId, snapshot => {
      snapshot.timeline.find(entry => entry.kind === 'booking_state_at_driver_cancellation').availability = 'unknown'
    })
    await assert.rejects(
      applyAuthorizedResponsibilityFinancialConsequences(unavailableBooking.caseId, { db: database.client, clock }),
      error => error.code === 'BOOKING_FARE_EVIDENCE_MISSING',
    )

    const malformedIncident = await seedFinalizedCase(database.client, scenario, scenario.bookingStates.previous)
    await authorize(database.client, malformedIncident.caseId)
    await replaceCaseEvidence(database.client, malformedIncident.caseId, snapshot => {
      snapshot.timeline.find(entry => entry.kind === 'booking_state_at_driver_cancellation').value.userId = null
    })
    await assert.rejects(
      applyAuthorizedResponsibilityFinancialConsequences(malformedIncident.caseId, { db: database.client, clock }),
      error => error.code === 'INCIDENT_FINANCIAL_EVIDENCE_INVALID',
    )

    const zeroRoundedLiability = await seedFinalizedCase(database.client, scenario, scenario.bookingStates.current)
    await authorize(database.client, zeroRoundedLiability.caseId)
    await replaceCaseEvidence(database.client, zeroRoundedLiability.caseId, snapshot => {
      snapshot.timeline.find(entry => entry.kind === 'booking_state_at_driver_cancellation').value.authoritativeFarePaise = 1
    })
    await assert.rejects(
      applyAuthorizedResponsibilityFinancialConsequences(zeroRoundedLiability.caseId, { db: database.client, clock }),
      error => error.code === 'LIABILITY_AMOUNT_INVALID',
    )

    for (const caseId of [
      evidenceHashMismatch.caseId,
      unavailableBooking.caseId,
      malformedIncident.caseId,
      zeroRoundedLiability.caseId,
    ]) {
      assert.equal(await database.client.responsibilityLiability.count({ where: { caseId } }), 0)
    }
  })

  await t.test('persisted finality lineage, incident links, and replayed consequences are independently verified', async () => {
    const scenario = await seedScenario(database.client)
    const inconsistentFinalDecision = await seedFinalizedCase(database.client, scenario, scenario.bookingStates.current)
    await authorize(database.client, inconsistentFinalDecision.caseId)
    await database.client.responsibilityFinalDecision.update({
      where: { caseId: inconsistentFinalDecision.caseId }, data: { evidenceHash: 'different-final-decision-hash' },
    })
    await assert.rejects(
      applyAuthorizedResponsibilityFinancialConsequences(inconsistentFinalDecision.caseId, { db: database.client, clock }),
      error => error.code === 'FINAL_DECISION_INCONSISTENT',
    )

    const inconsistentProvisional = await seedFinalizedCase(database.client, scenario, scenario.bookingStates.next)
    await authorize(database.client, inconsistentProvisional.caseId)
    await database.client.responsibilityProvisionalDecision.update({
      where: { caseId: inconsistentProvisional.caseId }, data: { policyVersion: 'inconsistent-policy-version' },
    })
    await assert.rejects(
      applyAuthorizedResponsibilityFinancialConsequences(inconsistentProvisional.caseId, { db: database.client, clock }),
      error => error.code === 'FINALIZED_DRIVER_CLASSIFICATION_MISSING',
    )

    const brokenLineage = await seedFinalizedCase(database.client, scenario, scenario.bookingStates.previous)
    await authorize(database.client, brokenLineage.caseId)
    await database.client.responsibilityProvisionalDecision.update({
      where: { caseId: brokenLineage.caseId }, data: { route: provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW },
    })
    await assert.rejects(
      applyAuthorizedResponsibilityFinancialConsequences(brokenLineage.caseId, { db: database.client, clock }),
      error => error.code === 'FINALIZED_DRIVER_CLASSIFICATION_MISSING',
    )

    const brokenIncidentLink = await seedFinalizedCase(database.client, scenario, scenario.bookingStates.current)
    await authorize(database.client, brokenIncidentLink.caseId)
    await database.client.driverCancellation.update({
      where: { id: brokenIncidentLink.cancellationId }, data: { bookingId: scenario.bookingStates.next.id },
    })
    await assert.rejects(
      applyAuthorizedResponsibilityFinancialConsequences(brokenIncidentLink.caseId, { db: database.client, clock }),
      error => error.code === 'INCIDENT_LINK_MISMATCH',
    )

    const applied = await seedFinalizedCase(database.client, scenario, scenario.bookingStates.next)
    await authorize(database.client, applied.caseId)
    await applyAuthorizedResponsibilityFinancialConsequences(applied.caseId, { db: database.client, clock })

    const replay = await seedFinalizedCase(database.client, scenario, scenario.bookingStates.previous)
    await authorize(database.client, replay.caseId)
    await applyAuthorizedResponsibilityFinancialConsequences(replay.caseId, { db: database.client, clock })
    await database.client.responsibilityConsequenceExecution.update({
      where: { caseId: replay.caseId }, data: { financialAppliedAt: null },
    })
    assert.equal((await applyAuthorizedResponsibilityFinancialConsequences(replay.caseId, { db: database.client, clock })).reused, true)
    assert.ok((await database.client.responsibilityConsequenceExecution.findUniqueOrThrow({
      where: { caseId: replay.caseId },
    })).financialAppliedAt)
  })

  await t.test('only a persisted driver-caused finalization lineage can create financial consequences', async () => {
    const scenario = await seedScenario(database.client)
    for (const classification of [
      null,
      responsibilityClassification.EXTERNAL_OR_UNCERTAIN,
      responsibilityClassification.PLATFORM_CAUSED,
      responsibilityClassification.VALID_WAIVED,
    ]) {
      const seeded = await seedFinalizedCase(database.client, scenario, scenario.bookingStates.current, {
        finalClassification: classification,
      })
      await authorize(database.client, seeded.caseId)
      await assert.rejects(
        applyAuthorizedResponsibilityFinancialConsequences(seeded.caseId, { db: database.client, clock }),
        error => error.code === 'FINALIZED_DRIVER_CLASSIFICATION_MISSING',
      )
      assert.equal(await database.client.responsibilityLiability.count({ where: { caseId: seeded.caseId } }), 0)
    }
  })

  await t.test('auto, admin, and appeal-upheld final routes require and honor persisted driver-caused lineage', async () => {
    const scenario = await seedScenario(database.client)
    for (const finalization of ['AUTO', 'ADMIN', 'APPEAL_AUTO', 'APPEAL_ADMIN']) {
      const seeded = await seedFinalizedCase(database.client, scenario, scenario.bookingStates.current, { finalization })
      await authorize(database.client, seeded.caseId)
      const applied = await applyAuthorizedResponsibilityFinancialConsequences(seeded.caseId, {
        db: database.client, clock,
      })
      assert.equal(applied.reused, false, finalization)
      assert.equal(await database.client.responsibilityLiability.count({ where: { caseId: seeded.caseId } }), 1)
    }
  })

  await t.test('human final classification can uphold driver responsibility when advisory AI said platform-caused', async () => {
    const scenario = await seedScenario(database.client)
    const seeded = await seedFinalizedCase(database.client, scenario, scenario.bookingStates.current, {
      finalization: 'ADMIN',
      analysisClassification: responsibilityClassification.PLATFORM_CAUSED,
      finalClassification: responsibilityClassification.DRIVER_CAUSED,
    })
    await authorize(database.client, seeded.caseId)
    assert.equal((await applyAuthorizedResponsibilityFinancialConsequences(seeded.caseId, {
      db: database.client, clock,
    })).reused, false)
    const waived = await seedFinalizedCase(database.client, scenario, scenario.bookingStates.next, {
      finalization: 'ADMIN',
      analysisClassification: responsibilityClassification.DRIVER_CAUSED,
      finalClassification: responsibilityClassification.VALID_WAIVED,
    })
    await authorize(database.client, waived.caseId)
    await assert.rejects(
      applyAuthorizedResponsibilityFinancialConsequences(waived.caseId, { db: database.client, clock }),
      error => error.code === 'FINALIZED_DRIVER_CLASSIFICATION_MISSING',
    )
    assert.equal(await database.client.responsibilityLiability.count({ where: { caseId: waived.caseId } }), 0)
  })

  await t.test('unsupported incident types are durably blocked while the sweep applies supported work', async () => {
    const scenario = await seedScenario(database.client)
    const unsupported = await seedFinalizedCase(database.client, scenario, scenario.bookingStates.current)
    await database.client.responsibilityCase.update({
      where: { id: unsupported.caseId }, data: { caseType: responsibilityCaseType.DRIVER_OFFLINE },
    })
    const supported = await seedFinalizedCase(database.client, scenario, scenario.bookingStates.next)
    await Promise.all([authorize(database.client, unsupported.caseId), authorize(database.client, supported.caseId)])
    const result = await sweepResponsibilityFinancialConsequences({ db: database.client, clock, batchSize: 50 })
    assert.deepEqual(result.find(item => item.caseId === unsupported.caseId), {
      caseId: unsupported.caseId, status: 'BLOCKED', code: 'FINANCIAL_SEMANTICS_UNSUPPORTED_DRIVER_OFFLINE',
    })
    assert.deepEqual(result.find(item => item.caseId === supported.caseId), {
      caseId: supported.caseId, status: 'APPLIED',
    })
    const execution = await database.client.responsibilityConsequenceExecution.findUniqueOrThrow({
      where: { caseId: unsupported.caseId },
    })
    assert.equal(execution.financialLastError, 'FINANCIAL_SEMANTICS_UNSUPPORTED_DRIVER_OFFLINE')
    assert.ok(execution.financialAttemptedAt)
    assert.equal(await database.client.responsibilityLiability.count({ where: { caseId: unsupported.caseId } }), 0)
  })

  await t.test('the sweep persists a generic failure code when an executor has no classified error', async () => {
    const scenario = await seedScenario(database.client)
    const seeded = await seedFinalizedCase(database.client, scenario, scenario.bookingStates.current)
    await authorize(database.client, seeded.caseId)
    await database.client.responsibilityConsequenceExecution.updateMany({
      where: { caseId: { not: seeded.caseId }, financialAppliedAt: null },
      data: { financialLastError: 'FINANCIAL_SEMANTICS_UNSUPPORTED_DRIVER_OFFLINE' },
    })
    const result = await sweepResponsibilityFinancialConsequences({
      db: database.client,
      clock,
      apply: async () => { throw new Error('unclassified executor failure') },
    })
    assert.deepEqual(result, [{ caseId: seeded.caseId, status: 'BLOCKED', code: 'FINANCIAL_EXECUTION_FAILED' }])
    assert.equal((await database.client.responsibilityConsequenceExecution.findUniqueOrThrow({
      where: { caseId: seeded.caseId },
    })).financialLastError, 'FINANCIAL_EXECUTION_FAILED')
  })

  await t.test('financial records are append-only and liability-entry invariants hold in PostgreSQL', async () => {
    const scenario = await seedScenario(database.client)
    const seeded = await seedFinalizedCase(database.client, scenario, scenario.bookingStates.current)
    await authorize(database.client, seeded.caseId)
    await applyAuthorizedResponsibilityFinancialConsequences(seeded.caseId, { db: database.client, clock })

    const liability = await database.client.responsibilityLiability.findUniqueOrThrow({ where: { caseId: seeded.caseId } })
    const compensation = await database.client.responsibilityCompensation.findUniqueOrThrow({ where: { caseId: seeded.caseId } })
    const entry = await database.client.responsibilityLiabilityEntry.findFirstOrThrow({
      where: { liabilityId: liability.id, kind: 'CREATED' },
    })

    // The normal financial-consequence insert path created one row in each guarded table.
    assert.equal(await database.client.responsibilityLiability.count({ where: { id: liability.id } }), 1)
    assert.equal(await database.client.responsibilityCompensation.count({ where: { id: compensation.id } }), 1)
    assert.equal(await database.client.responsibilityLiabilityEntry.count({ where: { id: entry.id } }), 1)

    for (const execute of [
      () => database.client.$executeRaw`UPDATE "responsibility_liabilities" SET "amount_paise" = "amount_paise" + 1 WHERE "id" = ${liability.id}`,
      () => database.client.$executeRaw`DELETE FROM "responsibility_liabilities" WHERE "id" = ${liability.id}`,
      () => database.client.$executeRaw`UPDATE "responsibility_compensations" SET "amount_paise" = "amount_paise" + 1 WHERE "id" = ${compensation.id}`,
      () => database.client.$executeRaw`DELETE FROM "responsibility_compensations" WHERE "id" = ${compensation.id}`,
      () => database.client.$executeRaw`UPDATE "responsibility_liability_entries" SET "amount_paise" = "amount_paise" + 1 WHERE "id" = ${entry.id}`,
      () => database.client.$executeRaw`DELETE FROM "responsibility_liability_entries" WHERE "id" = ${entry.id}`,
    ]) {
      await assert.rejects(execute(), /records are append-only/)
    }

    for (const table of [
      'responsibility_liabilities',
      'responsibility_compensations',
      'responsibility_liability_entries',
    ]) {
      await assert.rejects(
        database.client.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE`),
        /records are append-only/,
      )
    }

    assert.equal((await database.client.responsibilityLiability.findUniqueOrThrow({ where: { id: liability.id } })).amountPaise, liability.amountPaise)
    assert.equal((await database.client.responsibilityCompensation.findUniqueOrThrow({ where: { id: compensation.id } })).amountPaise, compensation.amountPaise)
    assert.equal((await database.client.responsibilityLiabilityEntry.findUniqueOrThrow({ where: { id: entry.id } })).amountPaise, entry.amountPaise)

    await assert.rejects(
      database.client.responsibilityLiabilityEntry.create({ data: {
        liabilityId: liability.id,
        kind: 'CREATED',
        amountPaise: liability.amountPaise,
        sourceKey: `phase6c-duplicate-created:${randomUUID()}`,
      } }),
      error => error.code === 'P2002',
    )
    const checkSeeded = await seedFinalizedCase(database.client, scenario, scenario.bookingStates.next)
    await authorize(database.client, checkSeeded.caseId)
    await applyAuthorizedResponsibilityFinancialConsequences(checkSeeded.caseId, { db: database.client, clock })
    const checkLiability = await database.client.responsibilityLiability.findUniqueOrThrow({
      where: { caseId: checkSeeded.caseId },
    })
    await assert.rejects(
      database.client.responsibilityLiabilityEntry.create({ data: {
        liabilityId: checkLiability.id,
        kind: 'CREATED',
        amountPaise: checkLiability.amountPaise,
        sourceKey: `phase6c-created-with-earning:${randomUUID()}`,
        earningBookingId: seeded.booking.id,
      } }),
      error => error.cause?.code === '23514',
    )
  })

  await t.test('concurrent authorization and financial application create one liability and one compensation', async () => {
    const scenario = await seedScenario(database.client, { current: { fare: 100 } })
    const seeded = await seedFinalizedCase(database.client, scenario, scenario.bookingStates.current)
    const authorizationClients = [database.connect(), database.connect()]
    try {
      const authorizations = await Promise.all(authorizationClients.map(client => authorize(client, seeded.caseId)))
      assert.equal(authorizations.filter(result => result.reused === false).length, 1)
      assert.equal(await database.client.responsibilityConsequenceExecution.count({ where: { caseId: seeded.caseId } }), 1)
    } finally {
      await Promise.all(authorizationClients.map(client => client.$disconnect()))
    }

    const results = await raceTransactions(database, [
      async (tx, rendezvous) => { await rendezvous(); return applyAuthorizedResponsibilityFinancialConsequences(seeded.caseId, { db: tx, clock }) },
      async (tx, rendezvous) => { await rendezvous(); return applyAuthorizedResponsibilityFinancialConsequences(seeded.caseId, { db: tx, clock }) },
    ])
    for (const result of results) assert.ifError(result.status === 'rejected' ? result.reason : null)
    assert.equal(await database.client.responsibilityLiability.count({ where: { caseId: seeded.caseId } }), 1)
    assert.equal(await database.client.responsibilityCompensation.count({ where: { caseId: seeded.caseId } }), 1)
    assert.equal(await database.client.responsibilityLiabilityEntry.count({ where: { liability: { caseId: seeded.caseId }, kind: 'CREATED' } }), 1)
    assert.equal(results.filter(result => result.value.reused === false).length, 1)
    assert.equal(results.filter(result => result.value.reused === true).length, 1)
    const appliedAt = (await database.client.responsibilityConsequenceExecution.findUniqueOrThrow({
      where: { caseId: seeded.caseId },
    })).financialAppliedAt
    assert.equal((await applyAuthorizedResponsibilityFinancialConsequences(seeded.caseId, {
      db: database.client, clock: { now: () => new Date('2026-10-01T00:00:00.000Z') },
    })).reused, true)
    assert.equal((await database.client.responsibilityConsequenceExecution.findUniqueOrThrow({
      where: { caseId: seeded.caseId },
    })).financialAppliedAt?.getTime(), appliedAt?.getTime())
  })

  await t.test('a transaction crash rolls back financial rows and a retry persists one complete consequence', async () => {
    const scenario = await seedScenario(database.client, { current: { fare: 100 } })
    const seeded = await seedFinalizedCase(database.client, scenario, scenario.bookingStates.current)
    await authorize(database.client, seeded.caseId)
    let calls = 0
    const crashingClock = { now: () => {
      calls += 1
      if (calls === 2) throw new Error('injected crash after financial rows')
      return new Date(NOW)
    } }
    await assert.rejects(
      applyAuthorizedResponsibilityFinancialConsequences(seeded.caseId, { db: database.client, clock: crashingClock }),
      /injected crash after financial rows/,
    )
    assert.equal(await database.client.responsibilityLiability.count({ where: { caseId: seeded.caseId } }), 0)
    assert.equal(await database.client.responsibilityCompensation.count({ where: { caseId: seeded.caseId } }), 0)
    assert.equal((await database.client.responsibilityConsequenceExecution.findUniqueOrThrow({ where: { caseId: seeded.caseId } })).financialAppliedAt, null)

    const retried = await applyAuthorizedResponsibilityFinancialConsequences(seeded.caseId, { db: database.client, clock })
    assert.equal(retried.reused, false)
    assert.equal(await database.client.responsibilityLiability.count({ where: { caseId: seeded.caseId } }), 1)
    assert.equal(await database.client.responsibilityCompensation.count({ where: { caseId: seeded.caseId } }), 1)
    assert.ok((await database.client.responsibilityConsequenceExecution.findUniqueOrThrow({ where: { caseId: seeded.caseId } })).financialAppliedAt)
  })

  await t.test('concurrent recovery uses one controlled earning without over-recovery and keeps FIFO partial allocation', async () => {
    const scenario = await seedScenario(database.client, {
      current: { fare: 100 },
      next: { fare: 50 },
    })
    const older = await seedFinalizedCase(database.client, scenario, scenario.bookingStates.current)
    const newer = await seedFinalizedCase(database.client, scenario, scenario.bookingStates.next)
    await Promise.all([authorize(database.client, older.caseId), authorize(database.client, newer.caseId)])
    await applyAuthorizedResponsibilityFinancialConsequences(older.caseId, { db: database.client, clock })
    await applyAuthorizedResponsibilityFinancialConsequences(newer.caseId, { db: database.client, clock })

    const earningEventKey = `phase6c-earning-${randomUUID()}`
    await database.client.walletEntry.create({ data: {
      driverId: older.driverId,
      amount: 12,
      type: 'ride_collection',
      method: 'upi',
      bookingId: scenario.bookingStates.previous.id,
      eventKey: earningEventKey,
      note: 'Phase 6C controlled earning fixture',
    } })
    const results = await raceTransactions(database, [
      async (tx, rendezvous) => { await rendezvous(); return recoverFinalizedLiabilitiesFromEarning({ driverId: older.driverId, earningEventKey, db: tx }) },
      async (tx, rendezvous) => { await rendezvous(); return recoverFinalizedLiabilitiesFromEarning({ driverId: older.driverId, earningEventKey, db: tx }) },
    ])
    for (const result of results) assert.ifError(result.status === 'rejected' ? result.reason : null)
    const liabilities = await database.client.responsibilityLiability.findMany({
      where: { id: { in: [
        (await database.client.responsibilityLiability.findUniqueOrThrow({ where: { caseId: older.caseId } })).id,
        (await database.client.responsibilityLiability.findUniqueOrThrow({ where: { caseId: newer.caseId } })).id,
      ] } },
      orderBy: { createdAt: 'asc' },
      include: { entries: { where: { kind: 'RECOVERED' }, orderBy: { createdAt: 'asc' } } },
    })
    assert.deepEqual(liabilities.map(liability => liability.entries.map(entry => entry.amountPaise)), [[1000], [200]])
    assert.equal(liabilities.flatMap(liability => liability.entries).reduce((total, entry) => total + entry.amountPaise, 0), 1200)
    assert.equal(await database.client.walletEntry.count({ where: { eventKey: { startsWith: 'liability_recovery:' } } }), 2)
  })

  await t.test('concurrent reservations cannot spend the same compensation inventory twice', async () => {
    const scenario = await seedScenario(database.client, {
      previous: { fare: 1000 },
      current: { fare: 75 },
      next: { fare: 75 },
    })
    const seeded = await seedFinalizedCase(database.client, scenario, scenario.bookingStates.previous)
    await authorize(database.client, seeded.caseId)
    const applied = await applyAuthorizedResponsibilityFinancialConsequences(seeded.caseId, { db: database.client, clock })
    const results = await raceTransactions(database, [
      async (tx, rendezvous) => { await rendezvous(); return reserveResponsibilityCompensation(tx, scenario.bookingStates.current.id) },
      async (tx, rendezvous) => { await rendezvous(); return reserveResponsibilityCompensation(tx, scenario.bookingStates.next.id) },
    ])
    for (const result of results) assert.ifError(result.status === 'rejected' ? result.reason : null)
    const allocations = await database.client.responsibilityCompensationAllocation.findMany({
      where: { compensationId: applied.compensation.id }, orderBy: { bookingId: 'asc' },
    })
    assert.equal(allocations.reduce((total, allocation) => total + allocation.amountPaise, 0), applied.compensation.amountPaise)
    assert.deepEqual(allocations.map(allocation => allocation.amountPaise).sort((a, b) => a - b), [2500, 7500])
    assert.ok(allocations.every(allocation => allocation.status === 'RESERVED'))
  })

  await t.test('partial completion preserves a consumed allocation and releases the unused value', async () => {
    const scenario = await seedScenario(database.client, {
      previous: { fare: 1000 }, current: { fare: 75 },
    })
    const seeded = await seedFinalizedCase(database.client, scenario, scenario.bookingStates.previous)
    await authorize(database.client, seeded.caseId)
    await applyAuthorizedResponsibilityFinancialConsequences(seeded.caseId, { db: database.client, clock })
    await database.client.$transaction(tx => reserveResponsibilityCompensation(tx, scenario.bookingStates.current.id))
    const result = await database.client.$transaction(tx => consumeReservedResponsibilityCompensation(
      tx, scenario.bookingStates.current.id, { clock, maxPaise: 6000 },
    ))
    assert.equal(result.count, 1)
    const rows = await database.client.responsibilityCompensationAllocation.findMany({
      where: { bookingId: scenario.bookingStates.current.id }, orderBy: { amountPaise: 'desc' },
    })
    assert.deepEqual(rows.map(row => [row.status, row.amountPaise]), [
      ['CONSUMED', 6000], ['RELEASED', 1500],
    ])
  })

  await t.test('the scheduled financial sweep executes a durable finalized authorization', async () => {
    const scenario = await seedScenario(database.client, { current: { fare: 400 } })
    const seeded = await seedFinalizedCase(database.client, scenario, scenario.bookingStates.current)
    await authorize(database.client, seeded.caseId)
    const result = await sweepResponsibilityFinancialConsequences({ db: database.client, clock, batchSize: 1 })
    assert.deepEqual(result, [{ caseId: seeded.caseId, status: 'APPLIED' }])
    const execution = await database.client.responsibilityConsequenceExecution.findUniqueOrThrow({
      where: { caseId: seeded.caseId },
    })
    assert.equal(execution.financialAppliedAt?.toISOString(), NOW.toISOString())
    assert.equal(execution.financialLastError, null)
  })

  await t.test('completed assigned RCS ride funds compensation and reduces only the customer balance', async () => {
    const scenario = await seedScenario(database.client, { current: {
      fare: 400, rideFare: 400, customerPayment: 400,
      scheduledAdvanceAmount: 4000, scheduledAdvancePaidAmount: 4000,
      scheduledRemainingAmount: 36000,
    } })
    const seeded = await seedFinalizedCase(database.client, scenario, scenario.bookingStates.previous)
    await authorize(database.client, seeded.caseId)
    await applyAuthorizedResponsibilityFinancialConsequences(seeded.caseId, { db: database.client, clock })
    await database.client.$transaction(tx => reserveResponsibilityCompensation(tx, scenario.bookingStates.current.id))
    const booking = await database.client.booking.update({
      where: { id: scenario.bookingStates.current.id }, data: { status: 'started', startedAt: NOW },
    })
    const driver = await database.client.driver.findUniqueOrThrow({ where: { id: booking.driverId } })
    const args = { booking, driver, from: 'started', to: 'completed', distanceKm: 0.2, accuracy: 12,
      capturedAt: NOW.toISOString(), completionOverrideReason: null, customerConfirmedCompletion: false }
    assert.equal(await database.client.$transaction(tx => settleRideTransitionInTransaction(tx, args, NOW)), true)
    assert.equal(await database.client.$transaction(tx => settleRideTransitionInTransaction(tx, args, NOW)), false)
    const saved = await database.client.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(saved.customerPayment, 300)
    assert.equal(saved.scheduledRemainingAmount, 26000)
    const allocations = await database.client.responsibilityCompensationAllocation.findMany({
      where: { bookingId: booking.id },
    })
    assert.deepEqual(allocations.map(allocation => [allocation.status, allocation.amountPaise]), [['CONSUMED', 10000]])
    const funding = await database.client.walletEntry.findMany({ where: {
      bookingId: booking.id, type: 'responsibility_compensation_funding',
    } })
    assert.equal(funding.length, 1)
    assert.equal(funding[0].amount, 100)
    assert.equal(await database.client.walletEntry.count({ where: {
      bookingId: booking.id, type: 'liability_recovery',
    } }), 1)
    const finalIntent = await database.client.payment.findUniqueOrThrow({
      where: { idempotencyKey: `scheduled-final:${booking.id}` },
    })
    assert.equal(finalIntent.amount, 26000)
  })
})
