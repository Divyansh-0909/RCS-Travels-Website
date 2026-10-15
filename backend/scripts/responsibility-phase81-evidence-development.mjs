import 'dotenv/config'
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import OpenAI from 'openai'
import { createEvidenceAwareSeverityAdapter, EVIDENCE_AWARE_SEVERITY_CONFIG } from '../benchmarks/responsibility/evidenceAwareSeverity.js'
import { pacedDevelopmentProvider } from '../benchmarks/responsibility/pacedDevelopment.js'
import { createLunaResponsibilityBaseline } from '../benchmarks/responsibility/lunaBaseline.js'
import { phase81DevelopmentDataset, phase81WaiverDevelopmentDataset, phase81DevelopmentHash } from '../benchmarks/responsibility/phase81Development.js'
import { phase81ConfigHash } from '../benchmarks/responsibility/phase81.js'
import { runJevResponsibilityAnalyst, benchmarkPredictionFromRun, simulateJevResponsibilityRoute } from '../benchmarks/responsibility/benchmark.js'
import { cachedInference } from '../benchmarks/common/cache.js'
import { scoreRawGatedResponsibility } from '../benchmarks/responsibility/rawGatedMetrics.js'
import { nextDevelopmentCacheIdentity, reusableLunaDevelopmentEntry } from '../benchmarks/responsibility/developmentCache.js'

if (process.argv.length > 2) throw new Error('DEVELOPMENT_ONLY_NO_ARGUMENTS')
const root = new URL('../../output/phase81/evidence-aware-development/', import.meta.url)
await mkdir(root, { recursive: true })
const write = (name, value) => writeFile(new URL(name, root), `${JSON.stringify(value, null, 2)}\n`)
const records = [...phase81DevelopmentDataset(), ...phase81WaiverDevelopmentDataset()]
const datasetHash = phase81DevelopmentHash(records)
const configHash = createHash('sha256').update(JSON.stringify({ base: phase81ConfigHash(), experiment: EVIDENCE_AWARE_SEVERITY_CONFIG })).digest('hex')
const previous = JSON.parse(await readFile(new URL('../expanded-development-1791126083366.json', root), 'utf8'))
const waiver = JSON.parse(await readFile(new URL('../waiver-development-result.json', root), 'utf8')).rows
const priorRows = [...previous, ...waiver]
const cacheFolder = new URL('../cache/responsibility/', root)
const entries = await Promise.all((await readdir(cacheFolder)).filter(name => name.endsWith('.json'))
  .map(name => readFile(new URL(name, cacheFolder), 'utf8').then(JSON.parse)))
const reusable = new Map()
for (const record of records) {
  const entry = reusableLunaDevelopmentEntry(entries, record, phase81ConfigHash(),
    [phase81DevelopmentHash(phase81DevelopmentDataset()), phase81DevelopmentHash(phase81WaiverDevelopmentDataset())])
  if (entry) reusable.set(record.id, entry)
}
const receipt = { domain: 'responsibility', split: 'DEVELOPMENT_ONLY', datasetHash, configHash, configuration: EVIDENCE_AWARE_SEVERITY_CONFIG,
  cases: records.length, successfulLunaCacheReuses: reusable.size,
  plannedJevCallsAtMost: records.length, plannedLunaCallsAtMost: 40, plannedDecisionsCalls: 0, plannedGoogleCalls: 0,
  accountDiscoveryCallsAtMost: 1, heldOutExecuted: false, productionChanged: false }
// Conservative UTF-8 byte ceiling plus output reservation; pace below the observed 100,000 TPM cap.
receipt.reservedTokensPerRequest = Math.max(...records.map(record => Buffer.byteLength(JSON.stringify({ evidence: record.modelInput.evidence })) + 2048))
receipt.lunaMinIntervalMs = Math.max(12000, Math.ceil(receipt.reservedTokensPerRequest / 50000 * 60000))
try { await write(`rows-before-resume-${Date.now()}.json`, JSON.parse(await readFile(new URL('rows.json', root), 'utf8'))) }
catch (error) { if (error.code !== 'ENOENT') throw error }
console.log(JSON.stringify(receipt)); await write('receipt.json', receipt)
const sdk = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 60000, maxRetries: 0 })
let accountDiscovery
try {
  const models = await sdk.models.list()
  accountDiscovery = { modelsList: 'PASS', decisionsNamedModels: models.data.filter(model => /decision/i.test(model.id)).map(model => model.id),
    decisionsSdkResourceExposed: 'decisions' in sdk, access: 'UNKNOWN', usableContract: 'NOT_EXPOSED', benchmarkExecuted: false }
} catch { accountDiscovery = { modelsList: 'FAIL', access: 'UNKNOWN', usableContract: 'NOT_EXPOSED', benchmarkExecuted: false } }
await write('account-discovery.json', accountDiscovery)
const jev = pacedDevelopmentProvider(createEvidenceAwareSeverityAdapter(), { requestLimit: records.length, minIntervalMs: 250, maxRetries: 0 })
const luna = pacedDevelopmentProvider(createLunaResponsibilityBaseline({ client: sdk }), { requestLimit: 40, minIntervalMs: receipt.lunaMinIntervalMs })
const cacheRoot = fileURLToPath(new URL('cache/', root)); const results = new Map()
const newCacheFolder = new URL('cache/responsibility/', root)
await mkdir(newCacheFolder, { recursive: true })
const newEntries = await Promise.all((await readdir(newCacheFolder)).filter(name => name.endsWith('.json'))
  .map(name => readFile(new URL(name, newCacheFolder), 'utf8').then(JSON.parse)))
