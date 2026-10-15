import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createTestClock } from './helpers/testClock.js'
import {
  createResponsibilityEvidence,
  evidenceCategory,
  responsibilityCaseType,
} from './helpers/responsibilityEvidence.js'
import { createResponsibilityAnalystFake } from './helpers/responsibilityAnalystFake.js'
import { createResponsibilityDecisionMemoryRepository } from './helpers/responsibilityDecisionMemoryRepository.js'
import {
  AI_RESPONSIBILITY_CONTRACT_VERSION,
  aiResponsibilityAnalysisSchema,
  responsibilityAnalystEnvelopeSchema,
  responsibilityClassification,
  responsibilityEvidenceBundleSchema,
  responsibilitySeverity,
  suggestedActionCategory,
} from '../services/responsibilityContracts.js'
import {
  createOpenAIResponsibilityAnalyst,
  responsibilityEvidenceHash,
  validateAnalysisAgainstEvidence,
} from '../services/responsibilityAnalyst.js'
import {
  appealWindowEligibility,
  assertResponsibilityStateTransition,
  canTransitionResponsibilityState,
  responsibilityCaseState,
} from '../services/responsibilityCaseState.js'
import {
  DEFAULT_RESPONSIBILITY_POLICY,
  RESPONSIBILITY_POLICY_VERSION,
  evaluateResponsibilityPolicy,
  provisionalResponsibilityRoute,
  responsibilityEvaluationKey,
} from '../services/responsibilityPolicyGate.js'
import { createPrismaResponsibilityDecisionRepository } from '../services/responsibilityDecisionRepository.js'
import { createResponsibilityDecisionService } from '../services/responsibilityDecisionService.js'

const start = '2026-09-25T06:00:00.000Z'

