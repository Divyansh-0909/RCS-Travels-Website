import assert from 'node:assert/strict'
import { readFile, writeFile, unlink } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import * as contract from '../helpers/phase9ReplayContract.js'
import * as canonical from '../helpers/phase9ReplayCanonical.js'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const variants = [
  ['phase9ReplayContract.js', "source.file.replace(/^backend\\//, '')", "source.file.replace(/backend\\//, '')",
    'The SHA-bound frozen manifest has exactly one backend/ prefix on every source path.'],
  ['phase9ReplayContract.js', "row.file.replace(/^backend\\//, '')", "row.file.replace(/backend\\//, '')",
    'The same SHA-bound source paths establish the prefix invariant.'],
  ['phase9ReplayContract.js', ".map(row => `prisma/migrations/${row.name}/migration.sql`).sort()",
    ".map(row => `prisma/migrations/${row.name}/migration.sql`)",
    'The dependency hasher sorts the final file-keyed output; migration discovery order cannot change the immutable source identities.'],
  ['phase9ReplayCanonical.js', "for (const key of ['final', 'liabilities', 'compensation'])", 'for (const key of [])',
    'Approved recipes seed at most one preexisting authority of each kind; replay inputs have no authority-creation event. Collections of zero or one element are already sorted.'],
  ['phase9ReplayCanonical.js', 'canonical.authorities[key] = sorted(canonical.authorities[key], row => row.id)',
    'canonical.authorities[key] = sorted(canonical.authorities[key], () => undefined)',
    'The same bounded scenario cardinality makes the authority comparator unobservable. Multiple authorities are outside this fixture contract and fail the injective identity check.'],
]
const recipe = { id: 'equivalence', initial: { at: '2026-10-09T06:00:00Z', fare: 1000 },
  events: [{ type: 'capture', sequence: 1, at: '2026-10-09T06:00:00Z' }] }
const expectedSources = await contract.replaySourceHashes(), expectedInput = await contract.sealPhase9Scenario(recipe)
const baseState = present => ({ booking: { id: 'booking', reference: null, otp: null, shareToken: null },
  cases: present ? [{ id: 'prior', evidenceVersion: 'test-v1', evidenceHash: 'test-hash', state: 'FINAL_UPHELD' }] : [],
  authorities: Object.fromEntries(['final', 'liabilities', 'compensation'].map(key => [key,
    present ? [{ id: `${key}-identity`, amount: 17, state: 'AUTHORIZED_SYNTHETIC_FIXTURE' }] : []])),
  financial: { payments: [], wallets: [], drivers: [] }, offers: [], incidents: [], routes: [], notifications: [],
  evidence: [], work: [], shadowResults: [], analystCalls: [], webhooks: [], allocations: [], liabilityEntries: [] })
const reviewed = []
for (const [file, before, after, rationale] of variants) {
  const target = resolve(root, 'backend/tests/helpers', file), source = await readFile(target, 'utf8')
  assert.equal(source.split(before).length - 1, 1, `unique reviewed mutation: ${before}`)
  const temporary = resolve(dirname(target), `phase9-equivalence-${randomUUID()}.js`)
  assert.equal(dirname(temporary), dirname(target))
  await writeFile(temporary, source.replace(before, after))
  let witnesses = 0
  try {
    const variant = await import(new URL(`../helpers/${temporary.split(/[\\/]/).at(-1)}`, import.meta.url))
    if (file.includes('Contract')) {
      assert.deepEqual(await variant.replaySourceHashes(), expectedSources); witnesses++
      assert.deepEqual(await variant.sealPhase9Scenario(recipe), expectedInput); witnesses++
      assert.deepEqual(await variant.validatePhase9Scenario(expectedInput), expectedInput); witnesses++
      for (const field of ['schema', 'frozenV5', 'integrity']) {
        await assert.rejects(variant.validatePhase9Scenario({ ...expectedInput, [field]: 'wrong' })); witnesses++
      }
    } else {
      for (const present of [false, true]) {
        const state = baseState(present)
        assert.deepEqual(variant.canonicalPhase9State(variant.createPhase9CanonicalMap(), state),
          canonical.canonicalPhase9State(canonical.createPhase9CanonicalMap(), state)); witnesses++
      }
      const state = baseState(true)
      state.authorities.final.push({ id: 'another-final', amount: 17 })
      assert.throws(() => variant.canonicalPhase9State(variant.createPhase9CanonicalMap(), state)); witnesses++
    }
    reviewed.push({ file, sourceHash: createHash('sha256').update(source).digest('hex'), before, after,
      rationale, witnesses, result: 'EQUIVALENT_UNDER_DOCUMENTED_CALLER_CONTRACT' })
  } finally { await unlink(temporary) }
}
await writeFile(resolve(root, 'output/phase9-final-integration-2026-10-09/replay-reviewed-equivalences.json'),
  JSON.stringify({ rawStatusesPreserved: true, reviewed }, null, 2))
console.log(`${reviewed.length} replay mutation equivalences verified; original helper sources unchanged.`)
