import {
  AI_RESPONSIBILITY_CONTRACT_VERSION,
  responsibilityClassification,
  responsibilitySeverity,
  suggestedActionCategory,
} from '../../services/responsibilityContracts.js'

const firstEvidenceIds = (bundle, count = 1) => bundle.timeline.slice(0, count).map(item => item.id)

const classificationAction = Object.freeze({
  [responsibilityClassification.DRIVER_CAUSED]: suggestedActionCategory.AUTO_UPHOLD_CANDIDATE,
  [responsibilityClassification.PLATFORM_CAUSED]: suggestedActionCategory.AUTO_WAIVE_CANDIDATE,
  [responsibilityClassification.VALID_WAIVED]: suggestedActionCategory.AUTO_WAIVE_CANDIDATE,
  [responsibilityClassification.EXTERNAL_OR_UNCERTAIN]: suggestedActionCategory.ADMIN_REVIEW,
  [responsibilityClassification.NEEDS_REVIEW]: suggestedActionCategory.ADMIN_REVIEW,
})

const baseEnvelope = ({ bundle, classification, confidence = 0.97, severity = responsibilitySeverity.LOW,
  analysisId = `analysis-${bundle.caseId}` }) => {
  const evidenceIds = firstEvidenceIds(bundle)
  return {
    analysisId,
    contractVersion: AI_RESPONSIBILITY_CONTRACT_VERSION,
    provider: 'deterministic-fake',
    model: 'phase5-fixture',
    output: {
      caseId: bundle.caseId,
      suggestedClassification: classification,
      confidence,
      factsSupporting: evidenceIds.length ? [{ type: 'FACT', evidenceIds, statement: 'Recorded evidence supports the suggestion.' }] : [],
      factsAgainst: [],
      contradictions: [],
      missingEvidence: [],
      inferences: evidenceIds.length ? [{ type: 'INFERENCE', evidenceIds, statement: 'The observed facts are consistent with the suggestion.' }] : [],
      severityAssessment: severity,
      suggestedActionCategory: classificationAction[classification],
      explanationSummary: 'Deterministic Phase 5 analyst fixture.',
    },
  }
}

export function createResponsibilityAnalystFake(mode = 'driver_caused') {
  let calls = 0
  return {
    provider: 'deterministic-fake',
    model: 'phase5-fixture',
    get calls() { return calls },
    async analyzeResponsibilityCase(bundle) {
      calls += 1
      if (mode === 'timeout') throw new Error('AI_TIMEOUT')
      if (mode === 'malformed') return { malformed: true }

      const classificationByMode = {
        driver_caused: responsibilityClassification.DRIVER_CAUSED,
        platform_caused: responsibilityClassification.PLATFORM_CAUSED,
        valid_waived: responsibilityClassification.VALID_WAIVED,
        external_uncertain: responsibilityClassification.EXTERNAL_OR_UNCERTAIN,
        low_confidence: responsibilityClassification.DRIVER_CAUSED,
        missing_evidence_reference: responsibilityClassification.DRIVER_CAUSED,
        invented_evidence_reference: responsibilityClassification.DRIVER_CAUSED,
        duplicate_result: responsibilityClassification.DRIVER_CAUSED,
        contradictory_analysis: responsibilityClassification.DRIVER_CAUSED,
        high_severity: responsibilityClassification.DRIVER_CAUSED,
      }
      const classification = classificationByMode[mode]
      if (!classification) throw new Error(`Unsupported analyst fake mode: ${mode}`)
      const envelope = baseEnvelope({
        bundle,
        classification,
        confidence: mode === 'low_confidence' ? 0.25 : 0.97,
        severity: mode === 'high_severity' ? responsibilitySeverity.HIGH : responsibilitySeverity.LOW,
        analysisId: mode === 'duplicate_result' ? 'analysis-duplicate' : `analysis-${bundle.caseId}`,
      })

      if (mode === 'missing_evidence_reference') envelope.output.factsSupporting[0].evidenceIds = []
      if (mode === 'invented_evidence_reference') envelope.output.factsSupporting[0].evidenceIds = ['gps_42']
      if (mode === 'contradictory_analysis') {
        envelope.output.factsAgainst = [{
          type: 'FACT',
          evidenceIds: [...envelope.output.factsSupporting[0].evidenceIds],
          statement: envelope.output.factsSupporting[0].statement,
        }]
      }
      return envelope
    },
  }
}
