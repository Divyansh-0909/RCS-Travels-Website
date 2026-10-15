import test from 'node:test'
import assert from 'node:assert/strict'

import { createTestClock } from './helpers/testClock.js'
import { createResponsibilityAnalystFake } from './helpers/responsibilityAnalystFake.js'
import {
  createResponsibilityEvidence,
  evidenceCategory,
  responsibilityCaseType,
} from '../services/responsibilityEvidence.js'
import { responsibilityEvidenceHash } from '../services/responsibilityAnalyst.js'
import { responsibilityCaseState } from '../services/responsibilityCaseState.js'
import {
  createResponsibilityShadowAdjudicator,
  createProductionResponsibilityAnalyst,
  getResponsibilityAdjudicationHealth,
  loadProductionResponsibilityAnalystClient,
  retryResponsibilityShadowCase,
  responsibilityShadowWorkStatus,
  summarizeResponsibilityShadowOutcomes,
  sweepResponsibilityShadowAdjudication,
} from '../services/responsibilityShadowAdjudication.js'
import {
  RESPONSIBILITY_ADJUDICATION_MODES,
  RESPONSIBILITY_ANALYST_CONFIG_VERSION,
  RESPONSIBILITY_SHADOW_BASE_RETRY_MS,
  RESPONSIBILITY_SHADOW_LEASE_MS,
  RESPONSIBILITY_SHADOW_MAX_ATTEMPTS,
  RESPONSIBILITY_SHADOW_MAX_MANUAL_RETRIES,
  RESPONSIBILITY_SHADOW_MAX_RETRY_MS,
  responsibilityAdjudicationMode,
  responsibilityShadowLogicalKey,
  responsibilityShadowRetryDelayMs,
} from '../services/responsibilityShadowConfig.js'
import { AI_RESPONSIBILITY_CONTRACT_VERSION } from '../services/responsibilityContracts.js'
import { provisionalResponsibilityRoute, RESPONSIBILITY_POLICY_VERSION } from '../services/responsibilityPolicyGate.js'

const NOW = '2026-09-29T10:00:00.000Z'

const record = (journal, category, kind, options = {}) => journal.record({
  category,
  kind,
  source: options.source ?? `source:${category}`,
  value: options.value ?? { recorded: true },
  quality: options.quality ?? { fresh: true },
  availability: options.availability ?? 'available',
  claimKey: options.claimKey ?? null,
})

function bundle(caseType = responsibilityCaseType.DRIVER_CANCELLATION, caseId = 'shadow-case') {
  const journal = createResponsibilityEvidence({
    caseId,
    caseType,
    bookingId: `booking-${caseId}`,
    occurredAt: NOW,
    scheduledAt: '2026-09-29T11:00:00.000Z',
    clock: createTestClock(NOW),
  })
  const byType = {
    DRIVER_CANCELLATION: [evidenceCategory.BOOKING, evidenceCategory.ASSIGNMENT, evidenceCategory.CANCELLATION],
    PLATFORM_ASSIGNMENT_FAILURE: [evidenceCategory.BOOKING, evidenceCategory.ASSIGNMENT, evidenceCategory.FEASIBILITY],
    DRIVER_LATE: [evidenceCategory.BOOKING, evidenceCategory.ASSIGNMENT, evidenceCategory.ROUTING, evidenceCategory.LOCATION],
  }
  for (const category of byType[caseType] ?? []) {
    const value = category === evidenceCategory.CANCELLATION
      ? { initiator: 'driver', avoidable: true, platformIssueObserved: false }
      : category === evidenceCategory.FEASIBILITY
        ? { assignmentFeasible: false, platformCapacityAvailable: false } : { recorded: true }
    record(journal, category, `recorded-${category}`, { value })
  }
  return journal.snapshot()
}

function contradictoryLateBundle(caseId = 'contradiction') {
  const journal = createResponsibilityEvidence({
    caseId,
    caseType: responsibilityCaseType.DRIVER_LATE,
    bookingId: `booking-${caseId}`,
    occurredAt: NOW,
    clock: createTestClock(NOW),
  })
  record(journal, evidenceCategory.BOOKING, 'booking')
  record(journal, evidenceCategory.ASSIGNMENT, 'assignment')
  record(journal, evidenceCategory.ROUTING, 'route')
  record(journal, evidenceCategory.LOCATION, 'gps-a', { claimKey: 'driver.position', value: { lat: 28.6 } })
  record(journal, evidenceCategory.LOCATION, 'gps-b', { claimKey: 'driver.position', value: { lat: 28.9 } })
  return journal.snapshot()
}

