import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { RESPONSIBILITY_LUNA_CONFIG } from '../benchmarks/responsibility/lunaBaseline.js'
import { digest } from '../benchmarks/codex/config.js'
import { createEvaluationJournal, evaluationIdentity, validateJournalEntry } from '../benchmarks/codex/journal.js'
import { executeDevelopmentQueue, requireVerifiedPreflight, requirePilotGate, validateDevelopmentInput } from '../benchmarks/codex/plan.js'
import { responsibilityCodexConfiguration, guardedCodexResponsibility, createResponsibilityCodexBackend,
  responsibilityInstructions, responsibilitySchema } from '../benchmarks/codex/responsibility.js'
import { verifyResponsibilityPrompt } from '../benchmarks/codex/responsibility.js'
import { phase81DevelopmentDataset } from '../benchmarks/responsibility/phase81Development.js'
import { output, temp, verifiedPreflight } from './helpers/codexFixtures.js'

const identity = (caseId = 'development-fixture', observation = 1) => evaluationIdentity({
  domain: 'responsibility-development', datasetHash: 'frozen-development-fixture', caseId,
  input: { evidence: { synthetic: true } }, configHash: 'codex-config-fixture', schemaHash: 'schema-fixture', observation })
const response = id => ({ success: true, error: null, output, backendId: id.backendId,
  model: id.model, executionSurface: id.executionSurface, inputHash: id.inputHash,
  configHash: id.configHash, schemaHash: id.schemaHash, usage: { inputTokens: 100, outputTokens: 40 },
  guardOutcome: 'NEEDS_ADMIN_REVIEW' })
const entry = id => ({ identity: id, key: digest(id), result: response(id), receiptHash: digest(response(id)) })

