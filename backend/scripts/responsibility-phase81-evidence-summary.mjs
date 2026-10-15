import { readFile, writeFile } from 'node:fs/promises'
import { phase81DevelopmentDataset, phase81WaiverDevelopmentDataset } from '../benchmarks/responsibility/phase81Development.js'
import { applyDevelopmentSeverityGuard, DEVELOPMENT_SEVERITY_GUARD_VERSION } from '../benchmarks/responsibility/developmentSeverityGate.js'
import { scoreRawGatedResponsibility } from '../benchmarks/responsibility/rawGatedMetrics.js'
import { scoreResponsibilityBenchmark, aggregateBenchmarkOperationalStats } from '../benchmarks/responsibility/metrics.js'

const root = new URL('../../output/phase81/evidence-aware-development/', import.meta.url)
const rows = JSON.parse(await readFile(new URL('rows.json', root), 'utf8'))
const records = new Map([...phase81DevelopmentDataset(), ...phase81WaiverDevelopmentDataset()].map(row => [row.id, row]))
const guarded = rows.map(row => ({ ...row, results: Object.fromEntries(Object.entries(row.results).map(([name, run]) =>
  [name, applyDevelopmentSeverityGuard(run, records.get(row.id).modelInput.evidence)])) }))
const common = guarded.filter(row => ['ordinal', 'evidenceAware', 'luna'].every(name => row.results[name] && !row.results[name].error))
const candidates = ['ordinal', 'evidenceAware', 'luna']
const summarize = candidate => {
  const selected = common.map(row => ({ ...row, prediction: row.results[candidate].prediction }))
  const successful = guarded.filter(row => row.results[candidate] && !row.results[candidate].error)
  const operational = successful.filter(row => candidate !== 'ordinal' && !row.results[candidate].cached).map(row => ({ ...row.results[candidate], ...row.results[candidate].raw?.usage }))
  return { commonRawAndGated: scoreRawGatedResponsibility(common, candidate), commonClassification: scoreResponsibilityBenchmark(selected),
    liveOperations: aggregateBenchmarkOperationalStats(operational), successCount: successful.length,
    historicalRecordedOperations: candidate === 'ordinal' ? aggregateBenchmarkOperationalStats(successful.map(row =>
      ({ ...row.results[candidate], ...row.results[candidate].raw?.usage }))) : null,
    guardChanges: guarded.filter(row => row.results[candidate]?.gate?.route !== rows.find(original => original.id === row.id).results[candidate]?.gate?.route)
      .map(row => ({ caseId: row.id, evidenceIds: row.results[candidate].developmentGuard.evidenceIds })),
    cost: 'UNAVAILABLE_WITHOUT_AUTHORITATIVE_VERSIONED_PRICING' }
}
const summary = { status: 'DEVELOPMENT_POSTPROCESSING_COMPARISON_NOT_PROVIDER_RERUN', guardVersion: DEVELOPMENT_SEVERITY_GUARD_VERSION,
  originalRowsPreserved: true, heldOutExecuted: false, simulatedOnly: true, productionPolicyChanged: false,
  commonCases: common.length, commonCaseIds: common.map(row => row.id), candidates: Object.fromEntries(candidates.map(candidate => [candidate, summarize(candidate)])) }
await writeFile(new URL('guarded-rows.json', root), `${JSON.stringify(guarded, null, 2)}\n`)
await writeFile(new URL('guarded-summary.json', root), `${JSON.stringify(summary, null, 2)}\n`)
console.log(JSON.stringify({ commonCases: common.length, candidates: Object.fromEntries(candidates.map(candidate => [candidate,
  { falseLevel2: summary.candidates[candidate].commonRawAndGated.raw.falseLevel2,
    unsafeAutoUpholds: summary.candidates[candidate].commonRawAndGated.gated.unsafeAutoUpholds, guardChanges: summary.candidates[candidate].guardChanges.length }])) }))