function incompleteCancellationBundle(caseId = 'missing') {
  const journal = createResponsibilityEvidence({
    caseId,
    caseType: responsibilityCaseType.DRIVER_CANCELLATION,
    bookingId: `booking-${caseId}`,
    occurredAt: NOW,
    clock: createTestClock(NOW),
  })
  record(journal, evidenceCategory.BOOKING, 'booking')
  record(journal, evidenceCategory.ASSIGNMENT, 'assignment')
  return journal.snapshot()
}

function createMemoryRepository(evidenceList) {
  const works = evidenceList.map((snapshot, index) => ({
    id: `work-${index + 1}`,
    caseId: snapshot?.caseId ?? `poison-${index + 1}`,
    evidenceVersionId: `evidence-${index + 1}`,
    analystConfigVersion: 'responsibility-analyst-config-v1',
    policyVersion: 'scheduled-responsibility-policy-v1',
    status: 'PENDING',
    attemptCount: 0,
    claimedAt: null,
    leaseUntil: null,
    nextRetryAt: null,
    evidenceVersion: {
      id: `evidence-${index + 1}`,
      evidenceHash: snapshot?.caseId ? responsibilityEvidenceHash(snapshot) : 'invalid-hash',
      snapshot,
    },
  }))
  const results = []
  const failures = []
  const claimCalls = []
  return {
    works,
    results,
    failures,
    claimCalls,
    async claimNext({ now, leaseUntil, maxAttempts }) {
      claimCalls.push({ now, leaseUntil, maxAttempts })
      const work = works.find(item => item.attemptCount < maxAttempts && (
        item.status === 'PENDING'
        || (item.status === 'RETRYABLE' && (!item.nextRetryAt || item.nextRetryAt <= now))
        || (item.status === 'PROCESSING' && item.leaseUntil && item.leaseUntil <= now)
      ))
      if (!work) return null
      work.status = 'PROCESSING'
      work.attemptCount += 1
      work.claimedAt = new Date(now)
      work.leaseUntil = new Date(leaseUntil)
      work.nextRetryAt = null
      return work
    },
    async complete(work, result, completedAt) {
      if (work.status !== 'PROCESSING') return { completed: false, result: results.find(row => row.workId === work.id) ?? null }
      const existing = results.find(row => row.workId === work.id)
      if (!existing) results.push({ id: `result-${results.length + 1}`, ...result, createdAt: completedAt })
      work.status = 'COMPLETED'
      work.completedAt = completedAt
      return { completed: true, result: results.find(row => row.workId === work.id) }
    },
    async fail(work, failure) {
      work.status = failure.status
      work.nextRetryAt = failure.nextRetryAt
      work.lastErrorCategory = failure.errorCategory
      work.lastErrorDetail = failure.errorDetail
      failures.push({ workId: work.id, ...failure })
      return { changed: true, at: failure.now }
    },
  }
}

const serviceFor = ({ snapshots, mode = 'shadow', analystMode = 'driver_caused', clock = createTestClock(NOW), maxAttempts } = {}) => {
  const repository = createMemoryRepository(snapshots ?? [bundle()])
  const analyst = createResponsibilityAnalystFake(analystMode)
  const adjudicator = createResponsibilityShadowAdjudicator({ repository, analyst, mode, clock, maxAttempts })
  return { repository, analyst, adjudicator }
}

test('A/R: clean driver cancellation produces a shadow auto-uphold candidate with no operative consequence fields', async () => {
  const { repository, adjudicator } = serviceFor({})
  const summary = await adjudicator.sweep()
  assert.equal(summary.status, 'SHADOW')
  assert.equal(summary.processed, 1)
  assert.equal(summary.outcomes[0].route, provisionalResponsibilityRoute.PROVISIONAL_AUTO_UPHELD)
  assert.equal(repository.results.length, 1)
  assert.equal(repository.results[0].mode, 'SHADOW')
  assert.equal(repository.results[0].analysisEnvelope.analysisId, repository.results[0].analysisProviderId)
  assert.equal(repository.results[0].analysisEnvelope.output.suggestedClassification, repository.results[0].suggestedClassification)
  assert.equal(repository.results[0].factualValidation.valid, true)
  for (const forbidden of ['finalDecision', 'liability', 'compensation', 'strike', 'block', 'appealWindow']) {
    assert.equal(forbidden in repository.results[0], false)
  }
})

