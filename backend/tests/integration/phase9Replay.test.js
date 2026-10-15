import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { phase9FinancialReplayRecipes, phase9ObservedReplayRecipes } from '../helpers/phase9ReplayScenarios.js'
import { sealPhase9Scenario, digest, validatePhase9Scenario } from '../helpers/phase9ReplayContract.js'
import { executePhase9Scenario } from '../helpers/phase9ReplayExecutor.js'
import { assertPhase9Environment } from '../helpers/phase9Isolation.js'

assertPhase9Environment(process.env)
const runId = `${new Date().toISOString().replace(/[^0-9]/g, '')}-${randomUUID()}`
const root = new URL(`../../../output/phase9-final-integration-2026-10-09/replay/${runId}/`, import.meta.url)
console.log(`Replay evidence run: ${runId}`)
for (const recipe of [...phase9FinancialReplayRecipes, ...phase9ObservedReplayRecipes]) {
  test(`Phase 9 replay: ${recipe.id}`, async () => {
    const scenario = await sealPhase9Scenario(recipe)
    const original = await executePhase9Scenario(scenario)
    await mkdir(root, { recursive: true })
    const receipt = new URL(`${recipe.id}.json`, root)
    await writeFile(receipt, JSON.stringify({ scenario, original }, null, 2))
    const saved = JSON.parse(await readFile(receipt, 'utf8'))
    const replayed = await executePhase9Scenario(saved.scenario)
    await writeFile(receipt, JSON.stringify({ scenario, original, replayed,
      equivalent: original.outcomeDigest === replayed.outcomeDigest }, null, 2))
    assert.deepEqual(replayed.initial, original.initial)
    assert.deepEqual(replayed.events, original.events)
    assert.deepEqual(replayed.final, original.final)
    assert.equal(replayed.outcomeDigest, original.outcomeDigest)
  })
}

test('Phase 9 replay: missing events, source changes, configuration changes and invalid order fail before database creation', async () => {
  const valid = await sealPhase9Scenario(phase9FinancialReplayRecipes[0])
  for (const mutate of [
    value => value.events.splice(2, 1), value => { value.initial.fare = 2000 },
    value => { value.sources['services/payments.js'] = 'wrong' },
  ]) {
    const value = structuredClone(valid); mutate(value)
    await assert.rejects(executePhase9Scenario(value), /INTEGRITY_MISMATCH/)
  }
  const { integrity: _old, ...wrongSources } = structuredClone(valid)
  wrongSources.sources['services/payments.js'] = 'wrong'
  await assert.rejects(validatePhase9Scenario({ ...wrongSources, integrity: digest(wrongSources) }), /SOURCE_IDENTITY/)
  const badOrder = await sealPhase9Scenario({ ...phase9FinancialReplayRecipes[0], events: [
    { type: 'capture', sequence: 1, at: '2026-10-09T06:01:00Z' },
    { type: 'capture', sequence: 2, at: '2026-10-09T06:00:00Z' },
  ] })
  await assert.rejects(validatePhase9Scenario(badOrder), /INVALID_EVENT_SEQUENCE/)
})
