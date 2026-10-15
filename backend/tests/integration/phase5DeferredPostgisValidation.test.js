import test from 'node:test'
import assert from 'node:assert/strict'
import { readdir } from 'node:fs/promises'

import { createTestDatabase } from '../helpers/database.js'
import { createTestClock } from '../helpers/testClock.js'
import {
  createResponsibilityEvidence,
  evidenceCategory,
  responsibilityCaseType,
} from '../helpers/responsibilityEvidence.js'
import { createResponsibilityAnalystFake } from '../helpers/responsibilityAnalystFake.js'
import { AI_RESPONSIBILITY_CONTRACT_VERSION } from '../../services/responsibilityContracts.js'
import { responsibilityEvidenceHash } from '../../services/responsibilityAnalyst.js'
import { createPrismaResponsibilityDecisionRepository } from '../../services/responsibilityDecisionRepository.js'
import { createResponsibilityDecisionService } from '../../services/responsibilityDecisionService.js'
import {
  RESPONSIBILITY_POLICY_VERSION,
  provisionalResponsibilityRoute,
} from '../../services/responsibilityPolicyGate.js'
import { responsibilityCaseState } from '../../services/responsibilityCaseState.js'
import { assertIndependentReview, consequenceState, assertNoAutomaticAuthority } from '../helpers/phase9dCurrentPolicyWitness.js'

// Current-policy regression v1: the October 8 independent guard supersedes the
// historical automatic-route assumptions for these unchanged recorded:true fixtures.

const start = '2026-09-25T06:00:00.000Z'
const migrationsDirectory = new URL('../../prisma/migrations/', import.meta.url)

const createJournal = (caseType, caseId) => createResponsibilityEvidence({
  caseId,
  bookingId: `booking-${caseId}`,
  caseType,
  occurredAt: start,
  scheduledAt: '2026-09-25T07:00:00.000Z',
  clock: createTestClock(start),
})

const record = (journal, category, kind, options = {}) => journal.record({
  category,
  kind,
  source: options.source ?? `source-${category}`,
  value: options.value ?? { recorded: true },
  quality: options.quality ?? {},
  availability: options.availability ?? 'available',
  claimKey: options.claimKey ?? null,
})

function driverCancellationBundle(caseId) {
  const journal = createJournal(responsibilityCaseType.DRIVER_CANCELLATION, caseId)
  record(journal, evidenceCategory.BOOKING, 'scheduled_booking')
  record(journal, evidenceCategory.ASSIGNMENT, 'accepted', { quality: { fresh: true } })
  record(journal, evidenceCategory.CANCELLATION, 'driver_cancelled', { quality: { fresh: true } })
  return journal.snapshot()
}

function platformFailureBundle(caseId) {
  const journal = createJournal(responsibilityCaseType.PLATFORM_ASSIGNMENT_FAILURE, caseId)
  record(journal, evidenceCategory.BOOKING, 'scheduled_booking')
  record(journal, evidenceCategory.ASSIGNMENT, 'assignment_cycle')
  record(journal, evidenceCategory.FEASIBILITY, 'platform_infeasible', { quality: { fresh: true } })
  return journal.snapshot()
}

function serviceFor(client, mode, options = {}) {
  const analyst = options.analyst ?? createResponsibilityAnalystFake(mode)
  const repository = createPrismaResponsibilityDecisionRepository(client)
  const service = createResponsibilityDecisionService({
    analyst,
    repository,
    clock: createTestClock(start),
    hooks: options.hooks ?? {},
  })
  return { analyst, repository, service }
}

async function assertPersistedDecision(client, bundle, result, expectedRoute) {
  const evidenceHash = responsibilityEvidenceHash(bundle)
  const caseRecord = await client.responsibilityCase.findUniqueOrThrow({ where: { id: bundle.caseId } })
  const analysis = await client.responsibilityAnalysis.findFirstOrThrow({ where: { caseId: bundle.caseId } })
  const decision = await client.responsibilityProvisionalDecision.findUniqueOrThrow({ where: { caseId: bundle.caseId } })

  assert.equal(result.decision.id, decision.id)
  assert.equal(caseRecord.bookingId, bundle.bookingId)
  assert.equal(caseRecord.state, expectedRoute)
  assert.equal(caseRecord.evidenceVersion, bundle.evidenceVersion)
  assert.equal(caseRecord.evidenceHash, evidenceHash)
  assert.equal(caseRecord.evidenceSnapshot.caseId, bundle.caseId)
  assert.equal(caseRecord.scheduledAt?.toISOString(), bundle.scheduledAt)
  assert.equal(caseRecord.occurredAt?.toISOString(), bundle.occurredAt)

  assert.equal(analysis.evidenceHash, evidenceHash)
  assert.equal(analysis.contractVersion, AI_RESPONSIBILITY_CONTRACT_VERSION)
  assert.equal(analysis.provider, 'deterministic-fake')
  assert.equal(analysis.model, 'phase5-fixture')
  assert.equal(analysis.validation.valid, true)

  assert.equal(decision.evidenceVersion, bundle.evidenceVersion)
  assert.equal(decision.evidenceHash, evidenceHash)
  assert.equal(decision.analysisId, analysis.id)
  assert.equal(decision.analysisVersion, AI_RESPONSIBILITY_CONTRACT_VERSION)
  assert.equal(decision.policyVersion, RESPONSIBILITY_POLICY_VERSION)
  assert.equal(decision.route, expectedRoute)
  assert.equal(decision.evaluatedAt.toISOString(), start)
  assert.ok(Array.isArray(decision.passedGates))
  assert.ok(Array.isArray(decision.failedGates))
  assert.equal(decision.humanReviewRequired, expectedRoute === provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW)
  return { caseRecord, analysis, decision }
}

