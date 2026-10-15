import 'dotenv/config'
import { mkdir, writeFile } from 'node:fs/promises'
import { createJevResponsibilityAdapter } from '../benchmarks/responsibility/benchmark.js'
import { createLunaResponsibilityBaseline } from '../benchmarks/responsibility/lunaBaseline.js'
import { phase81Dataset, runPhase81Record, summarizePhase81, PHASE81_CONFIGURATION, phase81ConfigHash } from '../benchmarks/responsibility/phase81.js'

const split = process.argv.includes('--held-out') ? 'heldOut' : 'development'
const limitArgument = process.argv.find(argument => argument.startsWith('--limit='))
const limit = limitArgument ? Number(limitArgument.split('=')[1]) : Infinity
if (!(limit > 0)) throw new Error('INVALID_LIMIT')
const selected = phase81Dataset(split).slice(0, limit)
const runId = `${split}-${Date.now()}`
const root = new URL('../../output/phase81/', import.meta.url)
await mkdir(root, { recursive: true })
const cacheRoot = new URL('./cache/', root).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const adapters = { jev: createJevResponsibilityAdapter({ timeout: 60_000 }), luna: createLunaResponsibilityBaseline() }
console.log(JSON.stringify({ split, cases: selected.length, plannedJevCalls: selected.length, plannedLunaCalls: selected.length,
  decisionsCalls: 0, configHash: phase81ConfigHash(), configuration: PHASE81_CONFIGURATION }))
const rows = []
for (const record of selected) {
  rows.push(await runPhase81Record(record, { cacheRoot, adapters }))
  await writeFile(new URL(`./${runId}.json`, root), JSON.stringify(rows, null, 2))
  console.log(JSON.stringify({ completed: rows.length, cases: selected.length, errors: Object.fromEntries(Object.entries(rows.at(-1).results).map(([name, result]) => [name, Boolean(result.error)])) }))
}
const summary = { split, configHash: phase81ConfigHash(), cases: rows.length,
  jev: summarizePhase81(rows, 'jev'), luna: summarizePhase81(rows, 'luna') }
await writeFile(new URL(`./${runId}-summary.json`, root), JSON.stringify(summary, null, 2))
console.log(JSON.stringify({ summaryFile: `${runId}-summary.json`, cases: rows.length }))
