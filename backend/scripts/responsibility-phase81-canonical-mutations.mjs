import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
const require = createRequire(import.meta.url)
// Use the same existing quality-tool installation; the backend compiler package exposes version only.
const ts = require(join(process.env.RCS_QUALITY_TOOLS_DIR ?? join(tmpdir(), 'rcs-phase1-quality-tools'), 'node_modules/typescript/lib/typescript.js'))
import './responsibility-phase81-mutation-reconcile.mjs'

const root = new URL('../../output/phase81/', import.meta.url)
const parse = async url => JSON.parse(await readFile(url, 'utf8'))
const digest = value => createHash('sha256').update(value).digest('hex')
const registry = await parse(new URL('mutation-reconciliation.json', root))
const original = await parse(new URL('authorized-original-pending-review.json', root))
const lineage = await parse(new URL('authorized-mutation-lineage.json', root))
const finite = await parse(new URL('authorized-dataset-equivalence-proof.json', root))
const repeats = await parse(new URL('authorized-guard-repeat-equivalence.json', root))
let reviewed = []
try { reviewed = (await parse(new URL('reviewed-equivalence-dispositions.json', root))).entries }
catch (error) { if (error.code !== 'ENOENT') throw error }
let lineageProofs = []
try { lineageProofs = (await parse(new URL('reviewed-source-lineage-proofs.json', root))).entries }
catch (error) { if (error.code !== 'ENOENT') throw error }
const proofs = new Map([...finite.entries.filter(e => e.disposition.startsWith('EQUIVALENT')), ...repeats.entries, ...reviewed].map(e => [e.key, e]))
const area = file => /cache/i.test(file) ? 'CACHE_IDENTITY' : /dataset|contracts/.test(file) ? 'GROUND_TRUTH_AND_SPLIT'
  : /severity/i.test(file) ? 'ATTRIBUTION_AND_SEVERITY' : /metric|evaluation/.test(file) ? 'SAFETY_METRICS'
    : /paced|Budget/.test(file) ? 'PROVIDER_BUDGET' : 'BENCHMARK_BOUNDARY'
const current = registry.entries.filter(e => e.currentSourceMatches).map(entry => {
  const proof = proofs.get(entry.key)
  if (proof && finite.sourceFile === entry.file && finite.sourceHash !== entry.sourceHash) throw new Error('STALE_EQUIVALENCE_PROOF')
  const proofValid = proof && (!proof.sourceHash || proof.sourceHash === entry.sourceHash)
  const disposition = entry.disposition === 'KILLED' ? 'KILLED' : proofValid ? (proof.disposition === 'NON_ACTIONABLE' ? 'NON_ACTIONABLE' : 'EQUIVALENT')
    : entry.disposition === 'JUSTIFIED_EQUIVALENT_NON_ACTIONABLE' ? 'EQUIVALENT' : 'MEANINGFUL_PHASE8_SURVIVOR'
  return { ...entry, behavioralArea: area(entry.file), disposition,
    reviewed: disposition !== 'MEANINGFUL_PHASE8_SURVIVOR', rationale: proofValid ? proof.rationale : entry.rationale }
})
// A detected infinite loop is non-actionable as a survivor, not an equivalent operation.
for (const entry of current) if (entry.mutator === 'AssignmentOperator' && entry.replacement === 'runNumber -= 1'
  && entry.witnesses.some(w => w.status === 'Timeout')) { entry.disposition = 'NON_ACTIONABLE'; entry.reviewed = true
  entry.rationale = 'Decrementing the repeat index never terminates; timeout witnesses detect the behavioral failure.' }
