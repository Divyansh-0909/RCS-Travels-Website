import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { phase81DevelopmentDataset, phase81WaiverDevelopmentDataset, phase81DevelopmentHash } from '../benchmarks/responsibility/phase81Development.js'
import { responsibilityEvidenceHash } from '../services/responsibilityAnalyst.js'
import { createResponsibilityCodexBackend, responsibilityCodexConfiguration, guardedCodexResponsibility } from '../benchmarks/codex/responsibility.js'
import { digest, isolatedEnvironment, resolveCodexLauncher } from '../benchmarks/codex/config.js'
import { collectProcess } from '../benchmarks/codex/process.js'
import { createEvaluationJournal, evaluationIdentity } from '../benchmarks/codex/journal.js'
import { executeDevelopmentQueue, requireVerifiedPreflight, requirePilotGate, validateDevelopmentInput } from '../benchmarks/codex/plan.js'
import { compareCodexDevelopment, codexConsistency, scoreCodexCohort, unsafeGuardedCount } from '../benchmarks/codex/metrics.js'

const [mode = '--prepare', ...rest] = process.argv.slice(2)
assert.ok(['--prepare', '--pilot', '--development', '--consistency'].includes(mode), 'UNKNOWN_STAGE')
assert.ok(rest.length === 0 || rest.length === 2 && rest[0] === '--run-dir', 'INVALID_ARGUMENTS')
const out = resolve(rest[1] ?? '../output/codex-luna-2026-10-08')
await mkdir(out, { recursive: true })
const load = async path => JSON.parse(await readFile(path, 'utf8'))
const records = [...phase81DevelopmentDataset(), ...phase81WaiverDevelopmentDataset()]
const original = await load('../output/provider-light-2026-10-07/provider-resume-manifest.json')
assert.equal(records.length, 113)
assert.equal(phase81DevelopmentHash(records), original.responsibility.datasetHash)
for (const record of records) {
  assert.equal(responsibilityEvidenceHash(record.evidence), record.evidenceHash, 'EVIDENCE_HASH_DRIFT')
  assert.deepEqual(record.modelInput, { evidence: record.evidence }, 'MODEL_AND_GUARD_EVIDENCE_MISMATCH')
}
const env = isolatedEnvironment(process.env), launcher = resolveCodexLauncher(env)
const version = await collectProcess({ command: launcher.command, args: ['--version'], cwd: out, env })
assert.equal(version.code, 0)
const sourceFiles = ['config.js', 'process.js', 'events.js', 'adapter.js', 'journal.js', 'plan.js', 'responsibility.js', 'metrics.js']
const source = await Promise.all(sourceFiles.map(async file => ({ file,
  sha256: createHash('sha256').update(await readFile(new URL(`../benchmarks/codex/${file}`, import.meta.url))).digest('hex') })))
const guardFiles = ['benchmark.js', 'developmentSeverityGate.js', 'rawGatedMetrics.js']
const guards = await Promise.all(guardFiles.map(async file => ({ file,
  sha256: createHash('sha256').update(await readFile(new URL(`../benchmarks/responsibility/${file}`, import.meta.url))).digest('hex') })))
