import { prisma } from '../db/prisma.js'
import { systemClock } from '../lib/clock.js'
import { responsibilityShadowDiagnostics } from './responsibilityShadowDiagnostics.js'
import {
  responsibilityCaseState,
} from './responsibilityCaseState.js'
import {
  responsibilityEvidenceBundleSchema,
} from './responsibilityContracts.js'
import {
  createOpenAIResponsibilityAnalyst,
  responsibilityEvidenceHash,
  validateAnalysisAgainstEvidence,
} from './responsibilityAnalyst.js'
import {
  DEFAULT_RESPONSIBILITY_POLICY,
  evaluateResponsibilityPolicy,
  responsibilityEvaluationKey,
} from './responsibilityPolicyGate.js'
import {
  createPrismaResponsibilityShadowRepository,
  enqueueResponsibilityShadowEvidence,
} from './responsibilityShadowRepository.js'
import {
  RESPONSIBILITY_ADJUDICATION_MODES,
  RESPONSIBILITY_ANALYST_CONFIG_VERSION,
  RESPONSIBILITY_SHADOW_LEASE_MS,
  RESPONSIBILITY_SHADOW_MAX_ATTEMPTS,
  ResponsibilityAdjudicationConfigError,
  responsibilityAdjudicationMode,
  responsibilityShadowRetryDelayMs,
} from './responsibilityShadowConfig.js'

export const responsibilityShadowWorkStatus = Object.freeze({
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  RETRYABLE: 'RETRYABLE',
  COMPLETED: 'COMPLETED',
  MANUAL_REVIEW: 'MANUAL_REVIEW',
})

export async function loadProductionResponsibilityAnalystClient() {
  /* c8 ignore next -- V8 reports the dynamic import expression itself as a synthetic branch. */
  const clientModule = await import('../lib/openai.js')
  return clientModule
}

export function createProductionResponsibilityAnalyst({
  clientModuleLoader = loadProductionResponsibilityAnalystClient,
} = {}) {
  return createOpenAIResponsibilityAnalyst({ clientModuleLoader })
}

export function summarizeResponsibilityShadowOutcomes(outcomes) {
  const counts = { completed: 0, retrying: 0, manualReview: 0 }
  for (const outcome of outcomes) {
    if (outcome.status === responsibilityShadowWorkStatus.COMPLETED) counts.completed += 1
    if (outcome.status === responsibilityShadowWorkStatus.RETRYABLE) counts.retrying += 1
    if (outcome.status === responsibilityShadowWorkStatus.MANUAL_REVIEW) counts.manualReview += 1
  }
  return counts
}

const redactErrorDetail = error => {
  const name = typeof error?.name === 'string' ? error.name : 'Error'
  const code = typeof error?.code === 'string' ? error.code : null
  const message = typeof error?.message === 'string' ? error.message : 'adjudication failure'
  const safe = message
    .replace(/sk-[a-zA-Z0-9_-]+/g, '[redacted]')
    .replace(/Bearer\s+[a-zA-Z0-9._-]+/gi, 'Bearer [redacted]')
    .slice(0, 240)
  return [name, code, safe].filter(Boolean).join(':')
}

const analystFailure = error => {
  if (error?.name === 'ZodError') return { retryable: false, category: 'ANALYST_SCHEMA_FAILURE' }
  const code = String(error?.code ?? error?.message).toUpperCase()
  if (error?.name === 'AbortError' || code.includes('TIMEOUT') || code.includes('ETIMEDOUT')) {
    return { retryable: true, category: 'ANALYST_TIMEOUT' }
  }
  return { retryable: true, category: 'ANALYST_PROVIDER_FAILURE' }
}

const usageFromEnvelope = envelope => ({
  inputTokens: Number.isInteger(envelope.usage?.inputTokens) ? envelope.usage.inputTokens : null,
  outputTokens: Number.isInteger(envelope.usage?.outputTokens) ? envelope.usage.outputTokens : null,
  requestCount: envelope.usage?.requestCount ?? 1,
})

