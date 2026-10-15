import { createHash } from 'node:crypto'
import { createEvidenceCriteriaV5Adapter, EVIDENCE_CRITERIA_V5_CONFIG } from '../benchmarks/responsibility/evidenceCriteriaV5.js'
import { responsibilityEvidenceHash } from './responsibilityAnalyst.js'
import { AI_RESPONSIBILITY_CONTRACT_VERSION, responsibilityAnalystEnvelopeSchema } from './responsibilityContracts.js'

export const JEV_V5_EXECUTION_VERSION = 'responsibility-jev-v5-production-envelope-v1'

// Preserve categorical analysis without inventing freeform facts or evidence citations.
// Independent evidence authority is enforced by the existing production policy gate.
export function jevV5AnalysisEnvelope(evidence, run) {
  const output = run.normalized
  const blocked = !output.evidenceSufficient || output.needsHumanReview || output.externalCauseMaterial
    || run.raw.decisions.aggravatingEvidencePresent === 'YES'
    || (output.classification === 'DRIVER_CAUSED' && output.platformMateriallyContributed)
    || (output.classification === 'PLATFORM_CAUSED' && !output.platformMateriallyContributed)
  const action = blocked ? 'ADMIN_REVIEW'
    : output.classification === 'DRIVER_CAUSED' ? 'AUTO_UPHOLD_CANDIDATE'
      : ['PLATFORM_CAUSED', 'VALID_WAIVED'].includes(output.classification) ? 'AUTO_WAIVE_CANDIDATE' : 'ADMIN_REVIEW'
  const analysisId = createHash('sha256').update(JSON.stringify({ version: JEV_V5_EXECUTION_VERSION,
    questions: EVIDENCE_CRITERIA_V5_CONFIG.questionsHash, evidenceHash: responsibilityEvidenceHash(evidence), raw: run.raw })).digest('hex')
  return responsibilityAnalystEnvelopeSchema.parse({ analysisId, contractVersion: AI_RESPONSIBILITY_CONTRACT_VERSION,
    provider: 'typesafe-ai', model: run.raw.model, output: { caseId: evidence.caseId,
      suggestedClassification: output.classification, confidence: output.confidence,
      factsSupporting: [], factsAgainst: [], contradictions: [], missingEvidence: [], inferences: [],
      severityAssessment: output.severity, suggestedActionCategory: action,
      explanationSummary: 'Bounded Jev V5 categorical recommendation. No freeform facts or citations were returned; independent evidence and policy checks determine eligibility.' } })
}

export function createJevV5ResponsibilityAnalyst(options) {
  const adapter = createEvidenceCriteriaV5Adapter(options)
  return { provider: adapter.provider, model: adapter.model, configVersion: EVIDENCE_CRITERIA_V5_CONFIG.version,
    async analyzeResponsibilityCase(evidence) {
      responsibilityEvidenceHash(evidence)
      const run = await adapter.analyzeResponsibilityCase(evidence)
      return jevV5AnalysisEnvelope(evidence, run)
    } }
}