test('Phase 5 current-policy v1 persistence round-trips recommendations without invented causal authority', async t => {
  const database = await createTestDatabase()
  t.after(() => database.close())

  const migrationDirectories = (await readdir(migrationsDirectory, { withFileTypes: true }))
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort()
  const appliedMigrations = await database.client.$queryRawUnsafe(`
    SELECT migration_name, finished_at, rolled_back_at
    FROM _prisma_migrations
    ORDER BY migration_name
  `)
  assert.deepEqual(appliedMigrations.map(row => row.migration_name), migrationDirectories)
  assert.ok(appliedMigrations.every(row => row.finished_at instanceof Date && row.rolled_back_at === null))
  assert.ok(migrationDirectories.includes('20260925134000_phase5_responsibility_adjudication'))
  assert.ok(migrationDirectories.includes('20260925152000_phase6a_finalized_consequence_boundary'))
  const beforeConsequences = await consequenceState(database.client)

  const upheldBundle = driverCancellationBundle('db-upheld')
  const upheld = serviceFor(database.client, 'driver_caused')
  const upheldResult = await upheld.service.process(upheldBundle)
  const upheldStored = await assertPersistedDecision(
    database.client,
    upheldBundle,
    upheldResult,
    provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW,
  )
  assertIndependentReview(upheldStored.decision)
  assert.equal(upheldStored.analysis.envelope.output.suggestedClassification, 'DRIVER_CAUSED')
  await assertNoAutomaticAuthority(database.client, upheldBundle.caseId)

  const duplicate = await upheld.service.process(upheldBundle)
  assert.equal(duplicate.reusedDecision, true)
  assert.equal(duplicate.decision.id, upheldResult.decision.id)
  assert.equal(await database.client.responsibilityCase.count({ where: { id: upheldBundle.caseId } }), 1)
  assert.equal(await database.client.responsibilityAnalysis.count({ where: { caseId: upheldBundle.caseId } }), 1)
  assert.equal(await database.client.responsibilityProvisionalDecision.count({ where: { caseId: upheldBundle.caseId } }), 1)
  assert.equal(upheld.analyst.calls, 1)

  const replayedAnalysis = await upheld.repository.saveAnalysis(upheldStored.analysis)
  const replayedDecision = await upheld.repository.saveDecision(upheldStored.decision)
  assert.equal(replayedAnalysis.id, upheldStored.analysis.id)
  assert.equal(replayedDecision.id, upheldStored.decision.id)
  assert.equal(await database.client.responsibilityAnalysis.count({ where: { caseId: upheldBundle.caseId } }), 1)
  assert.equal(await database.client.responsibilityProvisionalDecision.count({ where: { caseId: upheldBundle.caseId } }), 1)

  const waivedBundle = platformFailureBundle('db-waived')
  const waived = serviceFor(database.client, 'platform_caused')
  const waivedResult = await waived.service.process(waivedBundle)
  const waivedStored = await assertPersistedDecision(
    database.client,
    waivedBundle,
    waivedResult,
    provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW,
  )
  assertIndependentReview(waivedStored.decision)
  assert.equal(waivedStored.analysis.envelope.output.suggestedClassification, 'PLATFORM_CAUSED')
  await assertNoAutomaticAuthority(database.client, waivedBundle.caseId)

  const reviewBundle = driverCancellationBundle('db-review')
  const review = serviceFor(database.client, 'low_confidence')
  const reviewResult = await review.service.process(reviewBundle)
  const reviewStored = await assertPersistedDecision(
    database.client,
    reviewBundle,
    reviewResult,
    provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW,
  )
  assert.ok(reviewStored.decision.failedGates.some(item => item.code === 'CONFIDENCE_FLOOR'))
  await assertNoAutomaticAuthority(database.client, reviewBundle.caseId)
  assert.deepEqual(await consequenceState(database.client), beforeConsequences)
})