test('B/C/D: platform-caused and valid-waived can shadow-waive while uncertainty stays review-only', async () => {
  for (const [analystMode, expected] of [
    ['platform_caused', provisionalResponsibilityRoute.PROVISIONAL_AUTO_WAIVED],
    ['valid_waived', provisionalResponsibilityRoute.PROVISIONAL_AUTO_WAIVED],
    ['external_uncertain', provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW],
  ]) {
    const snapshot = structuredClone(analystMode === 'platform_caused'
      ? bundle(responsibilityCaseType.PLATFORM_ASSIGNMENT_FAILURE, analystMode)
      : bundle(responsibilityCaseType.DRIVER_CANCELLATION, analystMode))
    if (analystMode === 'valid_waived') {
      snapshot.timeline.find(item => item.category === 'cancellation').value = { reasonCode: 'APPROVED_OPERATIONAL_WAIVER', corroborated: true }
    }
    const { adjudicator } = serviceFor({ snapshots: [snapshot], analystMode })
    const summary = await adjudicator.sweep()
    assert.equal(summary.outcomes[0].route, expected)
  }
})

test('E/F: missing or contradictory evidence is preserved and deterministically routes to shadow admin review', async () => {
  for (const snapshot of [incompleteCancellationBundle(), contradictoryLateBundle()]) {
    const { repository, adjudicator } = serviceFor({ snapshots: [snapshot] })
    await adjudicator.sweep()
    assert.equal(repository.results[0].route, provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW)
    assert.ok(repository.results[0].failedGates.length > 0)
  }
})

test('G: analyst timeout persists bounded retry state with backoff', async () => {
  const { repository, adjudicator } = serviceFor({ analystMode: 'timeout', maxAttempts: 2 })
  const first = await adjudicator.sweep()
  assert.equal(first.outcomes[0].status, responsibilityShadowWorkStatus.RETRYABLE)
  assert.equal(repository.works[0].lastErrorCategory, 'ANALYST_TIMEOUT')
  assert.equal(repository.works[0].nextRetryAt.getTime(), new Date(NOW).getTime() + RESPONSIBILITY_SHADOW_BASE_RETRY_MS)
})

test('H/I: malformed output and invented evidence references fail closed to manual review with no shadow result', async () => {
  for (const analystMode of ['malformed', 'invented_evidence_reference']) {
    const { repository, adjudicator } = serviceFor({ analystMode })
    const summary = await adjudicator.sweep()
    assert.equal(summary.outcomes[0].status, responsibilityShadowWorkStatus.MANUAL_REVIEW)
    assert.equal(repository.results.length, 0)
    assert.match(repository.works[0].lastErrorCategory, /^ANALYSIS_VALIDATION_/)
  }
})

test('L: an expired processing lease is reclaimable after a simulated worker crash', async () => {
  const clock = createTestClock(NOW)
  const { repository, adjudicator } = serviceFor({ clock })
  repository.works[0].status = 'PROCESSING'
  repository.works[0].attemptCount = 1
  repository.works[0].leaseUntil = new Date(new Date(NOW).getTime() - 1)
  const summary = await adjudicator.sweep()
  assert.equal(summary.outcomes[0].status, responsibilityShadowWorkStatus.COMPLETED)
  assert.equal(repository.works[0].attemptCount, 2)
})

test('M: a poison case does not starve the valid case behind it', async () => {
  const good = bundle(responsibilityCaseType.DRIVER_CANCELLATION, 'good-after-poison')
  const repository = createMemoryRepository([{ malformed: true }, good])
  const adjudicator = createResponsibilityShadowAdjudicator({
    repository,
    analyst: createResponsibilityAnalystFake('driver_caused'),
    mode: 'shadow',
    clock: createTestClock(NOW),
  })
  const summary = await adjudicator.sweep({ batchSize: 2 })
  assert.equal(summary.outcomes[0].status, responsibilityShadowWorkStatus.MANUAL_REVIEW)
  assert.equal(summary.outcomes[1].status, responsibilityShadowWorkStatus.COMPLETED)
  assert.equal(repository.results.length, 1)
})

test('P/Q: disabled is an immediate kill switch and re-enabling shadow drains the untouched backlog', async () => {
  const repository = createMemoryRepository([bundle()])
  const analyst = createResponsibilityAnalystFake('driver_caused')
  const disabled = createResponsibilityShadowAdjudicator({ repository, analyst, mode: 'disabled', clock: createTestClock(NOW) })
  assert.deepEqual(await disabled.sweep(), { status: 'DISABLED', processed: 0, outcomes: [] })
  assert.equal(repository.works[0].status, 'PENDING')
  assert.equal(analyst.calls, 0)

  const enabled = createResponsibilityShadowAdjudicator({ repository, analyst, mode: 'shadow', clock: createTestClock(NOW) })
  assert.equal((await enabled.sweep()).outcomes[0].status, responsibilityShadowWorkStatus.COMPLETED)
  assert.equal(analyst.calls, 1)
})

