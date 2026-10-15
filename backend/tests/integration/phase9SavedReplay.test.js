import test from 'node:test'
import assert from 'node:assert/strict'
import { readdir, realpath, readFile, writeFile } from 'node:fs/promises'
import { relative, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { executePhase9Scenario } from '../helpers/phase9ReplayExecutor.js'
import { assertPhase9Environment } from '../helpers/phase9Isolation.js'

assertPhase9Environment(process.env)
const allowed = await realpath(fileURLToPath(new URL('../../../output/phase9-final-integration-2026-10-09/replay/', import.meta.url)))
const folder = await realpath(process.env.PHASE9_REPLAY_RECEIPTS)
const subpath = relative(allowed, folder)
assert.ok(subpath && !subpath.startsWith('..') && !isAbsolute(subpath), 'saved replay requires a synthetic evidence run directory')
const files = (await readdir(folder)).filter(name => name.endsWith('.json') && name !== 'saved-replay-report.json').sort()
assert.ok(files.length, 'saved replay cannot pass an empty receipt set')
const results = []
for (const file of files) {
  test(`Phase 9 saved receipt: ${file}`, async () => {
    const { scenario, original } = JSON.parse(await readFile(join(folder, file), 'utf8'))
    assert.equal(original.syntheticOnly, true)
    const replayed = await executePhase9Scenario(scenario)
    assert.deepEqual(replayed.initial, original.initial)
    assert.deepEqual(replayed.events, original.events)
    assert.deepEqual(replayed.final, original.final)
    assert.equal(replayed.outcomeDigest, original.outcomeDigest)
    results.push({ scenarioId: scenario.id, inputIntegrity: scenario.integrity, outcomeDigest: replayed.outcomeDigest, equivalent: true })
  })
}
test.after(async () => {
  await writeFile(join(folder, 'saved-replay-report.json'), JSON.stringify({ expected: files.length, passed: results.length,
    complete: results.length === files.length, results }, null, 2))
})
