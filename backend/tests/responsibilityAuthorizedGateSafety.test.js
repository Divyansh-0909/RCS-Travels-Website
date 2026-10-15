import test from 'node:test'
import assert from 'node:assert/strict'
import { phase81DevelopmentDataset, phase81WaiverDevelopmentDataset } from '../benchmarks/responsibility/phase81Development.js'
import { simulateJevResponsibilityRoute, runExistingResponsibilityAnalyst } from '../benchmarks/responsibility/benchmark.js'
import { createResponsibilityAnalystFake } from './helpers/responsibilityAnalystFake.js'
import { buildFrozenResponsibilityBenchmarkDataset, splitResponsibilityBenchmark } from '../benchmarks/responsibility/dataset.js'
import { DEFAULT_RESPONSIBILITY_POLICY } from '../services/responsibilityPolicyGate.js'
import { runResponsibilityBenchmark, parseResponsibilityBenchmarkOptions } from '../benchmarks/responsibility/run.js'

const evidence = phase81DevelopmentDataset().find(r => r.id === 'driver_cancellation-ordinary_driver_evidence').evidence
const ordinary = { classification: 'DRIVER_CAUSED', confidence: 1, severity: 'MODERATE', evidenceSufficient: true,
  needsHumanReview: false, externalCauseMaterial: false, platformMateriallyContributed: false }
test('benchmark automation never bypasses waiver/uphold enablement, unknown attribution or unresolved causes', () => {
  const waiver = { ...ordinary, classification: 'VALID_WAIVED', severity: 'LOW' }
  const waiverEvidence = phase81WaiverDevelopmentDataset()[0].evidence
  const waived = simulateJevResponsibilityRoute({ evidence: waiverEvidence, result: waiver })
  assert.equal(waived.route, 'PROVISIONAL_AUTO_WAIVED')
  assert.equal(waived.passedGates.find(g => g.code === 'AUTO_WAIVE_ENABLED').detail, 'policy')
  const unknown = simulateJevResponsibilityRoute({ evidence, result: { ...ordinary, classification: 'UNKNOWN' } })
  assert.equal(unknown.failedGates.find(g => g.code === 'INDEPENDENT_ROUTE_AUTHORITY').pass, false)
  const uncertain = simulateJevResponsibilityRoute({ evidence, result: { ...ordinary, classification: 'EXTERNAL_OR_UNCERTAIN' } })
  assert.equal(uncertain.route, 'NEEDS_ADMIN_REVIEW')
  assert.ok(![...uncertain.passedGates, ...uncertain.failedGates].some(g => g.code.startsWith('AUTO_')))
  for (const [result, key] of [[waiver,'autoWaiveAllowed'],[ordinary,'autoUpholdAllowed']]) {
    const policy = structuredClone(DEFAULT_RESPONSIBILITY_POLICY); policy.cases.DRIVER_CANCELLATION[key] = false
    const decision = simulateJevResponsibilityRoute({ evidence: key === 'autoWaiveAllowed' ? waiverEvidence : evidence, result, policy })
    assert.equal(decision.route, 'NEEDS_ADMIN_REVIEW'); assert.equal(decision.humanReviewRequired, true)
    assert.ok(decision.failedGates.some(g => g.code === (key === 'autoWaiveAllowed' ? 'AUTO_WAIVE_ENABLED' : 'AUTO_UPHOLD_ENABLED')))
  }
  for (const result of [{ ...ordinary, classification:'UNKNOWN' },{ ...ordinary, classification:'EXTERNAL_OR_UNCERTAIN' },
    { ...ordinary, evidenceSufficient:false },{ ...ordinary, needsHumanReview:true },{ ...ordinary, externalCauseMaterial:true },
    { ...ordinary, platformMateriallyContributed:true },{ ...ordinary, confidence:0 },{ ...ordinary, severity:'HIGH' },
    { ...waiver, externalCauseMaterial:true },{ ...waiver, classification:'PLATFORM_CAUSED' }]) {
    assert.equal(simulateJevResponsibilityRoute({ evidence, result }).route, 'NEEDS_ADMIN_REVIEW')
  }
})

