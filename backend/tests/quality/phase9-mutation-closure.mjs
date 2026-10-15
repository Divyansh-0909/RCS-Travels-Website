import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const folder = resolve(root, 'output/phase9-final-integration-2026-10-09')
const read = file => JSON.parse(readFileSync(resolve(folder, file), 'utf8'))
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
function reconcile(name, reports, expected, equivalents = []) {
  const identities = new Map(), sources = {}
  for (const [index, file] of reports.entries()) {
    for (const [source, result] of Object.entries(read(file).files)) {
      const hash = sha(readFileSync(resolve(root, 'backend', source)))
      assert.equal(sha(result.source.replace(/^\/\/ @ts-nocheck\r?\n/, '')), hash, `tested source: ${source}`)
      sources[source] = hash
      for (const mutant of result.mutants) {
        const id = JSON.stringify([source, mutant.location, mutant.mutatorName, mutant.replacement])
        if (index) assert.ok(identities.has(id), `unmatched retest identity in ${file}`)
        identities.set(id, { source, ...mutant, lastReport: file })
      }
    }
  }
  const mutants = [...identities.values()]
  assert.equal(mutants.length, expected)
  const counts = Object.fromEntries([...new Set(mutants.map(row => row.status))]
    .map(status => [status, mutants.filter(row => row.status === status).length]))
  assert.equal(mutants.filter(row => !['Killed', 'Survived'].includes(row.status)).length, 0)
  const survivors = mutants.filter(row => row.status === 'Survived')
  assert.equal(survivors.length, equivalents.length)
  for (const survivor of survivors) assert.ok(equivalents.some(row => row.source === survivor.source
    && row.line === survivor.location.start.line && row.mutatorName === survivor.mutatorName), 'unreviewed survivor')
  const result = { name, reports, sources, unique: expected, counts, reviewedEquivalent: equivalents.length,
    meaningfulSurvivors: 0, timeouts: 0, errors: 0, ignored: 0, mutants }
  writeFileSync(resolve(folder, `mutation-${name}-closure.json`), JSON.stringify(result, null, 2))
  return result
}
const replayReview = read('replay-reviewed-equivalences.json')
assert.equal(replayReview.reviewed.length, 5)
assert.ok(replayReview.reviewed.every(row => row.result === 'EQUIVALENT_UNDER_DOCUMENTED_CALLER_CONTRACT'))
const replay = reconcile('replay', ['mutation-replay-integrity-report.json', 'mutation-replay-retest-report.json',
  'mutation-replay-final-gap-report.json', 'mutation-replay-timeout-retest-report.json'], 481, [
  { source: 'tests/helpers/phase9ReplayContract.js', line: 42, mutatorName: 'Regex' },
  { source: 'tests/helpers/phase9ReplayContract.js', line: 49, mutatorName: 'MethodExpression' },
  { source: 'tests/helpers/phase9ReplayContract.js', line: 51, mutatorName: 'Regex' },
  { source: 'tests/helpers/phase9ReplayCanonical.js', line: 111, mutatorName: 'ArrayDeclaration' },
  { source: 'tests/helpers/phase9ReplayCanonical.js', line: 111, mutatorName: 'ArrowFunction' },
])
const dispatch = reconcile('dispatch', ['mutation-dispatch-calls-report.json'], 13)
const incidentCalls = reconcile('incident-calls', ['mutation-integration-calls-final-report.json'], 5)
const location = reconcile('location', ['mutation-location-final-report.json'], 174)
const incidents = read('mutation-incidents-closure.json'), routing = read('mutation-routing-closure.json')
assert.deepEqual(incidents.counts, { Killed: 326 })
assert.equal(routing.counts.Killed, 468)
assert.equal(routing.reviewedEquivalent, 8)
const groups = [incidents, routing, replay, dispatch, incidentCalls, location]
const unique = groups.reduce((sum, group) => sum + group.unique, 0)
const killed = groups.reduce((sum, group) => sum + group.counts.Killed, 0)
const equivalent = groups.reduce((sum, group) => sum + (group.reviewedEquivalent ?? 0), 0)
assert.equal(unique, 1475)
assert.equal(killed + equivalent, unique)
const result = { schema: 'phase9-current-mutation-closure-v1', unique, killed, reviewedEquivalent: equivalent,
  meaningfulSurvivors: 0, timeouts: 0, ignored: 0, errors: 0,
  groups: groups.map(({ mutants: _mutants, ...summary }) => summary),
  historicalFinancialReport: 'output/phase9-financial-lifecycle-2026-10-09/mutation-closure.json',
  historicalFinancialScoreNotAddedToCurrentTotal: true }
writeFileSync(resolve(folder, 'mutation-closure.json'), JSON.stringify(result, null, 2))
console.log(`${unique} current mutants: ${killed} killed, ${equivalent} reviewed equivalent, zero meaningful survivors/timeouts/ignored/errors.`)
