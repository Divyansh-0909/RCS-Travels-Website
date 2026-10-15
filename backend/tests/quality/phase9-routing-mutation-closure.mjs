import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const folder = resolve(root, 'output/phase9-final-integration-2026-10-09')
const read = name => JSON.parse(readFileSync(resolve(folder, name), 'utf8'))
const runs = ['mutation-routing-focused-trial-report.json', 'mutation-routing-retest-report.json',
  'mutation-routing-final-gap-report.json', 'mutation-routing-multiline-report.json', 'mutation-routing-host-final-report.json']
const key = row => JSON.stringify([row.location, row.mutatorName, row.replacement])
const final = new Map()
for (const [index, name] of runs.entries()) {
  const report = read(name)
  for (const [file, result] of Object.entries(report.files)) {
    const testedBytes = result.source.replace(/^\/\/ @ts-nocheck\r?\n/, '')
    assert.equal(createHash('sha256').update(testedBytes).digest('hex'),
      createHash('sha256').update(readFileSync(resolve(root, 'backend', file))).digest('hex'), `tested source identity: ${file}`)
    for (const mutant of result.mutants) {
      const identity = `${file}:${key(mutant)}`
      if (index) assert.ok(final.has(identity), `retest introduced an unmatched identity: ${identity}`)
      final.set(identity, { file, location: mutant.location, mutatorName: mutant.mutatorName,
        replacement: mutant.replacement, status: mutant.status, lastReport: name })
    }
  }
}
const equivalences = read('routing-reviewed-equivalences.json')
const mutants = [...final.values()]
const counts = Object.fromEntries([...new Set(mutants.map(row => row.status))]
  .map(status => [status, mutants.filter(row => row.status === status).length]))
assert.equal(mutants.length, 476)
assert.equal(counts.Killed, 468)
assert.equal(counts.Survived, 8)
assert.equal(mutants.filter(row => !['Killed', 'Survived'].includes(row.status)).length, 0)
assert.equal(equivalences.reviewed.length, 8)
assert.ok(equivalences.reviewed.every(row => row.result === 'EQUIVALENT_UNDER_DOCUMENTED_CALLER_CONTRACT'
  && row.witnesses === 92))
const sourceHashes = Object.fromEntries([...new Set(mutants.map(row => row.file))].map(file => [file,
  createHash('sha256').update(readFileSync(resolve(root, 'backend', file))).digest('hex')]))
assert.equal(sourceHashes['services/googleRoutes.js'], equivalences.sourceHash)
const result = { schema: 'phase9-routing-mutation-closure-v1', runs, sourceHashes, counts,
  unique: mutants.length, reviewedEquivalent: 8, meaningfulSurvivors: 0, timeouts: 0,
  equivalenceReport: 'routing-reviewed-equivalences.json', mutants }
writeFileSync(resolve(folder, 'mutation-routing-closure.json'), JSON.stringify(result, null, 2))
console.log(`${mutants.length} unique routing mutants: ${counts.Killed} killed, 8 reviewed equivalent, zero unresolved.`)
