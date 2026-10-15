import { systemClock } from '../lib/clock.js'
import { AI_RESPONSIBILITY_CONTRACT_VERSION, responsibilityEvidenceBundleSchema } from './responsibilityContracts.js'
import { responsibilityEvidenceHash, validateAnalysisAgainstEvidence } from './responsibilityAnalyst.js'
import { responsibilityCaseState, assertResponsibilityStateTransition } from './responsibilityCaseState.js'
import {
  DEFAULT_RESPONSIBILITY_POLICY,
  evaluateResponsibilityPolicy,
  responsibilityEvaluationKey,
} from './responsibilityPolicyGate.js'
import { createPrismaResponsibilityDecisionRepository } from './responsibilityDecisionRepository.js'

const analysisLogicalKey = ({ caseId, evidenceHash, contractVersion = AI_RESPONSIBILITY_CONTRACT_VERSION }) =>
  [caseId, evidenceHash, contractVersion].join(':')

const toDateOrNull = value => value == null ? null : new Date(value)

const invalidAnalysisId = (caseId, evidenceHash) => `invalid:${caseId}:${evidenceHash.slice(0, 16)}`

function analysisRecord({ envelope, validation, logicalKey, evidenceHash, analyst, caseId }) {
  const validShape = envelope && typeof envelope === 'object'
  return {
    id: validShape && typeof envelope.analysisId === 'string'
      ? envelope.analysisId
      : invalidAnalysisId(caseId, evidenceHash),
    logicalKey,
    caseId,
    evidenceHash,
    contractVersion: validShape && typeof envelope.contractVersion === 'string'
      ? envelope.contractVersion
      : AI_RESPONSIBILITY_CONTRACT_VERSION,
    provider: validShape && typeof envelope.provider === 'string' ? envelope.provider : analyst.provider,
    model: validShape && typeof envelope.model === 'string' ? envelope.model : analyst.model,
    envelope: envelope ?? { invalid: true },
    validation,
  }
}

async function ensureAiReviewState(repository, caseRecord) {
  if (caseRecord.state !== responsibilityCaseState.EVIDENCE_COLLECTING) return caseRecord
  const next = assertResponsibilityStateTransition(caseRecord.state, responsibilityCaseState.AI_REVIEW)
  return repository.setCaseState(caseRecord.id, next)
}

async function ensurePolicyEvaluationState(repository, caseRecord) {
  if (caseRecord.state === responsibilityCaseState.POLICY_EVALUATION) return caseRecord
  const next = assertResponsibilityStateTransition(caseRecord.state, responsibilityCaseState.POLICY_EVALUATION)
  return repository.setCaseState(caseRecord.id, next)
}

export function createResponsibilityDecisionService({
  analyst,
  repository = createPrismaResponsibilityDecisionRepository(),
  policy = DEFAULT_RESPONSIBILITY_POLICY,
  clock = systemClock,
  hooks = {},
}) {
  if (!analyst?.analyzeResponsibilityCase) throw new Error('Responsibility analyst is required')

  return {
    async process(evidenceInput) {
      const evidence = responsibilityEvidenceBundleSchema.parse(evidenceInput)
      const existingDecision = await repository.findDecision(evidence.caseId)
      if (existingDecision) return { status: 'DECIDED', decision: existingDecision, reusedDecision: true }

      const evidenceHash = responsibilityEvidenceHash(evidence)
      let caseRecord = await repository.saveCaseEvidence({
        id: evidence.caseId,
        bookingId: evidence.bookingId,
        caseType: evidence.caseType,
        state: responsibilityCaseState.EVIDENCE_COLLECTING,
        evidenceVersion: evidence.evidenceVersion,
        evidenceHash,
        evidenceSnapshot: evidence,
        scheduledAt: toDateOrNull(evidence.scheduledAt),
        occurredAt: toDateOrNull(evidence.occurredAt),
      })
      caseRecord = await ensureAiReviewState(repository, caseRecord)

      const logicalKey = analysisLogicalKey({ caseId: evidence.caseId, evidenceHash })
      let storedAnalysis = await repository.findAnalysis(logicalKey)
      if (!storedAnalysis) {
        let envelope
        try {
          envelope = await analyst.analyzeResponsibilityCase(evidence)
        } catch (error) {
          return {
            status: 'RETRYABLE_AI_REVIEW',
            caseId: evidence.caseId,
            state: responsibilityCaseState.AI_REVIEW,
            reason: error instanceof Error ? error.message : 'AI analyst unavailable',
          }
        }
        const validation = validateAnalysisAgainstEvidence(evidence, envelope)
        storedAnalysis = await repository.saveAnalysis(analysisRecord({
          envelope,
          validation,
          logicalKey,
          evidenceHash,
          analyst,
          caseId: evidence.caseId,
        }))
        if (hooks.afterAnalysisPersisted) await hooks.afterAnalysisPersisted(storedAnalysis)
      }

      caseRecord = await ensurePolicyEvaluationState(repository, caseRecord)
      const envelope = storedAnalysis.envelope
      const analysisId = envelope?.analysisId ?? 'invalid-analysis'
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
        currentState: caseRecord.state,
        idempotencyKey,
        policy,
        evaluatedAt: clock.now(),
      })
      const decision = await repository.saveDecision({
        caseId: evidence.caseId,
        evidenceVersion: evidence.evidenceVersion,
        evidenceHash,
        analysisId: storedAnalysis.id,
        analysisVersion: storedAnalysis.contractVersion,
        policyVersion: gate.policyVersion,
        route: gate.route,
        reasons: gate.reasons,
        passedGates: gate.passedGates,
        failedGates: gate.failedGates,
        humanReviewRequired: gate.humanReviewRequired,
        evaluatedAt: new Date(gate.evaluatedAt),
      })
      await repository.setCaseState(evidence.caseId, gate.route)
      return { status: 'DECIDED', decision, reusedDecision: false }
    },
  }
}
