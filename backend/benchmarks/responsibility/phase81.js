import { createHash } from 'node:crypto'
import { JEV_BENCHMARK_CONFIGURATION, createJevResponsibilityAdapter, runJevResponsibilityAnalyst, benchmarkPredictionFromRun } from './benchmark.js'
import { createLunaResponsibilityBaseline, RESPONSIBILITY_LUNA_CONFIG } from './lunaBaseline.js'
import { RESPONSIBILITY_BENCHMARK_DATASET_V2_FROZEN_HASH, buildFrozenResponsibilityBenchmarkDatasetV2,
  responsibilityBenchmarkDatasetV2Hash, splitResponsibilityBenchmarkV2 } from './datasetV2.js'
import { scoreResponsibilityBenchmark, aggregateBenchmarkOperationalStats, benchmarkRepeatDetails } from './metrics.js'
import { cachedInference } from '../common/cache.js'
import { DEFAULT_RESPONSIBILITY_POLICY } from '../../services/responsibilityPolicyGate.js'

export const PHASE81_CONFIGURATION = Object.freeze({
  version: 'responsibility-phase8.1-v2', jev: JEV_BENCHMARK_CONFIGURATION, luna: RESPONSIBILITY_LUNA_CONFIG,
  policyVersion: DEFAULT_RESPONSIBILITY_POLICY.policyVersion,
  policyHash: createHash('sha256').update(JSON.stringify(DEFAULT_RESPONSIBILITY_POLICY)).digest('hex'),
  timeoutsMs: 60_000, retries: 0, simulatedPolicyOnly: true,
  acceptance: { unsafeAutoUpholds: 0, falseLevel2: 0, missingEvidenceUnsafeAutomation: 0, contradictionUnsafeAutomation: 0,
    humanFinalCalibrationRequiredForAutoAdjudication: true },
})
export const phase81ConfigHash = () => createHash('sha256').update(JSON.stringify(PHASE81_CONFIGURATION)).digest('hex')

export function validatePhase81Identity(records) {
  if (responsibilityBenchmarkDatasetV2Hash(records) !== RESPONSIBILITY_BENCHMARK_DATASET_V2_FROZEN_HASH) throw new Error('V2_FROZEN_HASH_MISMATCH')
}
export function requirePhase81Adequacy(grouped) {
  if (!grouped.adequate) throw new Error('V2_HELD_OUT_INADEQUATE')
}
export function phase81Dataset(split) {
  if (!['development', 'heldOut'].includes(split)) throw new Error('BENCHMARK_SPLIT_INVALID')
  const records = buildFrozenResponsibilityBenchmarkDatasetV2()
  validatePhase81Identity(records)
  const grouped = splitResponsibilityBenchmarkV2(records)
  requirePhase81Adequacy(grouped)
  return grouped[split]
}

export async function runPhase81Record(record, { cacheRoot, runNumber = 1, adapters, datasetHash = RESPONSIBILITY_BENCHMARK_DATASET_V2_FROZEN_HASH } = {}) {
  const providers = adapters ?? { jev: createJevResponsibilityAdapter({ timeout: 60_000 }), luna: createLunaResponsibilityBaseline() }
  const results = {}
  for (const [name, adapter] of Object.entries(providers)) {
    const identity = { domain: 'responsibility', datasetHash,
      caseId: record.id, inputHash: record.evidenceHash, provider: adapter.provider, model: adapter.model, configHash: phase81ConfigHash(), runNumber }
    const response = await cachedInference(cacheRoot, identity, () => runJevResponsibilityAnalyst(record.modelInput.evidence, { adapter }))
    results[name] = { ...response.value, cached: response.cached, prediction: benchmarkPredictionFromRun(response.value) }
  }
  return { id: record.id, cohort: record.cohort, family: record.scenarioFamily, label: record.label, runNumber, results }
}

export function summarizePhase81(records, name) {
  const rows = records.filter(record => record.runNumber === 1).map(record => ({ ...record, prediction: record.results[name].prediction }))
  const operations = records.map(record => ({ ...record.results[name], ...record.results[name].raw?.usage }))
  const repeats = records.map(record => ({ id: record.id, prediction: record.results[name].prediction,
    severityScore: record.results[name].raw?.answers?.severity?.score }))
  const errors = records.filter(record => record.results[name].error).length
  return { scores: scoreResponsibilityBenchmark(rows), operations: aggregateBenchmarkOperationalStats(operations),
    consistency: benchmarkRepeatDetails(repeats), errors, errorRate: records.length ? errors / records.length : null,
    cached: records.filter(record => record.results[name].cached).length, cost: 'NOT_COMPUTED_WITHOUT_VERSIONED_PRICING_INPUT' }
}
