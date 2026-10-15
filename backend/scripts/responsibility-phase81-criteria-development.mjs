import 'dotenv/config'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createEvidenceCriteriaV2Adapter, EVIDENCE_CRITERIA_V2_CONFIG } from '../benchmarks/responsibility/evidenceCriteriaV2.js'
import { phase81DevelopmentDataset, phase81WaiverDevelopmentDataset, phase81DevelopmentHash } from '../benchmarks/responsibility/phase81Development.js'
import { runJevResponsibilityAnalyst, benchmarkPredictionFromRun } from '../benchmarks/responsibility/benchmark.js'
import { applyDevelopmentSeverityGuard } from '../benchmarks/responsibility/developmentSeverityGate.js'
import { cachedInference } from '../benchmarks/common/cache.js'
import { scoreRawGatedResponsibility } from '../benchmarks/responsibility/rawGatedMetrics.js'

if (process.argv.length > 2) throw new Error('DEVELOPMENT_ONLY_NO_ARGUMENTS')
const records = [...phase81DevelopmentDataset(), ...phase81WaiverDevelopmentDataset()]
const priorRoot = new URL('../../output/phase81/criteria-v2-development/', import.meta.url)
const priorReceipt = JSON.parse(await readFile(new URL('receipt.json', priorRoot), 'utf8'))
const previous = JSON.parse(await readFile(new URL('rows.json', priorRoot), 'utf8'))
const oldComparison = JSON.parse(await readFile(new URL('../../output/phase81/evidence-aware-development/rows.json', import.meta.url), 'utf8'))
const configHash = createHash('sha256').update(JSON.stringify(EVIDENCE_CRITERIA_V2_CONFIG)).digest('hex')
const probeRecords = records.filter(r => previous.some(p => p.id === r.id))
if (configHash !== priorReceipt.configHash || phase81DevelopmentHash(probeRecords) !== priorReceipt.datasetHash
  || previous.length !== probeRecords.length) throw new Error('DEVELOPMENT_PROBE_LINEAGE_CHANGED')
const root = new URL('../../output/phase81/criteria-v2-expanded-development/', import.meta.url)
await mkdir(root, { recursive: true })
const datasetHash = phase81DevelopmentHash(records)
const receipt = { status: 'DEVELOPMENT_ONLY_NOT_FROZEN', datasetHash, configHash, priorProbeDatasetHash: priorReceipt.datasetHash,
  unchangedProbeInputsVerified: true, plannedNewJevCallsAtMost: records.length - previous.length,
  plannedLunaCalls: 0, plannedGoogleCalls: 0, plannedDecisionsCalls: 0, guardUnchanged: true, heldOutExecuted: false }
console.log(JSON.stringify(receipt)); await writeFile(new URL('receipt.json', root), JSON.stringify(receipt, null, 2))
const adapter = createEvidenceCriteriaV2Adapter(); const rows = []
for (const record of records) {
  const prior = previous.find(r => r.id === record.id)
  const response = prior ? { value: prior.results.criteriaV2, cached: true } : await cachedInference(fileURLToPath(new URL('cache/', root)),
    { domain: 'responsibility', datasetHash, caseId: record.id, inputHash: record.evidenceHash,
      provider: adapter.provider, model: adapter.model, configHash, runNumber: 1 },
    () => runJevResponsibilityAnalyst(record.modelInput.evidence, { adapter }))
  const raw = { ...response.value, prediction: benchmarkPredictionFromRun(response.value) }
  const original = oldComparison.find(r => r.id === record.id)
  rows.push({ id: record.id, label: record.label, results: { criteriaV2: raw,
    guardedCriteriaV2: applyDevelopmentSeverityGuard(raw, record.modelInput.evidence),
    evidenceAware: applyDevelopmentSeverityGuard(original.results.evidenceAware, record.modelInput.evidence),
    luna: original.results.luna && applyDevelopmentSeverityGuard(original.results.luna, record.modelInput.evidence) },
    reuse: prior ? 'VERIFIED_IDENTICAL_PROBE_INPUT_CONFIG' : response.cached ? 'EXACT_CACHE_IDENTITY' : 'NEW_DEVELOPMENT_REQUEST' })
  await writeFile(new URL('rows.json', root), JSON.stringify(rows, null, 2))
  console.log(JSON.stringify({ completed: rows.length, total: records.length, cached: response.cached, error: raw.errorCategory ?? null }))
}
const common = rows.filter(r => ['criteriaV2', 'evidenceAware', 'luna'].every(n => r.results[n] && !r.results[n].error))
await writeFile(new URL('summary.json', root), JSON.stringify({ ...receipt, cases: rows.length, commonCases: common.length,
  commonCaseIds: common.map(r => r.id), commonMetrics: Object.fromEntries(['guardedCriteriaV2', 'evidenceAware', 'luna']
    .map(n => [n, scoreRawGatedResponsibility(common, n)])),
  developmentRevisionMetrics: Object.fromEntries(['criteriaV2', 'guardedCriteriaV2'].map(n => [n, scoreRawGatedResponsibility(rows, n)])) }, null, 2))
