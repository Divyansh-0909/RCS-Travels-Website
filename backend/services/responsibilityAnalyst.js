import { createHash } from 'node:crypto'
import { zodTextFormat } from 'openai/helpers/zod'
import {
  AI_RESPONSIBILITY_CONTRACT_VERSION,
  aiResponsibilityAnalysisSchema,
  responsibilityAnalystEnvelopeSchema,
  responsibilityEvidenceBundleSchema,
} from './responsibilityContracts.js'
import { stableSerializeResponsibilityEvidence } from './responsibilityEvidence.js'

export const RESPONSIBILITY_ANALYST_INSTRUCTIONS = `You analyze one normalized responsibility evidence bundle.
Use only evidence supplied in the bundle. Never invent evidence or evidence IDs.
Keep FACT items separate from INFERENCE items. Every fact and inference must cite evidence IDs from the bundle.
Call out uncertainty, contradictions, and missing evidence explicitly.
Do not decide or recommend executable financial changes, refunds, compensation, liability, strikes, suspension, blocking, payout changes, final responsibility, or final appeal outcomes.
Your classification and action category are advisory only. A deterministic policy gate makes the routing decision and cannot be overridden by you.`

const hashableBundle = bundle => ({
  evidenceVersion: bundle.evidenceVersion,
  caseId: bundle.caseId,
  caseType: bundle.caseType,
  bookingId: bundle.bookingId,
  scheduledAt: bundle.scheduledAt,
  occurredAt: bundle.occurredAt,
  timeline: bundle.timeline,
  completeness: bundle.completeness,
  contradictions: bundle.contradictions,
})

export function responsibilityEvidenceHash(bundle) {
  const normalized = responsibilityEvidenceBundleSchema.parse(bundle)
  return createHash('sha256')
    .update(stableSerializeResponsibilityEvidence(hashableBundle(normalized)))
    .digest('hex')
}

const referencedEvidenceIds = analysis => [
  ...analysis.factsSupporting,
  ...analysis.factsAgainst,
  ...analysis.inferences,
  ...analysis.contradictions,
].flatMap(item => item.evidenceIds)

const normalizedStatement = value => value.trim().replace(/\s+/g, ' ').toLowerCase()

export function validateAnalysisAgainstEvidence(bundle, envelope) {
  const bundleResult = responsibilityEvidenceBundleSchema.safeParse(bundle)
  const envelopeResult = responsibilityAnalystEnvelopeSchema.safeParse(envelope)
  const errors = []
  if (!bundleResult.success) errors.push('EVIDENCE_SCHEMA_INVALID')
  if (!envelopeResult.success) errors.push('ANALYSIS_SCHEMA_INVALID')
  if (!bundleResult.success || !envelopeResult.success) {
    return { valid: false, errors, evidenceIds: [], citedEvidenceIds: [] }
  }

  const normalizedBundle = bundleResult.data
  const analysis = envelopeResult.data.output
  const evidenceIds = normalizedBundle.timeline.map(item => item.id)
  const knownIds = new Set(evidenceIds)
  const citedEvidenceIds = referencedEvidenceIds(analysis)
  if (analysis.caseId !== normalizedBundle.caseId) errors.push('CASE_ID_MISMATCH')
  if (citedEvidenceIds.some(id => !knownIds.has(id))) errors.push('INVENTED_EVIDENCE_REFERENCE')

  const supportingStatements = new Set(analysis.factsSupporting.map(item => normalizedStatement(item.statement)))
  if (analysis.factsAgainst.some(item => supportingStatements.has(normalizedStatement(item.statement)))) {
    errors.push('SELF_CONTRADICTORY_FACTS')
  }

  return {
    valid: errors.length === 0,
    errors,
    evidenceIds,
    citedEvidenceIds: [...new Set(citedEvidenceIds)],
  }
}

export function createOpenAIResponsibilityAnalyst(options = {}) {
  const model = options.model ?? process.env.RESPONSIBILITY_ANALYST_MODEL ?? 'gpt-5.6-mini'
  const client = options.client ?? null
  const loadClientModule = options.clientModuleLoader ?? null
  return {
    provider: 'openai',
    model,
    async analyzeResponsibilityCase(bundle) {
      const normalized = responsibilityEvidenceBundleSchema.parse(bundle)
      const activeClient = client ?? (loadClientModule ? (await loadClientModule()).openai : null)
      if (!activeClient) throw new Error('Responsibility analyst client is not configured')
      const response = await activeClient.responses.parse({
        model,
        instructions: RESPONSIBILITY_ANALYST_INSTRUCTIONS,
        input: stableSerializeResponsibilityEvidence(normalized),
        text: { format: zodTextFormat(aiResponsibilityAnalysisSchema, 'responsibility_analysis') },
      })
      if (!response.output_parsed) throw new Error('Responsibility analyst returned no structured output')
      const usage = response.usage ?? null
      return responsibilityAnalystEnvelopeSchema.parse({
        analysisId: response.id,
        contractVersion: AI_RESPONSIBILITY_CONTRACT_VERSION,
        provider: 'openai',
        model,
        usage: {
          inputTokens: Number.isInteger(usage?.input_tokens) ? usage.input_tokens : null,
          outputTokens: Number.isInteger(usage?.output_tokens) ? usage.output_tokens : null,
          totalTokens: Number.isInteger(usage?.total_tokens) ? usage.total_tokens : null,
          requestCount: 1,
        },
        output: response.output_parsed,
      })
    },
  }
}