const identity = (record, adapter, version) => ({ domain: 'responsibility', datasetHash, caseId: record.id,
  inputHash: record.evidenceHash, provider: adapter.provider, model: adapter.model, configHash: version, runNumber: 1 })
const priority = record => record.label.consequenceLevel === 'LEVEL_2' ? 0 : record.label.responsibility === 'VALID_WAIVED' ? 1
  : record.label.autoUpholdAllowed ? 2 : record.label.contradictionCritical ? 3 : record.label.requiredMissingEvidence.length ? 4 : 5
// The new priority is based only on development strata; no label enters a provider request.
for (const record of [...records].sort((a, b) => priority(a) - priority(b))) {
  const evidenceIdentity = nextDevelopmentCacheIdentity(newEntries, identity(record, jev, configHash)).identity
  const evidenceResponse = await cachedInference(cacheRoot, evidenceIdentity, () => runJevResponsibilityAnalyst(record.modelInput.evidence, { adapter: jev }))
  const evidenceRun = { ...evidenceResponse.value, cached: evidenceResponse.cached, prediction: benchmarkPredictionFromRun(evidenceResponse.value) }
  let lunaRun
  if (reusable.has(record.id)) {
    const entry = reusable.get(record.id)
    lunaRun = { ...entry.value, gate: simulateJevResponsibilityRoute({ evidence: record.modelInput.evidence, result: entry.value.normalized }),
      cacheReuse: { key: entry.key, originalDatasetHash: entry.identity.datasetHash, inputHash: entry.identity.inputHash }, cached: true }
  } else {
    // Failed historical requests are not reused as successful inference; a new attempt has its own cache namespace.
    const lunaIdentity = nextDevelopmentCacheIdentity(newEntries, identity(record, luna, phase81ConfigHash())).identity
    const response = await cachedInference(cacheRoot, lunaIdentity, () => runJevResponsibilityAnalyst(record.modelInput.evidence, { adapter: luna }))
    lunaRun = { ...response.value, cached: response.cached }
  }
  lunaRun.prediction = benchmarkPredictionFromRun(lunaRun)
  const ordinal = priorRows.find(row => row.id === record.id)?.results.jev
  const row = { id: record.id, label: record.label, runNumber: 1, results: { evidenceAware: evidenceRun, luna: lunaRun,
    ...(ordinal ? { ordinal } : {}) } }
  results.set(record.id, row)
  await write('rows.json', [...results.values()])
  console.log(JSON.stringify({ completed: results.size, total: records.length, evidenceAwareError: evidenceRun.errorCategory ?? null,
    lunaCached: lunaRun.cached, lunaError: lunaRun.error ? 'FAIL_CLOSED' : null, lunaRequests: luna.budgetState().requests }))
}
const rows = [...results.values()]
const common = rows.filter(row => row.results.ordinal && !row.results.ordinal.error && !row.results.evidenceAware.error && !row.results.luna.error)
const cohorts = key => Object.fromEntries([...new Set(records.map(record => record.label[key]))].map(value => [value,
  records.filter(record => record.label[key] === value && !results.get(record.id).results.luna.error).length]))
const summary = { ...receipt, completed: rows.length, lunaBudget: luna.budgetState(), jevBudget: jev.budgetState(),
  lunaSuccessful: rows.filter(row => !row.results.luna.error).length, lunaCohorts: { responsibility: cohorts('responsibility'), level: cohorts('consequenceLevel') },
  comparableCommonCases: common.length, commonCaseIds: common.map(row => row.id),
  common: Object.fromEntries(['ordinal', 'evidenceAware', 'luna'].map(name => [name, scoreRawGatedResponsibility(common, name)])),
  allEvidenceAware: scoreRawGatedResponsibility(rows, 'evidenceAware'), allLuna: scoreRawGatedResponsibility(rows, 'luna'),
  heldOutReady: false, severityDesignFrozen: false, meaningfulMutants: 'PENDING', humanFinalCohort: 0 }
await write('summary.json', summary)
console.log(JSON.stringify({ completed: rows.length, commonCases: common.length, lunaSuccessful: summary.lunaSuccessful, heldOutExecuted: false }))