function shadowResultRecord({ work, evidence, envelope, gate, latencyMs }) {
  const output = envelope.output
  const usage = usageFromEnvelope(envelope)
  return {
    workId: work.id,
    caseId: work.caseId,
    evidenceVersionId: work.evidenceVersionId,
    mode: 'SHADOW',
    evidenceVersion: evidence.evidenceVersion,
    evidenceHash: work.evidenceVersion.evidenceHash,
    analysisProviderId: envelope.analysisId,
    analysisVersion: envelope.contractVersion,
    provider: envelope.provider,
    model: envelope.model,
    analystConfigVersion: work.analystConfigVersion,
    policyVersion: gate.policyVersion,
    route: gate.route,
    suggestedClassification: output.suggestedClassification,
    confidence: output.confidence,
    severity: output.severityAssessment,
    factsSupporting: output.factsSupporting,
    factsAgainst: output.factsAgainst,
    inferences: output.inferences,
    missingEvidence: output.missingEvidence,
    contradictions: output.contradictions,
    passedGates: gate.passedGates,
    failedGates: gate.failedGates,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    requestCount: usage.requestCount,
    processingLatencyMs: latencyMs,
    attemptCount: work.attemptCount,
  }
}

export function createResponsibilityShadowAdjudicator({
  repository,
  analyst,
  mode,
  policy = DEFAULT_RESPONSIBILITY_POLICY,
  clock = systemClock,
  leaseMs = RESPONSIBILITY_SHADOW_LEASE_MS,
  maxAttempts = RESPONSIBILITY_SHADOW_MAX_ATTEMPTS,
} = {}) {
  if (!repository) throw new Error('Responsibility shadow repository is required')
  if (!analyst?.analyzeResponsibilityCase) throw new Error('Responsibility analyst is required')
  if (!Object.values(RESPONSIBILITY_ADJUDICATION_MODES).includes(mode)) {
    throw new ResponsibilityAdjudicationConfigError('RESPONSIBILITY_ADJUDICATION_MODE_INVALID')
  }

  const failWork = async (work, failure, retryable) => {
    const now = clock.now()
    const canRetry = retryable && work.attemptCount < maxAttempts
    const status = canRetry ? responsibilityShadowWorkStatus.RETRYABLE : responsibilityShadowWorkStatus.MANUAL_REVIEW
    const nextRetryAt = canRetry
      ? new Date(now.getTime() + responsibilityShadowRetryDelayMs(work.attemptCount))
      : null
    await repository.fail(work, {
      status,
      now,
      nextRetryAt,
      errorCategory: failure.category,
      errorDetail: failure.detail,
    })
    return { status, caseId: work.caseId, errorCategory: failure.category, nextRetryAt }
  }

  const processWork = async work => {
    const parsed = responsibilityEvidenceBundleSchema.safeParse(work.evidenceVersion?.snapshot)
    if (!parsed.success) {
      return failWork(work, { category: 'EVIDENCE_SCHEMA_INVALID', detail: 'Persisted evidence failed schema validation' }, false)
    }
    const evidence = parsed.data
    const evidenceHash = responsibilityEvidenceHash(evidence)
    if (evidenceHash !== work.evidenceVersion.evidenceHash || evidence.caseId !== work.caseId) {
      return failWork(work, { category: 'EVIDENCE_INTEGRITY_MISMATCH', detail: 'Persisted evidence identity/hash mismatch' }, false)
    }

    const startedAt = clock.now()
    let envelope
    try {
      envelope = await analyst.analyzeResponsibilityCase(evidence)
    } catch (error) {
      const failure = analystFailure(error)
      return failWork(work, { category: failure.category, detail: redactErrorDetail(error) }, failure.retryable)
    }

    const validation = validateAnalysisAgainstEvidence(evidence, envelope)
    if (!validation.valid) {
      return failWork(work, {
        category: `ANALYSIS_VALIDATION_${validation.errors[0]}`,
        detail: validation.errors.join(','),
      }, false)
    }

    const analysisId = envelope.analysisId
    const idempotencyKey = responsibilityEvaluationKey({
      caseId: evidence.caseId,
      evidenceHash,
      analysisId,
      policyVersion: policy.policyVersion,
    })
    const gate = evaluateResponsibilityPolicy({
      evidence,
      analysisEnvelope: envelope,
      evidenceHash,
      currentState: responsibilityCaseState.POLICY_EVALUATION,
      idempotencyKey,
      policy,
      evaluatedAt: clock.now(),
    })
    const completedAt = clock.now()
    const latencyMs = Math.max(0, completedAt.getTime() - startedAt.getTime())
    const result = { ...shadowResultRecord({ work, evidence, envelope, gate, latencyMs }),
      ...responsibilityShadowDiagnostics(envelope, validation) }
    const saved = await repository.complete(work, result, completedAt)
    return {
      status: saved.completed ? responsibilityShadowWorkStatus.COMPLETED : 'STALE_CLAIM',
      caseId: work.caseId,
      route: saved.result?.route ?? gate.route,
      result: saved.result,
    }
  }

  return {
    async sweep({ batchSize = 25 } = {}) {
      if (mode === RESPONSIBILITY_ADJUDICATION_MODES.DISABLED) {
        return { status: 'DISABLED', processed: 0, outcomes: [] }
      }
      const outcomes = []
      for (let index = 0; index < batchSize; index += 1) {
        const now = clock.now()
        const work = await repository.claimNext({
          now,
          leaseUntil: new Date(now.getTime() + leaseMs),
          maxAttempts,
        })
        if (!work) break
        try {
          outcomes.push(await processWork(work))
        } catch (error) {
          try {
            outcomes.push(await failWork(work, {
              category: 'PROCESSING_FAILURE',
              detail: redactErrorDetail(error),
            }, true))
          } catch {
            outcomes.push({ status: 'LEASE_RECOVERY_REQUIRED', caseId: work.caseId })
          }
        }
      }
      return { status: 'SHADOW', processed: outcomes.length, outcomes }
    },
    processWork,
  }
}