test('mode parsing fails closed and retry backoff is bounded', () => {
  assert.deepEqual(responsibilityShadowWorkStatus, {
    PENDING: 'PENDING',
    PROCESSING: 'PROCESSING',
    RETRYABLE: 'RETRYABLE',
    COMPLETED: 'COMPLETED',
    MANUAL_REVIEW: 'MANUAL_REVIEW',
  })
  assert.equal(RESPONSIBILITY_ANALYST_CONFIG_VERSION, 'responsibility-analyst-config-v1')
  assert.equal(RESPONSIBILITY_SHADOW_LEASE_MS, 120_000)
  assert.equal(RESPONSIBILITY_SHADOW_MAX_ATTEMPTS, 4)
  assert.equal(RESPONSIBILITY_SHADOW_MAX_MANUAL_RETRIES, 2)
  assert.equal(RESPONSIBILITY_SHADOW_BASE_RETRY_MS, 30_000)
  assert.equal(RESPONSIBILITY_SHADOW_MAX_RETRY_MS, 900_000)
  assert.equal(
    responsibilityShadowLogicalKey({ caseId: 'case-1', evidenceHash: 'hash-1' }),
    ['shadow', 'case-1', 'hash-1', AI_RESPONSIBILITY_CONTRACT_VERSION, 'responsibility-analyst-config-v1', RESPONSIBILITY_POLICY_VERSION].join(':'),
  )
  assert.equal(responsibilityAdjudicationMode({ RESPONSIBILITY_ADJUDICATION_MODE: 'shadow' }), RESPONSIBILITY_ADJUDICATION_MODES.SHADOW)
  assert.equal(responsibilityAdjudicationMode({ RESPONSIBILITY_ADJUDICATION_MODE: 'disabled' }), RESPONSIBILITY_ADJUDICATION_MODES.DISABLED)
  assert.throws(() => responsibilityAdjudicationMode({}), /RESPONSIBILITY_ADJUDICATION_MODE_REQUIRED/)
  assert.throws(() => responsibilityAdjudicationMode({ RESPONSIBILITY_ADJUDICATION_MODE: 'active' }), /RESPONSIBILITY_ADJUDICATION_MODE_INVALID/)
  assert.equal(responsibilityShadowRetryDelayMs(1), RESPONSIBILITY_SHADOW_BASE_RETRY_MS)
  assert.equal(responsibilityShadowRetryDelayMs(2), 60_000)
  assert.equal(responsibilityShadowRetryDelayMs(3), 120_000)
  assert.equal(responsibilityShadowRetryDelayMs(99), 15 * 60 * 1000)
})

test('production analyst loader and shadow outcome telemetry stay explicit without a live model request', async () => {
  const previousKey = process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY = 'phase7-test-key'
  try {
    const module = await loadProductionResponsibilityAnalystClient()
    assert.ok(module.openai)
    assert.equal(await loadProductionResponsibilityAnalystClient(), module)
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = previousKey
  }
  assert.deepEqual(summarizeResponsibilityShadowOutcomes([
    { status: responsibilityShadowWorkStatus.COMPLETED },
    { status: responsibilityShadowWorkStatus.RETRYABLE },
    { status: responsibilityShadowWorkStatus.MANUAL_REVIEW },
    { status: 'LEASE_RECOVERY_REQUIRED' },
  ]), { completed: 1, retrying: 1, manualReview: 1 })

  const evidence = bundle()
  const fixtureEnvelope = await createResponsibilityAnalystFake('driver_caused').analyzeResponsibilityCase(evidence)
  let loaderCalls = 0
  let parseCalls = 0
  const productionAnalyst = createProductionResponsibilityAnalyst({
    clientModuleLoader: async () => {
      loaderCalls += 1
      return {
        openai: {
          responses: {
            parse: async () => {
              parseCalls += 1
              return {
                id: 'phase7-production-loader-test',
                output_parsed: fixtureEnvelope.output,
                usage: { input_tokens: 3, output_tokens: 2, total_tokens: 5 },
              }
            },
          },
        },
      }
    },
  })
  const loadedEnvelope = await productionAnalyst.analyzeResponsibilityCase(evidence)
  assert.equal(loaderCalls, 1)
  assert.equal(parseCalls, 1)
  assert.equal(loadedEnvelope.provider, 'openai')
  assert.equal(loadedEnvelope.analysisId, 'phase7-production-loader-test')
})

test('adjudicator construction rejects missing dependencies and unsupported modes', () => {
  const analyst = createResponsibilityAnalystFake('driver_caused')
  assert.throws(() => createResponsibilityShadowAdjudicator({ analyst, mode: 'shadow' }), /repository is required/i)
  assert.throws(() => createResponsibilityShadowAdjudicator({ repository: {}, mode: 'shadow' }), /analyst is required/i)
  assert.throws(() => createResponsibilityShadowAdjudicator({ repository: {}, analyst, mode: 'active' }), /RESPONSIBILITY_ADJUDICATION_MODE_INVALID/)
})

