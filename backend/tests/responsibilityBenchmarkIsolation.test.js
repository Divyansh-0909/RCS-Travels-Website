import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname, resolve, basename } from 'node:path'
import { createHash } from 'node:crypto'
import { createEvidenceAwareSeverityAdapter } from '../benchmarks/responsibility/evidenceAwareSeverity.js'
import { simulateJevResponsibilityRoute, runExistingResponsibilityAnalyst, createResponsibilityBenchmarkRunner,
  createJevResponsibilityAdapter } from '../benchmarks/responsibility/benchmark.js'
import { evaluateResponsibilityBenchmark } from '../benchmarks/responsibility/evaluation.js'
import { phase81DevelopmentDataset } from '../benchmarks/responsibility/phase81Development.js'
import { createResponsibilityAnalystFake } from './helpers/responsibilityAnalystFake.js'
import { parseResponsibilityBenchmarkOptions, runResponsibilityBenchmark } from '../benchmarks/responsibility/run.js'
import { pacedDevelopmentProvider } from '../benchmarks/responsibility/pacedDevelopment.js'

const record = phase81DevelopmentDataset()[0]
const ordinary = { classification: 'DRIVER_CAUSED', confidence: 1, severity: 'MODERATE', evidenceSufficient: true,
  needsHumanReview: false, externalCauseMaterial: false, platformMateriallyContributed: false }