export async function sweepResponsibilityShadowAdjudication({
  db = prisma,
  clock = systemClock,
  analyst = null,
  batchSize = 25,
  env = process.env,
} = {}) {
  let mode
  try {
    mode = responsibilityAdjudicationMode(env)
  } catch (error) {
    if (error instanceof ResponsibilityAdjudicationConfigError) {
      return { status: 'CONFIG_ERROR', processed: 0, code: error.code, outcomes: [] }
    }
    throw error
  }
  const repository = createPrismaResponsibilityShadowRepository(db)
  const adjudicator = createResponsibilityShadowAdjudicator({
    repository,
    analyst: analyst ?? createProductionResponsibilityAnalyst(),
    mode,
    clock,
  })
  const summary = await adjudicator.sweep({ batchSize })
  const outcomeCounts = summarizeResponsibilityShadowOutcomes(summary.outcomes)
  console.info('responsibility shadow adjudication', JSON.stringify({
    status: summary.status,
    processed: summary.processed,
    ...outcomeCounts,
  }))
  return summary
}

export async function getResponsibilityAdjudicationHealth({ db = prisma, clock = systemClock, env = process.env } = {}) {
  let mode = 'invalid'
  let configError = null
  try { mode = responsibilityAdjudicationMode(env) }
  catch (error) { configError = error instanceof ResponsibilityAdjudicationConfigError ? error.code : 'CONFIG_ERROR' }
  const repository = createPrismaResponsibilityShadowRepository(db)
  return { mode, configError, ...(await repository.health(clock.now())) }
}

export async function retryResponsibilityShadowCase(caseId, { db = prisma, clock = systemClock } = {}) {
  const repository = createPrismaResponsibilityShadowRepository(db)
  const responsibilityCase = await repository.findCase(caseId)
  if (!responsibilityCase) return { status: 'CASE_NOT_FOUND' }
  const latestWork = await repository.findLatestWork(caseId)
  if (!latestWork) {
    await enqueueResponsibilityShadowEvidence(responsibilityCase.evidenceSnapshot, { db })
    return { status: 'QUEUED' }
  }
  return repository.resetLatestManualWork(caseId, clock.now())
}

export { RESPONSIBILITY_ANALYST_CONFIG_VERSION }