test('real-source empty cohort stays unlabeled, single-run and auditable without loading frozen labels or a live database', async () => {
  let runnerOptions; let writerOptions; let repeated = 0; let metadata
  const existingAnalyst = { provider: 'test-openai', model: 'gpt-6-luna' }
  const jevAdapter = { provider: 'test-jev', model: 'jev-test' }
  const options = { outputDir: 'unit-no-files', source: 'real', splitName: 'development', take: 1,
    repeats: 1, consistencyCount: 8, runId: 'unit-empty', existingModel: 'gpt-6-luna' }
  const result = await runResponsibilityBenchmark(options, {
    prismaClient: { responsibilityCase: { findMany: async () => [] } },
    createExistingAnalyst: () => existingAnalyst, createJevAdapter: () => jevAdapter,
    createRunner: args => { runnerOptions = args; return { run: async (cases, run) => { repeated++; assert.deepEqual(cases, []); assert.equal(run.runNumber, 1); return [] } } },
    evaluate: records => { assert.deepEqual(records, []); return { empty: true } },
    createWriter: args => { writerOptions = args; return { artifacts: 'empty-artifacts', summary: 'empty-summary', append: async (records, info) => { assert.deepEqual(records, []); metadata = info } } },
  })
  assert.deepEqual(runnerOptions, { existingAnalyst, jevAdapter }); assert.deepEqual(writerOptions, { outputDir: options.outputDir, runId: options.runId })
  assert.equal(repeated, 1); assert.equal(result.config.datasetHash, null); assert.deepEqual(result.config.heldOutScenarioFamilies, [])
  assert.equal(result.config.consistencyCaseCount, 0); assert.equal(result.config.source, 'real')
  assert.equal(metadata.config, result.config); assert.deepEqual(metadata.evaluation, { empty: true })
})

test('audit metadata retains valid analyst identity and usage while malformed metadata never authorizes automation', async () => {
  const fake = createResponsibilityAnalystFake()
  const envelope = await fake.analyzeResponsibilityCase(evidence)
  envelope.usage = { inputTokens: 17, outputTokens: 3, totalTokens: 20, requestCount: 1 }
  const run = value => runExistingResponsibilityAnalyst(evidence, { analyst: { provider: 'test-openai', model: 'test-model', analyzeResponsibilityCase: async () => value } })
  const successful = await run(envelope)
  assert.equal(successful.error, null)
  assert.deepEqual(successful.raw, { analysisId: envelope.analysisId, contractVersion: envelope.contractVersion,
    provider: envelope.provider, model: envelope.model, usage: envelope.usage,
    output: { classification: 'DRIVER_CAUSED', confidence: 0.97, severity: 'LOW', action: 'AUTO_UPHOLD_CANDIDATE', factCount: 1, inferenceCount: 1 } })
  for (const edit of [value => { delete value.analysisId; delete value.contractVersion; delete value.provider; delete value.model; delete value.usage },
    value => { value.analysisId = 42; value.contractVersion = 42; value.provider = 42; value.model = 42; value.usage = { inputTokens: NaN } }]) {
    const malformed = structuredClone(envelope); edit(malformed)
    const result = await run(malformed)
    assert.equal(result.gate.route, 'NEEDS_ADMIN_REVIEW')
    assert.equal(result.raw.analysisId, null); assert.equal(result.raw.contractVersion, null)
    assert.equal(result.raw.provider, null); assert.equal(result.raw.model, null)
    if (malformed.usage) assert.deepEqual(result.raw.usage, { inputTokens: null, outputTokens: null, totalTokens: null, requestCount: null })
    else assert.equal(result.raw.usage, null)
  }
  const emptyFacts = structuredClone(envelope); delete emptyFacts.output.factsSupporting; delete emptyFacts.output.inferences
  const invalidFacts = await run(emptyFacts)
  assert.equal(invalidFacts.gate.route, 'NEEDS_ADMIN_REVIEW')
  assert.equal(invalidFacts.raw.output.factCount, 0); assert.equal(invalidFacts.raw.output.inferenceCount, 0)
  const noOutput = structuredClone(envelope); delete noOutput.output
  const invalidOutput = await run(noOutput)
  assert.equal(invalidOutput.gate.route, 'NEEDS_ADMIN_REVIEW'); assert.equal(invalidOutput.raw.output, null)
  for (const missingEnvelope of [null, undefined]) {
    const missing = await run(missingEnvelope)
    assert.equal(missing.error, null); assert.equal(missing.gate.route, 'NEEDS_ADMIN_REVIEW')
    assert.deepEqual(missing.raw, { analysisId: null, contractVersion: null, provider: null, model: null, usage: null, output: null })
  }
})