test('Phase 5 current-policy v1 deduplicates review decisions and resumes after persisted-analysis crash', async t => {
  const database = await createTestDatabase()
  t.after(() => database.close())
  const beforeConsequences = await consequenceState(database.client)

  const concurrentBundle = driverCancellationBundle('db-concurrent')
  let arrived = 0
  let release
  const gate = new Promise(resolve => { release = resolve })
  const makeRacingAnalyst = () => {
    const delegate = createResponsibilityAnalystFake('driver_caused')
    return {
      provider: delegate.provider,
      model: delegate.model,
      async analyzeResponsibilityCase(bundle) {
        arrived += 1
        if (arrived === 2) release()
        await gate
        return delegate.analyzeResponsibilityCase(bundle)
      },
    }
  }
  const workerA = serviceFor(database.connect(), 'driver_caused', { analyst: makeRacingAnalyst() }).service
  const workerB = serviceFor(database.connect(), 'driver_caused', { analyst: makeRacingAnalyst() }).service
  const raced = await Promise.allSettled([workerA.process(concurrentBundle), workerB.process(concurrentBundle)])
  assert.equal(arrived, 2, 'both workers crossed the pre-persistence analyst boundary')
  const raceFailures = raced
    .filter(result => result.status === 'rejected')
    .map(result => `${result.reason?.code ?? 'NO_CODE'}:${result.reason?.message ?? String(result.reason)}`)
  assert.deepEqual(raceFailures, [])
  assert.equal(await database.client.responsibilityCase.count({ where: { id: concurrentBundle.caseId } }), 1)
  assert.equal(await database.client.responsibilityAnalysis.count({ where: { caseId: concurrentBundle.caseId } }), 1)
  assert.equal(await database.client.responsibilityProvisionalDecision.count({ where: { caseId: concurrentBundle.caseId } }), 1)
  const concurrentDecision = await database.client.responsibilityProvisionalDecision.findUniqueOrThrow({
    where: { caseId: concurrentBundle.caseId },
  })
  assertIndependentReview(concurrentDecision)
  await assertNoAutomaticAuthority(database.client, concurrentBundle.caseId)
  assert.ok(raced.every(result => result.value.decision.id === concurrentDecision.id))

  const crashBundle = driverCancellationBundle('db-crash-retry')
  const analyst = createResponsibilityAnalystFake('driver_caused')
  const repository = createPrismaResponsibilityDecisionRepository(database.client)
  const crashing = createResponsibilityDecisionService({
    analyst,
    repository,
    clock: createTestClock(start),
    hooks: { afterAnalysisPersisted: () => { throw new Error('SIMULATED_CRASH') } },
  })
  await assert.rejects(crashing.process(crashBundle), /SIMULATED_CRASH/)
  assert.equal(await database.client.responsibilityAnalysis.count({ where: { caseId: crashBundle.caseId } }), 1)
  assert.equal(await database.client.responsibilityProvisionalDecision.count({ where: { caseId: crashBundle.caseId } }), 0)
  const afterCrashCase = await database.client.responsibilityCase.findUniqueOrThrow({ where: { id: crashBundle.caseId } })
  assert.equal(afterCrashCase.state, responsibilityCaseState.AI_REVIEW)

  const retrying = createResponsibilityDecisionService({ analyst, repository, clock: createTestClock(start) })
  const retried = await retrying.process(crashBundle)
  assertIndependentReview(retried.decision)
  await assertNoAutomaticAuthority(database.client, crashBundle.caseId)
  assert.equal(analyst.calls, 1, 'retry reused the persisted analysis')
  assert.equal(await database.client.responsibilityCase.count({ where: { id: crashBundle.caseId } }), 1)
  assert.equal(await database.client.responsibilityAnalysis.count({ where: { caseId: crashBundle.caseId } }), 1)
  assert.equal(await database.client.responsibilityProvisionalDecision.count({ where: { caseId: crashBundle.caseId } }), 1)
  assert.deepEqual(await consequenceState(database.client), beforeConsequences)

  const phase5ForeignKeys = await database.client.$queryRawUnsafe(`
    SELECT conname
    FROM pg_constraint
    WHERE contype = 'f'
      AND conrelid IN (
        'responsibility_cases'::regclass,
        'responsibility_analyses'::regclass,
        'responsibility_provisional_decisions'::regclass
      )
  `)
  assert.deepEqual(phase5ForeignKeys, [], 'Phase 5 audit rows have no cascade path from unrelated records')
})
