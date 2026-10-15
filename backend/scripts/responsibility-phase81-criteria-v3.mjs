import 'dotenv/config'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { createEvidenceCriteriaV3Adapter, EVIDENCE_CRITERIA_V3_CONFIG } from '../benchmarks/responsibility/evidenceCriteriaV3.js'
import { phase81DevelopmentDataset, phase81WaiverDevelopmentDataset, phase81DevelopmentHash } from '../benchmarks/responsibility/phase81Development.js'
import { runJevResponsibilityAnalyst, benchmarkPredictionFromRun } from '../benchmarks/responsibility/benchmark.js'
import { applyDevelopmentSeverityGuard } from '../benchmarks/responsibility/developmentSeverityGate.js'
import { cachedInference } from '../benchmarks/common/cache.js'
import { scoreRawGatedResponsibility } from '../benchmarks/responsibility/rawGatedMetrics.js'
if (process.argv.length > 2) throw new Error('DEVELOPMENT_ONLY_NO_ARGUMENTS')
const records = [...phase81DevelopmentDataset(), ...phase81WaiverDevelopmentDataset()]
const prior = JSON.parse(await readFile(new URL('../../output/phase81/criteria-v2-expanded-development/rows.json', import.meta.url)))
const root = new URL('../../output/phase81/criteria-v3-development/', import.meta.url)
await mkdir(root, { recursive: true })
const datasetHash = phase81DevelopmentHash(records)
const priorReceipt = JSON.parse(await readFile(new URL('../../output/phase81/criteria-v2-expanded-development/receipt.json', import.meta.url)))
if (priorReceipt.datasetHash !== datasetHash || prior.length !== records.length) throw new Error('DEVELOPMENT_INPUT_LINEAGE_CHANGED')
const configHash = createHash('sha256').update(JSON.stringify(EVIDENCE_CRITERIA_V3_CONFIG)).digest('hex')
const consistency = [...new Map([
  records.find(r => r.id === 'driver_cancellation-ordinary_driver_evidence'),
  records.find(r => r.id === 'driver_cancellation-available_driver_unresponsive'),
  records.find(r => r.id.includes('confirmed-deliberate-unavailability')),
  records.find(r => r.id.includes('documented-conflicting-commitments')),
  records.find(r => r.label.responsibility === 'PLATFORM_CAUSED'),
  records.find(r => r.label.responsibility === 'EXTERNAL_OR_UNCERTAIN'),
  records.find(r => r.label.responsibility === 'VALID_WAIVED'),
  records.find(r => r.label.requiredMissingEvidence.length),
  records.find(r => r.label.contradictionCritical),
  records.find(r => r.label.autoWaiveAllowed),
  records.find(r => r.id === 'failed_pickup-rider_cancel_after_platform_delay'),
  records.find(r => r.id.includes('acknowledged-dispatch-refusal')),
].filter(Boolean).map(r => [r.id, r])).values()]
const receipt = { status: 'DEVELOPMENT_ONLY_NOT_FROZEN', datasetHash, configHash, config: EVIDENCE_CRITERIA_V3_CONFIG,
  plannedJevCallsAtMost: records.length + consistency.length * 4, plannedLunaCalls: 0, plannedGoogleCalls: 0,
  plannedDecisionsCalls: 0, guardChanged: false, heldOutExecuted: false, consistencyCases: consistency.map(r => r.id) }
console.log(JSON.stringify(receipt)); await writeFile(new URL('receipt.json', root), JSON.stringify(receipt, null, 2))
const adapter = createEvidenceCriteriaV3Adapter(); const rows = []; const repeats = []
async function infer(record, runNumber) {
  return cachedInference(fileURLToPath(new URL('cache/', root)), { domain: 'responsibility', datasetHash,
    caseId: record.id, inputHash: record.evidenceHash, provider: adapter.provider, model: adapter.model, configHash, runNumber },
  () => runJevResponsibilityAnalyst(record.modelInput.evidence, { adapter }))
}
for (const record of records) {
  const previous = prior.find(r => r.id === record.id)
  if (!previous || JSON.stringify(previous.label) !== JSON.stringify(record.label)) throw new Error('DEVELOPMENT_COHORT_CHANGED')
  const response = await infer(record, 1)
  const raw = { ...response.value, prediction: benchmarkPredictionFromRun(response.value) }
  rows.push({ id: record.id, label: record.label, results: { criteriaV3: raw,
    guardedCriteriaV3: applyDevelopmentSeverityGuard(raw, record.modelInput.evidence),
    guardedCriteriaV2: previous.results.guardedCriteriaV2, luna: previous.results.luna } })
  await writeFile(new URL('rows.json', root), JSON.stringify(rows, null, 2))
  console.log(JSON.stringify({ completed: rows.length, cached: response.cached, failure: raw.errorCategory ?? null }))
}
const common = rows.filter(r => r.results.luna && !r.results.luna.error && !r.results.criteriaV3.error)
await writeFile(new URL('summary.json', root), JSON.stringify({ ...receipt, cases: rows.length,
  comparison: Object.fromEntries(['guardedCriteriaV2','guardedCriteriaV3'].map(n => [n,scoreRawGatedResponsibility(rows,n)])),
  commonCases: common.length, common: Object.fromEntries(['guardedCriteriaV3','luna'].map(n => [n,scoreRawGatedResponsibility(common,n)])) }, null, 2))
for (const record of consistency) for (let runNumber = 1; runNumber <= 5; runNumber++) {
  const response = await infer(record, runNumber)
  repeats.push({ id: record.id, runNumber, result: applyDevelopmentSeverityGuard(response.value, record.modelInput.evidence) })
  await writeFile(new URL('consistency.json', root), JSON.stringify(repeats, null, 2))
}
