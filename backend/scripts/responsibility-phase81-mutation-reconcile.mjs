import { readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const root = new URL('../coverage/', import.meta.url)
const reports = (await readdir(root)).filter(name => /^(phase8|phase81|owner-policy).*mutation\.json$/.test(name))
const registry = new Map(); const reportCounts = []
const digest = text => createHash('sha256').update(text).digest('hex')
const justifiedWitness = { 'benchmarks/responsibility/benchmark.js:7': 'Optional gate access is redundant after earlier guaranteed gate access.',
  'benchmarks/responsibility/metrics.js:33': 'Normalised inputs are JSON; Object.entries/every use the same values for the admitted shape.',
  'benchmarks/responsibility/metrics.js:52': 'The exact tolerance boundary is not representable as an admitted probability sum near one.',
  'benchmarks/responsibility/rawGatedMetrics.js:120': 'The severity helper is invoked only with admitted successful normalized output.',
  'benchmarks/responsibility/rawGatedMetrics.js:126': 'The admitted successful output already guarantees a gate at the earlier access.',
  'benchmarks/responsibility/rawGatedMetrics.js:134': 'Failure short-circuits; successful admitted output already guarantees a gate.' }
for (const name of reports) {
  const report = JSON.parse(await readFile(new URL(name, root), 'utf8'))
  const timestamp = (await stat(new URL(name, root))).mtimeMs
  const counts = {}
  for (const [file, detail] of Object.entries(report.files)) {
    if (!file.startsWith('benchmarks/responsibility/') && !file.startsWith('benchmarks/common/')) continue
    const sourceHash = digest(detail.source)
    const currentHash = digest(await readFile(new URL(`../${file}`, import.meta.url), 'utf8'))
    for (const mutant of detail.mutants) {
      counts[mutant.status] = (counts[mutant.status] ?? 0) + 1
      const key = digest(JSON.stringify({ file, sourceHash, location: mutant.location, mutator: mutant.mutatorName, replacement: mutant.replacement }))
      const witness = { report: name, id: mutant.id, status: mutant.status, timestamp,
        reason: name === 'phase81-witness-mutation.json' ? justifiedWitness[`${file}:${mutant.id}`] ?? null : null }
      const entry = registry.get(key) ?? { key, file, sourceHash, currentSourceMatches: sourceHash === currentHash,
        location: mutant.location, mutator: mutant.mutatorName, replacement: mutant.replacement, witnesses: [] }
      entry.witnesses.push(witness); registry.set(key, entry)
    }
  }
  reportCounts.push({ report: name, counts })
}
const entries = [...registry.values()].map(entry => {
  const killed = entry.witnesses.some(witness => witness.status === 'Killed')
  const reason = entry.witnesses.find(witness => witness.reason)?.reason
  const pending = entry.witnesses.some(witness => ['Survived', 'Timeout', 'NoCoverage'].includes(witness.status))
  const disposition = !entry.currentSourceMatches ? 'SOURCE_CHANGED_RETEST_REQUIRED' : killed ? 'KILLED'
    : reason ? 'JUSTIFIED_EQUIVALENT_NON_ACTIONABLE' : pending ? 'PENDING_MEANINGFUL_REVIEW' : 'OTHER_STATUS_REVIEW'
  return { ...entry, disposition, rationale: reason ?? null }
})
const counts = Object.fromEntries([...new Set(entries.map(entry => entry.disposition))]
  .map(disposition => [disposition, entries.filter(entry => entry.disposition === disposition).length]))
const result = { status: 'INCOMPLETE_NO_ZERO_SURVIVOR_CLAIM', overlappingReportCountsNotAdditive: true,
  reconciliationMethod: 'Exact source hash, file, location, mutator and replacement; earlier/later identical witnesses deduplicated.',
  unchangedHistoricalDebtExcluded: 0, reportCounts, counts, entries }
await writeFile(new URL('../../output/phase81/mutation-reconciliation.json', import.meta.url), `${JSON.stringify(result, null, 2)}\n`)
console.log(JSON.stringify({ status: result.status, reports: reports.length, counts }))