test('provider/schema failures are redacted, classified, and bounded without inventing outcomes', async () => {
  const snapshot = bundle()
  for (const [thrown, expectedCategory, expectedStatus] of [
    [null, 'ANALYST_PROVIDER_FAILURE', responsibilityShadowWorkStatus.RETRYABLE],
    [Object.assign(new Error('provider sk-secret Bearer abc.def failed'), { code: 'EAI' }), 'ANALYST_PROVIDER_FAILURE', responsibilityShadowWorkStatus.RETRYABLE],
    [{ name: 'ZodError', code: 'BAD_SCHEMA', message: 'bad output' }, 'ANALYST_SCHEMA_FAILURE', responsibilityShadowWorkStatus.MANUAL_REVIEW],
    [{ name: 'AbortError', message: 'aborted' }, 'ANALYST_TIMEOUT', responsibilityShadowWorkStatus.RETRYABLE],
  ]) {
    const repository = createMemoryRepository([snapshot])
    const adjudicator = createResponsibilityShadowAdjudicator({
      repository,
      analyst: { analyzeResponsibilityCase: async () => { throw thrown } },
      mode: 'shadow',
      clock: createTestClock(NOW),
      maxAttempts: 2,
    })
    const outcome = (await adjudicator.sweep()).outcomes[0]
    assert.equal(outcome.errorCategory, expectedCategory)
    assert.equal(outcome.status, expectedStatus)
    assert.equal(repository.results.length, 0)
    if (repository.works[0].lastErrorDetail) {
      assert.equal(repository.works[0].lastErrorDetail.includes('sk-secret'), false)
      assert.equal(repository.works[0].lastErrorDetail.includes('Bearer abc.def'), false)
    }
  }

  const redactedRepository = createMemoryRepository([snapshot])
  const secretError = Object.assign(new Error('provider sk-secret123 Bearer abc.def failed'), { code: 'EAI' })
  await createResponsibilityShadowAdjudicator({
    repository: redactedRepository,
    analyst: { analyzeResponsibilityCase: async () => { throw secretError } },
    mode: 'shadow',
    clock: createTestClock(NOW),
    maxAttempts: 2,
  }).sweep()
  assert.equal(redactedRepository.works[0].lastErrorDetail, 'Error:EAI:provider [redacted] Bearer [redacted] failed')

  const fallbackRepository = createMemoryRepository([snapshot])
  await createResponsibilityShadowAdjudicator({
    repository: fallbackRepository,
    analyst: { analyzeResponsibilityCase: async () => { throw null } },
    mode: 'shadow',
    clock: createTestClock(NOW),
    maxAttempts: 2,
  }).sweep()
  assert.equal(fallbackRepository.works[0].lastErrorDetail, 'Error:adjudication failure')

  const namedRepository = createMemoryRepository([snapshot])
  await createResponsibilityShadowAdjudicator({
    repository: namedRepository,
    analyst: { analyzeResponsibilityCase: async () => { throw { name: 'ProviderError', message: 'oops' } } },
    mode: 'shadow',
    clock: createTestClock(NOW),
    maxAttempts: 2,
  }).sweep()
  assert.equal(namedRepository.works[0].lastErrorDetail, 'ProviderError:oops')

  const whitespaceSecretRepository = createMemoryRepository([snapshot])
  await createResponsibilityShadowAdjudicator({
    repository: whitespaceSecretRepository,
    analyst: { analyzeResponsibilityCase: async () => { throw new Error('Bearer  abc.def') } },
    mode: 'shadow',
    clock: createTestClock(NOW),
    maxAttempts: 2,
  }).sweep()
  assert.equal(whitespaceSecretRepository.works[0].lastErrorDetail, 'Error:Bearer [redacted]')

  const longDetailRepository = createMemoryRepository([snapshot])
  await createResponsibilityShadowAdjudicator({
    repository: longDetailRepository,
    analyst: { analyzeResponsibilityCase: async () => { throw Object.assign(new Error('x'.repeat(300)), { code: 'LONG' }) } },
    mode: 'shadow',
    clock: createTestClock(NOW),
    maxAttempts: 2,
  }).sweep()
  assert.equal(longDetailRepository.works[0].lastErrorDetail, `Error:LONG:${'x'.repeat(240)}`)

  const exhaustedRepository = createMemoryRepository([snapshot])
  exhaustedRepository.works[0].attemptCount = 1
  const exhausted = await createResponsibilityShadowAdjudicator({
    repository: exhaustedRepository,
    analyst: { analyzeResponsibilityCase: async () => { throw Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }) } },
    mode: 'shadow',
    clock: createTestClock(NOW),
    maxAttempts: 2,
  }).sweep()
  assert.equal(exhausted.outcomes[0].status, responsibilityShadowWorkStatus.MANUAL_REVIEW)
  assert.equal(exhausted.outcomes[0].nextRetryAt, null)
})

