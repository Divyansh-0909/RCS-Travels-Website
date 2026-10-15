import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'

const root = new URL('../../output/phase81/', import.meta.url)
const ledger = JSON.parse(await readFile(new URL('canonical-mutation-reconciliation.json', root), 'utf8'))
const rules = [
  [['431dd926', 'eb63deb4', '7002db1d', '04fd9bcf', '557a1b95', 'b6571e17'], 'EQUIVALENT',
    'Only the absent name/message fallback changes to a constant containing none of the classifier regex keywords. Fallback text is never returned; taxonomy for admitted errors is unchanged. Explicit supplied error text is unaffected.'],
  [['47a04265'], 'EQUIVALENT',
    'For undefined header, Number(undefined) and Date.parse(undefined) are NaN and the final finite check returns null. Removing the explicit undefined check preserves the observable result. The essential null-header check remains tested.'],
  [['7a19b573', '4e87a401'], 'NON_ACTIONABLE',
    'The record super-refinement independently requires exact equality with its evidence SHA256 (64 lowercase hex characters). Prefix/suffix hashes remain rejected. Only which validation diagnostic rejects a malformed hash changes; no admitted record, ground truth, split or scoring changes. The separate real-metadata schema is not waived.'],
  [['cdef1979'], 'EQUIVALENT',
    'Partial usage now yields NaN instead of null privately; operational aggregation excludes every non-finite value. Complete usage sums and original input/output token telemetry are unchanged; explicit totalTokens takes precedence.'],
  [['d419edb6'], 'EQUIVALENT',
    'The right side is reached only after Number.isFinite(usage?.inputTokens) succeeds, which proves usage exists. Otherwise && short-circuits.'],
  [['718213ee'], 'EQUIVALENT',
    'Only an unused operational-row error field changes. The aggregation consumes latency/tokens/requestCount, never this field. Latency already independently excludes failed requests; failure and timeout statistics read original runs.'],
  [['0f3116f1', '9cd66381'], 'EQUIVALENT',
    'Admitted successful legacy answers contain a validated severity answer; categorical adapters have no answers property, and failed runs have raw=null. Earlier optional links short-circuit absent raw/answers. No admitted state reaches missing severity after a present answers object.'],
  [['c909fd48', 'afd561f9'], 'EQUIVALENT',
    'The fallback string array contributes only undefined code values. None equals any required diagnostic code, so .find/.some and evidence-denial checks have the same result as an empty array. Normal gate arrays are untouched.'],
  [['da67776c'], 'EQUIVALENT',
    'metricRows selects existing only for literal existing; every other discriminator selects jev. Replacing its jev argument by empty text changes neither rows nor output (no name is exposed by that helper).'],
  [['8533618e'], 'EQUIVALENT',
    'The altered discriminator only removes a severityScore input to aggregateBenchmarkConsistency, which consumes prediction signatures and never reads severityScore. Jev prediction selection remains the non-existing branch. Independent score variance is read through the separate unchanged repeatDetails call.'],
  [['18768145'], 'EQUIVALENT',
    'Earlier if/else-if clauses consume the two XOR correctness cases. Remaining cases have equal Boolean correctness, where AND and OR of both negations are identical. Correct/correct and wrong/wrong regressions are tested.'],
  [['507303e7', '46f510be'], 'EQUIVALENT',
    'A placeholder string contributes infinite/NaN freshness only. With the actual finite policy age limits it cannot make .some fresh. Real available records and required-category existence are unchanged; a missing group still fails freshness.'],
  [['5dde6745', '3d931ac5'], 'EQUIVALENT',
    'For malformed dates the private helper returns NaN rather than Infinity; both fail <= every admitted finite freshness bound. Valid ISO timestamps are unchanged. Neither private age value is exported.'],
  [['65a852cc'], 'EQUIVALENT',
    'humanLabel reads decision.classification before this optional access; it can only reach consequenceLevel with a non-null decision. Missing level still coalesces to null.'],
  [['07e5d14f'], 'EQUIVALENT',
    'Empty readFile encoding returns Buffer; JSON.parse coerces that Buffer to its default UTF-8 text. The cache format is UTF-8 JSON, so parsing and corruption checks are identical, including multibyte text.'],
  [['c8c6e446'], 'NON_ACTIONABLE',
    'The documented CLI receives executable and absolute script path in argv[0:2]. Neither starts with a supported --name= prefix, so including these prefix entries cannot change argument selection. Explicit injected argv behavior is unaffected.'],
]
const entries = []
for (const [prefixes, disposition, rationale] of rules) for (const prefix of prefixes) {
  const found = ledger.entries.filter(entry => entry.key.startsWith(prefix))
  assert.equal(found.length, 1)
  const entry = found[0]
  const current = await readFile(new URL(`../${entry.file}`, import.meta.url), 'utf8')
  assert.equal(createHash('sha256').update(current).digest('hex'), entry.sourceHash)
  entries.push({ key: entry.key, file: entry.file, sourceHash: entry.sourceHash, location: entry.location,
    mutator: entry.mutator, replacement: entry.replacement, disposition, rationale,
    scope: 'CURRENT_SOURCE_ADMITTED_BENCHMARK_CONTRACT_ONLY', historicalDebtWaiver: false })
}
await writeFile(new URL('reviewed-equivalence-dispositions.json', root), JSON.stringify({ entries,
  method: 'Per exact mutant/source identity and admitted observable benchmark behavior; no blanket historical waiver.' }, null, 2) + '\n')
console.log(JSON.stringify({ reviewed: entries.length, equivalent: entries.filter(e => e.disposition === 'EQUIVALENT').length,
  nonActionable: entries.filter(e => e.disposition === 'NON_ACTIONABLE').length }))
