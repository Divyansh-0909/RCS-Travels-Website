import { readFile, writeFile } from 'node:fs/promises'
import { scoreRawGatedResponsibility } from '../benchmarks/responsibility/rawGatedMetrics.js'
import { summarizePhase81 } from '../benchmarks/responsibility/phase81.js'
import { developmentProviderFailure } from '../benchmarks/responsibility/developmentBudget.js'
const root = new URL('../../output/phase81/', import.meta.url)
const id = 'expanded-development-1791126083366'
const receipt = JSON.parse(await readFile(new URL(`${id}-receipt.json`, root), 'utf8'))
if (receipt.split !== 'development' || receipt.finalHeldOutExecuted !== false) throw new Error('DEVELOPMENT_ONLY')
const rows = JSON.parse(await readFile(new URL(`${id}.json`, root), 'utf8'))
const report = { version: 'development-review-v2-provider-failures-separated', receipt, evaluated: rows.length,
  humanFinalCohort: 0, finalHeldOutExecuted: false, comparableWholeCohort: false, candidates: {} }
for (const name of ['jev', 'luna']) {
  const successful = rows.filter(row => !row.results[name].error && row.results[name].normalized)
  const liveSuccess = successful.filter(row => !row.results[name].cached && !row.results[name].raw?.replay)
  const failures = rows.filter(row => row.results[name].error)
  const errorCategories = failures.reduce((counts, row) => {
    const category = developmentProviderFailure({ message: row.results[name].error })
    counts[category] = (counts[category] ?? 0) + 1; return counts
  }, {})
  report.candidates[name] = { attemptedCases: rows.length, successfulCases: successful.length, failures: failures.length, errorCategories,
    rawVsGated: scoreRawGatedResponsibility(rows, name), classificationSuccessfulOnly: summarizePhase81(successful, name).scores,
    liveSuccessOperations: summarizePhase81(liveSuccess, name).operations,
    positiveStrataWithSuccessfulResponse: successful.reduce((counts, row) => { for (const key of [row.label.responsibility, row.label.consequenceLevel]) counts[key] = (counts[key] ?? 0) + 1; return counts }, {}),
    historicalReplays: successful.filter(row => row.results[name].raw?.replay).length,
    liveRequests: rows.filter(row => !row.results[name].cached && !row.results[name].raw?.replay).length,
    cost: 'UNAVAILABLE_WITHOUT_AUTHORITATIVE_VERSIONED_PRICING', repeatConsistency: 'NOT_MEASURED' }
}
await writeFile(new URL(`${id}-review.json`, root), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(Object.fromEntries(Object.entries(report.candidates).map(([name, value]) => [name, {
  success: value.successfulCases, failures: value.failures, errors: value.errorCategories, raw: value.rawVsGated.raw, gated: value.rawVsGated.gated }]))))
