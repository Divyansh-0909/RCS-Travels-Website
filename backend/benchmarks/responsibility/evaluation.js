import { responsibilityBenchmarkCohort, responsibilityGroundTruthSource } from './contracts.js'
import {
  aggregateBenchmarkConsistency,
  aggregateBenchmarkOperationalStats,
  benchmarkRepeatDetails,
  classifyBenchmarkDisagreements,
  scoreProbabilityCalibration,
  scoreResponsibilityBenchmark,
} from './metrics.js'

const firstRuns = records => records.filter(record => record.runNumber === 1)

const metricRows = (records, system) => firstRuns(records).map(record => ({
  id: record.id,
  cohort: record.cohort,
  label: record.label,
  prediction: system === 'existing' ? record.existingPrediction : record.jevPrediction,
}))

const usageTotal = usage => usage?.totalTokens ?? (
  Number.isFinite(usage?.inputTokens) && Number.isFinite(usage?.outputTokens)
    ? usage.inputTokens + usage.outputTokens : null
)

const operationalRows = (records, system) => records.map(record => {
  const run = record[system]
  const usage = run?.raw?.usage ?? null
  return {
    latencyMs: run?.error ? null : run?.latencyMs ?? null,
    inputTokens: usage?.inputTokens ?? null,
    outputTokens: usage?.outputTokens ?? null,
    totalTokens: usageTotal(usage),
    requestCount: usage?.requestCount ?? (run ? 1 : null),
    error: run?.error ?? null,
  }
})

const consistencyRows = (records, system) => records.map(record => ({
  id: record.id,
  consistencyKey: record.id,
  prediction: system === 'existing' ? record.existingPrediction : record.jevPrediction,
  severityScore: record[system]?.raw?.answers?.severity?.score,
}))

const failureStats = (records, system) => {
  const rows = records.map(record => record[system])
  const errors = rows.filter(run => run?.error).length
  return { requests: rows.length, errors, errorRate: rows.length ? errors / rows.length : 0 }
}

const groundingDiagnostics = (counts, run, failed) => {
  const invalid = failed.find(item => item.code === 'ANALYSIS_VALIDATION')
  if (!invalid) return
  counts.invalidAnalyses += 1
  if (!run.error && invalid.detail.includes('ANALYSIS_SCHEMA_INVALID')) counts.structuredOutputFailures += 1
  if (invalid.detail.includes('INVENTED_EVIDENCE_REFERENCE')) counts.inventedEvidenceReferences += 1
  if (invalid.detail.includes('SELF_CONTRADICTORY_FACTS')) counts.selfContradictoryFacts += 1
}

const outputDiagnostics = (records, system) => {
  const counts = { providerErrors: 0, timeouts: 0, structuredOutputFailures: 0, invalidAnalyses: 0,
    inventedEvidenceReferences: 0, selfContradictoryFacts: 0, reportedMissingEvidenceCases: 0, manualReviewRoutes: 0,
    retryCount: null, unsupportedFactualClaims: 'NOT_SEMANTICALLY_VERIFIED' }
  for (const record of records) {
    const run = record[system]
    if (run?.error) {
      if (run.errorCategory === 'TIMEOUT' || /timeout|timed out|ETIMEDOUT/i.test(run.error)) counts.timeouts += 1
      else if (run.errorCategory === 'SCHEMA' || /JEV_(?:ANSWER|CLASSIFICATION)_INVALID|structured output|schema|parse|Zod/i.test(run.error)) counts.structuredOutputFailures += 1
      else counts.providerErrors += 1
    }
    const failed = run?.gate?.failedGates ?? []
    groundingDiagnostics(counts, run, failed)
    if (failed.some(item => item.code === 'AI_REPORTED_MISSING_EVIDENCE')) counts.reportedMissingEvidenceCases += 1
    if (record[`${system}Prediction`]?.needsReview) counts.manualReviewRoutes += 1
  }
  return counts
}

const cohortScores = (rows) => Object.fromEntries(Object.values(responsibilityBenchmarkCohort).map(cohort => [
  cohort,
  scoreResponsibilityBenchmark(rows.filter(row => row.cohort === cohort)),
]))

export function evaluateResponsibilityBenchmark(records) {
  const primary = firstRuns(records)
  const existingRows = metricRows(records, 'existing')
  const jevRows = metricRows(records, 'jev')
  const jevCalibrationRows = primary.map(record => ({
    label: record.label,
    predictedResponsibility: record.jevPrediction?.responsibility,
    probabilities: record.jevPrediction?.probabilities,
  }))
  return {
    cases: primary.length,
    labeledCases: primary.filter(record => record.label?.source !== responsibilityGroundTruthSource.UNLABELED && record.label).length,
    unlabeledCases: primary.filter(record => !record.label || record.label.source === responsibilityGroundTruthSource.UNLABELED).length,
    existing: {
      scores: scoreResponsibilityBenchmark(existingRows),
      cohortScores: cohortScores(existingRows),
      operations: aggregateBenchmarkOperationalStats(operationalRows(records, 'existing')),
      consistency: aggregateBenchmarkConsistency(consistencyRows(records, 'existing')),
      repeatDetails: benchmarkRepeatDetails(consistencyRows(records, 'existing')),
      failures: failureStats(records, 'existing'),
      outputDiagnostics: outputDiagnostics(records, 'existing'),
      cost: 'NOT_AUTHORITATIVELY_AVAILABLE',
    },
    jev: {
      scores: scoreResponsibilityBenchmark(jevRows),
      cohortScores: cohortScores(jevRows),
      operations: aggregateBenchmarkOperationalStats(operationalRows(records, 'jev')),
      consistency: aggregateBenchmarkConsistency(consistencyRows(records, 'jev')),
      repeatDetails: benchmarkRepeatDetails(consistencyRows(records, 'jev')),
      calibration: scoreProbabilityCalibration(jevCalibrationRows),
      failures: failureStats(records, 'jev'),
      outputDiagnostics: outputDiagnostics(records, 'jev'),
      cost: 'NOT_AUTHORITATIVELY_AVAILABLE',
    },
    disagreements: classifyBenchmarkDisagreements(primary),
  }
}