const createJournal = (caseType, caseId, options = {}) => createResponsibilityEvidence({
  caseId,
  bookingId: `booking-${caseId}`,
  caseType,
  occurredAt: start,
  scheduledAt: '2026-09-25T07:00:00.000Z',
  clock: options.clock ?? createTestClock(start),
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

function driverCancellationBundle(caseId = 'driver-cancellation', { missingCancellation = false } = {}) {
  const journal = createJournal(responsibilityCaseType.DRIVER_CANCELLATION, caseId)
  record(journal, evidenceCategory.BOOKING, 'scheduled_booking')
  record(journal, evidenceCategory.ASSIGNMENT, 'accepted', { quality: { fresh: true } })
  if (!missingCancellation) record(journal, evidenceCategory.CANCELLATION, 'driver_cancelled', {
    value: { initiator: 'driver', avoidable: true, platformIssueObserved: false }, quality: { fresh: true } })
  return journal.snapshot()
}

function platformFailureBundle(caseId = 'platform-failure') {
  const journal = createJournal(responsibilityCaseType.PLATFORM_ASSIGNMENT_FAILURE, caseId)
  record(journal, evidenceCategory.BOOKING, 'scheduled_booking')
  record(journal, evidenceCategory.ASSIGNMENT, 'assignment_cycle')
  record(journal, evidenceCategory.FEASIBILITY, 'platform_infeasible', {
    value: { assignmentFeasible: false, platformCapacityAvailable: false }, quality: { fresh: true } })
  return journal.snapshot()
}

function driverLateContradictionBundle(caseId = 'driver-late-contradiction') {
  const journal = createJournal(responsibilityCaseType.DRIVER_LATE, caseId)
  record(journal, evidenceCategory.BOOKING, 'scheduled_booking')
  record(journal, evidenceCategory.ASSIGNMENT, 'accepted')
  record(journal, evidenceCategory.ROUTING, 'eta')
  record(journal, evidenceCategory.LOCATION, 'gps_a', { claimKey: 'driver.position', value: { lat: 28.6, lng: 77.2 } })
  record(journal, evidenceCategory.LOCATION, 'gps_b', { claimKey: 'driver.position', value: { lat: 28.8, lng: 77.4 } })
  return journal.snapshot()
}

function failedPickupWithRoutingFailure(caseId = 'routing-failure') {
  const journal = createJournal(responsibilityCaseType.FAILED_PICKUP, caseId)
  record(journal, evidenceCategory.BOOKING, 'scheduled_booking')
  record(journal, evidenceCategory.ASSIGNMENT, 'accepted')
  record(journal, evidenceCategory.ROUTING, 'route_provider', {
    availability: 'not_available',
    value: null,
    quality: { failureCategory: 'ROUTING_TIMEOUT' },
  })
  record(journal, evidenceCategory.LOCATION, 'gps', { quality: { fresh: true } })
  record(journal, evidenceCategory.CONNECTIVITY, 'network', { quality: { fresh: true } })
  record(journal, evidenceCategory.NOTIFICATION, 'pickup_warning', { quality: { fresh: true } })
  return journal.snapshot()
}

const serviceFor = ({ mode = 'driver_caused', repository = createResponsibilityDecisionMemoryRepository(), hooks = {} } = {}) => {
  const analyst = createResponsibilityAnalystFake(mode)
  return {
    analyst,
    repository,
    service: createResponsibilityDecisionService({ analyst, repository, clock: createTestClock(start), hooks }),
  }
}

test('A: complete driver-caused candidate becomes provisional auto-upheld with no consequence fields', async () => {
  const { service, repository } = serviceFor()
  const result = await service.process(driverCancellationBundle())
  assert.equal(result.decision.route, provisionalResponsibilityRoute.PROVISIONAL_AUTO_UPHELD)
  assert.equal(result.decision.humanReviewRequired, false)
  assert.equal(repository.stores.decisions.size, 1)
  for (const field of ['liability', 'strike', 'suspension', 'compensation', 'payout', 'refund', 'earningsDebit']) {
    assert.equal(field in result.decision, false)
  }
})

test('B: high-confidence driver-caused suggestion cannot bypass missing required evidence', async () => {
  const { service } = serviceFor()
  const result = await service.process(driverCancellationBundle('missing-evidence', { missingCancellation: true }))
  assert.equal(result.decision.route, provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW)
  assert.equal(result.decision.failedGates.some(gate => gate.code === 'REQUIRED_EVIDENCE'), true)
})

test('C: invented evidence reference invalidates analysis for automation', async () => {
  const bundle = driverCancellationBundle('invented-evidence')
  const analyst = createResponsibilityAnalystFake('invented_evidence_reference')
  const envelope = await analyst.analyzeResponsibilityCase(bundle)
  const validation = validateAnalysisAgainstEvidence(bundle, envelope)
  assert.deepEqual(validation.errors, ['INVENTED_EVIDENCE_REFERENCE'])
  const repository = createResponsibilityDecisionMemoryRepository()
  const service = createResponsibilityDecisionService({ analyst, repository, clock: createTestClock(start) })
  const result = await service.process(bundle)
  assert.equal(result.decision.route, provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW)
})

test('D: platform-caused evidence can take the deterministic provisional waiver route', async () => {
  const { service } = serviceFor({ mode: 'platform_caused' })
  const result = await service.process(platformFailureBundle())
  assert.equal(result.decision.route, provisionalResponsibilityRoute.PROVISIONAL_AUTO_WAIVED)
})

test('E: unresolved material GPS contradiction routes to admin review', async () => {
  const bundle = driverLateContradictionBundle()
  const analyst = createResponsibilityAnalystFake('driver_caused')
  const envelope = await analyst.analyzeResponsibilityCase(bundle)
  const evidenceHash = responsibilityEvidenceHash(bundle)
  const policy = structuredClone(DEFAULT_RESPONSIBILITY_POLICY)
  policy.cases.DRIVER_LATE.autoUpholdAllowed = true
  const analysisId = envelope.analysisId
  const idempotencyKey = [bundle.caseId, evidenceHash, analysisId, policy.policyVersion].join(':')
  const gate = evaluateResponsibilityPolicy({
    evidence: bundle,
    analysisEnvelope: envelope,
    evidenceHash,
    currentState: responsibilityCaseState.POLICY_EVALUATION,
    idempotencyKey,
    policy,
    evaluatedAt: new Date(start),
  })
  assert.equal(gate.route, provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW)
  assert.equal(gate.failedGates.some(item => item.code === 'MATERIAL_CONTRADICTIONS'), true)
})

test('F: routing provider failure cannot produce an auto-uphold', async () => {
  const { service } = serviceFor()
  const result = await service.process(failedPickupWithRoutingFailure())
  assert.equal(result.decision.route, provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW)
  assert.equal(result.decision.failedGates.some(item => item.code === 'REQUIRED_EVIDENCE'), true)
})

test('G: provider acceptance does not start appeal clock; successful delivery starts exactly 24 hours', () => {
  const accepted = appealWindowEligibility({
    caseState: responsibilityCaseState.PROVISIONAL_AUTO_UPHELD,
    adverseNotice: { status: 'accepted', providerAcceptedAt: start },
    now: start,
  })
  assert.equal(accepted.eligible, false)
  const delivered = appealWindowEligibility({
    caseState: responsibilityCaseState.PROVISIONAL_AUTO_UPHELD,
    adverseNotice: { status: 'delivered', deliveredAt: start },
    now: '2026-09-26T05:59:59.999Z',
  })
  assert.equal(delivered.eligible, true)
  assert.equal(delivered.closesAt, '2026-09-26T06:00:00.000Z')
  assert.equal(delivered.open, true)
})

test('H: AI timeout stays retryable in AI review and creates no provisional decision', async () => {
  const { service, repository } = serviceFor({ mode: 'timeout' })
  const result = await service.process(driverCancellationBundle('timeout'))
  assert.equal(result.status, 'RETRYABLE_AI_REVIEW')
  assert.equal(result.state, responsibilityCaseState.AI_REVIEW)
  assert.equal(repository.stores.decisions.size, 0)
})

test('I: malformed AI output is schema-invalid and routes to admin review without consequence', async () => {
  const { service } = serviceFor({ mode: 'malformed' })
  const result = await service.process(driverCancellationBundle('malformed'))
  assert.equal(result.decision.route, provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW)
  assert.equal(result.decision.failedGates.some(item => item.code === 'ANALYSIS_VALIDATION'), true)
})

test('J: duplicate processing returns one logical provisional decision and one AI call', async () => {
  const { service, repository, analyst } = serviceFor({ mode: 'duplicate_result' })
  const bundle = driverCancellationBundle('duplicate')
  const first = await service.process(bundle)
  const second = await service.process(bundle)
  assert.equal(first.decision.id, second.decision.id)
  assert.equal(second.status, 'DECIDED')
  assert.equal(second.reusedDecision, true)
  assert.equal(repository.stores.decisions.size, 1)
  assert.equal(analyst.calls, 1)
})

test('K: retry after crash reuses stored analysis and creates one decision', async () => {
  const repository = createResponsibilityDecisionMemoryRepository()
  const analyst = createResponsibilityAnalystFake('driver_caused')
  let crash = true
  const firstService = createResponsibilityDecisionService({
    analyst,
    repository,
    clock: createTestClock(start),
    hooks: { afterAnalysisPersisted: () => { if (crash) throw new Error('SIMULATED_CRASH') } },
  })
  const bundle = driverCancellationBundle('crash-retry')
  await assert.rejects(firstService.process(bundle), /SIMULATED_CRASH/)
  assert.equal(repository.stores.analyses.size, 1)
  assert.equal(repository.stores.decisions.size, 0)
  crash = false
  const secondService = createResponsibilityDecisionService({ analyst, repository, clock: createTestClock(start) })
  const result = await secondService.process(bundle)
  assert.equal(result.decision.route, provisionalResponsibilityRoute.PROVISIONAL_AUTO_UPHELD)
  assert.equal(repository.stores.decisions.size, 1)
  assert.equal(analyst.calls, 1)
})

test('L: unknown case type is never auto-routed', () => {
  const gate = evaluateResponsibilityPolicy({
    evidence: { caseId: 'unknown', caseType: 'NEW_CASE_TYPE' },
    analysisEnvelope: null,
    evidenceHash: 'hash',
    currentState: responsibilityCaseState.POLICY_EVALUATION,
    idempotencyKey: 'key',
    evaluatedAt: new Date(start),
  })
  assert.equal(gate.route, provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW)
  assert.equal(gate.failedGates[0].code, 'CASE_TYPE_ALLOWLIST')
})

test('low confidence, high severity, missing evidence reference, and contradictory analysis all deny automation', async () => {
  for (const mode of ['low_confidence', 'high_severity', 'missing_evidence_reference', 'contradictory_analysis']) {
    const { service } = serviceFor({ mode })
    const result = await service.process(driverCancellationBundle(`deny-${mode}`))
    assert.equal(result.decision.route, provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW, mode)
  }
})

test('VALID_WAIVED can waive while EXTERNAL_OR_UNCERTAIN stays in admin review', async () => {
  const waived = serviceFor({ mode: 'valid_waived' })
  const waiverEvidence = structuredClone(driverCancellationBundle('valid-waived'))
  waiverEvidence.timeline.find(item => item.category === 'cancellation').value = { reasonCode: 'APPROVED_OPERATIONAL_WAIVER', corroborated: true }
  const waivedResult = await waived.service.process(waiverEvidence)
  assert.equal(waivedResult.decision.route, provisionalResponsibilityRoute.PROVISIONAL_AUTO_WAIVED)
  const uncertain = serviceFor({ mode: 'external_uncertain' })
  const uncertainResult = await uncertain.service.process(driverCancellationBundle('external-uncertain'))
  assert.equal(uncertainResult.decision.route, provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW)
})

test('facts/inferences are explicit and strict schema rejects executable consequence fields', async () => {
  const bundle = driverCancellationBundle('contract')
  const envelope = await createResponsibilityAnalystFake().analyzeResponsibilityCase(bundle)
  assert.equal(envelope.output.factsSupporting[0].type, 'FACT')
  assert.equal(envelope.output.inferences[0].type, 'INFERENCE')
  const unsafe = { ...envelope.output, driverDebitPaise: 1000 }
  assert.equal(aiResponsibilityAnalysisSchema.safeParse(unsafe).success, false)
})

test('evidence hash is stable across snapshot generation time changes', () => {
  const bundle = driverCancellationBundle('hash-stability')
  const later = { ...structuredClone(bundle), generatedAt: '2026-09-25T09:00:00.000Z' }
  assert.equal(responsibilityEvidenceHash(bundle), responsibilityEvidenceHash(later))
})

test('state machine rejects backward transitions and gates appeal window on delivered notice', () => {
  assert.throws(() => assertResponsibilityStateTransition(
    responsibilityCaseState.POLICY_EVALUATION,
    responsibilityCaseState.AI_REVIEW,
  ), /Illegal responsibility state transition/)
  assert.throws(() => assertResponsibilityStateTransition(
    responsibilityCaseState.PROVISIONAL_AUTO_UPHELD,
    responsibilityCaseState.APPEAL_WINDOW,
  ), /Illegal responsibility state transition/)
  assert.equal(assertResponsibilityStateTransition(
    responsibilityCaseState.PROVISIONAL_AUTO_UPHELD,
    responsibilityCaseState.APPEAL_WINDOW,
    { adverseNoticeDelivered: true },
  ), responsibilityCaseState.APPEAL_WINDOW)
})

test('real-provider adapter obeys the structured contract without a live API call', async () => {
  const bundle = driverCancellationBundle('provider-adapter')
  const output = (await createResponsibilityAnalystFake().analyzeResponsibilityCase(bundle)).output
  let request
  const client = { responses: { parse: async options => { request = options; return { id: 'resp-1', output_parsed: output } } } }
  const analyst = createOpenAIResponsibilityAnalyst({ model: 'test-model', client })
  const envelope = await analyst.analyzeResponsibilityCase(bundle)
  assert.equal(envelope.analysisId, 'resp-1')
  assert.equal(envelope.output.caseId, bundle.caseId)
  assert.match(request.instructions, /deterministic policy gate/i)
  const emptyClient = { responses: { parse: async () => ({ id: 'resp-2', output_parsed: null }) } }
  await assert.rejects(createOpenAIResponsibilityAnalyst({ client: emptyClient }).analyzeResponsibilityCase(bundle),
    /no structured output/)
})

test('Phase 5 decision service has no direct dependency on consequence or money services', () => {
  const source = fs.readFileSync(new URL('../services/responsibilityDecisionService.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /conductStrikes|driverCancellations|payments|refund|wallet|payout|compensation/i)
})

test('classification compatibility remains frozen and high confidence alone cannot enable a mismatched action', async () => {
  const bundle = driverCancellationBundle('mismatch')
  const envelope = await createResponsibilityAnalystFake().analyzeResponsibilityCase(bundle)
  envelope.output.suggestedClassification = responsibilityClassification.DRIVER_CAUSED
  envelope.output.suggestedActionCategory = suggestedActionCategory.AUTO_WAIVE_CANDIDATE
  envelope.output.confidence = 1
  envelope.output.severityAssessment = responsibilitySeverity.LOW
  const evidenceHash = responsibilityEvidenceHash(bundle)
  const gate = evaluateResponsibilityPolicy({
    evidence: bundle,
    analysisEnvelope: envelope,
    evidenceHash,
    currentState: responsibilityCaseState.POLICY_EVALUATION,
    idempotencyKey: [bundle.caseId, evidenceHash, envelope.analysisId, DEFAULT_RESPONSIBILITY_POLICY.policyVersion].join(':'),
    evaluatedAt: new Date(start),
  })
  assert.equal(gate.route, provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW)
  assert.equal(gate.failedGates.some(item => item.code === 'CLASSIFICATION_ACTION_COMPATIBILITY'), true)
})

test('analysis validation rejects invalid contracts and case mismatches, and lazy client loading stays testable', async () => {
  const invalid = validateAnalysisAgainstEvidence({}, {})
  assert.deepEqual(invalid.errors, ['EVIDENCE_SCHEMA_INVALID', 'ANALYSIS_SCHEMA_INVALID'])

  const bundle = driverCancellationBundle('analysis-edges')
  const envelope = await createResponsibilityAnalystFake().analyzeResponsibilityCase(bundle)
  const mismatched = structuredClone(envelope)
  mismatched.output.caseId = 'other-case'
  assert.equal(validateAnalysisAgainstEvidence(bundle, mismatched).errors.includes('CASE_ID_MISMATCH'), true)

  const fakeClient = { responses: { parse: async () => ({ id: 'lazy-client', output_parsed: envelope.output }) } }
  let loaderCalls = 0
  const loaderAnalyst = createOpenAIResponsibilityAnalyst({
    model: 'loader-model',
    clientModuleLoader: async () => {
      loaderCalls += 1
      return { openai: fakeClient }
    },
  })
  const loaderResult = await loaderAnalyst.analyzeResponsibilityCase(bundle)
  assert.equal(loaderResult.analysisId, 'lazy-client')
  assert.equal(loaderCalls, 1)

  await assert.rejects(
    createOpenAIResponsibilityAnalyst({ model: 'unconfigured' }).analyzeResponsibilityCase(bundle),
    /client is not configured/,
  )
})

test('state helpers reject unknown sources and support delivered admin-upheld appeal preparation', () => {
  assert.equal(canTransitionResponsibilityState('UNKNOWN_STATE', responsibilityCaseState.AI_REVIEW), false)
  const eligibility = appealWindowEligibility({
    caseState: responsibilityCaseState.PROVISIONAL_ADMIN_UPHELD,
    adverseNotice: { readAt: start },
    now: '2026-09-26T06:00:00.000Z',
  })
  assert.equal(eligibility.eligible, true)
  assert.equal(eligibility.open, true)
})

test('decision service covers invalid envelopes, nullable dates, non-Error provider failures, and resumed policy evaluation', async () => {
  assert.throws(() => createResponsibilityDecisionService({ analyst: null }), /analyst is required/i)

  const nullBundle = { ...driverCancellationBundle('null-envelope'), scheduledAt: null, occurredAt: null }
  const nullRepository = createResponsibilityDecisionMemoryRepository()
  const nullAnalyst = { provider: 'fake', model: 'null-output', analyzeResponsibilityCase: async () => null }
  const nullService = createResponsibilityDecisionService({
    analyst: nullAnalyst,
    repository: nullRepository,
    clock: createTestClock(start),
  })
  const nullResult = await nullService.process(nullBundle)
  assert.equal(nullResult.decision.route, provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW)
  assert.equal(nullRepository.stores.analyses.values().next().value.envelope.invalid, true)

  const throwingAnalyst = { provider: 'fake', model: 'throws-string', analyzeResponsibilityCase: async () => { throw 'offline' } }
  const retry = await createResponsibilityDecisionService({
    analyst: throwingAnalyst,
    repository: createResponsibilityDecisionMemoryRepository(),
    clock: createTestClock(start),
  }).process(driverCancellationBundle('non-error-failure'))
  assert.equal(retry.reason, 'AI analyst unavailable')

  const resumedBundle = driverCancellationBundle('already-policy-evaluation')
  const resumedRepository = createResponsibilityDecisionMemoryRepository()
  resumedRepository.stores.cases.set(resumedBundle.caseId, { id: resumedBundle.caseId, state: responsibilityCaseState.POLICY_EVALUATION })
  const resumed = createResponsibilityDecisionService({
    analyst: createResponsibilityAnalystFake(),
    repository: resumedRepository,
    clock: createTestClock(start),
  })
  const resumedResult = await resumed.process(resumedBundle)
  assert.equal(resumedResult.decision.route, provisionalResponsibilityRoute.PROVISIONAL_AUTO_UPHELD)
})

test('Prisma decision repository maps every persistence operation without adding consequences', async () => {
  const calls = []
  const method = (name, result) => async args => { calls.push([name, args]); return result }
  const db = {
    responsibilityCase: {
      findUnique: method('case.findUnique', { id: 'case-1' }),
      upsert: method('case.upsert', { id: 'case-1' }),
      update: method('case.update', { id: 'case-1' }),
    },
    responsibilityAnalysis: {
      findUnique: method('analysis.findUnique', { id: 'analysis-1' }),
      upsert: method('analysis.upsert', { id: 'analysis-1' }),
    },
    responsibilityProvisionalDecision: {
      findUnique: method('decision.findUnique', { id: 'decision-1' }),
      upsert: method('decision.upsert', { id: 'decision-1' }),
    },
  }
  const repository = createPrismaResponsibilityDecisionRepository(db)
  await repository.findCase('case-1')
  await repository.saveCaseEvidence({
    id: 'case-1', bookingId: 'booking-1', caseType: 'DRIVER_CANCELLATION', evidenceVersion: 'v1', evidenceHash: 'hash',
    evidenceSnapshot: { ok: true }, scheduledAt: null, occurredAt: null, state: responsibilityCaseState.EVIDENCE_COLLECTING,
  })
  await repository.setCaseState('case-1', responsibilityCaseState.AI_REVIEW)
  await repository.findAnalysis('logical-1')
  await repository.saveAnalysis({ logicalKey: 'logical-1', id: 'analysis-1' })
  await repository.findDecision('case-1')
  await repository.saveDecision({ caseId: 'case-1', route: provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW })
  assert.deepEqual(calls.map(([name]) => name), [
    'case.findUnique', 'case.upsert', 'case.update', 'analysis.findUnique', 'analysis.upsert', 'decision.findUnique', 'decision.upsert',
  ])
  assert.deepEqual(calls[1][1].update, {
    bookingId: 'booking-1', caseType: 'DRIVER_CANCELLATION', evidenceVersion: 'v1', evidenceHash: 'hash',
    evidenceSnapshot: { ok: true }, scheduledAt: null, occurredAt: null,
  })
})

test('policy gate exercises conservative freshness, quality, idempotency, and AI-report fallbacks', async () => {
  const malformed = evaluateResponsibilityPolicy({
    evidence: { caseId: 'malformed-known', caseType: responsibilityCaseType.DRIVER_CANCELLATION },
    analysisEnvelope: null,
    evidenceHash: 'hash',
    currentState: responsibilityCaseState.POLICY_EVALUATION,
    idempotencyKey: 'wrong-key',
    evaluatedAt: new Date(start),
  })
  assert.equal(malformed.route, provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW)
  assert.deepEqual(malformed.failedGates.find(item => item.code === 'IDEMPOTENCY_KEY'),
    { code: 'IDEMPOTENCY_KEY', detail: 'invalid' })

  const invalidDates = {
    caseId: 'invalid-dates',
    caseType: responsibilityCaseType.DRIVER_CANCELLATION,
    timeline: [
      { id: 'b', category: evidenceCategory.BOOKING, availability: 'available', quality: {}, basis: 'direct', derivedFrom: [], observedAt: 'bad', receivedAt: 'bad' },
      { id: 'a', category: evidenceCategory.ASSIGNMENT, availability: 'available', quality: {}, basis: 'direct', derivedFrom: [], observedAt: 'bad', receivedAt: 'bad' },
      { id: 'c', category: evidenceCategory.CANCELLATION, availability: 'available', quality: {}, basis: 'direct', derivedFrom: [], observedAt: 'bad', receivedAt: 'bad' },
    ],
  }
  const invalidDateGate = evaluateResponsibilityPolicy({
    evidence: invalidDates,
    analysisEnvelope: null,
    evidenceHash: 'hash',
    currentState: responsibilityCaseState.POLICY_EVALUATION,
    idempotencyKey: 'wrong-key',
    evaluatedAt: new Date(start),
  })
  assert.equal(invalidDateGate.failedGates.some(item => item.code === 'EVIDENCE_FRESHNESS'), true)

  const ageBundle = structuredClone(driverCancellationBundle('age-ms-fallback'))
  const assignment = ageBundle.timeline.find(item => item.category === evidenceCategory.ASSIGNMENT)
  assignment.quality = { ageMs: 0 }
  const ageEnvelope = await createResponsibilityAnalystFake().analyzeResponsibilityCase(ageBundle)
  const agePolicy = structuredClone(DEFAULT_RESPONSIBILITY_POLICY)
  agePolicy.cases.DRIVER_CANCELLATION.freshnessRequiredCategories = [evidenceCategory.ASSIGNMENT]
  agePolicy.cases.DRIVER_CANCELLATION.maxAgeMsByCategory = {}
  const ageHash = responsibilityEvidenceHash(ageBundle)
  const ageGate = evaluateResponsibilityPolicy({
    evidence: ageBundle,
    analysisEnvelope: ageEnvelope,
    evidenceHash: ageHash,
    currentState: responsibilityCaseState.POLICY_EVALUATION,
    idempotencyKey: [ageBundle.caseId, ageHash, ageEnvelope.analysisId, agePolicy.policyVersion].join(':'),
    policy: agePolicy,
    evaluatedAt: new Date(start),
  })
  assert.equal(ageGate.route, provisionalResponsibilityRoute.PROVISIONAL_AUTO_UPHELD)

  const timestampBundle = structuredClone(driverCancellationBundle('timestamp-freshness'))
  for (const entry of timestampBundle.timeline.filter(item => [evidenceCategory.ASSIGNMENT, evidenceCategory.CANCELLATION].includes(item.category))) {
    entry.quality = {}
    entry.observedAt = '2026-09-25T06:00:01.000Z'
    entry.receivedAt = '2026-09-25T06:00:00.000Z'
  }
  const timestampEnvelope = await createResponsibilityAnalystFake().analyzeResponsibilityCase(timestampBundle)
  const timestampHash = responsibilityEvidenceHash(timestampBundle)
  const timestampGate = evaluateResponsibilityPolicy({
    evidence: timestampBundle,
    analysisEnvelope: timestampEnvelope,
    evidenceHash: timestampHash,
    currentState: responsibilityCaseState.POLICY_EVALUATION,
    idempotencyKey: [timestampBundle.caseId, timestampHash, timestampEnvelope.analysisId, DEFAULT_RESPONSIBILITY_POLICY.policyVersion].join(':'),
    evaluatedAt: new Date(start),
  })
  assert.equal(timestampGate.route, provisionalResponsibilityRoute.PROVISIONAL_AUTO_UPHELD)

  const qualityMutations = [
    entry => { entry.quality = { invalid: true } },
    entry => { entry.quality = { provenance: 'missing' } },
    entry => { entry.basis = 'derived'; entry.derivedFrom = ['missing-evidence-id'] },
  ]
  for (const [index, mutate] of qualityMutations.entries()) {
    const bundle = structuredClone(driverCancellationBundle(`quality-${index}`))
    mutate(bundle.timeline[0])
    const envelope = await createResponsibilityAnalystFake().analyzeResponsibilityCase(bundle)
    const hash = responsibilityEvidenceHash(bundle)
    const gate = evaluateResponsibilityPolicy({
      evidence: bundle,
      analysisEnvelope: envelope,
      evidenceHash: hash,
      currentState: responsibilityCaseState.POLICY_EVALUATION,
      idempotencyKey: [bundle.caseId, hash, envelope.analysisId, DEFAULT_RESPONSIBILITY_POLICY.policyVersion].join(':'),
      evaluatedAt: new Date(start),
    })
    assert.equal(gate.failedGates.some(item => item.code === 'EVIDENCE_QUALITY'), true)
  }

  const reportedBundle = driverCancellationBundle('ai-reported-gaps')
  const reportedEnvelope = await createResponsibilityAnalystFake().analyzeResponsibilityCase(reportedBundle)
  reportedEnvelope.output.missingEvidence = [{ category: evidenceCategory.NOTIFICATION, reason: 'No delivery receipt.' }]
  reportedEnvelope.output.contradictions = [{
    evidenceIds: [reportedBundle.timeline[0].id, reportedBundle.timeline[1].id],
    summary: 'Two records require human interpretation.',
  }]
  const reportedHash = responsibilityEvidenceHash(reportedBundle)
  const reportedGate = evaluateResponsibilityPolicy({
    evidence: reportedBundle,
    analysisEnvelope: reportedEnvelope,
    evidenceHash: reportedHash,
    currentState: responsibilityCaseState.POLICY_EVALUATION,
    idempotencyKey: [reportedBundle.caseId, reportedHash, reportedEnvelope.analysisId, DEFAULT_RESPONSIBILITY_POLICY.policyVersion].join(':'),
    evaluatedAt: new Date(start),
  })
  assert.equal(reportedGate.failedGates.some(item => item.code === 'AI_REPORTED_MISSING_EVIDENCE'), true)
  assert.equal(reportedGate.failedGates.some(item => item.code === 'AI_REPORTED_CONTRADICTIONS'), true)
})

test('driver-caused cases with automation disabled stay in admin review after all other gates pass', async () => {
  const journal = createJournal(responsibilityCaseType.DRIVER_LATE, 'driver-late-auto-disabled')
  record(journal, evidenceCategory.BOOKING, 'scheduled_booking')
  record(journal, evidenceCategory.ASSIGNMENT, 'accepted')
  record(journal, evidenceCategory.ROUTING, 'eta')
  record(journal, evidenceCategory.LOCATION, 'gps')
  record(journal, evidenceCategory.CANCELLATION, 'driver_causation', { value: { initiator: 'driver', avoidable: true, platformIssueObserved: false } })
  const bundle = journal.snapshot()
  const envelope = await createResponsibilityAnalystFake().analyzeResponsibilityCase(bundle)
  const hash = responsibilityEvidenceHash(bundle)
  const gate = evaluateResponsibilityPolicy({
    evidence: bundle,
    analysisEnvelope: envelope,
    evidenceHash: hash,
    currentState: responsibilityCaseState.POLICY_EVALUATION,
    idempotencyKey: [bundle.caseId, hash, envelope.analysisId, DEFAULT_RESPONSIBILITY_POLICY.policyVersion].join(':'),
    evaluatedAt: new Date(start),
  })
  assert.equal(gate.route, provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW)
  assert.deepEqual(gate.failedGates.find(item => item.code === 'AUTO_UPHOLD_ENABLED'),
    { code: 'AUTO_UPHOLD_ENABLED', detail: 'disabled' })
})

test('Phase 5 contract constants and schema cardinalities stay frozen', async () => {
  assert.equal(AI_RESPONSIBILITY_CONTRACT_VERSION, 'responsibility-analysis-v1')
  assert.deepEqual(responsibilityClassification, {
    DRIVER_CAUSED: 'DRIVER_CAUSED', PLATFORM_CAUSED: 'PLATFORM_CAUSED', VALID_WAIVED: 'VALID_WAIVED',
    EXTERNAL_OR_UNCERTAIN: 'EXTERNAL_OR_UNCERTAIN', NEEDS_REVIEW: 'NEEDS_REVIEW',
  })
  assert.deepEqual(suggestedActionCategory, {
    AUTO_WAIVE_CANDIDATE: 'AUTO_WAIVE_CANDIDATE', AUTO_UPHOLD_CANDIDATE: 'AUTO_UPHOLD_CANDIDATE', ADMIN_REVIEW: 'ADMIN_REVIEW',
  })
  assert.deepEqual(responsibilitySeverity, { LOW: 'LOW', MODERATE: 'MODERATE', HIGH: 'HIGH' })

  const bundle = structuredClone(driverCancellationBundle('schema-cardinality'))
  bundle.timeline[0].availability = 'not_available'
  bundle.contradictions = [{
    claimKey: 'multi-observation',
    observations: [
      { value: 1, evidenceIds: [bundle.timeline[0].id, bundle.timeline[1].id] },
      { value: 2, evidenceIds: [bundle.timeline[1].id] },
      { value: 3, evidenceIds: [bundle.timeline[2].id] },
    ],
  }]
  assert.equal(responsibilityEvidenceBundleSchema.safeParse(bundle).success, true)
  const unknownAvailability = structuredClone(bundle)
  unknownAvailability.timeline[0].availability = 'unknown'
  assert.equal(responsibilityEvidenceBundleSchema.safeParse(unknownAvailability).success, true)
  const emptyAvailability = structuredClone(bundle)
  emptyAvailability.timeline[0].availability = ''
  assert.equal(responsibilityEvidenceBundleSchema.safeParse(emptyAvailability).success, false)

  const envelope = await createResponsibilityAnalystFake().analyzeResponsibilityCase(driverCancellationBundle('analysis-cardinality'))
  const ids = envelope.output.factsSupporting[0].evidenceIds
  const allIds = driverCancellationBundle('analysis-cardinality').timeline.map(item => item.id)
  envelope.output.factsSupporting[0].evidenceIds = allIds.slice(0, 2)
  envelope.output.inferences[0].evidenceIds = allIds.slice(0, 2)
  envelope.output.contradictions = [{ evidenceIds: allIds, summary: 'Three cited observations conflict.' }]
  assert.equal(ids.length > 0, true)
  assert.equal(aiResponsibilityAnalysisSchema.safeParse(envelope.output).success, true)
  assert.equal(responsibilityAnalystEnvelopeSchema.safeParse(envelope).success, true)
})

test('analyst hashing and evidence validation preserve the full normalized contract', async () => {
  const bundle = driverCancellationBundle('hash-contract')
  const baseHash = responsibilityEvidenceHash(bundle)
  const variants = [
    value => { value.caseId = 'hash-contract-other' },
    value => { value.bookingId = 'booking-other' },
    value => { value.scheduledAt = '2026-09-25T08:00:00.000Z' },
    value => { value.occurredAt = '2026-09-25T06:01:00.000Z' },
    value => { value.timeline[0].value = { changed: true } },
    value => { value.completeness.complete = false; value.completeness.missing = [evidenceCategory.BOOKING] },
  ]
  for (const mutate of variants) {
    const changed = structuredClone(bundle)
    mutate(changed)
    assert.notEqual(responsibilityEvidenceHash(changed), baseHash)
  }

  const invalid = validateAnalysisAgainstEvidence({}, {})
  assert.deepEqual(invalid, {
    valid: false,
    errors: ['EVIDENCE_SCHEMA_INVALID', 'ANALYSIS_SCHEMA_INVALID'],
    evidenceIds: [],
    citedEvidenceIds: [],
  })

  const envelope = await createResponsibilityAnalystFake().analyzeResponsibilityCase(bundle)
  envelope.output.factsSupporting[0].statement = '  Driver    ACCEPTED  '
  envelope.output.factsAgainst = [{
    type: 'FACT', evidenceIds: [bundle.timeline[1].id], statement: 'driver accepted',
  }]
  envelope.output.inferences[0].evidenceIds = [bundle.timeline[0].id, bundle.timeline[1].id]
  const validation = validateAnalysisAgainstEvidence(bundle, envelope)
  assert.deepEqual(validation.errors, ['SELF_CONTRADICTORY_FACTS'])
  assert.deepEqual(validation.evidenceIds, bundle.timeline.map(item => item.id))
  assert.deepEqual(validation.citedEvidenceIds, [bundle.timeline[0].id, bundle.timeline[1].id])

  const distinctEnvelope = await createResponsibilityAnalystFake().analyzeResponsibilityCase(bundle)
  distinctEnvelope.output.factsSupporting[0].statement = 'ab c'
  distinctEnvelope.output.factsAgainst = [{
    type: 'FACT', evidenceIds: [bundle.timeline[1].id], statement: 'a bc',
  }]
  assert.deepEqual(validateAnalysisAgainstEvidence(bundle, distinctEnvelope).errors, [])
})

test('OpenAI analyst adapter records exact provider/model metadata and structured format', async () => {
  const bundle = driverCancellationBundle('adapter-metadata')
  const output = (await createResponsibilityAnalystFake().analyzeResponsibilityCase(bundle)).output
  const requests = []
  const client = { responses: { parse: async options => { requests.push(options); return { id: 'resp-meta', output_parsed: output } } } }
  const previousModel = process.env.RESPONSIBILITY_ANALYST_MODEL
  try {
    process.env.RESPONSIBILITY_ANALYST_MODEL = 'env-model'
    const envAnalyst = createOpenAIResponsibilityAnalyst({ client })
    assert.equal(envAnalyst.provider, 'openai')
    assert.equal(envAnalyst.model, 'env-model')
    const envResult = await envAnalyst.analyzeResponsibilityCase(bundle)
    assert.equal(envResult.provider, 'openai')
    assert.equal(envResult.model, 'env-model')
    assert.equal(envResult.contractVersion, AI_RESPONSIBILITY_CONTRACT_VERSION)
    assert.equal(requests[0].model, 'env-model')
    assert.equal(requests[0].text.format.type, 'json_schema')
    assert.equal(requests[0].text.format.name, 'responsibility_analysis')

    const explicit = createOpenAIResponsibilityAnalyst({ model: 'explicit-model', client })
    assert.equal(explicit.model, 'explicit-model')
    assert.equal((await explicit.analyzeResponsibilityCase(bundle)).model, 'explicit-model')

    delete process.env.RESPONSIBILITY_ANALYST_MODEL
    assert.equal(createOpenAIResponsibilityAnalyst({ client }).model, 'gpt-5.6-mini')
    await assert.rejects(
      createOpenAIResponsibilityAnalyst({ client: { responses: { parse: async () => ({ id: 'empty', output_parsed: null }) } } })
        .analyzeResponsibilityCase(bundle),
      error => error instanceof Error && error.message === 'Responsibility analyst returned no structured output',
    )
    await assert.rejects(
      createOpenAIResponsibilityAnalyst({ model: 'unconfigured' }).analyzeResponsibilityCase(bundle),
      error => error instanceof Error && error.message === 'Responsibility analyst client is not configured',
    )
  } finally {
    if (previousModel === undefined) delete process.env.RESPONSIBILITY_ANALYST_MODEL
    else process.env.RESPONSIBILITY_ANALYST_MODEL = previousModel
  }
})

test('responsibility state constants, transitions, and appeal timing are exact', () => {
  assert.deepEqual(responsibilityCaseState, {
    EVIDENCE_COLLECTING: 'EVIDENCE_COLLECTING', AI_REVIEW: 'AI_REVIEW', POLICY_EVALUATION: 'POLICY_EVALUATION',
    PROVISIONAL_AUTO_UPHELD: 'PROVISIONAL_AUTO_UPHELD', PROVISIONAL_AUTO_WAIVED: 'PROVISIONAL_AUTO_WAIVED',
    NEEDS_ADMIN_REVIEW: 'NEEDS_ADMIN_REVIEW', PROVISIONAL_ADMIN_UPHELD: 'PROVISIONAL_ADMIN_UPHELD',
    PROVISIONAL_ADMIN_WAIVED: 'PROVISIONAL_ADMIN_WAIVED', APPEAL_WINDOW: 'APPEAL_WINDOW', APPEAL_OPEN: 'APPEAL_OPEN',
    APPEAL_REVIEW: 'APPEAL_REVIEW', FINAL_UPHELD: 'FINAL_UPHELD', FINAL_WAIVED: 'FINAL_WAIVED',
  })
  const allowed = [
    ['EVIDENCE_COLLECTING', 'AI_REVIEW'],
    ['AI_REVIEW', 'POLICY_EVALUATION'], ['AI_REVIEW', 'NEEDS_ADMIN_REVIEW'],
    ['POLICY_EVALUATION', 'PROVISIONAL_AUTO_UPHELD'], ['POLICY_EVALUATION', 'PROVISIONAL_AUTO_WAIVED'],
    ['POLICY_EVALUATION', 'NEEDS_ADMIN_REVIEW'],
  ]
  for (const [from, to] of allowed) assert.equal(canTransitionResponsibilityState(from, to), true, `${from}->${to}`)
  assert.equal(canTransitionResponsibilityState('PROVISIONAL_AUTO_UPHELD', 'APPEAL_WINDOW', { adverseNoticeDelivered: true }), true)
  assert.equal(canTransitionResponsibilityState('PROVISIONAL_ADMIN_UPHELD', 'APPEAL_WINDOW', { adverseNoticeDelivered: true }), true)
  assert.equal(canTransitionResponsibilityState('PROVISIONAL_AUTO_WAIVED', 'APPEAL_WINDOW', { adverseNoticeDelivered: true }), false)
  assert.equal(canTransitionResponsibilityState('PROVISIONAL_ADMIN_WAIVED', 'APPEAL_WINDOW', { adverseNoticeDelivered: true }), false)

  assert.deepEqual(appealWindowEligibility({
    caseState: responsibilityCaseState.PROVISIONAL_AUTO_UPHELD, adverseNotice: undefined, now: start,
  }), { eligible: false, deliveredAt: null, closesAt: null, open: false })
  assert.deepEqual(appealWindowEligibility({
    caseState: responsibilityCaseState.PROVISIONAL_AUTO_WAIVED,
    adverseNotice: { deliveredAt: start }, now: start,
  }), { eligible: false, deliveredAt: null, closesAt: null, open: false })
  const precedence = appealWindowEligibility({
    caseState: responsibilityCaseState.PROVISIONAL_ADMIN_UPHELD,
    adverseNotice: { deliveredAt: start, readAt: '2026-09-25T07:00:00.000Z' },
    now: '2026-09-26T05:59:59.999Z',
  })
  assert.deepEqual(precedence, {
    eligible: true, deliveredAt: start, closesAt: '2026-09-26T06:00:00.000Z', open: true,
  })
  assert.equal(appealWindowEligibility({
    caseState: responsibilityCaseState.PROVISIONAL_ADMIN_UPHELD,
    adverseNotice: { readAt: start }, now: '2026-09-26T06:00:00.000Z',
  }).open, true)
})

test('default policy configuration and route constants are exact and opt-in', () => {
  assert.equal(RESPONSIBILITY_POLICY_VERSION, 'scheduled-responsibility-policy-v1')
  assert.deepEqual(provisionalResponsibilityRoute, {
    PROVISIONAL_AUTO_UPHELD: 'PROVISIONAL_AUTO_UPHELD',
    PROVISIONAL_AUTO_WAIVED: 'PROVISIONAL_AUTO_WAIVED',
    NEEDS_ADMIN_REVIEW: 'NEEDS_ADMIN_REVIEW',
  })
  const common = {
    autoWaiveAllowed: true, autoUpholdAllowed: false,
    allowedSeverities: ['LOW', 'MODERATE'], minConfidence: 0.8,
    freshnessRequiredCategories: [], maxAgeMsByCategory: {},
  }
  assert.deepEqual(DEFAULT_RESPONSIBILITY_POLICY, {
    policyVersion: 'scheduled-responsibility-policy-v1',
    cases: {
      DRIVER_CANCELLATION: {
        ...common, autoUpholdAllowed: true, requiredCategories: ['booking', 'assignment', 'cancellation'],
        freshnessRequiredCategories: ['assignment', 'cancellation'],
        maxAgeMsByCategory: { assignment: 900000, cancellation: 300000 },
      },
      FAILED_PICKUP: {
        ...common, requiredCategories: ['booking', 'assignment', 'routing', 'location', 'connectivity', 'notification'],
        freshnessRequiredCategories: ['routing', 'location', 'connectivity', 'notification'],
        maxAgeMsByCategory: { routing: 600000, location: 300000, connectivity: 300000, notification: 600000 },
      },
      DRIVER_LATE: { ...common, requiredCategories: ['booking', 'assignment', 'routing', 'location'] },
      DRIVER_OFFLINE: { ...common, requiredCategories: ['booking', 'assignment', 'connectivity'] },
      RIDER_CANCELLATION: { ...common, requiredCategories: ['booking', 'assignment', 'cancellation', 'location'] },
      PLATFORM_ASSIGNMENT_FAILURE: {
        ...common, requiredCategories: ['booking', 'assignment', 'feasibility'],
        freshnessRequiredCategories: ['feasibility'], maxAgeMsByCategory: { feasibility: 600000 },
      },
      REPLACEMENT_FAILURE: { ...common, requiredCategories: ['booking', 'assignment', 'feasibility'] },
    },
  })
})

test('policy gate audit is deterministic for a fully eligible driver-caused case', async () => {
  const bundle = driverCancellationBundle('exact-gate-audit')
  const envelope = await createResponsibilityAnalystFake().analyzeResponsibilityCase(bundle)
  const evidenceHash = responsibilityEvidenceHash(bundle)
  const key = responsibilityEvaluationKey({
    caseId: bundle.caseId, evidenceHash, analysisId: envelope.analysisId, policyVersion: RESPONSIBILITY_POLICY_VERSION,
  })
  assert.equal(key, `${bundle.caseId}:${evidenceHash}:${envelope.analysisId}:${RESPONSIBILITY_POLICY_VERSION}`)
  const gate = evaluateResponsibilityPolicy({
    evidence: bundle, analysisEnvelope: envelope, evidenceHash,
    currentState: responsibilityCaseState.POLICY_EVALUATION, idempotencyKey: key, evaluatedAt: new Date(start),
  })
  assert.deepEqual(gate, {
    route: 'PROVISIONAL_AUTO_UPHELD', policyVersion: RESPONSIBILITY_POLICY_VERSION, evaluatedAt: start,
    passedGates: [
      { code: 'CASE_TYPE_ALLOWLIST', detail: 'allowed' },
      { code: 'ANALYSIS_VALIDATION', detail: 'valid' },
      { code: 'CURRENT_STATE', detail: 'POLICY_EVALUATION' },
      { code: 'IDEMPOTENCY_KEY', detail: 'valid' },
      { code: 'REQUIRED_EVIDENCE', detail: 'complete' },
      { code: 'EVIDENCE_FRESHNESS', detail: 'fresh' },
      { code: 'EVIDENCE_QUALITY', detail: 'acceptable' },
      { code: 'MATERIAL_CONTRADICTIONS', detail: 'none' },
      { code: 'INDEPENDENT_REQUIRED_EVIDENCE', detail: 'usable' },
      { code: 'INDEPENDENT_MANDATORY_REVIEW', detail: 'no-evidence-review-blocker' },
      { code: 'INDEPENDENT_ROUTE_AUTHORITY', detail: 'responsibility-independent-evidence-v1:DRIVER_CAUSED' },
      { code: 'AI_REPORTED_MISSING_EVIDENCE', detail: 'none' },
      { code: 'AI_REPORTED_CONTRADICTIONS', detail: 'none' },
      { code: 'CLASSIFICATION_ACTION_COMPATIBILITY', detail: 'DRIVER_CAUSED/AUTO_UPHOLD_CANDIDATE' },
      { code: 'CONFIDENCE_FLOOR', detail: '0.97' },
      { code: 'SEVERITY_ALLOWLIST', detail: 'LOW' },
      { code: 'AUTO_UPHOLD_ENABLED', detail: 'enabled' },
    ],
    failedGates: [], reasons: [], humanReviewRequired: false,
  })
})

test('policy gate preserves conservative audit reasons at critical boundaries', async () => {
  const unknown = evaluateResponsibilityPolicy({
    evidence: undefined, analysisEnvelope: null, evidenceHash: 'hash', currentState: responsibilityCaseState.POLICY_EVALUATION,
    idempotencyKey: 'key', evaluatedAt: new Date(start),
  })
  assert.deepEqual(unknown, {
    route: 'NEEDS_ADMIN_REVIEW', policyVersion: RESPONSIBILITY_POLICY_VERSION, evaluatedAt: start,
    passedGates: [], failedGates: [{ code: 'CASE_TYPE_ALLOWLIST', detail: 'unknown-or-disabled' }],
    reasons: ['CASE_TYPE_ALLOWLIST:unknown-or-disabled'], humanReviewRequired: true,
  })

  const boundaryBundle = structuredClone(driverCancellationBundle('confidence-boundary'))
  const boundaryEnvelope = await createResponsibilityAnalystFake().analyzeResponsibilityCase(boundaryBundle)
  boundaryEnvelope.output.confidence = 0.8
  const boundaryHash = responsibilityEvidenceHash(boundaryBundle)
  const boundaryKey = responsibilityEvaluationKey({
    caseId: boundaryBundle.caseId, evidenceHash: boundaryHash, analysisId: boundaryEnvelope.analysisId,
    policyVersion: RESPONSIBILITY_POLICY_VERSION,
  })
  assert.equal(evaluateResponsibilityPolicy({
    evidence: boundaryBundle, analysisEnvelope: boundaryEnvelope, evidenceHash: boundaryHash,
    currentState: responsibilityCaseState.POLICY_EVALUATION, idempotencyKey: boundaryKey, evaluatedAt: new Date(start),
  }).route, provisionalResponsibilityRoute.PROVISIONAL_AUTO_UPHELD)

  boundaryEnvelope.output.confidence = 0.799
  const below = evaluateResponsibilityPolicy({
    evidence: boundaryBundle, analysisEnvelope: boundaryEnvelope, evidenceHash: boundaryHash,
    currentState: responsibilityCaseState.POLICY_EVALUATION, idempotencyKey: boundaryKey, evaluatedAt: new Date(start),
  })
  assert.deepEqual(below.failedGates.find(item => item.code === 'CONFIDENCE_FLOOR'),
    { code: 'CONFIDENCE_FLOOR', detail: '0.799' })
  assert.equal(below.humanReviewRequired, true)

  const staleBundle = structuredClone(driverCancellationBundle('stale-by-timestamp'))
  const staleAssignment = staleBundle.timeline.find(item => item.category === evidenceCategory.ASSIGNMENT)
  staleAssignment.quality = {}
  staleAssignment.observedAt = '2026-09-25T05:50:00.000Z'
  staleAssignment.receivedAt = '2026-09-25T06:10:00.000Z'
  const staleEnvelope = await createResponsibilityAnalystFake().analyzeResponsibilityCase(staleBundle)
  const staleHash = responsibilityEvidenceHash(staleBundle)
  const staleGate = evaluateResponsibilityPolicy({
    evidence: staleBundle, analysisEnvelope: staleEnvelope, evidenceHash: staleHash,
    currentState: responsibilityCaseState.POLICY_EVALUATION,
    idempotencyKey: responsibilityEvaluationKey({ caseId: staleBundle.caseId, evidenceHash: staleHash,
      analysisId: staleEnvelope.analysisId, policyVersion: RESPONSIBILITY_POLICY_VERSION }),
    evaluatedAt: new Date(start),
  })
  assert.deepEqual(staleGate.failedGates.find(item => item.code === 'EVIDENCE_FRESHNESS'),
    { code: 'EVIDENCE_FRESHNESS', detail: 'stale-or-unproven:assignment' })
})

test('policy gate quality checks accept valid derivation and reject partially invented provenance', async () => {
  const validBundle = structuredClone(driverCancellationBundle('derived-valid'))
  validBundle.timeline[2].basis = 'derived'
  validBundle.timeline[2].derivedFrom = [validBundle.timeline[0].id, validBundle.timeline[1].id]
  const validEnvelope = await createResponsibilityAnalystFake().analyzeResponsibilityCase(validBundle)
  const validHash = responsibilityEvidenceHash(validBundle)
  const gateFor = (bundle, envelope, hash) => evaluateResponsibilityPolicy({
    evidence: bundle, analysisEnvelope: envelope, evidenceHash: hash,
    currentState: responsibilityCaseState.POLICY_EVALUATION,
    idempotencyKey: responsibilityEvaluationKey({ caseId: bundle.caseId, evidenceHash: hash,
      analysisId: envelope.analysisId, policyVersion: RESPONSIBILITY_POLICY_VERSION }),
    evaluatedAt: new Date(start),
  })
  assert.equal(gateFor(validBundle, validEnvelope, validHash).failedGates.some(item => item.code === 'EVIDENCE_QUALITY'), false)

  const partialBundle = structuredClone(driverCancellationBundle('derived-partial'))
  partialBundle.timeline[2].basis = 'derived'
  partialBundle.timeline[2].derivedFrom = [partialBundle.timeline[0].id, 'missing-id']
  const partialEnvelope = await createResponsibilityAnalystFake().analyzeResponsibilityCase(partialBundle)
  const partialHash = responsibilityEvidenceHash(partialBundle)
  assert.deepEqual(gateFor(partialBundle, partialEnvelope, partialHash).failedGates.find(item => item.code === 'EVIDENCE_QUALITY'),
    { code: 'EVIDENCE_QUALITY', detail: `invalid:${partialBundle.timeline[2].id}` })
})

test('policy gate compatibility and waiver automation remain classification-specific', async () => {
  for (const classification of [responsibilityClassification.EXTERNAL_OR_UNCERTAIN, responsibilityClassification.NEEDS_REVIEW]) {
    const bundle = driverCancellationBundle(`manual-${classification.toLowerCase()}`)
    const envelope = await createResponsibilityAnalystFake().analyzeResponsibilityCase(bundle)
    envelope.output.suggestedClassification = classification
    envelope.output.suggestedActionCategory = suggestedActionCategory.ADMIN_REVIEW
    const hash = responsibilityEvidenceHash(bundle)
    const gate = evaluateResponsibilityPolicy({
      evidence: bundle, analysisEnvelope: envelope, evidenceHash: hash,
      currentState: responsibilityCaseState.POLICY_EVALUATION,
      idempotencyKey: responsibilityEvaluationKey({ caseId: bundle.caseId, evidenceHash: hash,
        analysisId: envelope.analysisId, policyVersion: RESPONSIBILITY_POLICY_VERSION }),
      evaluatedAt: new Date(start),
    })
    assert.equal(gate.passedGates.some(item => item.code === 'CLASSIFICATION_ACTION_COMPATIBILITY'), true)
    assert.equal(gate.failedGates.some(item => item.code === 'INDEPENDENT_ROUTE_AUTHORITY'), true)
    assert.equal(gate.route, provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW)
  }

  const bundle = platformFailureBundle('waive-disabled')
  const envelope = await createResponsibilityAnalystFake('platform_caused').analyzeResponsibilityCase(bundle)
  const policy = structuredClone(DEFAULT_RESPONSIBILITY_POLICY)
  policy.cases.PLATFORM_ASSIGNMENT_FAILURE.autoWaiveAllowed = false
  const hash = responsibilityEvidenceHash(bundle)
  const gate = evaluateResponsibilityPolicy({
    evidence: bundle, analysisEnvelope: envelope, evidenceHash: hash, policy,
    currentState: responsibilityCaseState.POLICY_EVALUATION,
    idempotencyKey: responsibilityEvaluationKey({ caseId: bundle.caseId, evidenceHash: hash,
      analysisId: envelope.analysisId, policyVersion: policy.policyVersion }), evaluatedAt: new Date(start),
  })
  assert.deepEqual(gate.failedGates.find(item => item.code === 'AUTO_WAIVE_ENABLED'),
    { code: 'AUTO_WAIVE_ENABLED', detail: 'disabled-or-ineligible' })
})

test('policy gate audit details remain exact across missing, stale, invalid, and malformed evidence', async () => {
  const evaluate = async (bundle, options = {}) => {
    const envelope = options.envelope ?? await createResponsibilityAnalystFake(options.mode ?? 'driver_caused').analyzeResponsibilityCase(bundle)
    const hash = responsibilityEvidenceHash(bundle)
    const policy = options.policy ?? DEFAULT_RESPONSIBILITY_POLICY
    return evaluateResponsibilityPolicy({
      evidence: bundle,
      analysisEnvelope: envelope,
      evidenceHash: hash,
      currentState: options.currentState ?? responsibilityCaseState.POLICY_EVALUATION,
      idempotencyKey: options.idempotencyKey ?? responsibilityEvaluationKey({
        caseId: bundle.caseId, evidenceHash: hash, analysisId: envelope.analysisId, policyVersion: policy.policyVersion,
      }),
      policy,
      evaluatedAt: new Date(start),
    })
  }

  const missing = structuredClone(driverCancellationBundle('multi-missing'))
  missing.timeline = missing.timeline.filter(item => item.category === evidenceCategory.BOOKING)
  missing.completeness = {
    ...missing.completeness,
    complete: false,
    missing: [evidenceCategory.ASSIGNMENT, evidenceCategory.CANCELLATION],
    unavailable: [],
  }
  const missingGate = await evaluate(missing)
  assert.deepEqual(missingGate.failedGates.find(item => item.code === 'REQUIRED_EVIDENCE'),
    { code: 'REQUIRED_EVIDENCE', detail: 'missing:assignment,cancellation' })

  const stale = structuredClone(driverCancellationBundle('multi-stale'))
  for (const entry of stale.timeline.filter(item => [evidenceCategory.ASSIGNMENT, evidenceCategory.CANCELLATION].includes(item.category))) {
    entry.quality = { fresh: false }
    entry.observedAt = '2026-09-25T05:00:00.000Z'
    entry.receivedAt = '2026-09-25T06:00:00.000Z'
  }
  const staleGate = await evaluate(stale)
  assert.deepEqual(staleGate.failedGates.find(item => item.code === 'EVIDENCE_FRESHNESS'),
    { code: 'EVIDENCE_FRESHNESS', detail: 'stale-or-unproven:assignment,cancellation' })

  const invalid = structuredClone(driverCancellationBundle('multi-invalid'))
  invalid.timeline[0].quality = { invalid: true }
  invalid.timeline[1].quality = { provenance: 'missing', fresh: true }
  const invalidGate = await evaluate(invalid)
  assert.deepEqual(invalidGate.failedGates.find(item => item.code === 'EVIDENCE_QUALITY'),
    { code: 'EVIDENCE_QUALITY', detail: `invalid:${invalid.timeline[0].id},${invalid.timeline[1].id}` })

  const malformed = structuredClone(driverCancellationBundle('missing-quality-object'))
  delete malformed.timeline.find(item => item.category === evidenceCategory.ASSIGNMENT).quality
  const malformedGate = evaluateResponsibilityPolicy({
    evidence: malformed,
    analysisEnvelope: null,
    evidenceHash: 'malformed-hash',
    currentState: responsibilityCaseState.POLICY_EVALUATION,
    idempotencyKey: responsibilityEvaluationKey({
      caseId: malformed.caseId, evidenceHash: 'malformed-hash', analysisId: 'invalid-analysis',
      policyVersion: RESPONSIBILITY_POLICY_VERSION,
    }),
    evaluatedAt: new Date(start),
  })
  assert.equal(malformedGate.route, provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW)
  assert.deepEqual(malformedGate.passedGates.find(item => item.code === 'IDEMPOTENCY_KEY'),
    { code: 'IDEMPOTENCY_KEY', detail: 'valid' })
})

test('freshness policy honors explicit freshness, age metadata, and any fresh sample in a category', async () => {
  const evaluate = async (bundle) => {
    const envelope = await createResponsibilityAnalystFake().analyzeResponsibilityCase(bundle)
    const hash = responsibilityEvidenceHash(bundle)
    return evaluateResponsibilityPolicy({
      evidence: bundle, analysisEnvelope: envelope, evidenceHash: hash,
      currentState: responsibilityCaseState.POLICY_EVALUATION,
      idempotencyKey: responsibilityEvaluationKey({
        caseId: bundle.caseId, evidenceHash: hash, analysisId: envelope.analysisId, policyVersion: RESPONSIBILITY_POLICY_VERSION,
      }), evaluatedAt: new Date(start),
    })
  }

  const explicitlyFresh = structuredClone(driverCancellationBundle('explicit-fresh'))
  const freshAssignment = explicitlyFresh.timeline.find(item => item.category === evidenceCategory.ASSIGNMENT)
  freshAssignment.quality = { fresh: true }
  freshAssignment.observedAt = '2026-09-25T04:00:00.000Z'
  freshAssignment.receivedAt = '2026-09-25T06:00:00.000Z'
  assert.equal((await evaluate(explicitlyFresh)).route, provisionalResponsibilityRoute.PROVISIONAL_AUTO_UPHELD)

  const ageFresh = structuredClone(driverCancellationBundle('age-fresh'))
  const ageAssignment = ageFresh.timeline.find(item => item.category === evidenceCategory.ASSIGNMENT)
  ageAssignment.quality = { ageMs: 0 }
  ageAssignment.observedAt = '2026-09-25T04:00:00.000Z'
  ageAssignment.receivedAt = '2026-09-25T06:00:00.000Z'
  assert.equal((await evaluate(ageFresh)).route, provisionalResponsibilityRoute.PROVISIONAL_AUTO_UPHELD)

  const mixed = structuredClone(driverCancellationBundle('mixed-freshness'))
  const assignment = mixed.timeline.find(item => item.category === evidenceCategory.ASSIGNMENT)
  const staleAssignment = structuredClone(assignment)
  staleAssignment.id = `${assignment.id}-stale`
  staleAssignment.quality = { fresh: false }
  staleAssignment.observedAt = '2026-09-25T04:00:00.000Z'
  staleAssignment.receivedAt = '2026-09-25T06:00:00.000Z'
  mixed.timeline.push(staleAssignment)
  assert.equal((await evaluate(mixed)).route, provisionalResponsibilityRoute.PROVISIONAL_AUTO_UPHELD)
})

test('policy gate keeps direct provenance, classification compatibility, state, and validation independently gated', async () => {
  const direct = structuredClone(driverCancellationBundle('direct-provenance'))
  direct.timeline[0].basis = 'direct'
  direct.timeline[0].derivedFrom = ['missing-source-id']
  const directEnvelope = await createResponsibilityAnalystFake().analyzeResponsibilityCase(direct)
  const directHash = responsibilityEvidenceHash(direct)
  const directKey = responsibilityEvaluationKey({
    caseId: direct.caseId, evidenceHash: directHash, analysisId: directEnvelope.analysisId, policyVersion: RESPONSIBILITY_POLICY_VERSION,
  })
  const directGate = evaluateResponsibilityPolicy({
    evidence: direct, analysisEnvelope: directEnvelope, evidenceHash: directHash,
    currentState: responsibilityCaseState.POLICY_EVALUATION, idempotencyKey: directKey, evaluatedAt: new Date(start),
  })
  assert.deepEqual(directGate.passedGates.find(item => item.code === 'EVIDENCE_QUALITY'),
    { code: 'EVIDENCE_QUALITY', detail: 'acceptable' })

  const wrongStateGate = evaluateResponsibilityPolicy({
    evidence: direct, analysisEnvelope: directEnvelope, evidenceHash: directHash,
    currentState: responsibilityCaseState.AI_REVIEW, idempotencyKey: directKey, evaluatedAt: new Date(start),
  })
  assert.deepEqual(wrongStateGate.failedGates.find(item => item.code === 'CURRENT_STATE'),
    { code: 'CURRENT_STATE', detail: responsibilityCaseState.AI_REVIEW })

  const badEnvelope = structuredClone(directEnvelope)
  badEnvelope.output.caseId = 'wrong-case'
  badEnvelope.output.factsSupporting[0].evidenceIds = ['invented-evidence']
  const badGate = evaluateResponsibilityPolicy({
    evidence: direct, analysisEnvelope: badEnvelope, evidenceHash: directHash,
    currentState: responsibilityCaseState.POLICY_EVALUATION,
    idempotencyKey: responsibilityEvaluationKey({
      caseId: direct.caseId, evidenceHash: directHash, analysisId: badEnvelope.analysisId, policyVersion: RESPONSIBILITY_POLICY_VERSION,
    }), evaluatedAt: new Date(start),
  })
  assert.deepEqual(badGate.failedGates.find(item => item.code === 'ANALYSIS_VALIDATION'),
    { code: 'ANALYSIS_VALIDATION', detail: 'CASE_ID_MISMATCH,INVENTED_EVIDENCE_REFERENCE' })

  const platform = platformFailureBundle('platform-action-mismatch')
  const platformEnvelope = await createResponsibilityAnalystFake('platform_caused').analyzeResponsibilityCase(platform)
  platformEnvelope.output.suggestedActionCategory = suggestedActionCategory.ADMIN_REVIEW
  const platformHash = responsibilityEvidenceHash(platform)
  const platformGate = evaluateResponsibilityPolicy({
    evidence: platform, analysisEnvelope: platformEnvelope, evidenceHash: platformHash,
    currentState: responsibilityCaseState.POLICY_EVALUATION,
    idempotencyKey: responsibilityEvaluationKey({
      caseId: platform.caseId, evidenceHash: platformHash, analysisId: platformEnvelope.analysisId, policyVersion: RESPONSIBILITY_POLICY_VERSION,
    }), evaluatedAt: new Date(start),
  })
  assert.deepEqual(platformGate.failedGates.find(item => item.code === 'CLASSIFICATION_ACTION_COMPATIBILITY'),
    { code: 'CLASSIFICATION_ACTION_COMPATIBILITY', detail: 'PLATFORM_CAUSED/ADMIN_REVIEW' })

  const external = driverCancellationBundle('external-action-mismatch')
  const externalEnvelope = await createResponsibilityAnalystFake('external_uncertain').analyzeResponsibilityCase(external)
  externalEnvelope.output.suggestedActionCategory = suggestedActionCategory.AUTO_WAIVE_CANDIDATE
  const externalHash = responsibilityEvidenceHash(external)
  const externalGate = evaluateResponsibilityPolicy({
    evidence: external, analysisEnvelope: externalEnvelope, evidenceHash: externalHash,
    currentState: responsibilityCaseState.POLICY_EVALUATION,
    idempotencyKey: responsibilityEvaluationKey({
      caseId: external.caseId, evidenceHash: externalHash, analysisId: externalEnvelope.analysisId, policyVersion: RESPONSIBILITY_POLICY_VERSION,
    }), evaluatedAt: new Date(start),
  })
  assert.deepEqual(externalGate.failedGates.find(item => item.code === 'CLASSIFICATION_ACTION_COMPATIBILITY'),
    { code: 'CLASSIFICATION_ACTION_COMPATIBILITY', detail: 'EXTERNAL_OR_UNCERTAIN/AUTO_WAIVE_CANDIDATE' })
})

test('policy gate records exact adverse audit reasons and successful waiver enablement', async () => {
  const contradiction = driverLateContradictionBundle('exact-material-contradiction')
  const contradictionEnvelope = await createResponsibilityAnalystFake().analyzeResponsibilityCase(contradiction)
  const contradictionHash = responsibilityEvidenceHash(contradiction)
  const contradictionGate = evaluateResponsibilityPolicy({
    evidence: contradiction, analysisEnvelope: contradictionEnvelope, evidenceHash: contradictionHash,
    currentState: responsibilityCaseState.POLICY_EVALUATION,
    idempotencyKey: responsibilityEvaluationKey({
      caseId: contradiction.caseId, evidenceHash: contradictionHash, analysisId: contradictionEnvelope.analysisId,
      policyVersion: RESPONSIBILITY_POLICY_VERSION,
    }), evaluatedAt: new Date(start),
  })
  assert.deepEqual(contradictionGate.failedGates.find(item => item.code === 'MATERIAL_CONTRADICTIONS'),
    { code: 'MATERIAL_CONTRADICTIONS', detail: 'unresolved' })

  const reported = driverCancellationBundle('exact-ai-reported')
  const reportedEnvelope = await createResponsibilityAnalystFake().analyzeResponsibilityCase(reported)
  reportedEnvelope.output.missingEvidence = [{ category: evidenceCategory.NOTIFICATION, reason: 'Missing receipt.' }]
  reportedEnvelope.output.contradictions = [{
    evidenceIds: [reported.timeline[0].id, reported.timeline[1].id], summary: 'Needs review.',
  }]
  const reportedHash = responsibilityEvidenceHash(reported)
  const reportedGate = evaluateResponsibilityPolicy({
    evidence: reported, analysisEnvelope: reportedEnvelope, evidenceHash: reportedHash,
    currentState: responsibilityCaseState.POLICY_EVALUATION,
    idempotencyKey: responsibilityEvaluationKey({
      caseId: reported.caseId, evidenceHash: reportedHash, analysisId: reportedEnvelope.analysisId, policyVersion: RESPONSIBILITY_POLICY_VERSION,
    }), evaluatedAt: new Date(start),
  })
  assert.deepEqual(reportedGate.failedGates.find(item => item.code === 'AI_REPORTED_MISSING_EVIDENCE'),
    { code: 'AI_REPORTED_MISSING_EVIDENCE', detail: 'reported' })
  assert.deepEqual(reportedGate.failedGates.find(item => item.code === 'AI_REPORTED_CONTRADICTIONS'),
    { code: 'AI_REPORTED_CONTRADICTIONS', detail: 'reported' })

  const platform = platformFailureBundle('exact-waive-enabled')
  const platformEnvelope = await createResponsibilityAnalystFake('platform_caused').analyzeResponsibilityCase(platform)
  const platformHash = responsibilityEvidenceHash(platform)
  const platformGate = evaluateResponsibilityPolicy({
    evidence: platform, analysisEnvelope: platformEnvelope, evidenceHash: platformHash,
    currentState: responsibilityCaseState.POLICY_EVALUATION,
    idempotencyKey: responsibilityEvaluationKey({
      caseId: platform.caseId, evidenceHash: platformHash, analysisId: platformEnvelope.analysisId, policyVersion: RESPONSIBILITY_POLICY_VERSION,
    }), evaluatedAt: new Date(start),
  })
  assert.equal(platformGate.route, provisionalResponsibilityRoute.PROVISIONAL_AUTO_WAIVED)
  assert.deepEqual(platformGate.passedGates.find(item => item.code === 'AUTO_WAIVE_ENABLED'),
    { code: 'AUTO_WAIVE_ENABLED', detail: 'enabled' })
})

test('state transition fallback and preloaded invalid analysis remain conservative and restart-safe', async () => {
  assert.equal(canTransitionResponsibilityState('UNKNOWN_STATE', 'Stryker was here'), false)

  const bundle = driverCancellationBundle('preloaded-invalid-analysis')
  const evidenceHash = responsibilityEvidenceHash(bundle)
  const logicalKey = `${bundle.caseId}:${evidenceHash}:${AI_RESPONSIBILITY_CONTRACT_VERSION}`
  const repository = createResponsibilityDecisionMemoryRepository()
  repository.stores.analyses.set(logicalKey, {
    id: 'preloaded-invalid', logicalKey, caseId: bundle.caseId, evidenceHash,
    contractVersion: AI_RESPONSIBILITY_CONTRACT_VERSION, provider: 'fixture', model: 'fixture', envelope: null,
    validation: { valid: false, errors: ['ANALYSIS_SCHEMA_INVALID'], evidenceIds: [], citedEvidenceIds: [] },
  })
  const analyst = {
    provider: 'fixture', model: 'fixture',
    analyzeResponsibilityCase: async () => { throw new Error('SHOULD_NOT_CALL_ANALYST') },
  }
  const result = await createResponsibilityDecisionService({ analyst, repository, clock: createTestClock(start) }).process(bundle)
  assert.equal(result.status, 'DECIDED')
  assert.equal(result.decision.route, provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW)
  assert.deepEqual(result.decision.passedGates.find(item => item.code === 'IDEMPOTENCY_KEY'),
    { code: 'IDEMPOTENCY_KEY', detail: 'valid' })
})

test('Prisma responsibility repository preserves every key and create/update shape exactly', async () => {
  const calls = []
  const method = name => async args => { calls.push([name, args]); return args }
  const db = {
    responsibilityCase: { findUnique: method('case.find'), upsert: method('case.upsert'), update: method('case.update') },
    responsibilityAnalysis: { findUnique: method('analysis.find'), upsert: method('analysis.upsert') },
    responsibilityProvisionalDecision: { findUnique: method('decision.find'), upsert: method('decision.upsert') },
  }
  const repository = createPrismaResponsibilityDecisionRepository(db)
  const caseRecord = {
    id: 'case-exact', bookingId: 'booking-exact', caseType: 'DRIVER_CANCELLATION', evidenceVersion: 'v1', evidenceHash: 'h1',
    evidenceSnapshot: { caseId: 'case-exact' }, scheduledAt: null, occurredAt: new Date(start), state: 'EVIDENCE_COLLECTING',
  }
  const analysisRecord = { logicalKey: 'logical-exact', id: 'analysis-exact', caseId: 'case-exact' }
  const decisionRecord = { caseId: 'case-exact', route: 'NEEDS_ADMIN_REVIEW', policyVersion: RESPONSIBILITY_POLICY_VERSION }
  await repository.findCase('case-exact')
  await repository.saveCaseEvidence(caseRecord)
  await repository.setCaseState('case-exact', 'AI_REVIEW')
  await repository.findAnalysis('logical-exact')
  await repository.saveAnalysis(analysisRecord)
  await repository.findDecision('case-exact')
  await repository.saveDecision(decisionRecord)
  assert.deepEqual(calls, [
    ['case.find', { where: { id: 'case-exact' } }],
    ['case.upsert', { where: { id: 'case-exact' }, update: {
      bookingId: 'booking-exact', caseType: 'DRIVER_CANCELLATION', evidenceVersion: 'v1', evidenceHash: 'h1',
      evidenceSnapshot: { caseId: 'case-exact' }, scheduledAt: null, occurredAt: new Date(start),
    }, create: caseRecord }],
    ['case.update', { where: { id: 'case-exact' }, data: { state: 'AI_REVIEW' } }],
    ['analysis.find', { where: { logicalKey: 'logical-exact' } }],
    ['analysis.upsert', { where: { logicalKey: 'logical-exact' }, update: {}, create: analysisRecord }],
    ['decision.find', { where: { caseId: 'case-exact' } }],
    ['decision.upsert', { where: { caseId: 'case-exact' }, update: {}, create: decisionRecord }],
  ])
})

test('Prisma responsibility repository recovers only same-logical-key analysis uniqueness races', async () => {
  const duplicate = Object.assign(new Error('duplicate analysis id'), { code: 'P2002' })
  const unrelated = Object.assign(new Error('database unavailable'), { code: 'P1001' })
  const existing = { id: 'analysis-race', logicalKey: 'logical-race' }
  const record = { id: 'analysis-race', logicalKey: 'logical-race', caseId: 'case-race' }
  const db = {
    responsibilityAnalysis: {
      upsert: async () => { throw duplicate },
      findUnique: async args => {
        assert.deepEqual(args, { where: { logicalKey: 'logical-race' } })
        return existing
      },
    },
    responsibilityProvisionalDecision: {
      upsert: async () => { throw duplicate },
      findUnique: async args => {
        assert.deepEqual(args, { where: { caseId: 'case-race' } })
        return { id: 'decision-race', caseId: 'case-race' }
      },
    },
  }
  const repository = createPrismaResponsibilityDecisionRepository(db)
  assert.equal(await repository.saveAnalysis(record), existing)
  assert.deepEqual(await repository.saveDecision({ caseId: 'case-race' }), {
    id: 'decision-race', caseId: 'case-race',
  })

  db.responsibilityAnalysis.upsert = async () => { throw unrelated }
  await assert.rejects(repository.saveAnalysis(record), error => error === unrelated)

  db.responsibilityAnalysis.upsert = async () => { throw duplicate }
  db.responsibilityAnalysis.findUnique = async () => null
  await assert.rejects(repository.saveAnalysis(record), error => error === duplicate)
})

test('decision service persists exact audit metadata and safe fallbacks for invalid analyst envelopes', async () => {
  const bundle = driverCancellationBundle('service-persistence')
  const repository = createResponsibilityDecisionMemoryRepository()
  const service = createResponsibilityDecisionService({ analyst: createResponsibilityAnalystFake(), repository, clock: createTestClock(start) })
  const result = await service.process(bundle)
  const hash = responsibilityEvidenceHash(bundle)
  const logicalKey = `${bundle.caseId}:${hash}:${AI_RESPONSIBILITY_CONTRACT_VERSION}`
  const caseRecord = repository.stores.cases.get(bundle.caseId)
  const analysis = repository.stores.analyses.get(logicalKey)
  assert.equal(result.status, 'DECIDED')
  assert.equal(result.reusedDecision, false)
  assert.equal(caseRecord.scheduledAt.toISOString(), bundle.scheduledAt)
  assert.equal(caseRecord.occurredAt.toISOString(), bundle.occurredAt)
  assert.equal(caseRecord.state, provisionalResponsibilityRoute.PROVISIONAL_AUTO_UPHELD)
  assert.equal(analysis.logicalKey, logicalKey)
  assert.equal(analysis.id, `analysis-${bundle.caseId}`)
  assert.equal(analysis.contractVersion, AI_RESPONSIBILITY_CONTRACT_VERSION)
  assert.equal(analysis.provider, 'deterministic-fake')
  assert.equal(analysis.model, 'phase5-fixture')
  assert.equal(result.decision.analysisId, analysis.id)
  assert.equal(result.decision.analysisVersion, AI_RESPONSIBILITY_CONTRACT_VERSION)
  assert.equal(result.decision.policyVersion, RESPONSIBILITY_POLICY_VERSION)
  assert.equal(result.decision.evaluatedAt.toISOString(), start)

  const invalidModes = [
    { label: 'null', envelope: null, expectedEnvelope: { invalid: true } },
    { label: 'primitive', envelope: 'bad-envelope', expectedEnvelope: 'bad-envelope' },
    { label: 'typed-fields', envelope: { analysisId: 'partial-id', contractVersion: 'partial-contract', provider: 'partial-provider', model: 'partial-model' } },
    { label: 'wrong-types', envelope: { analysisId: 7, contractVersion: 8, provider: 9, model: 10 } },
  ]
  for (const item of invalidModes) {
    const invalidBundle = { ...driverCancellationBundle(`invalid-${item.label}`), scheduledAt: null, occurredAt: null }
    const invalidRepository = createResponsibilityDecisionMemoryRepository()
    const analyst = { provider: 'fallback-provider', model: 'fallback-model', analyzeResponsibilityCase: async () => item.envelope }
    const invalidResult = await createResponsibilityDecisionService({ analyst, repository: invalidRepository, clock: createTestClock(start) })
      .process(invalidBundle)
    const invalidHash = responsibilityEvidenceHash(invalidBundle)
    const invalidLogicalKey = `${invalidBundle.caseId}:${invalidHash}:${AI_RESPONSIBILITY_CONTRACT_VERSION}`
    const stored = invalidRepository.stores.analyses.get(invalidLogicalKey)
    const validShape = item.envelope && typeof item.envelope === 'object'
    assert.equal(stored.id, validShape && typeof item.envelope.analysisId === 'string'
      ? item.envelope.analysisId : `invalid:${invalidBundle.caseId}:${invalidHash.slice(0, 16)}`)
    assert.equal(stored.contractVersion, validShape && typeof item.envelope.contractVersion === 'string'
      ? item.envelope.contractVersion : AI_RESPONSIBILITY_CONTRACT_VERSION)
    assert.equal(stored.provider, validShape && typeof item.envelope.provider === 'string' ? item.envelope.provider : 'fallback-provider')
    assert.equal(stored.model, validShape && typeof item.envelope.model === 'string' ? item.envelope.model : 'fallback-model')
    assert.deepEqual(stored.envelope, item.expectedEnvelope ?? item.envelope)
    assert.deepEqual(stored.validation, { valid: false, errors: ['ANALYSIS_SCHEMA_INVALID'], evidenceIds: [], citedEvidenceIds: [] })
    assert.equal(invalidRepository.stores.cases.get(invalidBundle.caseId).scheduledAt, null)
    assert.equal(invalidRepository.stores.cases.get(invalidBundle.caseId).occurredAt, null)
    assert.equal(invalidResult.status, 'DECIDED')
    assert.equal(invalidResult.reusedDecision, false)
    assert.equal(invalidResult.decision.route, provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW)
  }
})