const byKey = new Map(current.map(e => [e.key, e]))
const reportCache = new Map()
async function sourceFor(entry) {
  for (const witness of entry.witnesses) {
    if (!reportCache.has(witness.report)) reportCache.set(witness.report,
      await parse(new URL(`../coverage/${witness.report}`, import.meta.url)))
    const source = reportCache.get(witness.report).files[entry.file]?.source
    if (source && digest(source) === entry.sourceHash) return source
  }
  throw new Error('MUTATION_SOURCE_NOT_FOUND')
}
const offset = (source, point) => source.split('\n').slice(0, point.line - 1).reduce((sum, line) => sum + line.length + 1, 0) + point.column - 1
const astFiles = new Map(); const astPaths = new Map()
function astPath(source, location) {
  const hash = digest(source); const cacheKey = `${hash}:${JSON.stringify(location)}`
  if (astPaths.has(cacheKey)) return astPaths.get(cacheKey)
  if (!astFiles.has(hash)) astFiles.set(hash, ts.createSourceFile('witness.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS))
  const file = astFiles.get(hash)
  const start = offset(source, location.start); const end = offset(source, location.end)
  let best = null
  function walk(node, path, scoped = false) {
    if (node.getFullStart() > start || node.end < end) return
    const name = node.name?.getText(file)
    const segment = `${ts.SyntaxKind[node.kind]}${name ? `:${name}` : ''}`
    const anchor = !scoped && name && (ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node))
    const next = anchor ? [segment] : [...path, segment]
    if (node.getStart(file) === start && node.end === end) best = next.join('/')
    const children = []; ts.forEachChild(node, child => { children.push(child) })
    const frequencies = new Map()
    for (const child of children) {
      const key = `${child.kind}:${child.name?.getText(file) ?? ''}`
      const index = frequencies.get(key) ?? 0; frequencies.set(key, index + 1)
      walk(child, [...next, `${key}#${index}`], scoped || Boolean(anchor))
    }
  }
  walk(file, [])
  astPaths.set(cacheKey, best)
  return best
}
const changed = []
for (const old of lineage.changedSource.entries) {
  const historical = registry.entries.find(e => e.key === old.originalKey)
  if (!historical) throw new Error('HISTORICAL_IDENTITY_NOT_FOUND')
  const source = await sourceFor(historical)
  const oldText = source.slice(offset(source, historical.location.start), offset(source, historical.location.end))
  const path = astPath(source, historical.location)
  const matches = []
  for (const candidate of current.filter(e => e.file === historical.file && e.mutator === historical.mutator && e.replacement === historical.replacement)) {
    const newSource = await sourceFor(candidate)
    if (path && astPath(newSource, candidate.location) === path) matches.push({ candidate,
      textIdentical: newSource.slice(offset(newSource, candidate.location.start), offset(newSource, candidate.location.end)) === oldText })
  }
  let match = matches.length === 1 ? matches[0] : null
  let reviewedSuccessors = []; let removedRootGuard = false; let removedCurrentHash = null
  if (!match && historical.file.endsWith('benchmark.js') && (historical.mutator === 'LogicalOperator'
    || historical.mutator === 'OptionalChaining' && historical.replacement === 'run?.gate.route')) {
    reviewedSuccessors = current.filter(e => e.file === historical.file && e.mutator === historical.mutator
      && e.replacement === historical.replacement.replace(/\brun\?\./g, 'run.'))
  }
  if (!match && /phase81Development|phase81Failures/.test(historical.file) && path?.includes('PropertyAssignment:')) {
    const parts = path.split('/'); const index = parts.findLastIndex(value => value.startsWith('PropertyAssignment:'))
    const prefix = parts.slice(0, index + 1).join('/') + '/'
    for (const candidate of current.filter(e => e.file === historical.file)) {
      if (astPath(await sourceFor(candidate), candidate.location)?.startsWith(prefix)) reviewedSuccessors.push(candidate)
    }
  }
  if (!match && historical.file.endsWith('benchmark.js') && historical.mutator === 'OptionalChaining'
    && historical.location.start.line === 275 && historical.replacement === 'run.gate') {
    const liveSource = await readFile(new URL('../benchmarks/responsibility/benchmark.js', import.meta.url), 'utf8')
    removedRootGuard = liveSource.includes('normalized && !run.error ? run.gate?.route')
    removedCurrentHash = digest(liveSource)
  }
  if (reviewedSuccessors.length && reviewedSuccessors.every(e => e.disposition === 'KILLED'))
    match = { candidate: reviewedSuccessors[0], textIdentical: false }
  const proof = lineageProofs.find(e => e.originalKey === old.originalKey)
  if (proof) {
    const liveSource = await readFile(new URL(`../${proof.file}`, import.meta.url), 'utf8')
    if (digest(liveSource) !== proof.sourceHash || proof.expectedDatasetHash === proof.observedMutantDatasetHash) throw new Error('STALE_LINEAGE_PROOF')
    match = { candidate: { key: proof.mutationKey, sourceHash: proof.sourceHash, disposition: proof.disposition }, textIdentical: false }
  }
  changed.push({ originalKey: old.originalKey, file: old.file, oldSourceHash: old.oldSourceHash, oldLocation: old.oldLocation,
    mutator: old.mutator, replacement: old.replacement, astPath: path,
    currentKey: match?.candidate.key ?? null, currentSourceHash: match?.candidate.sourceHash ?? removedCurrentHash,
    disposition: removedRootGuard ? 'NON_ACTIONABLE' : match?.candidate.disposition ?? 'LINEAGE_UNRESOLVED',
    reviewedSuccessorKeys: reviewedSuccessors.map(e => e.key), removedRedundantOperation: removedRootGuard,
    isolatedSuccessorProof: proof ?? null,
    sourceOperationIdentical: match?.textIdentical ?? false,
    method: match ? (match.textIdentical ? 'Identical operation at unique named AST path; current-source tests determine disposition.'
      : 'Changed named operation: all recorded current successors killed; NOT an equivalence claim.')
      : removedRootGuard ? 'Removed root optional access: branch first requires normalized and reads run.error, so null runs cannot enter. Current fallback/malformed-run tests preserve review. No old-source kill claimed.'
        : 'No unique structural successor; remains blocked.' })
}
const originalReview = original.entries.map(e => ({ ...e, disposition: byKey.get(e.key)?.disposition ?? 'LINEAGE_UNRESOLVED',
  reviewed: byKey.get(e.key)?.reviewed ?? false, rationale: byKey.get(e.key)?.rationale ?? null }))
const counts = Object.fromEntries([...new Set(current.map(e => e.disposition))].map(d => [d, current.filter(e => e.disposition === d).length]))
const result = { status: counts.MEANINGFUL_PHASE8_SURVIVOR ? 'INCOMPLETE' : 'CURRENT_WITNESSES_RESOLVED_LINEAGE_REVIEW_REQUIRED',
  counts, meaningfulSurvivors: 'UNRESOLVED_UNTIL_EACH_PENDING_REVIEWED', pendingWitnesses: current.filter(e => !e.reviewed).length,
  sourceIdentity: 'SHA256(file source) + file + UTF-16 one-based Stryker location + mutator + replacement',
  reports: registry.reportCounts, reportCountsNotAdditive: true, entries: current, originalReview,
  originalPendingRemaining: originalReview.filter(e => !e.reviewed).length, changedSourceLineage: changed,
  changedSourceLineageRemaining: changed.filter(e => !e.currentKey && !e.removedRedundantOperation).length, historicalDebtWaivers: 0 }
const unresolved = result.pendingWitnesses + result.originalPendingRemaining + result.changedSourceLineageRemaining
result.status = unresolved ? 'INCOMPLETE' : 'RESOLVED_CURRENT_CRITICAL_WITNESSES'
result.meaningfulSurvivors = unresolved ? 'UNRESOLVED' : 0
await writeFile(new URL('canonical-mutation-reconciliation.json', root), JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify({ counts, originalPendingRemaining: result.originalPendingRemaining,
  changedSourceLineageRemaining: result.changedSourceLineageRemaining, pendingWitnesses: result.pendingWitnesses }))
