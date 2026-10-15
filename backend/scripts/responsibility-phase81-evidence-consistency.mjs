import 'dotenv/config'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { phase81DevelopmentDataset, phase81WaiverDevelopmentDataset } from '../benchmarks/responsibility/phase81Development.js'
import { createEvidenceAwareSeverityAdapter } from '../benchmarks/responsibility/evidenceAwareSeverity.js'
import { pacedDevelopmentProvider } from '../benchmarks/responsibility/pacedDevelopment.js'
import { applyDevelopmentSeverityGuard } from '../benchmarks/responsibility/developmentSeverityGate.js'
import { runJevResponsibilityAnalyst, benchmarkPredictionFromRun } from '../benchmarks/responsibility/benchmark.js'
import { benchmarkRepeatDetails, aggregateBenchmarkOperationalStats } from '../benchmarks/responsibility/metrics.js'
import { cachedInference } from '../benchmarks/common/cache.js'

if (process.argv.length > 2) throw new Error('DEVELOPMENT_ONLY_NO_ARGUMENTS')
const root = new URL('../../output/phase81/evidence-aware-development/', import.meta.url)
const receipt = JSON.parse(await readFile(new URL('receipt.json', root), 'utf8'))
const initial = JSON.parse(await readFile(new URL('rows.json', root), 'utf8'))
const failures = JSON.parse(await readFile(new URL('../jev-four-severity-failures.json', root), 'utf8'))
const ids = [...failures.map(row => row.caseId), 'development-documented-conflicting-commitments-0',
  'development-confirmed-deliberate-unavailability-0', 'development-authenticated-rider-release-reviewed-0']
const records = [...phase81DevelopmentDataset(), ...phase81WaiverDevelopmentDataset()].filter(row => ids.includes(row.id))
if (records.length !== 7) throw new Error('CONSISTENCY_DEVELOPMENT_COHORT_MISMATCH')
const budget = { split: 'DEVELOPMENT_ONLY', cases: 7, runsPerCase: 5, priorResponsesReused: 7,
  plannedJevCallsAtMost: 28, plannedLunaCalls: 0, plannedDecisionsCalls: 0, plannedGoogleCalls: 0,
  datasetHash: receipt.datasetHash, configHash: receipt.configHash, heldOutExecuted: false }
console.log(JSON.stringify(budget))
await mkdir(root, { recursive: true })
const rows = []
const provider = pacedDevelopmentProvider(createEvidenceAwareSeverityAdapter(), { requestLimit: 28, minIntervalMs: 250, maxRetries: 0 })
for (const record of records) {
  for (let runNumber = 1; runNumber <= 5; runNumber++) {
    const identity = { domain: 'responsibility', datasetHash: receipt.datasetHash, caseId: record.id, inputHash: record.evidenceHash,
      provider: provider.provider, model: provider.model, configHash: receipt.configHash, runNumber }
    const response = runNumber === 1 ? { cached: true, value: initial.find(row => row.id === record.id).results.evidenceAware }
      : await cachedInference(fileURLToPath(new URL('cache/', root)), identity, () => runJevResponsibilityAnalyst(record.modelInput.evidence, { adapter: provider }))
    const raw = response.value
    const guarded = applyDevelopmentSeverityGuard(raw, record.modelInput.evidence)
    rows.push({ id: record.id, runNumber, raw, cached: response.cached, prediction: benchmarkPredictionFromRun(guarded),
      unguardedPrediction: benchmarkPredictionFromRun(raw), rawSeverity: raw.raw?.rawSeverity ?? null })
    await writeFile(new URL('consistency-rows.json', root), `${JSON.stringify(rows, null, 2)}\n`)
  }
}
const summary = { ...budget, actualBudget: provider.budgetState(), errors: rows.filter(row => row.raw.error).length,
  unguarded: benchmarkRepeatDetails(rows.map(row => ({ ...row, prediction: row.unguardedPrediction }))),
  guarded: benchmarkRepeatDetails(rows), operations: aggregateBenchmarkOperationalStats(rows.filter(row => !row.cached)
    .map(row => ({ ...row.raw, ...row.raw.raw?.usage }))), modelVersions: [...new Set(rows.map(row => row.raw.raw?.model))],
  severityDesignFrozen: false, reviewBand: 'NOT_CALIBRATED_NO_ARBITRARY_ORDINAL_THRESHOLD_ADDED' }
await writeFile(new URL('consistency-summary.json', root), `${JSON.stringify(summary, null, 2)}\n`)
console.log(JSON.stringify({ calls: provider.budgetState().requests, errors: summary.errors, consistency: summary.guarded }))