test('usage defaults, evidence integrity, and stale completion remain conservative', async () => {
  const snapshot = bundle()
  const baseAnalyst = createResponsibilityAnalystFake('driver_caused')
  const repository = createMemoryRepository([snapshot])
  const adjudicator = createResponsibilityShadowAdjudicator({
    repository,
    analyst: {
      analyzeResponsibilityCase: async evidence => {
        const envelope = await baseAnalyst.analyzeResponsibilityCase(evidence)
        const withoutUsage = { ...envelope }
        delete withoutUsage.usage
        return withoutUsage
      },
    },
    mode: 'shadow',
    clock: createTestClock(NOW),
  })
  await adjudicator.sweep()
  assert.equal(repository.results[0].inputTokens, null)
  assert.equal(repository.results[0].outputTokens, null)
  assert.equal(repository.results[0].requestCount, 1)

  const usageRepository = createMemoryRepository([snapshot])
  const usageAdjudicator = createResponsibilityShadowAdjudicator({
    repository: usageRepository,
    analyst: {
      analyzeResponsibilityCase: async evidence => ({
        ...(await baseAnalyst.analyzeResponsibilityCase(evidence)),
        usage: { inputTokens: 12, outputTokens: 7, totalTokens: 19, requestCount: 2 },
      }),
    },
    mode: 'shadow',
    clock: createTestClock(NOW),
  })
  await usageAdjudicator.sweep()
  assert.equal(usageRepository.results[0].inputTokens, 12)
  assert.equal(usageRepository.results[0].outputTokens, 7)
  assert.equal(usageRepository.results[0].requestCount, 2)

  const missingVersion = createMemoryRepository([snapshot])
  missingVersion.works[0].evidenceVersion = null
  const missingVersionOutcome = await createResponsibilityShadowAdjudicator({
    repository: missingVersion, analyst: baseAnalyst, mode: 'shadow', clock: createTestClock(NOW),
  }).sweep()
  assert.equal(missingVersionOutcome.outcomes[0].status, responsibilityShadowWorkStatus.MANUAL_REVIEW)
  assert.equal(missingVersion.works[0].lastErrorCategory, 'EVIDENCE_SCHEMA_INVALID')

  const wrongHash = createMemoryRepository([snapshot])
  wrongHash.works[0].evidenceVersion.evidenceHash = 'wrong-hash'
  const hashOutcome = await createResponsibilityShadowAdjudicator({
    repository: wrongHash, analyst: baseAnalyst, mode: 'shadow', clock: createTestClock(NOW),
  }).sweep()
  assert.equal(hashOutcome.outcomes[0].status, responsibilityShadowWorkStatus.MANUAL_REVIEW)
  assert.equal(wrongHash.works[0].lastErrorCategory, 'EVIDENCE_INTEGRITY_MISMATCH')
  assert.equal(wrongHash.works[0].lastErrorDetail, 'Persisted evidence identity/hash mismatch')

  const wrongCase = createMemoryRepository([snapshot])
  wrongCase.works[0].caseId = 'different-case'
  const caseOutcome = await createResponsibilityShadowAdjudicator({
    repository: wrongCase, analyst: baseAnalyst, mode: 'shadow', clock: createTestClock(NOW),
  }).sweep()
  assert.equal(caseOutcome.outcomes[0].status, responsibilityShadowWorkStatus.MANUAL_REVIEW)
  assert.equal(wrongCase.works[0].lastErrorCategory, 'EVIDENCE_INTEGRITY_MISMATCH')

  const poison = createMemoryRepository([{ malformed: true }])
  const poisonOutcome = await createResponsibilityShadowAdjudicator({
    repository: poison, analyst: baseAnalyst, mode: 'shadow', clock: createTestClock(NOW),
  }).sweep()
  assert.equal(poisonOutcome.outcomes[0].status, responsibilityShadowWorkStatus.MANUAL_REVIEW)
  assert.equal(poison.works[0].lastErrorCategory, 'EVIDENCE_SCHEMA_INVALID')
  assert.equal(poison.works[0].lastErrorDetail, 'Persisted evidence failed schema validation')

  const multiErrorRepository = createMemoryRepository([snapshot])
  const multiErrorAdjudicator = createResponsibilityShadowAdjudicator({
    repository: multiErrorRepository,
    analyst: {
      analyzeResponsibilityCase: async evidence => {
        const envelope = await baseAnalyst.analyzeResponsibilityCase(evidence)
        const statement = envelope.output.factsSupporting[0].statement
        envelope.output.caseId = 'different-case'
        envelope.output.factsSupporting[0].evidenceIds = ['invented-evidence']
        envelope.output.factsAgainst = [{
          type: 'FACT', evidenceIds: ['invented-evidence'], statement,
        }]
        return envelope
      },
    },
    mode: 'shadow',
    clock: createTestClock(NOW),
  })
  const multiErrorOutcome = await multiErrorAdjudicator.sweep()
  assert.equal(multiErrorOutcome.outcomes[0].status, responsibilityShadowWorkStatus.MANUAL_REVIEW)
  assert.equal(
    multiErrorRepository.works[0].lastErrorDetail,
    'CASE_ID_MISMATCH,INVENTED_EVIDENCE_REFERENCE,SELF_CONTRADICTORY_FACTS',
  )

  const stale = createMemoryRepository([snapshot])
  stale.complete = async () => ({ completed: false, result: null })
  const staleOutcome = await createResponsibilityShadowAdjudicator({
    repository: stale, analyst: baseAnalyst, mode: 'shadow', clock: createTestClock(NOW),
  }).sweep()
  assert.equal(staleOutcome.outcomes[0].status, 'STALE_CLAIM')
  assert.equal(staleOutcome.outcomes[0].route, provisionalResponsibilityRoute.PROVISIONAL_AUTO_UPHELD)

  const timedClock = createTestClock(NOW)
  const timedRepository = createMemoryRepository([snapshot])
  const timedAnalyst = createResponsibilityAnalystFake('driver_caused')
  const timed = createResponsibilityShadowAdjudicator({
    repository: timedRepository,
    analyst: {
      analyzeResponsibilityCase: async evidence => {
        timedClock.advance(123)
        return timedAnalyst.analyzeResponsibilityCase(evidence)
      },
    },
    mode: 'shadow',
    clock: timedClock,
  })
  await timed.sweep({ batchSize: 1 })
  assert.equal(timedRepository.results[0].processingLatencyMs, 123)
  assert.equal(timedRepository.claimCalls.length, 1)
  assert.equal(timedRepository.claimCalls[0].maxAttempts, RESPONSIBILITY_SHADOW_MAX_ATTEMPTS)
  assert.equal(
    timedRepository.claimCalls[0].leaseUntil.getTime() - timedRepository.claimCalls[0].now.getTime(),
    RESPONSIBILITY_SHADOW_LEASE_MS,
  )
})