test('Codex cache identities separate execution backend, domain, config, input and observations', () => {
  const id = identity()
  assert.deepEqual(id, { domain: 'responsibility-development', datasetHash: 'frozen-development-fixture',
    caseId: 'development-fixture', inputHash: digest({ evidence: { synthetic: true } }), configHash: 'codex-config-fixture',
    schemaHash: 'schema-fixture', backendId: 'luna-codex', model: 'gpt-6-luna', executionSurface: 'codex-exec-chatgpt', observation: 1 })
  assert.notEqual(digest(id), digest(identity(id.caseId, 2)))
  assert.equal(identity(id.caseId, 5).observation, 5)
  assert.equal(evaluationIdentity({ ...id, input: {} }).observation, 1)
  for (const domain of ['heldout', 'responsibility-heldout', 'search-heldout', 'production', 'responsibility']) {
    assert.throws(() => evaluationIdentity({ ...id, input: {}, domain }), { message: 'BENCHMARK_SPLIT_FORBIDDEN' })
  }
  for (const observation of [0, 6, 1.5, '1']) {
    assert.throws(() => evaluationIdentity({ ...id, input: {}, observation }), { message: 'OBSERVATION_FORBIDDEN' })
  }
  for (const domain of ['search-development', 'search-robustness']) assert.equal(evaluationIdentity({ ...id, input: {}, domain }).domain, domain)
})
test('Codex cache verifies identity, receipt integrity and backend metadata before reuse', () => {
  const id = identity(), cached = entry(id)
  assert.deepEqual(validateJournalEntry(cached, id), response(id))
  assert.throws(() => validateJournalEntry({ ...cached, identity: { ...id, caseId: 'tampered' } }, id), { message: 'CODEX_CACHE_IDENTITY_MISMATCH' })
  for (const field of ['caseId', 'domain', 'inputHash', 'datasetHash', 'configHash', 'schemaHash', 'model', 'backendId', 'executionSurface', 'observation']) {
    assert.throws(() => validateJournalEntry(cached, { ...id, [field]: 'changed' }), { message: 'CODEX_CACHE_IDENTITY_MISMATCH' })
  }
  assert.throws(() => validateJournalEntry({ ...cached, key: 'wrong' }, id), { message: 'CODEX_CACHE_IDENTITY_MISMATCH' })
  assert.throws(() => validateJournalEntry({ ...cached, receiptHash: 'wrong' }, id), { message: 'CODEX_CACHE_IDENTITY_MISMATCH' })
  for (const field of ['success', 'error', 'output']) {
    const result = { ...cached.result, [field]: field === 'error' ? 'failed' : null }
    assert.throws(() => validateJournalEntry({ ...cached, result, receiptHash: digest(result) }, id), { message: 'CODEX_CACHE_INVALID' })
  }
  for (const field of ['backendId', 'model', 'executionSurface', 'inputHash', 'configHash', 'schemaHash']) {
    const result = { ...cached.result, [field]: 'wrong' }
    assert.throws(() => validateJournalEntry({ ...cached, result, receiptHash: digest(result) }, id), { message: 'CODEX_CACHE_IDENTITY_MISMATCH' })
  }
})
test('Codex journal persists each successful response and cache hits make no inference call', async () => {
  const directory = await temp(), journal = createEvaluationJournal(directory), id = identity()
  let calls = 0
  const first = await journal.evaluateOnce(id, async () => { calls++; return response(id) })
  assert.equal(first.cacheHit, false)
  const second = await journal.evaluateOnce(id, () => { throw new Error('duplicate inference') })
  assert.equal(second.cacheHit, true); assert.equal(calls, 1)
  assert.deepEqual(second.result, first.result)
  assert.deepEqual(await journal.pending([id, identity('second')]), [identity('second')])
  assert.deepEqual(JSON.parse(await readFile(join(directory, `${digest(id)}.json`), 'utf8')), entry(id))
  const claim = JSON.parse(await readFile(join(directory, `${digest(id)}.claim`), 'utf8'))
  assert.deepEqual(claim.identity, id); assert.equal(claim.key, digest(id)); assert.ok(Number.isFinite(Date.parse(claim.at)))
  const saves = [], observed = createEvaluationJournal(await temp(), { save: async (...args) => { saves.push(args); return writeFile(...args) } })
  await observed.evaluateOnce(identity(), async () => response(identity()))
  assert.deepEqual(saves.map(args => args[2]), [{ flag: 'wx' }, { flag: 'wx' }])
})
test('Codex journal prevents simultaneous duplicate calls and interrupted case resampling', async () => {
  const journal = createEvaluationJournal(await temp()), id = identity()
  let release, called
  const entered = new Promise(resolve => { called = resolve })
  const first = journal.evaluateOnce(id, async () => { called(); await new Promise(resolve => { release = resolve }); return response(id) })
  await entered
  await assert.rejects(journal.evaluateOnce(id, async () => response(id)), { message: 'CODEX_CASE_ALREADY_CLAIMED_NEEDS_RECONCILIATION' })
  release(); await first
  const interrupted = identity('interrupted')
  await assert.rejects(journal.evaluateOnce(interrupted, () => { throw new Error('process interrupted') }), { message: 'process interrupted' })
  await assert.rejects(journal.evaluateOnce(interrupted, () => { throw new Error('must not retry') }), { message: 'CODEX_CASE_ALREADY_CLAIMED_NEEDS_RECONCILIATION' })
})
test('Codex failures are preserved separately and do not become successful cache entries', async () => {
  const directory = await temp(), journal = createEvaluationJournal(directory), id = identity()
  const failed = { ...response(id), success: false, output: null, error: 'PROVIDER_USAGE_EXHAUSTED' }
  const saves = [], audited = createEvaluationJournal(await temp(), { save: async (...args) => { saves.push(args); return writeFile(...args) } })
  await audited.evaluateOnce(id, async () => failed)
  assert.deepEqual(saves.map(args => args[2]), [{ flag: 'wx' }, { flag: 'wx' }])
  assert.equal((await journal.evaluateOnce(id, async () => failed)).result.success, false)
  assert.deepEqual(await journal.pending([id]), [id])
  assert.equal(JSON.parse(await readFile(join(directory, `${digest(id)}.failure.json`), 'utf8')).result.error, 'PROVIDER_USAGE_EXHAUSTED')
  await assert.rejects(journal.evaluateOnce(id, async () => response(id)), { message: 'CODEX_CASE_ALREADY_CLAIMED_NEEDS_RECONCILIATION' })
})
test('Codex cache corruption stops execution instead of silently reissuing a successful request', async () => {
  const directory = await temp(), journal = createEvaluationJournal(directory), id = identity()
  await writeFile(join(directory, `${digest(id)}.json`), JSON.stringify({ ...entry(id), receiptHash: 'corrupt' }))
  await assert.rejects(journal.evaluateOnce(id, async () => response(id)), { message: 'CODEX_CACHE_IDENTITY_MISMATCH' })
  await writeFile(join(directory, `${digest(id)}.json`), 'invalid JSON')
  await assert.rejects(journal.evaluateOnce(id, async () => response(id)), SyntaxError)
})
test('Codex journal reports filesystem failures and absent directories accurately', async () => {
  const directory = await temp(), file = join(directory, 'not-a-directory')
  await writeFile(file, 'fixture')
  await assert.rejects(createEvaluationJournal(file).evaluateOnce(identity(), async () => response(identity())))
  assert.deepEqual(await createEvaluationJournal(join(directory, 'missing')).pending([identity()]), [identity()])
  await assert.rejects(createEvaluationJournal(file).pending([identity()]))
  await mkdir(join(directory, `${digest(identity())}.claim`))
  await assert.rejects(createEvaluationJournal(directory).evaluateOnce(identity(), async () => response(identity())), { message: 'CODEX_CASE_ALREADY_CLAIMED_NEEDS_RECONCILIATION' })
  const denied = createEvaluationJournal(await temp(), { save: async () => { throw Object.assign(new Error('access denied'), { code: 'EACCES' }) } })
  await assert.rejects(denied.evaluateOnce(identity(), async () => response(identity())), { message: 'access denied' })
  const unknown = createEvaluationJournal(await temp(), { save: async () => { throw new Error('filesystem unavailable') } })
  await assert.rejects(unknown.evaluateOnce(identity(), async () => response(identity())), { message: 'filesystem unavailable' })
})
test('Codex queue checkpoint preserves exact order and cached successes across an interrupted run', async () => {
  const directory = await temp(), ids = [identity('first'), identity('second'), identity('third')]
  const journal = createEvaluationJournal(directory), called = [], checkpoints = []
  await assert.rejects(executeDevelopmentQueue({ order: ids, journal, evaluate: async id => { called.push(id.caseId); return response(id) },
    checkpoint: async value => { if (value.completed === 1) throw new Error('outer interruption') } }), { message: 'outer interruption' })
  const resumed = await executeDevelopmentQueue({ order: ids, journal, evaluate: async id => { called.push(id.caseId); return response(id) },
    checkpoint: async value => checkpoints.push({ status: value.status, completed: value.completed }) })
  assert.deepEqual(called, ['first', 'second', 'third'])
  assert.equal(resumed.completed, 3); assert.equal(resumed.status, 'COMPLETE'); assert.equal(resumed.failure, null)
  assert.equal(resumed.results[0].cacheHit, true)
  assert.deepEqual(checkpoints, [{ status: 'RUNNING', completed: 1 }, { status: 'RUNNING', completed: 2 }, { status: 'RUNNING', completed: 3 }, { status: 'COMPLETE', completed: 3 }])
})
test('Codex queue stops on provider exhaustion or unresolved claims without calling later cases', async () => {
  for (const category of ['PROVIDER_USAGE_EXHAUSTED', 'PROVIDER_AUTH_FAILURE', 'UNEXPECTED_TOOL_USE']) {
    const ids = [identity('first'), identity('second'), identity('third')], calls = [], checkpoints = []
    const result = await executeDevelopmentQueue({ order: ids, journal: createEvaluationJournal(await temp()),
      evaluate: async id => { calls.push(id.caseId); return id.caseId === 'second' ? { ...response(id), success: false, error: category } : response(id) },
      checkpoint: async value => checkpoints.push(value) })
    assert.equal(result.status, 'STOPPED'); assert.equal(result.completed, 1); assert.equal(result.failure, category)
    assert.deepEqual(result.failedIdentity, ids[1]); assert.deepEqual(calls, ['first', 'second']); assert.equal(checkpoints.at(-1).status, 'STOPPED')
  }
  const failure = await executeDevelopmentQueue({ order: [identity()], journal: { evaluateOnce: async () => { throw new Error('unresolved claim') } },
    evaluate: () => { throw new Error('must not call') }, checkpoint: async () => {} })
  assert.equal(failure.failure, 'unresolved claim'); assert.equal(failure.completed, 0)
  assert.equal(failure.status, 'STOPPED'); assert.deepEqual(failure.results, [])
  const observed = []
  await executeDevelopmentQueue({ order: [identity()], journal: { evaluateOnce: async () => { throw new Error('unresolved claim') } },
    evaluate: () => { throw new Error('must not call') }, checkpoint: async value => observed.push(value) })
  assert.deepEqual(observed, [{ status: 'STOPPED', completed: 0, failure: 'unresolved claim', results: [] }])
})
test('Codex analyst inputs must match the precommitted development input and contain no labels', () => {
  const record = { id: 'fixture', modelInput: { evidence: { synthetic: true } } }
  const plan = { order: [{ caseId: record.id, inputHash: digest(record.modelInput) }] }
  assert.deepEqual(validateDevelopmentInput(record, plan), record.modelInput)
  assert.throws(() => validateDevelopmentInput({ ...record, id: 'heldout' }, plan), { message: 'BENCHMARK_INPUT_OR_SPLIT_MISMATCH' })
  assert.throws(() => validateDevelopmentInput({ ...record, modelInput: { evidence: {} } }, plan), { message: 'BENCHMARK_INPUT_OR_SPLIT_MISMATCH' })
  const leaked = { ...record, modelInput: { ...record.modelInput, label: 'hidden truth' } }
  assert.throws(() => validateDevelopmentInput(leaked, { order: [{ caseId: leaked.id, inputHash: digest(leaked.modelInput) }] }), { message: 'BENCHMARK_LABEL_LEAKAGE' })
})
test('Codex live pilot requires completed model, authentication, bridge isolation and sandbox verification', () => {
  const verified = verifiedPreflight()
  requireVerifiedPreflight(verified, 'fixture-cli')
  for (const field of Object.keys(verified)) {
    assert.throws(() => requireVerifiedPreflight({ ...verified, [field]: 'invalid' }, 'fixture-cli'), { message: 'CODEX_PREFLIGHT_NOT_VERIFIED' })
  }
  assert.throws(() => requireVerifiedPreflight(verified, 'different-cli'), { message: 'CODEX_PREFLIGHT_NOT_VERIFIED' })
})
test('Codex full development requires a complete, safe pilot under the identical plan', () => {
  const receipt = { planHash: 'plan-fixture', status: 'COMPLETE', completed: 10, failures: 0, unexpectedToolCalls: 0, guardedUnsafeOutcomes: 0 }
  requirePilotGate(receipt, 'plan-fixture')
  for (const field of Object.keys(receipt)) assert.throws(() => requirePilotGate({ ...receipt, [field]: 'invalid' }, 'plan-fixture'), { message: 'CODEX_PILOT_GATE_NOT_PASSED' })
})
test('Responsibility Codex uses the existing bounded fields and factual/severity/policy guards', () => {
  const cfg = responsibilityCodexConfiguration('fixture-cli')
  assert.equal(cfg.task, 'responsibility-development'); assert.equal(cfg.apiEquivalent, false)
  assert.equal(cfg.promptHash, digest(responsibilityInstructions)); assert.equal(cfg.schemaHash, digest(responsibilitySchema))
  const suffix = '\nThis is an inference-only development evaluation. Do not use tools, read files, browse, execute commands, edit, or spawn agents. Analyze only the evidence in the user input. Return exactly one JSON object.'
  assert.ok(responsibilityInstructions.endsWith(suffix))
  assert.equal(createHash('sha256').update(responsibilityInstructions.slice(0, -suffix.length)).digest('hex'), RESPONSIBILITY_LUNA_CONFIG.promptHash)
  const record = phase81DevelopmentDataset().find(record => record.id === 'driver_cancellation-missing_provenance')
  const run = guardedCodexResponsibility({ ...response(identity()), model: 'gpt-6-luna', latencyMs: 1 }, record.evidence)
  assert.equal(run.normalized.classification, 'EXTERNAL_OR_UNCERTAIN'); assert.equal(run.normalized.probabilities, null)
  assert.equal(run.normalized.directAnalystContractCompatible, false); assert.equal(run.normalized.directPolicyGateCompatible, false)
  assert.equal(run.gate.route, 'NEEDS_ADMIN_REVIEW'); assert.equal(run.developmentGuard.productionApplied, false)
  assert.equal(run.raw.model, 'gpt-6-luna'); assert.equal(run.latencyMs, 1)
  assert.throws(() => guardedCodexResponsibility({ output: {} }, record.evidence))
  assert.throws(() => verifyResponsibilityPrompt('changed bounded prompt'), { message: 'BOUNDED_PROMPT_DRIFT' })
  assert.equal(createResponsibilityCodexBackend({ config: cfg, launcher: { command: 'fixture', prefix: [] } }).id, 'luna-codex')
})
test('Responsibility Codex import detects a changed bounded prompt before an evaluator can run', async () => {
  const module = new URL('../benchmarks/codex/responsibility.js', import.meta.url)
  const source = await readFile(module, 'utf8')
  const fault = source.replace('Evaluate normalized responsibility evidence', 'Changed bounded instructions')
    .replace(/from '([^']+)'/g, (_, specifier) => `from '${specifier.startsWith('.') ? new URL(specifier, module).href : specifier}'`)
  const localFault = fault.replace("from 'zod'", `from '${new URL('../node_modules/zod/index.js', import.meta.url).href}'`)
  await assert.rejects(import('data:text/javascript;base64,' + Buffer.from(localFault).toString('base64')), { message: 'BOUNDED_PROMPT_DRIFT' })
})
test('Responsibility Codex factory validates the bounded schema on actual fixture response', async () => {
  const cfg = responsibilityCodexConfiguration('fixture-cli')
  const backend = createResponsibilityCodexBackend({ config: cfg, launcher: { command: 'fixture', prefix: [] },
    runProcess: async options => {
      const { successProcess } = await import('./helpers/codexFixtures.js')
      await writeFile(options.args[options.args.indexOf('--output-last-message') + 1], JSON.stringify(output))
      return successProcess()
    } })
  const result = await backend.evaluate({ input: { evidence: { synthetic: true } } })
  assert.deepEqual(result.output, output); assert.ok(Number.isFinite(result.latencyMs) && result.latencyMs >= 0)
})
