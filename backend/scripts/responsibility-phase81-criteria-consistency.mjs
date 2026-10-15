import 'dotenv/config'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createEvidenceCriteriaV2Adapter } from '../benchmarks/responsibility/evidenceCriteriaV2.js'
import { phase81DevelopmentDataset } from '../benchmarks/responsibility/phase81Development.js'
import { runJevResponsibilityAnalyst, benchmarkPredictionFromRun } from '../benchmarks/responsibility/benchmark.js'
import { applyDevelopmentSeverityGuard } from '../benchmarks/responsibility/developmentSeverityGate.js'
import { cachedInference } from '../benchmarks/common/cache.js'

if (process.argv.length > 2) throw new Error('DEVELOPMENT_ONLY_NO_ARGUMENTS')
const root = new URL('../../output/phase81/criteria-v2-development/', import.meta.url)
const receipt = JSON.parse(await readFile(new URL('receipt.json', root), 'utf8'))
const initial = JSON.parse(await readFile(new URL('rows.json', root), 'utf8'))
const ids = ['driver_cancellation-ordinary_driver_evidence', 'driver_cancellation-available_driver_unresponsive',
  'development-documented-conflicting-commitments-0', 'development-confirmed-deliberate-unavailability-0']
const records = phase81DevelopmentDataset().filter(r => ids.includes(r.id))
await mkdir(root, { recursive: true })
console.log(JSON.stringify({ developmentOnly: true, cases: records.length, runsPerCase: 5, plannedNewJevCallsAtMost: 16,
  plannedLunaCalls: 0, plannedGoogleCalls: 0, plannedDecisionsCalls: 0, guardUnchanged: true }))
const adapter = createEvidenceCriteriaV2Adapter(); const rows = []
for (const record of records) {
  const runs = []
  for (let runNumber = 1; runNumber <= 5; runNumber++) {
    const response = runNumber === 1 ? { value: initial.find(r => r.id === record.id).results.criteriaV2, cached: true }
      : await cachedInference(fileURLToPath(new URL('cache/', root)), { domain: 'responsibility', datasetHash: receipt.datasetHash,
        caseId: record.id, inputHash: record.evidenceHash, provider: adapter.provider, model: adapter.model,
        configHash: receipt.configHash, runNumber }, () => runJevResponsibilityAnalyst(record.modelInput.evidence, { adapter }))
    const raw = { ...response.value, prediction: benchmarkPredictionFromRun(response.value) }
    runs.push({ runNumber, raw, guarded: applyDevelopmentSeverityGuard(raw, record.modelInput.evidence), cached: response.cached })
    console.log(JSON.stringify({ caseId: record.id, runNumber, cached: response.cached, error: raw.errorCategory ?? null }))
  }
  rows.push({ caseId: record.id, runs })
  await writeFile(new URL('consistency.json', root), JSON.stringify({ status: 'DEVELOPMENT_ONLY_NOT_FROZEN', guardUnchanged: true,
    heldOutExecuted: false, rows }, null, 2))
}
