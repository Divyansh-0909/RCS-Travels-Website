import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { phase81DevelopmentHash, phase81WaiverDevelopmentDataset } from '../benchmarks/responsibility/phase81Development.js'

const root = new URL('../../output/phase81/', import.meta.url)
const ledger = JSON.parse(await readFile(new URL('canonical-mutation-reconciliation.json', root), 'utf8'))
const file = 'benchmarks/responsibility/phase81Development.js'
const sourceUrl = new URL(`../${file}`, import.meta.url)
const source = await readFile(sourceUrl, 'utf8')
const original = 'autoWaiveAllowed: Boolean(pattern.waived)'
assert.equal(source.split(original).length, 2)
const historical = ledger.changedSourceLineage.filter(e => !e.currentKey && !e.removedRedundantOperation)
assert.equal(historical.length, 1); assert.equal(historical[0].file, file)
assert.equal(historical[0].replacement, 'true')
const mutated = source.replace(original, 'autoWaiveAllowed: true').replace(/from (['"])(\.[^'"]+)\1/g,
  (_all, quote, specifier) => `from ${quote}${new URL(specifier, sourceUrl).href}${quote}`)
// An isolated module keeps the real working-tree source untouched while testing the successor mutation.
const module = await import(`data:text/javascript;base64,${Buffer.from(mutated).toString('base64')}`)
const altered = [...module.phase81DevelopmentDataset(), ...phase81WaiverDevelopmentDataset()]
const receipt = JSON.parse(await readFile(new URL('criteria-v3-development/receipt.json', root), 'utf8'))
const actualHash = phase81DevelopmentHash(altered)
assert.notEqual(actualHash, receipt.datasetHash)
const result = { domain: 'responsibility', labelsChanged: false, sourceMutatedInWorkingTree: false, providerCalls: 0,
  entries: [{ originalKey: historical[0].originalKey, file, sourceHash: createHash('sha256').update(source).digest('hex'),
    successorMutation: 'Boolean(pattern.waived) -> true', mutationKey: 'custom-current-autoWaiveAllowed-true', disposition: 'KILLED',
    expectedDatasetHash: receipt.datasetHash, observedMutantDatasetHash: actualHash,
    rationale: 'The former constant became a waiver-specific expression. Forcing the current expression true corrupts serious-case labels and is rejected by the immutable development receipt comparison.' }] }
await writeFile(new URL('reviewed-source-lineage-proofs.json', root), JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify({ isolatedSuccessorMutations: 1, killed: 1, productionSourceChanged: false, providerCalls: 0 }))
