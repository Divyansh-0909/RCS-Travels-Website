import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import { TypeSafeClient } from '@typesafe-ai/sdk'
import { Responses } from 'openai/resources/responses/responses'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PHASE81_CONFIGURATION, phase81ConfigHash, phase81Dataset, runPhase81Record, summarizePhase81, validatePhase81Identity, requirePhase81Adequacy } from '../benchmarks/responsibility/phase81.js'
import { scoreResponsibilityBenchmark } from '../benchmarks/responsibility/metrics.js'

test('V2 dev and held-out preserve family isolation, all safety strata and frozen configuration', () => {
  const dev = phase81Dataset('development'); const held = phase81Dataset('heldOut')
  assert.equal(dev.length + held.length, 163)
  assert.equal(held.some(row => dev.some(other => row.scenarioFamily === other.scenarioFamily)), false)
  assert.equal(held.filter(row => row.label.autoUpholdAllowed).length, 3)
  assert.equal(held.filter(row => row.label.consequenceLevel === 'LEVEL_1').length, 3)
  assert.equal(held.filter(row => row.label.consequenceLevel === 'LEVEL_2').length, 7)
  assert.equal(PHASE81_CONFIGURATION.acceptance.unsafeAutoUpholds, 0)
  assert.match(PHASE81_CONFIGURATION.policyHash, /^[a-f0-9]{64}$/)
  assert.match(phase81ConfigHash(), /^[a-f0-9]{64}$/)
  assert.throws(() => phase81Dataset('all'), /BENCHMARK_SPLIT_INVALID/)
  assert.throws(() => validatePhase81Identity([]), /V2_FROZEN_HASH_MISMATCH/)
  assert.throws(() => requirePhase81Adequacy({ adequate: false, missingStrata: ['LEVEL_1'] }), /V2_HELD_OUT_INADEQUATE/)
})
test('Phase 8.1 summaries retain failed-call rates with a non-unit denominator', () => {
  const record = phase81Dataset('development')[0]
  const prediction = { responsibility: 'DRIVER_CAUSED', consequenceLevel: 'LEVEL_1', needsReview: true }
  const row = error => ({ id: 'rate', runNumber: 1, label: record.label, results: { jev: { prediction, error, latencyMs: 1,
    raw: { usage: { inputTokens: 1, outputTokens: 1 }, answers: { severity: { score: 1 } } } } } })
  const summary = summarizePhase81([row(null), row('TIMEOUT')], 'jev')
  assert.equal(summary.errors, 1); assert.equal(summary.errorRate, .5)
  assert.equal(summary.cost, 'NOT_COMPUTED_WITHOUT_VERSIONED_PRICING_INPUT')
})
test('benchmark candidates see identical evidence, cache results and do not use labels as model input', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'rcs-phase81-'))
  const seen = []
  const createAdapter = provider => ({ provider, model: 'fake-test-model', analyzeResponsibilityCase: async evidence => {
    seen.push(evidence)
    assert.equal('label' in evidence, false)
    return { normalized: { classification: 'EXTERNAL_OR_UNCERTAIN', confidence: 1, needsHumanReview: true,
      evidenceSufficient: false, externalCauseMaterial: true, platformMateriallyContributed: false, severity: 'LOW' },
    raw: { usage: { inputTokens: 2, outputTokens: 1, requestCount: 1 } } }
  } })
  const adapters = { jev: createAdapter('fake-specialist'), luna: createAdapter('fake-baseline') }
  const record = phase81Dataset('development')[0]
  try {
    const initial = await runPhase81Record(record, { cacheRoot: folder, adapters })
    const duplicate = await runPhase81Record(record, { cacheRoot: folder, adapters })
    assert.strictEqual(seen[0], seen[1]); assert.equal(seen.length, 2)
    assert.equal(duplicate.results.jev.cached, true)
    assert.equal(initial.results.jev.prediction.autoUpholdAllowed, false)
    const repeat = await runPhase81Record(record, { cacheRoot: folder, adapters, runNumber: 2 })
    const summary = summarizePhase81([initial, duplicate, repeat], 'luna')
    assert.equal(summary.scores.labeledCount, 2)
    assert.equal(summary.operations.usage.inputTokens.total, 6)
    assert.equal(summary.errors, 0)
    assert.equal(summary.cached, 1)
    assert.equal(summarizePhase81([], 'luna').errorRate, null)
    const failures = structuredClone([initial]); failures[0].results.luna.error = 'REDACTED_PROVIDER_FAILURE'
    assert.equal(summarizePhase81(failures, 'luna').errors, 1)
    failures[0].results.luna.raw = { answers: { severity: { score: 1 } } }
    assert.equal(summarizePhase81(failures, 'luna').operations.count, 1)
    failures[0].results.luna.raw = null
    assert.equal(summarizePhase81(failures, 'luna').operations.count, 1)
  } finally { await rm(folder, { recursive: true, force: true }) }
})
test('default benchmark SDK boundaries can be exercised without a live provider dependency', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'rcs-phase81-sdk-'))
  const previous = { openai: process.env.OPENAI_API_KEY, typesafe: process.env.TYPESAFE_API_KEY }
  process.env.OPENAI_API_KEY = 'test-only-noncredential'; process.env.TYPESAFE_API_KEY = 'test-only-noncredential'
  mock.method(TypeSafeClient.prototype, 'systemOne', async (_request, options) => {
    assert.deepEqual(options, { timeout: 60000, retry: { maxRetries: 0 } })
    return { model: 'jev-fake', answers: {
    responsibility: { choice: 'EXTERNAL_OR_UNCERTAIN', confidence: 1, probabilities: { EXTERNAL_OR_UNCERTAIN: 1 } },
    evidenceSufficient: { noul: 0 }, platformMateriallyContributed: { noul: 0 }, externalCauseMaterial: { noul: 1 },
    needsHumanReview: { noul: 1 }, severity: { score: 0, confidence: 1, probabilities: { LOW: 1 } },
  } } })
  mock.method(Responses.prototype, 'parse', async function () {
    assert.equal(this._client.maxRetries, 0)
    assert.equal(this._client.timeout, 60000)
    return { model: 'gpt-6-luna', output_parsed: {
    responsibility: 'EXTERNAL_OR_UNCERTAIN', confidence: 1, evidenceSufficient: false, platformMateriallyContributed: false,
    externalCauseMaterial: true, needsHumanReview: true, severity: 'LOW' }, usage: { input_tokens: 1, output_tokens: 1 } }
  })
  try {
    const row = await runPhase81Record(phase81Dataset('development')[0], { cacheRoot: folder })
    assert.equal(row.results.jev.prediction.autoUpholdAllowed, false)
    assert.equal(row.results.luna.prediction.autoUpholdAllowed, false)
    assert.equal(row.results.luna.error, null)
  } finally {
    mock.restoreAll()
    for (const [key, value] of [['OPENAI_API_KEY', previous.openai], ['TYPESAFE_API_KEY', previous.typesafe]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value
    }
    await rm(folder, { recursive: true, force: true })
  }
})
test('false auto-waive includes unresolved and contradiction cases, not just wrongly waived driver cases', () => {
  const label = { responsibility: 'EXTERNAL_OR_UNCERTAIN', source: 'FROZEN_SYNTHETIC', autoWaiveAllowed: false, autoUpholdAllowed: false,
    needsReview: true, evidenceSufficient: false, consequenceLevel: 'LEVEL_0', requiredMissingEvidence: [], contradictionCritical: true }
  const prediction = { responsibility: 'VALID_WAIVED', autoWaiveAllowed: true, autoUpholdAllowed: false, needsReview: false }
  assert.equal(scoreResponsibilityBenchmark([{ label, prediction }]).safety.falseAutoWaive, 1)
  assert.equal(scoreResponsibilityBenchmark([{ label: { ...label, responsibility: 'DRIVER_CAUSED', autoWaiveAllowed: null }, prediction }]).safety.falseAutoWaive, 1)
  assert.equal(scoreResponsibilityBenchmark([{ label: { ...label, consequenceLevel: null }, prediction: { ...prediction, consequenceLevel: 'LEVEL_2' } }]).safety.falseLevel2, 0)
  const reviewed = { responsibility: 'EXTERNAL_OR_UNCERTAIN', autoWaiveAllowed: false, autoUpholdAllowed: false, needsReview: true, evidenceSufficient: false }
  assert.equal(scoreResponsibilityBenchmark([{ label, prediction: reviewed }]).safety.contradictionSafety, 0)
  assert.equal(scoreResponsibilityBenchmark([{ label, prediction: { ...reviewed, evidenceSufficient: true } }]).safety.contradictionSafety, 1)
  assert.equal(scoreResponsibilityBenchmark([{ label, prediction: { ...reviewed, needsReview: false } }]).safety.contradictionSafety, 1)
})
