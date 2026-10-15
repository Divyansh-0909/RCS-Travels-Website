import 'dotenv/config'
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createJevResponsibilityAdapter } from '../benchmarks/responsibility/benchmark.js'
import { createLunaResponsibilityBaseline } from '../benchmarks/responsibility/lunaBaseline.js'
import { phase81Dataset, runPhase81Record, summarizePhase81, PHASE81_CONFIGURATION, phase81ConfigHash } from '../benchmarks/responsibility/phase81.js'
import { phase81DevelopmentDataset, phase81DevelopmentHash } from '../benchmarks/responsibility/phase81Development.js'
import { verifiedDevelopmentReplays, replayDevelopmentAdapter } from '../benchmarks/responsibility/replay.js'
import { analyzePhase81SeverityFailures } from '../benchmarks/responsibility/phase81Failures.js'
import { scoreRawGatedResponsibility } from '../benchmarks/responsibility/rawGatedMetrics.js'
import { guardDevelopmentProvider } from '../benchmarks/responsibility/developmentBudget.js'

if (process.argv.length > 2) throw new Error('DEVELOPMENT_ONLY_NO_ARGUMENTS')
const root = new URL('../../output/phase81/', import.meta.url)
await mkdir(root, { recursive: true })
const priorRows = JSON.parse(await readFile(new URL('development-1791118485083.json', root), 'utf8'))
const logBytes = await readFile(new URL('../ai-evaluation-preflight/responsibility-dev.log', root))
const log = logBytes.toString(logBytes[0] === 0xff && logBytes[1] === 0xfe ? 'utf16le' : 'utf8').replace(/^\uFEFF/, '')
const receipt = JSON.parse(log.split(/\r?\n/).find(line => line.startsWith('{"split"')))
const failures = analyzePhase81SeverityFailures(phase81Dataset('development'), priorRows)
await writeFile(new URL('jev-four-severity-failures.json', root), JSON.stringify(failures, null, 2))
const selected = phase81DevelopmentDataset()
const datasetHash = phase81DevelopmentHash(selected)
await writeFile(new URL('development-supplement.json', root), JSON.stringify({ status: 'DEVELOPMENT_ONLY_FROZEN_SYNTHETIC',
  datasetHash, records: selected.slice(-6), heldOutUnchanged: true }, null, 2))
const cacheFolder = new URL('cache/responsibility/', root)
const entries = await Promise.all((await readdir(cacheFolder)).filter(name => name.endsWith('.json'))
  .map(name => readFile(new URL(name, cacheFolder), 'utf8').then(JSON.parse)))
const replayEntries = verifiedDevelopmentReplays(receipt, entries, selected)
const adapters = { jev: replayDevelopmentAdapter(createJevResponsibilityAdapter({ timeout: 60_000 }), replayEntries),
  luna: replayDevelopmentAdapter(guardDevelopmentProvider(createLunaResponsibilityBaseline(), { minIntervalMs: 6500, requestLimit: 50 }), replayEntries) }
const runId = `expanded-development-${Date.now()}`
const cacheRoot = fileURLToPath(new URL('cache/', root))
const budget = { split: 'development', cases: selected.length, datasetHash, configHash: phase81ConfigHash(),
  configuration: PHASE81_CONFIGURATION, plannedJevCallsAtMost: selected.length - replayEntries.filter(e => e.identity.provider === adapters.jev.provider).length,
  plannedLunaCallsAtMost: selected.length - replayEntries.filter(e => e.identity.provider === adapters.luna.provider).length,
  plannedDecisionsCalls: 0, plannedGoogleCalls: 0, validatedReplays: replayEntries.length, finalHeldOutExecuted: false }
await writeFile(new URL(`${runId}-receipt.json`, root), JSON.stringify(budget, null, 2))
console.log(JSON.stringify(budget))
const rows = []
for (const record of selected) {
  rows.push(await runPhase81Record(record, { cacheRoot, adapters, datasetHash }))
  await writeFile(new URL(`${runId}.json`, root), JSON.stringify(rows, null, 2))
  console.log(JSON.stringify({ completed: rows.length, total: selected.length, errors: Object.fromEntries(
    Object.entries(rows.at(-1).results).map(([name, result]) => [name, result.errorCategory ?? null])) }))
}
const summary = { ...budget, evaluated: rows.length }
for (const name of Object.keys(adapters)) {
  const live = rows.filter(row => !row.results[name].cached && !row.results[name].raw?.replay)
  summary[name] = { scores: summarizePhase81(rows, name).scores, rawVsGated: scoreRawGatedResponsibility(rows, name),
    liveOperations: summarizePhase81(live, name).operations,
    liveRequests: live.filter(row => !row.results[name].error?.startsWith('RESPONSIBILITY_PROVIDER_PAUSED')).length,
    providerBudgetState: adapters[name].budgetState?.() ?? null,
    historicalReplays: rows.filter(row => row.results[name].raw?.replay).length,
    cacheHits: rows.filter(row => row.results[name].cached).length, errors: rows.filter(row => row.results[name].error).length,
    cost: 'UNAVAILABLE_WITHOUT_AUTHORITATIVE_VERSIONED_PRICING', consistency: 'NOT_MEASURED_SINGLE_RUN' }
}
await writeFile(new URL(`${runId}-summary.json`, root), JSON.stringify(summary, null, 2))
console.log(JSON.stringify({ summaryFile: `${runId}-summary.json`, cases: rows.length }))