const config = { ...responsibilityCodexConfiguration(version.stdout.trim()),
  implementationHash: digest(source), guardManifestHash: digest(guards),
  runnerSourceHash: createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex') }
const consistency = await load('../output/phase81/criteria-v5-development/consistency.json')
const consistencyIds = [...new Set(consistency.map(row => row.id))]
assert.equal(consistencyIds.length, 20)
const pilotIds = [
  'driver_cancellation-ordinary_driver_evidence', 'driver_cancellation-ordinary_platform_evidence',
  'development-authenticated-rider-release-reviewed-0', 'driver_cancellation-missing_provenance',
  'driver_cancellation-conflicting_gps', 'development-confirmed-deliberate-unavailability-0',
  'driver_cancellation-stale_rider_gps', 'driver_cancellation-contradictory_timestamps',
  'driver_cancellation-suggestive_not_proof', 'driver_cancellation-received_at_vs_observed_at',
]
// Fixed semantic strata chosen before any successful Codex development response.
const order = records.map(record => evaluationIdentity({ domain: 'responsibility-development',
  datasetHash: original.responsibility.datasetHash, caseId: record.id, input: record.modelInput,
  configHash: digest(config), schemaHash: config.schemaHash }))
const byId = new Map(records.map(record => [record.id, record]))
for (const id of [...pilotIds, ...consistencyIds]) assert.ok(byId.has(id), `UNKNOWN_FROZEN_CASE:${id}`)
const plan = { version: 'responsibility-codex-development-v1', datasetHash: original.responsibility.datasetHash,
  config, configHash: digest(config), source, guards, order, pilotIds, consistencyIds,
  observations: 5, maxFreshConsistencyCalls: 80, heldOutCases: 0,
  apiResultsReusedAsCodex: 0, originalApiGateAmended: false }
plan.planHash = digest(plan)
const planPath = join(out, `responsibility-plan-${plan.planHash}.json`)
try { assert.deepEqual(await load(planPath), plan) }
catch (error) { if (error.code !== 'ENOENT') throw error; await writeFile(planPath, JSON.stringify(plan, null, 2) + '\n', { flag: 'wx' }) }
if (mode === '--prepare') {
  console.log(JSON.stringify({ status: 'PRECOMMITTED', cases: order.length, pilot: pilotIds.length,
    consistency: `${consistencyIds.length}x5`, planHash: plan.planHash, freshModelCalls: 0 }))
} else {
  const preflight = await load(join(out, 'preflight-corrected.json')).catch(error => {
    if (error.code !== 'ENOENT') throw error
    return load(join(out, 'preflight.json'))
  })
  requireVerifiedPreflight(preflight, config.cliVersion)
  if (mode !== '--pilot') requirePilotGate(await load(join(out, 'pilot-gate.json')), plan.planHash)
  if (mode === '--consistency') {
    const development = await load(join(out, 'development-receipt.json'))
    assert.equal(development.status, 'COMPLETE')
    assert.equal(development.completed, 113)
    assert.equal(development.planHash, plan.planHash)
    assert.equal(development.guardedUnsafeOutcomes, 0)
  }
  let selected = order
  if (mode === '--pilot') selected = pilotIds.map(id => order.find(item => item.caseId === id))
  if (mode === '--consistency') selected = consistencyIds.flatMap(id => Array.from({ length: 5 }, (_, index) => ({
    ...order.find(item => item.caseId === id), observation: index + 1 })))
  const backend = createResponsibilityCodexBackend({ config, launcher, env })
  const journal = createEvaluationJournal(join(out, 'cache', 'responsibility-development', 'luna-codex'))
  const stage = mode.slice(2)
  const receipt = await executeDevelopmentQueue({ order: selected, journal,
    evaluate: async identity => {
      const record = byId.get(identity.caseId), input = validateDevelopmentInput(record, plan)
      const result = await backend.evaluate({ input })
      if (result.success) result.guardedRun = guardedCodexResponsibility(result, record.evidence)
      return result
    },
    checkpoint: value => writeFile(join(out, `${stage}-receipt.json`), JSON.stringify({ ...value, planHash: plan.planHash }, null, 2) + '\n') })
  const rows = receipt.results.map(({ identity, result }) => ({ id: identity.caseId,
    label: byId.get(identity.caseId).label, results: { codex: result.guardedRun } }))
  const guardedUnsafeOutcomes = unsafeGuardedCount(rows, 'codex')
  await writeFile(join(out, `${stage}-receipt.json`), JSON.stringify({ ...receipt, planHash: plan.planHash, guardedUnsafeOutcomes }, null, 2) + '\n')
  if (mode === '--consistency') {
    await writeFile(join(out, 'consistency-metrics.json'), JSON.stringify(codexConsistency(receipt, consistencyIds), null, 2) + '\n')
  } else {
    const comparison = compareCodexDevelopment(rows,
      await load('../output/phase81/criteria-v5-development/rows.json'),
      await load('../output/responsibility-resume-2026-10-08/current-common-rows.json'))
    await writeFile(join(out, `${stage}-comparison.json`), JSON.stringify(comparison, null, 2) + '\n')
  }
  if (mode === '--pilot' && receipt.status === 'COMPLETE') {
    await writeFile(join(out, 'pilot-gate.json'), JSON.stringify({ planHash: plan.planHash,
      status: receipt.status, completed: rows.length, failures: 0, unexpectedToolCalls: 0, guardedUnsafeOutcomes,
      scored: scoreCodexCohort(rows, 'codex') }, null, 2) + '\n', { flag: 'wx' })
  }
  console.log(JSON.stringify({ status: receipt.status, completed: receipt.completed, failure: receipt.failure }))
}
