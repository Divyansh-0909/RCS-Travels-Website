import 'dotenv/config'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createEvidenceCriteriaV2Adapter, EVIDENCE_CRITERIA_V2_CONFIG } from '../benchmarks/responsibility/evidenceCriteriaV2.js'
import { phase81DevelopmentDataset, phase81WaiverDevelopmentDataset, phase81DevelopmentHash } from '../benchmarks/responsibility/phase81Development.js'
import { runJevResponsibilityAnalyst, benchmarkPredictionFromRun } from '../benchmarks/responsibility/benchmark.js'
import { applyDevelopmentSeverityGuard } from '../benchmarks/responsibility/developmentSeverityGate.js'
import { cachedInference } from '../benchmarks/common/cache.js'

if (process.argv.length > 2) throw new Error('DEVELOPMENT_PROBE_NO_ARGUMENTS')
const all = [...phase81DevelopmentDataset(), ...phase81WaiverDevelopmentDataset()]
const records = all.filter(r => r.label.autoUpholdAllowed || r.id.startsWith('development-') || r.label.responsibility === 'VALID_WAIVED')
const previous = JSON.parse(await readFile(new URL('../../output/phase81/evidence-aware-development/rows.json', import.meta.url), 'utf8'))
const root = new URL('../../output/phase81/criteria-v2-development/', import.meta.url); await mkdir(root, { recursive: true })
const datasetHash = phase81DevelopmentHash(records)
const configHash = createHash('sha256').update(JSON.stringify(EVIDENCE_CRITERIA_V2_CONFIG)).digest('hex')
const receipt = { ...EVIDENCE_CRITERIA_V2_CONFIG, datasetHash, configHash, cases: records.length,
  plannedJevCallsAtMost: records.length, plannedLunaCalls: 0, plannedGoogleCalls: 0, plannedDecisionsCalls: 0,
  originalGuardPreserved: true, heldOutExecuted: false }
console.log(JSON.stringify(receipt)); await writeFile(new URL('receipt.json', root), JSON.stringify(receipt, null, 2))
const adapter = createEvidenceCriteriaV2Adapter(); const rows = []
for (const record of records) {
  const response = await cachedInference(fileURLToPath(new URL('cache/', root)), { domain: 'responsibility', datasetHash,
    caseId: record.id, inputHash: record.evidenceHash, provider: adapter.provider, model: adapter.model, configHash, runNumber: 1 },
  () => runJevResponsibilityAnalyst(record.modelInput.evidence, { adapter }))
  const raw = { ...response.value, prediction: benchmarkPredictionFromRun(response.value) }
  const guarded = applyDevelopmentSeverityGuard(raw, record.modelInput.evidence)
  rows.push({ id: record.id, label: record.label, results: { criteriaV2: raw, guardedCriteriaV2: guarded,
    ...previous.find(r => r.id === record.id).results }, cached: response.cached })
  await writeFile(new URL('rows.json', root), `${JSON.stringify(rows, null, 2)}\n`)
  console.log(JSON.stringify({ completed: rows.length, total: records.length, error: raw.errorCategory ?? null }))
}
