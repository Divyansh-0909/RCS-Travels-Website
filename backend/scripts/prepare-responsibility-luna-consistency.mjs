import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { phase81DevelopmentDataset, phase81WaiverDevelopmentDataset, phase81DevelopmentHash } from '../benchmarks/responsibility/phase81Development.js'
import { benchmarkCacheKey } from '../benchmarks/common/cache.js'

assert.equal(process.argv.length, 2, 'Offline precommit only')
const root = new URL('../../', import.meta.url)
const out = new URL('output/provider-resume-2026-10-07/', root)
await mkdir(out, { recursive: true })
const load = async file => JSON.parse(await readFile(new URL(file, root), 'utf8'))
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const records = [...phase81DevelopmentDataset(), ...phase81WaiverDevelopmentDataset()]
const byId = new Map(records.map(record => [record.id, record]))
const parent = await load('output/provider-light-2026-10-07/provider-resume-manifest.json')
const originalPlan = await load('output/phase81/criteria-v5-development/plan.json')
const common = await load('output/phase81/criteria-v5-development/luna-common-cohort-audit.json')
assert.equal(phase81DevelopmentHash(records), parent.responsibility.datasetHash)
const ids = originalPlan.consistencyCaseIds
assert.equal(ids.length, 20)
assert.equal(new Set(ids).size, 20)
const strata = {
  VALID_WAIVED: record => record.label.responsibility === 'VALID_WAIVED',
  PLATFORM_SAFE_WAIVE: record => record.label.responsibility === 'PLATFORM_CAUSED' && record.label.autoWaiveAllowed,
  DRIVER_LEVEL_1: record => record.label.responsibility === 'DRIVER_CAUSED' && record.label.consequenceLevel === 'LEVEL_1',
  DRIVER_LEVEL_2: record => record.label.responsibility === 'DRIVER_CAUSED' && record.label.consequenceLevel === 'LEVEL_2',
  SAFE_UPHOLD: record => record.label.autoUpholdAllowed,
  MANDATORY_REVIEW: record => record.label.needsReview,
  MISSING_EVIDENCE: record => record.label.requiredMissingEvidence.length > 0,
  CONTRADICTORY_EVIDENCE: record => record.label.contradictionCritical || record.evidence.contradictions.length > 0,
  DELIBERATE_UNAVAILABILITY: record => record.evidence.timeline.some(entry => entry.value?.driverAuthenticatedDisableDispatch === true),
  CONFLICTING_COMMITMENTS: record => record.evidence.timeline.some(entry => entry.value?.secondOverlappingBookingAccepted === true),
  EXTERNAL_OR_UNCERTAIN: record => record.label.responsibility === 'EXTERNAL_OR_UNCERTAIN',
}
const coverage = Object.fromEntries(Object.entries(strata).map(([name, predicate]) => [name, ids.filter(id => predicate(byId.get(id)))]))
assert.ok(Object.values(coverage).every(caseIds => caseIds.length > 0))
const queue = ids.map((caseId, index) => {
  const record = byId.get(caseId)
  const existing = common.cacheProof.find(proof => proof.caseId === caseId)
  const plannedFirst = parent.responsibility.exactOrder.find(row => row.caseId === caseId)
  assert.ok(existing || plannedFirst)
  const firstIdentity = existing?.identity ?? plannedFirst.identity
  const repeatIdentities = [2, 3, 4, 5].map(runNumber => ({ domain: 'responsibility', datasetHash: parent.responsibility.datasetHash,
    caseId, inputHash: record.evidenceHash, provider: 'openai', model: 'gpt-6-luna',
    configHash: parent.responsibility.LunaConfigHash, runNumber }))
  return { order: index + 1, caseId, evidenceHash: record.evidenceHash,
    modelInputHash: hash(record.modelInput), firstObservation: { cacheKey: benchmarkCacheKey(firstIdentity),
      identity: firstIdentity, reusedExistingSuccess: Boolean(existing), fromMissingDevelopmentQueue: !existing },
    repeats: repeatIdentities.map(identity => ({ cacheKey: benchmarkCacheKey(identity), identity })),
    totalObservations: 5 }
})
const plan = { version: 'responsibility-luna-risk-consistency-precommit-v1', scope: 'DEVELOPMENT_ONLY',
  parentManifestHash: parent.manifestHash, selectionSource: 'Same 20-case V5 risk-stratified plan, committed before new Luna outputs',
  datasetHash: parent.responsibility.datasetHash, LunaConfigHash: parent.responsibility.LunaConfigHash,
  LunaPromptHash: parent.responsibility.LunaConfig.promptHash, LunaSchemaHash: parent.responsibility.LunaSchemaHash,
  caseCount: 20, observationsPerCase: 5, observationsTotal: 100, maximumFreshRepeatCalls: 80,
  existingFirstSuccessesReused: queue.filter(row => row.firstObservation.reusedExistingSuccess).length,
  executeOnlyAfter: ['LUNA_RETRY_WINDOW_ELAPSED', 'ONE_PREFLIGHT_PASS', 'MISSING_DEVELOPMENT_COHORT_AND_COVERAGE_GATES_PASS'],
  retries: 0, concurrency: 1, queue, strataCoverage: coverage,
  metrics: ['classification', 'severity', 'evidence sufficiency', 'review', 'route', 'safe-uphold eligibility', 'safe-waive eligibility'],
  recordEveryInstabilityByCase: true, heldOutExcluded: true, providerCallsMade: 0 }
plan.planHash = hash(plan)
const file = new URL('responsibility-consistency-plan.json', out)
try {
  const prior = JSON.parse(await readFile(file, 'utf8'))
  assert.deepEqual(prior, plan, 'Consistency selection must not adapt to new output')
} catch (error) {
  if (error.code !== 'ENOENT') throw error
  await writeFile(file, JSON.stringify(plan, null, 2) + '\n', { flag: 'wx' })
}
console.log(JSON.stringify({ planHash: plan.planHash, cases: 20, observations: 100, freshRepeatCallsMaximum: 80,
  existingFirstSuccessesReused: plan.existingFirstSuccessesReused, strataCounts: Object.fromEntries(Object.entries(coverage).map(([name, ids]) => [name, ids.length])),
  providerCalls: 0, execution: 'NOT_ALLOWED_BEFORE_LUNA_WINDOW' }))
