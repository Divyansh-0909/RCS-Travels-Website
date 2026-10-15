import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const root = new URL('../../output/search-s5-authorized-development/', import.meta.url)
const prior = JSON.parse(await readFile(new URL('mutation-reconciliation.json', root), 'utf8'))
const hash = value => createHash('sha256').update(value).digest('hex')
const registry = new Map(prior.entries.map(entry => [entry.key, { ...entry, witnesses: [...entry.witnesses] }]))
const reportCounts = [...prior.reportCounts]
const completeCurrentRetests = new Set()
for (const name of ['search-development-closure-mutation.json', 'search-development-safety-mutation.json',
  'search-development-final-witness-mutation.json', 'search-development-candidate-boundaries-mutation.json',
  'search-development-timezone-form-witness-mutation.json', 'search-development-boundary-witness-mutation.json',
  'search-development-temporal-boundaries-mutation.json', 'search-development-temporal-helper-mutation.json',
  'search-development-trim-witness-mutation.json', 'search-development-landmark-witness-mutation.json',
  'search-request-prefix-mutation.json', 'search-request-prefix-witness-mutation.json', 'search-booking-tail-mutation.json',
  'search-booking-tail-witness-mutation.json', 'search-vehicle-routing-questions-mutation.json', 'search-flag-tail-mutation.json',
  'search-vehicle-strength-guard-mutation.json', 'search-vehicle-guard-witness-mutation.json',
  'search-vehicle-guard-final-witness-mutation.json']) {
let report
try { report = JSON.parse(await readFile(new URL(`../coverage/${name}`, import.meta.url), 'utf8')) }
catch (error) { if (error.code === 'ENOENT') continue; throw error }
const counts = {}
for (const [file, detail] of Object.entries(report.files)) {
  const current = await readFile(new URL(`../${file}`, import.meta.url), 'utf8')
  if (hash(current) !== hash(detail.source)) continue
  if (['search-development-candidate-boundaries-mutation.json', 'search-development-temporal-boundaries-mutation.json',
    'search-development-temporal-helper-mutation.json', 'search-request-prefix-mutation.json', 'search-booking-tail-mutation.json',
    'search-vehicle-routing-questions-mutation.json', 'search-flag-tail-mutation.json',
    'search-vehicle-strength-guard-mutation.json'].includes(name)) completeCurrentRetests.add(file)
  const sourceHash = hash(current)
  for (const mutant of detail.mutants) {
    counts[mutant.status] = (counts[mutant.status] ?? 0) + 1
    const key = hash(JSON.stringify({ file, sourceHash, location: mutant.location, mutator: mutant.mutatorName, replacement: mutant.replacement }))
    const entry = registry.get(key) ?? { key, file, sourceHash, location: mutant.location,
      mutator: mutant.mutatorName, replacement: mutant.replacement, witnesses: [] }
    const witness = entry.witnesses.find(witness => witness.report === name && witness.id === mutant.id)
    if (witness) {
      if (witness.status !== mutant.status) witness.previousStatus = witness.status
      witness.status = mutant.status
    } else entry.witnesses.push({ report: name, id: mutant.id, status: mutant.status })
    entry.status = entry.witnesses.some(witness => witness.status === 'Killed') ? 'KILLED' : 'PENDING_MEANINGFUL_REVIEW'
    registry.set(key, entry)
  }
}
reportCounts.splice(0, reportCounts.length, ...reportCounts.filter(r => r.name !== name), { name, counts })
}
const entries = []
const retired = [...(prior.retiredSourceEntries ?? [])]
for (const entry of registry.values()) {
  const current = await readFile(new URL(`../${entry.file}`, import.meta.url), 'utf8')
  if (hash(current) !== entry.sourceHash) {
    if (!retired.some(r => r.key === entry.key)) retired.push({ ...entry, currentSourceHash: hash(current),
      disposition: 'CHANGED_SOURCE_NOT_A_CURRENT_KILL', fullCurrentSourceRetested: false })
  } else entries.push(entry)
}
for (const entry of retired) entry.fullCurrentSourceRetested = completeCurrentRetests.has(entry.file)
const proofs = JSON.parse(await readFile(new URL('reviewed-equivalence-dispositions.json', root), 'utf8')).entries
for (const entry of entries) {
  const proof = proofs.find(p => p.key === entry.key && p.sourceHash === entry.sourceHash)
  if (entry.status !== 'KILLED' && proof) Object.assign(entry, { status: proof.disposition, rationale: proof.rationale })
  if (entry.status !== 'KILLED' && entry.key.startsWith('8b4a203b35ed') && entry.witnesses.some(w => w.status === 'Timeout'))
    Object.assign(entry, { status: 'NON_ACTIONABLE', rationale: 'Mutation tester detects nonterminating year-- calendar search on impossible/past omitted-year dates. Timeout is a caught mutation, not a passing survivor or an application timeout.' })
}
const sourceRetestsRequired = [...new Set(retired.filter(r => !r.fullCurrentSourceRetested).map(r => r.file))]
const result = { ...prior, status: 'INCOMPLETE_NO_ZERO_SURVIVOR_CLAIM', entries,
  counts: { KILLED: entries.filter(e => e.status === 'KILLED').length,
    EQUIVALENT: entries.filter(e => e.status === 'EQUIVALENT').length,
    NON_ACTIONABLE: entries.filter(e => e.status === 'NON_ACTIONABLE').length,
    PENDING_MEANINGFUL_REVIEW: entries.filter(e => e.status === 'PENDING_MEANINGFUL_REVIEW').length },
  retiredSourceEntries: retired, sourceRetestsRequired,
  reportCounts,
  labelsChanged: false, splitChanged: false, heldOutExecuted: false }
result.meaningfulSurvivors = result.counts.PENDING_MEANINGFUL_REVIEW || sourceRetestsRequired.length ? 'UNRESOLVED' : 0
result.status = result.meaningfulSurvivors === 0 ? 'RESOLVED_CURRENT_CRITICAL_WITNESSES' : 'INCOMPLETE_NO_ZERO_SURVIVOR_CLAIM'
await writeFile(new URL('mutation-reconciliation.json', root), JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify({ overlappingReportsNotAdditive: true, counts: result.counts, reports: reportCounts }))