test('unexpected processing failures become retryable or lease-recovery outcomes without stalling the sweep', async () => {
  const snapshot = bundle()
  const analyst = createResponsibilityAnalystFake('driver_caused')
  const retryRepository = createMemoryRepository([snapshot])
  retryRepository.complete = async () => { throw Object.assign(new Error('database temporarily unavailable'), { code: 'DB_TEMP' }) }
  const retrySummary = await createResponsibilityShadowAdjudicator({
    repository: retryRepository, analyst, mode: 'shadow', clock: createTestClock(NOW), maxAttempts: 3,
  }).sweep()
  assert.equal(retrySummary.outcomes[0].status, responsibilityShadowWorkStatus.RETRYABLE)
  assert.equal(retrySummary.outcomes[0].errorCategory, 'PROCESSING_FAILURE')

  const lostLeaseRepository = createMemoryRepository([snapshot])
  lostLeaseRepository.complete = async () => { throw new Error('database unavailable') }
  lostLeaseRepository.fail = async () => { throw new Error('cannot persist failure') }
  const lostLeaseSummary = await createResponsibilityShadowAdjudicator({
    repository: lostLeaseRepository, analyst, mode: 'shadow', clock: createTestClock(NOW),
  }).sweep()
  assert.deepEqual(lostLeaseSummary.outcomes[0], { status: 'LEASE_RECOVERY_REQUIRED', caseId: snapshot.caseId })
})

const emptyHealthDb = () => ({
  responsibilityAdjudicationWork: {
    groupBy: async () => [],
    findFirst: async () => null,
    count: async () => 0,
  },
  responsibilityShadowResult: {
    count: async () => 0,
    groupBy: async () => [],
    aggregate: async () => ({ _avg: { processingLatencyMs: null } }),
  },
})