const offTreeModule = async (file, alter) => {
  const sourceUrl = new URL(`../benchmarks/responsibility/${file}`, import.meta.url)
  const source = alter(await readFile(sourceUrl, 'utf8'))
    .replace(/from (['"])(\.[^'"]+)\1/g, (_all, quote, specifier) => `from ${quote}${new URL(specifier, sourceUrl).href}${quote}`)
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}

test('benchmark entry points reject corrupted closed-factory data before any inference or metrics', async () => {
  for (const [file, build, entry, expected] of [
    ['phase81.js', 'buildFrozenResponsibilityBenchmarkDatasetV2', m => m.phase81Dataset('development'), 'V2_FROZEN_HASH_MISMATCH'],
    ['run.js', 'buildFrozenResponsibilityBenchmarkDataset', m => m.runResponsibilityBenchmark({ source: 'frozen', splitName: 'development' }), 'RESPONSIBILITY_BENCHMARK_DATASET_HASH_MISMATCH'],
  ]) {
    const module = await offTreeModule(file, source => source.replace(`const ${file === 'run.js' ? 'dataset' : 'records'} = ${build}()`,
      `const ${file === 'run.js' ? 'dataset' : 'records'} = ${build}().map((r,i)=>i===0 ? {...r,evidenceHash:'f'.repeat(64)} : r)`))
    await assert.rejects(async () => entry(module), error => error.message === expected)
  }
})

test('provider and requested model identity stay distinct from the model-reported response metadata', async () => {
  assert.equal(createEvidenceAwareSeverityAdapter({ client: {} }).provider, 'typesafe-ai')
  const response = { model: 42, usage: {}, answers: { responsibility: { choice: 'DRIVER_CAUSED', confidence: 1 },
    evidenceSufficient: { noul: 1 }, platformMateriallyContributed: { noul: 0 }, externalCauseMaterial: { noul: 0 },
    needsHumanReview: { noul: 0 }, severity: { score: 1 } } }
  const adapter = createJevResponsibilityAdapter({ client: { systemOne: async () => response } })
  const result = await adapter.analyzeResponsibilityCase(record.evidence)
  assert.equal(result.raw.model, null); assert.equal(adapter.model, 'jev-latest')
})

test('gate audit keeps multiple missing, stale and invalid evidence identifiers separately', () => {
  const source = structuredClone(record.evidence)
  source.timeline = source.timeline.filter(item => !['booking', 'assignment'].includes(item.category))
  const missing = simulateJevResponsibilityRoute({ evidence: source, result: ordinary })
  assert.equal(missing.failedGates.find(g => g.code === 'REQUIRED_EVIDENCE').detail, 'missing:booking,assignment')
  const stale = structuredClone(record.evidence)
  for (const item of stale.timeline) item.quality.ageMs = 999999999
  const custom = { policyVersion: 'unit', cases: { DRIVER_CANCELLATION: { requiredCategories: [], freshnessRequiredCategories: ['booking', 'assignment'],
    maxAgeMsByCategory: { booking: 0, assignment: 0 }, minConfidence: 0, allowedSeverities: ['MODERATE'], autoUpholdAllowed: true } } }
  assert.equal(simulateJevResponsibilityRoute({ evidence: stale, result: ordinary, policy: custom }).failedGates.find(g => g.code === 'EVIDENCE_FRESHNESS').detail, 'stale-or-unproven:booking,assignment')
  const derived = structuredClone(record.evidence); derived.timeline[0].quality.invalid = true; derived.timeline[1].quality.invalid = true
  assert.equal(simulateJevResponsibilityRoute({ evidence: derived, result: ordinary }).failedGates.find(g => g.code === 'EVIDENCE_QUALITY').detail, 'invalid:ev_0001,ev_0002')
  const direct = structuredClone(record.evidence); direct.timeline[0].derivedFrom = ['unrelated-id']
  assert.equal(simulateJevResponsibilityRoute({ evidence: direct, result: ordinary }).failedGates.some(g => g.code === 'EVIDENCE_QUALITY'), false)
})

test('invalid analyst metadata preserves the idempotency audit rather than bypassing or adding a false gate failure', async () => {
  for (const envelope of [null, undefined]) {
    const run = await runExistingResponsibilityAnalyst(record.evidence, { analyst: { analyzeResponsibilityCase: async () => envelope } })
    assert.equal(run.gate.passedGates.some(g => g.code === 'IDEMPOTENCY_KEY'), true)
    assert.equal(run.gate.route, 'NEEDS_ADMIN_REVIEW')
  }
  const fake = createResponsibilityAnalystFake()
  const envelope = await fake.analyzeResponsibilityCase(record.evidence)
  const valid = await runExistingResponsibilityAnalyst(record.evidence, { analyst: { analyzeResponsibilityCase: async () => envelope } })
  assert.equal(valid.gate.passedGates.some(g => g.code === 'IDEMPOTENCY_KEY'), true)
})

test('missing optional benchmark case metadata receives opaque stable identifiers and a real-world scenario', async () => {
  const runner = createResponsibilityBenchmarkRunner({ existingAnalyst: { analyzeResponsibilityCase: async () => null },
    jevAdapter: { analyzeResponsibilityCase: async () => { throw new Error('unavailable') } } })
  const [row] = await runner.run([{ evidence: record.evidence }])
  assert.equal(row.id, 'case-' + createHash('sha256').update(record.evidence.caseId).digest('hex').slice(0, 24))
  assert.equal(row.scenario, 'real-world'); assert.equal(row.cohort, 'D_REAL_UNLABELED'); assert.equal(row.label, null)
})

test('development CLI accepts every documented source/split and retains explicit run identity', () => {
  for (const source of ['frozen', 'real', 'all']) for (const split of ['development', 'heldout', 'all']) {
    const result = parseResponsibilityBenchmarkOptions({ argv: ['--output=unit', `--source=${source}`, `--split=${split}`, '--run-id=unit-run'], env: {} })
    assert.equal(result.source, source); assert.equal(result.splitName, split); assert.equal(result.runId, 'unit-run')
  }
})

test('each provider has independent repeated classification and severity statistics', () => {
  const prediction = value => ({ responsibility: value, needsReview: true, consequenceLevel: 'LEVEL_1', autoUpholdAllowed: false, autoWaiveAllowed: false, evidenceSufficient: false })
  const rows = [1, 2].map(runNumber => ({ id: 'repeated', cohort: record.cohort, label: record.label, runNumber,
    existingPrediction: prediction('DRIVER_CAUSED'), jevPrediction: prediction(runNumber === 1 ? 'DRIVER_CAUSED' : 'PLATFORM_CAUSED'),
    existing: { error: null, raw: { answers: { severity: { score: 1 } } }, gate: { failedGates: [] } },
    jev: { error: null, raw: { answers: { severity: { score: runNumber } } }, gate: { failedGates: [] } } }))
  const result = evaluateResponsibilityBenchmark(rows)
  assert.notDeepEqual(result.existing.repeatDetails, result.jev.repeatDetails)
  assert.notDeepEqual(result.existing.consistency, result.jev.consistency)
  assert.equal(result.existing.repeatDetails.cases[0].severityScoreVariance, 0)
})

test('daily capacity hints halt even without quota wording; timeouts retry within the bounded attempt budget', async () => {
  const daily = pacedDevelopmentProvider({ analyzeResponsibilityCase: async () => { throw { status: 429, name: 'RPD', message: 'capacity reached' } } },
    { requestLimit: 2, minIntervalMs: 0, wait: async () => assert.fail('A daily capacity signal may not be retried') })
  await assert.rejects(daily.analyzeResponsibilityCase({}), /FAILURE:RATE_LIMIT/)
  assert.equal(daily.budgetState().requests, 1)
  let calls = 0
  const transient = pacedDevelopmentProvider({ analyzeResponsibilityCase: async () => { if (++calls === 1) throw new Error('TIMEOUT'); return 'recovered' } },
    { requestLimit: 2, minIntervalMs: 0, random: () => 0, wait: async () => {} })
  assert.equal(await transient.analyzeResponsibilityCase({}), 'recovered'); assert.equal(calls, 2)
})

test('the read-only runner passes the explicit cohort limit to the loader instead of its default', async () => {
  let selected
  await runResponsibilityBenchmark({ outputDir: 'unit', source: 'real', splitName: 'development', take: 23, repeats: 1, consistencyCount: 0 }, {
    prismaClient: { responsibilityCase: { findMany: async options => { selected = options; return [] } } },
    createExistingAnalyst: () => ({}), createJevAdapter: () => ({}), createRunner: () => ({ run: async () => [] }),
    createWriter: () => ({ append: async () => {} }), evaluate: () => ({}),
  })
  assert.equal(selected.take, 23)
})

test('direct CLI completion disconnects its database handle; the isolated probe never uses the real database', async () => {
  const module = await offTreeModule('run.js', source => {
    assert.ok(source.includes("import { prisma } from '../../db/prisma.js'"))
    const mocked = source.replace("import { prisma } from '../../db/prisma.js'",
      'export const cleanupProbe = { calls: 0 }; const prisma = { $disconnect: async () => { cleanupProbe.calls++ } }')
      .replace(/export async function main\(input = \{\}\) \{[\s\S]*?\n\}/,
        'export async function main() { return { isolatedCleanupProbe: true } }')
      .replace(/if \(import\.meta\.url ===[^\n]+/, 'if (true) {')
    assert.ok(mocked.includes('isolatedCleanupProbe: true'))
    return mocked
  })
  for (let index = 0; index < 10; index++) await Promise.resolve()
  assert.equal(module.cleanupProbe.calls, 1)
})

test('the default benchmark factory explicitly requests the frozen 60-second SDK timeout', async () => {
  const module = await offTreeModule('phase81.js', source => {
    assert.ok(source.includes('JEV_BENCHMARK_CONFIGURATION, createJevResponsibilityAdapter,'))
    assert.ok(source.includes('createLunaResponsibilityBaseline, RESPONSIBILITY_LUNA_CONFIG'))
    return source.replace('JEV_BENCHMARK_CONFIGURATION, createJevResponsibilityAdapter,', 'JEV_BENCHMARK_CONFIGURATION,')
      .replace('createLunaResponsibilityBaseline, RESPONSIBILITY_LUNA_CONFIG', 'RESPONSIBILITY_LUNA_CONFIG') + `
      export const defaultFactoryProbe = [];
      const adapter = (provider) => ({provider, model:'unit-model', analyzeResponsibilityCase:async()=>({raw:{}, normalized:{
        classification:'DRIVER_CAUSED',confidence:1,severity:'MODERATE',evidenceSufficient:true,
        needsHumanReview:false,externalCauseMaterial:false,platformMateriallyContributed:false}})});
      function createJevResponsibilityAdapter(options) { defaultFactoryProbe.push(options); return adapter('unit-jev') }
      function createLunaResponsibilityBaseline() { return adapter('unit-luna') }
    `
  })
  const directory = await mkdtemp(join(tmpdir(), 'rcs-phase81-default-factory-'))
  try {
    await module.runPhase81Record(record, { cacheRoot: directory })
    assert.deepEqual(module.defaultFactoryProbe, [{ timeout: 60000 }])
  } finally {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir())); assert.ok(basename(directory).startsWith('rcs-phase81-default-factory-'))
    await rm(directory, { recursive: true, force: true })
  }
})
