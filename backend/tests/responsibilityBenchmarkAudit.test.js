import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createResponsibilityAnalystFake } from './helpers/responsibilityAnalystFake.js'
import { phase81Dataset } from '../benchmarks/responsibility/phase81.js'
import { buildFrozenResponsibilityBenchmarkDataset, responsibilityBenchmarkDatasetHash } from '../benchmarks/responsibility/dataset.js'
import { runExistingResponsibilityAnalyst, createReadOnlyResponsibilityBenchmarkLoader,
  createResponsibilityBenchmarkRunner, createAppendOnlyResponsibilityArtifactWriter } from '../benchmarks/responsibility/benchmark.js'
import { evaluateResponsibilityBenchmark } from '../benchmarks/responsibility/evaluation.js'

const record = phase81Dataset('development').find(row => row.id === 'driver_cancellation-ordinary_driver_evidence')
test('frozen synthetic identity and all nested history remain immutable', () => {
  const records = buildFrozenResponsibilityBenchmarkDataset()
  assert.equal(responsibilityBenchmarkDatasetHash(records), 'f011610a6083cec0006f434c330c6cc51fb0090e66999d435f43d95070b400e0')
  for (const row of records) {
    assert.equal(Object.isFrozen(row.evidence.timeline), true)
    for (const item of row.evidence.timeline) {
      assert.equal(Object.isFrozen(item), true); assert.equal(Object.isFrozen(item.value), true)
      assert.throws(() => { item.value.changedAfterFreeze = true }, TypeError)
    }
  }
})
test('existing analyst audit retains only typed metadata and summary counts, never arbitrary provider prose', async () => {
  const analyst = createResponsibilityAnalystFake('driver_caused')
  const valid = await analyst.analyzeResponsibilityCase(record.evidence)
  const run = overrides => runExistingResponsibilityAnalyst(record.evidence, { analyst: {
    provider: 'audit-provider', model: 'audit-model', analyzeResponsibilityCase: async () => ({ ...valid, ...overrides }),
  } })
  const good = await run({ analysisId: 'audit-analysis', contractVersion: 'audit-contract', provider: 'audit-provider', model: 'audit-model',
    usage: { inputTokens: 10, outputTokens: 3, totalTokens: 13, requestCount: 1 } })
  assert.deepEqual({ analysisId: good.raw.analysisId, contractVersion: good.raw.contractVersion, provider: good.raw.provider, model: good.raw.model },
    { analysisId: 'audit-analysis', contractVersion: 'audit-contract', provider: 'audit-provider', model: 'audit-model' })
  assert.deepEqual(good.raw.usage, { inputTokens: 10, outputTokens: 3, totalTokens: 13, requestCount: 1 })
  assert.deepEqual(Object.keys(good.raw.output).sort(), ['action', 'classification', 'confidence', 'factCount', 'inferenceCount', 'severity'])
  assert.equal(good.raw.output.factCount, valid.output.factsSupporting.length)
  assert.equal(good.raw.output.inferenceCount, valid.output.inferences.length)
  for (const field of ['analysisId', 'contractVersion', 'provider', 'model']) {
    assert.equal((await run({ [field]: 7 })).raw[field], null)
    assert.equal((await run({ [field]: '' })).raw[field], '')
  }
  assert.equal((await run({ usage: null })).raw.usage, null)
  const absent = await run({ output: null })
  assert.equal(absent.raw.output, null); assert.equal(absent.gate.route, 'NEEDS_ADMIN_REVIEW')
})
test('real-data loader requires human decisions and reads complete audit links without writing account state', async () => {
  let query
  const loader = createReadOnlyResponsibilityBenchmarkLoader({ responsibilityCase: { findMany: async value => { query = value; return [
    { id: 'approved', state: 'FINAL_WAIVED', evidenceSnapshot: record.evidence,
      finalDecision: { source: 'APPEAL_REVIEW', appealId: 'appeal', classification: 'VALID_WAIVED', consequenceLevel: 'LEVEL_0' } },
    { id: 'invalid-human', evidenceSnapshot: record.evidence, adminReview: { classification: 'NOT_A_CLASS' } },
    { id: 'automatic', state: 'FINAL_UPHELD', evidenceSnapshot: record.evidence,
      finalDecision: { source: 'NO_APPEAL_AUTO', classification: 'DRIVER_CAUSED', consequenceLevel: 'LEVEL_2' } },
  ] } } })
  const rows = await loader.load({ take: 3, caseIds: ['approved', 'invalid-human', 'automatic'] })
  assert.deepEqual(query.where, { shadowResults: { some: {} }, id: { in: ['approved', 'invalid-human', 'automatic'] } })
  assert.deepEqual(query.select, { id: true, state: true, evidenceSnapshot: true,
    finalDecision: { select: { outcome: true, classification: true, consequenceLevel: true, source: true, appealId: true } },
    adminReview: { select: { decision: true, classification: true, consequenceLevel: true } } })
  assert.deepEqual(rows.map(row => row.label?.source ?? null), ['FINAL_APPEAL', null, null])
  assert.equal(rows[0].label.consequenceLevel, 'LEVEL_0')
  assert.equal(rows[0].label.contradictionCritical, false)
  assert.equal(rows[1].cohort, 'D_REAL_UNLABELED'); assert.equal(rows[2].cohort, 'D_REAL_UNLABELED')
})
test('evaluation usage, failure taxonomy and repeat details preserve provider distinctions', () => {
  const prediction = { responsibility: 'DRIVER_CAUSED', consequenceLevel: 'LEVEL_1', needsReview: true }
  const row = { id: 'audit', runNumber: 1, cohort: record.cohort, label: record.label, existingPrediction: prediction, jevPrediction: prediction,
    existing: { latencyMs: 10, error: null, raw: { usage: { inputTokens: 3, outputTokens: 2 } } },
    jev: { latencyMs: 20, error: null, raw: { usage: { inputTokens: 5, outputTokens: 4, totalTokens: 9, requestCount: 2 }, answers: { severity: { score: 1.2 } } } } }
  const report = evaluateResponsibilityBenchmark([row, { ...row, runNumber: 2, existing: { error: 'slow', errorCategory: 'TIMEOUT' },
    jev: { error: 'broken', errorCategory: 'PROVIDER' } }])
  assert.equal(report.existing.operations.usage.totalTokens.total, 5)
  assert.equal(report.jev.operations.usage.inputTokens.total, 5)
  assert.equal(report.jev.operations.usage.outputTokens.total, 4)
  assert.equal(report.jev.operations.usage.requestCount.total, 3)
  assert.equal(report.existing.outputDiagnostics.timeouts, 1)
  assert.equal(report.jev.outputDiagnostics.timeouts, 0)
  assert.equal(report.jev.outputDiagnostics.providerErrors, 1)
  assert.equal(report.jev.outputDiagnostics.manualReviewRoutes, 2)
  assert.equal(report.jev.repeatDetails.comparedCases, 1)
  assert.equal(report.jev.repeatDetails.cases[0].severityScoreVariance, null)
  const repeated = evaluateResponsibilityBenchmark([row, { ...row, runNumber: 2,
    jev: { ...row.jev, raw: { answers: { severity: { score: .2 } } } } }])
  assert.ok(Math.abs(repeated.jev.repeatDetails.cases[0].severityScoreVariance - .25) < .000001)
})
test('runner and append-only artifacts retain labeled inputs, run identity, records and failures', async () => {
  const runner = createResponsibilityBenchmarkRunner({ existingAnalyst: createResponsibilityAnalystFake('driver_caused'),
    jevAdapter: { provider: 'fake', model: 'fake', analyzeResponsibilityCase: async () => { throw new Error('provider-unavailable') } } })
  const [row] = await runner.run([{ evidence: record.evidence, label: record.label }], { runNumber: 2 })
  assert.deepEqual(row.label, record.label); assert.equal(row.runNumber, 2)
  const directory = await mkdtemp(join(tmpdir(), 'rcs-phase81-audit-'))
  try {
    const writer = createAppendOnlyResponsibilityArtifactWriter({ outputDir: directory, runId: 'audit' })
    await writer.append([row], { measured: true })
    await writer.append([], { retry: true })
    assert.equal((await readdir(directory)).length, 2)
    const values = await Promise.all([writer.artifacts, writer.summary].map(file => readFile(file, 'utf8').then(value => value.trim().split('\n').map(JSON.parse))))
    assert.ok(values.flat().some(value => value.runNumber === 2 && value.label?.source === 'FROZEN_SYNTHETIC'))
    assert.ok(values.flat().some(value => value.measured === true))
    assert.ok(values.flat().some(value => value.jev?.error === 'provider-unavailable'))
    assert.equal(values[1][0].failures, 1); assert.equal(values[1][1].records, 0)
  } finally { await rm(directory, { recursive: true, force: true }) }
})