test('production sweep and health helpers fail closed on configuration without touching consequences', async () => {
  assert.deepEqual(await sweepResponsibilityShadowAdjudication({ env: {}, db: {} }), {
    status: 'CONFIG_ERROR', processed: 0, code: 'RESPONSIBILITY_ADJUDICATION_MODE_REQUIRED', outcomes: [],
  })
  const disabled = await sweepResponsibilityShadowAdjudication({
    env: { RESPONSIBILITY_ADJUDICATION_MODE: 'disabled' }, db: {}, analyst: null, clock: createTestClock(NOW),
  })
  assert.deepEqual(disabled, { status: 'DISABLED', processed: 0, outcomes: [] })

  const infoCalls = []
  const originalInfo = console.info
  let zeroBatch
  try {
    console.info = (...args) => infoCalls.push(args)
    zeroBatch = await sweepResponsibilityShadowAdjudication({
      env: { RESPONSIBILITY_ADJUDICATION_MODE: 'shadow' },
      db: {},
      analyst: createResponsibilityAnalystFake('driver_caused'),
      clock: createTestClock(NOW),
      batchSize: 0,
    })
  } finally {
    console.info = originalInfo
  }
  assert.deepEqual(zeroBatch, { status: 'SHADOW', processed: 0, outcomes: [] })
  assert.equal(infoCalls.length, 1)
  assert.equal(infoCalls[0][0], 'responsibility shadow adjudication')
  assert.deepEqual(JSON.parse(infoCalls[0][1]), {
    status: 'SHADOW', processed: 0, completed: 0, retrying: 0, manualReview: 0,
  })

  const explodingEnv = new Proxy({}, { get: () => { throw new Error('env unavailable') } })
  await assert.rejects(sweepResponsibilityShadowAdjudication({ env: explodingEnv, db: {} }), /env unavailable/)

  const healthy = await getResponsibilityAdjudicationHealth({
    db: emptyHealthDb(), clock: createTestClock(NOW), env: { RESPONSIBILITY_ADJUDICATION_MODE: 'shadow' },
  })
  assert.equal(healthy.mode, 'shadow')
  assert.equal(healthy.configError, null)
  const invalid = await getResponsibilityAdjudicationHealth({ db: emptyHealthDb(), clock: createTestClock(NOW), env: {} })
  assert.equal(invalid.mode, 'invalid')
  assert.equal(invalid.configError, 'RESPONSIBILITY_ADJUDICATION_MODE_REQUIRED')
  const generic = await getResponsibilityAdjudicationHealth({ db: emptyHealthDb(), clock: createTestClock(NOW), env: explodingEnv })
  assert.equal(generic.configError, 'CONFIG_ERROR')
})

function retryDb(evidence) {
  const hash = responsibilityEvidenceHash(evidence)
  let caseRow = null
  let latestWork = null
  let manualWork = null
  const tx = {
    responsibilityCase: {
      findUnique: async () => caseRow,
      update: async ({ data }) => { caseRow = { ...caseRow, ...data }; return caseRow },
    },
    responsibilityEvidenceVersion: { upsert: async ({ create }) => ({ id: 'retry-evidence', ...create }) },
    responsibilityAdjudicationWork: {
      upsert: async ({ create }) => { latestWork = { id: 'retry-work', ...create }; return latestWork },
      findFirst: async () => latestWork,
      findUniqueOrThrow: async () => manualWork,
      update: async ({ data }) => { manualWork = { ...manualWork, ...data, manualRetryCount: (manualWork.manualRetryCount ?? 0) + 1 }; return manualWork },
    },
    $queryRawUnsafe: async () => manualWork ? [{ id: manualWork.id }] : [],
  }
  return {
    db: { ...tx, $transaction: async operation => operation(tx) },
    setCase(value) { caseRow = value },
    setLatestWork(value) { latestWork = value; manualWork = value },
    hash,
  }
}

test('authorized re-analysis helper handles missing cases, first queue, and bounded manual retry', async () => {
  const evidence = bundle(responsibilityCaseType.DRIVER_CANCELLATION, 'retry-case')
  const fixture = retryDb(evidence)
  assert.deepEqual(await retryResponsibilityShadowCase(evidence.caseId, { db: fixture.db, clock: createTestClock(NOW) }), { status: 'CASE_NOT_FOUND' })
  fixture.setCase({
    id: evidence.caseId,
    bookingId: evidence.bookingId,
    caseType: evidence.caseType,
    state: responsibilityCaseState.NEEDS_ADMIN_REVIEW,
    evidenceHash: fixture.hash,
    evidenceSnapshot: evidence,
  })
  assert.deepEqual(await retryResponsibilityShadowCase(evidence.caseId, { db: fixture.db, clock: createTestClock(NOW) }), { status: 'QUEUED' })
  fixture.setLatestWork({ id: 'retry-work', caseId: evidence.caseId, status: 'MANUAL_REVIEW', manualRetryCount: 0, attemptCount: 1 })
  const requeued = await retryResponsibilityShadowCase(evidence.caseId, { db: fixture.db, clock: createTestClock(NOW) })
  assert.equal(requeued.status, 'REQUEUED')
})