test('subset splitting never inserts a provenance family that does not exist in its input', () => {
  const original = buildFrozenResponsibilityBenchmarkDataset()[0]
  const subset = [{ ...original, scenario: 'unit-subset', scenarioFamily: 'unit-subset' }]
  const split = splitResponsibilityBenchmark(subset)
  assert.deepEqual(split.heldOutScenarioFamilies, ['unit-subset'])
  assert.equal(split.heldOut.length + split.development.length, 1)
})

test('offline benchmark orchestration keeps repeat identities, model configuration, evidence lineage and append-only audit together', async () => {
  const calls=[]; let persisted; let evaluated
  const options={outputDir:'unit-no-files',source:'frozen',splitName:'development',take:5,repeats:3,consistencyCount:2,runId:'unit',existingModel:'gpt-6-luna'}
  const result=await runResponsibilityBenchmark(options,{
    createExistingAnalyst:model=>({provider:'unit-openai',model}),createJevAdapter:()=>({provider:'unit-jev',model:'jev-test'}),
    createRunner:()=>({run:async(cases,{runNumber})=>{calls.push({ids:cases.map(r=>r.id),runNumber});return cases.map(r=>({id:r.id,runNumber}))}}),
    evaluate:records=>{evaluated=records;return {unit:true}},
    createWriter:()=>({artifacts:'unit-artifacts',summary:'unit-summary',append:async(records,metadata)=>{persisted={records,metadata}}}),
  })
  assert.equal(calls.length,3); assert.deepEqual(calls.map(c=>c.runNumber),[1,2,3])
  assert.equal(calls[1].ids.length,2); assert.deepEqual(calls[2].ids,calls[1].ids)
  assert.deepEqual(calls[1].ids,[...calls[0].ids].sort().slice(0,2))
  assert.equal(result.records,result.cases+4); assert.equal(result.config.repeats,3)
  assert.equal(persisted.records,evaluated); assert.equal(persisted.metadata.config,result.config)
  assert.equal(result.config.existing.model,'gpt-6-luna'); assert.equal(result.config.jev.model,'jev-test')
  assert.match(result.config.datasetHash,/^[a-f0-9]{64}$/); assert.match(result.config.existing.promptHash,/^[a-f0-9]{64}$/)
  assert.ok(result.config.heldOutScenarioFamilies.length); assert.equal(result.config.inferenceSettings.maxRetries,0)
  assert.deepEqual(result.evaluation,{unit:true}); assert.equal(result.artifacts,'unit-artifacts')
  assert.equal(parseResponsibilityBenchmarkOptions({argv:['--output=unit','--repeats=10','--consistency-count=100','--take=10000'],env:{}}).repeats,10)
  for(const arg of ['--repeats=11','--consistency-count=101','--take=10001']) {
    assert.throws(()=>parseResponsibilityBenchmarkOptions({argv:['--output=unit',arg],env:{}}))
  }
})
