import { responsibilityBenchmarkDatasetV2Hash } from './datasetV2.js'
import { isDeepStrictEqual } from 'node:util'

export function analyzePhase81SeverityFailures(development, runs) {
  const byId = new Map(development.map(record => [record.id, record]))
  return runs.filter(run => run.label.consequenceLevel === 'LEVEL_1' && run.results.jev.prediction.consequenceLevel === 'LEVEL_2').map(run => {
    const record = byId.get(run.id)
    if (!record) throw new Error('DEVELOPMENT_RECORD_NOT_FOUND')
    if (!isDeepStrictEqual(run.label, record.label)) throw new Error('DEVELOPMENT_LABEL_MISMATCH')
    const result = run.results.jev
    return { caseId: run.id, caseType: record.evidence.caseType, evidenceHash: record.evidenceHash,
      groundTruth: { responsibility: run.label.responsibility, severity: run.label.consequenceLevel, source: run.label.source },
      jevResponsibility: result.normalized.classification, jevSeverity: result.normalized.severity,
      score: result.raw.answers.severity.score, severityConfidence: result.raw.answers.severity.confidence,
      severityProbabilities: result.raw.answers.severity.probabilities,
      documentedMapping: 'SDK ordered rubric index 0=LOW, 1=MODERATE, 2=HIGH; existing midpoint cutoffs 0.5 / 1.5',
      evidenceSupplied: record.evidence.timeline.map(item => ({ id: item.id, category: item.category, kind: item.kind, value: item.value })),
      preventingEvidence: 'Only ordinary avoidable driver_action is affirmative. No repeated refusal, deliberate unavailability, conflicting commitment or abandonment is recorded. Baseline present:true does not prove an aggravating circumstance.',
      failureClassification: { questionWording: 'UNDER_SPECIFIED_SEVERITY', criteria: 'NAMES_ONLY_NO_FROZEN_LEVEL_2_CRITERIA',
        severityMapping: 'MATHEMATICALLY_CORRECT_BUT_UNCALIBRATED', evidenceContext: 'SYNTHETIC_PLACEHOLDERS_NO_SEVERE_FACTS',
        adapterMapping: 'NO_OBSERVED_BUG', crossQuestionGate: 'PROTECTED_BY_SEVERITY_ALLOWLIST',
        modelJudgment: 'RAW_FALSE_LEVEL_2; CAUSAL_ATTRIBUTION_NOT_ISOLATED' },
      downstream: { route: result.gate.route, failedGates: result.gate.failedGates,
        level2Automated: result.gate.route === 'PROVISIONAL_AUTO_UPHELD' },
      matchedDevelopmentDatasetHash: responsibilityBenchmarkDatasetV2Hash(development) }
  })
}
