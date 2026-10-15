import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { z } from 'zod'
import { phase81DevelopmentDataset, phase81WaiverDevelopmentDataset, phase81DevelopmentHash } from '../benchmarks/responsibility/phase81Development.js'
import { phase81ConfigHash } from '../benchmarks/responsibility/phase81.js'
import { RESPONSIBILITY_LUNA_CONFIG, RESPONSIBILITY_LUNA_SCHEMA } from '../benchmarks/responsibility/lunaBaseline.js'
import { EVIDENCE_CRITERIA_V5_CONFIG } from '../benchmarks/responsibility/evidenceCriteriaV5.js'
import { DEFAULT_RESPONSIBILITY_POLICY } from '../services/responsibilityPolicyGate.js'
import { responsibilityEvidenceHash } from '../services/responsibilityAnalyst.js'
import { benchmarkCacheKey } from '../benchmarks/common/cache.js'
import { frozenSearchDevelopment } from '../benchmarks/search/freeze.js'
import { developmentToolAuditPacket } from '../benchmarks/search/toolAudit.js'
import { generateLocationCandidates } from '../services/search/locations/candidates.ts'
import { LUNA_MODEL, LUNA_SCHEMA_VERSION, lunaOutputSchema } from '../services/search/complex/contracts.ts'

assert.equal(process.argv.length, 2, 'Prepare only; no provider execution or selective IDs')
const root = new URL('../../', import.meta.url)
const out = new URL('output/provider-light-2026-10-07/', root)
const load = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'))
const digest = value => createHash('sha256').update(value).digest('hex')
const hash = value => digest(JSON.stringify(value))
const sourceHash = async path => digest(await readFile(new URL(path, root), 'utf8'))
// Once committed, later provider outputs update runtime pending state, not this plan.
// Rebuilding from new successes would adapt the pre-inference selection.
try {
  const committed = await load('output/provider-light-2026-10-07/provider-resume-manifest.json')
  const { manifestHash, ...content } = committed
  assert.equal(hash(content), manifestHash)
  for (const entry of committed.search.sourceManifest) assert.equal(await sourceHash(entry.file), entry.sha256)
  const packageData = await load('docs/search/s6-development/verifier-package.json')
  const { packageHash, ...packageContent } = packageData
  assert.equal(hash(packageContent), packageHash)
  assert.equal(packageHash, committed.s6.packageHash)
  console.log(JSON.stringify({ status: 'COMMITTED_PRE_INFERENCE_PLAN_RETAINED', manifestHash,
    responsibilityQueue: committed.responsibility.exactOrder.length, providerCalls: 0 }))
  process.exit(0)
} catch (error) { if (error.code !== 'ENOENT') throw error }
async function optionalCache(path) {
  try { return await load(path) } catch (error) { if (error.code === 'ENOENT') return null; throw error }
}
async function verifyCache(folder, identity) {
  const key = benchmarkCacheKey(identity), entry = await load(folder + identity.domain + '/' + key + '.json')
  assert.equal(entry.key, key)
  assert.deepEqual(entry.identity, identity)
  return { key, identity, contentHash: hash(entry) }
}
const records = [...phase81DevelopmentDataset(), ...phase81WaiverDevelopmentDataset()]
const rPlan = await load('output/phase81/criteria-v5-development/plan.json')
const common = await load('output/phase81/criteria-v5-development/luna-common-cohort-audit.json')
assert.equal(phase81DevelopmentHash(records), rPlan.datasetHash)
assert.deepEqual(rPlan.criteria, EVIDENCE_CRITERIA_V5_CONFIG)
for (const record of records) {
  assert.equal(responsibilityEvidenceHash(record.evidence), record.evidenceHash)
  assert.deepEqual(record.evidence, record.modelInput.evidence)
  assert.ok(['A_FROZEN_SYNTHETIC', 'B_ADVERSARIAL_SAFETY'].includes(record.cohort))
}
const config = { criteria: EVIDENCE_CRITERIA_V5_CONFIG,
  guard: await sourceHash('backend/benchmarks/responsibility/developmentSeverityGate.js'),
  normalization: await sourceHash('backend/benchmarks/responsibility/evidenceAwareSeverity.js'), policy: DEFAULT_RESPONSIBILITY_POLICY }
assert.equal(hash(config), rPlan.configHash)
assert.equal(phase81ConfigHash(), common.lunaConfigHash)
const jevCacheProof = []
for (const record of records) {
  const repetitions = rPlan.consistencyCaseIds.includes(record.id) ? 5 : 1
  for (let runNumber = 1; runNumber <= repetitions; runNumber += 1) {
    jevCacheProof.push(await verifyCache('output/phase81/criteria-v5-development/cache/', { domain: 'responsibility',
      datasetHash: rPlan.datasetHash, caseId: record.id, inputHash: record.evidenceHash,
      provider: 'typesafe-ai', model: 'jev-latest', configHash: rPlan.configHash, runNumber }))
  }
}
assert.equal(jevCacheProof.length, 193)
for (const proof of common.cacheProof) {
  const record = records.find(record => record.id === proof.caseId)
  assert.ok(record)
  assert.equal(proof.identity.inputHash, record.evidenceHash)
  assert.equal(benchmarkCacheKey(proof.identity), proof.key)
  const path = 'responsibility/' + proof.key + '.json'
  const entry = await optionalCache('output/phase81/cache/' + path)
    ?? await optionalCache('output/phase81/evidence-aware-development/cache/' + path)
  assert.ok(entry)
  assert.deepEqual(entry.identity, proof.identity)
  assert.equal(entry.value.error, null)
  assert.equal(entry.value.raw.model, 'gpt-6-luna')
}
const completedIds = new Set(common.cacheProof.map(proof => proof.caseId))
assert.equal(completedIds.size, 36)
const priorities = [
  ['VALID_WAIVED', record => record.label.responsibility === 'VALID_WAIVED'],
  ['PLATFORM_CAUSED_SAFE_WAIVE', record => record.label.responsibility === 'PLATFORM_CAUSED' && record.label.autoWaiveAllowed],
  ['LEVEL_2', record => record.label.consequenceLevel === 'LEVEL_2'],
  ['MISSING_EVIDENCE', record => record.label.requiredMissingEvidence.length > 0],
  ['CONTRADICTION', record => record.label.contradictionCritical || record.evidence.contradictions.length > 0],
  ['SAFE_UPHOLD', record => record.label.autoUpholdAllowed],
  ['MANDATORY_REVIEW', record => record.label.needsReview], ['REMAINING', () => true],
]
const rank = record => priorities.findIndex(([, predicate]) => predicate(record))
const pending = records.filter(record => !completedIds.has(record.id)).sort((a, b) => rank(a) - rank(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
assert.equal(pending.length, 77)
const rQueue = []
for (const record of pending) {
  let identity = { domain: 'responsibility', datasetHash: rPlan.datasetHash, caseId: record.id,
    inputHash: record.evidenceHash, provider: 'openai', model: 'gpt-6-luna', configHash: common.lunaConfigHash, runNumber: 1 }
  let prior = await optionalCache('output/phase81/cache/responsibility/' + benchmarkCacheKey(identity) + '.json')
  const priorFailures = []
  while (prior) {
    assert.equal(prior.key, benchmarkCacheKey(identity))
    assert.ok(prior.value.error, 'Successful current-identity output must not be scheduled again')
    priorFailures.push(prior.key)
    identity = { ...identity, runNumber: identity.runNumber + 1 }
    assert.ok(identity.runNumber < 100)
    prior = await optionalCache('output/phase81/cache/responsibility/' + benchmarkCacheKey(identity) + '.json')
  }
  rQueue.push({ order: rQueue.length + 1, caseId: record.id, priority: rank(record) + 1,
    stratum: priorities[rank(record)][0], evidenceHash: record.evidenceHash,
    modelInputHash: hash(record.modelInput), identity, plannedCacheKey: benchmarkCacheKey(identity), priorFailures })
}
const frozen = await load('docs/search/benchmark-v1/frozen-v1/dataset.json')
const sRecords = frozenSearchDevelopment(frozen)
assert.equal(frozen.templateFamilyLeakage, 0)
const heldOutFamilies = new Set(frozen.records.filter(record => record.split === 'HELD_OUT').map(record => record.templateFamily))
assert.ok(sRecords.every(record => !heldOutFamilies.has(record.templateFamily)))
const sPlan = await load('output/search-s5-authorized-development/development-plan.json')
const sAudit = await load('output/search-s5-authorized-development/current-development-audit.json')
const sRows = await load('output/search-s5-authorized-development/live-development-source-any-strength-guard/rows.json')
const sInputs = await load('output/search-s5-authorized-development/development-inputs.json')
assert.equal(sRecords.length, 222)
assert.equal(sInputs.length, 222)
for (const entry of sPlan.sourceManifest) assert.equal(await sourceHash(entry.file), entry.sha256)
assert.equal(hash(sPlan.sourceManifest), sAudit.sourceManifestHash)
assert.equal(hash({ sourceManifestHash: sAudit.sourceManifestHash, phase: 'JEV_S3_ONLY_LUNA_NOT_CALLED', model: 'jev-latest', sdk: '0.6.0' }), sAudit.configHash)
const sCacheProof = []
for (const row of sRows) {
  const input = sInputs.find(input => input.caseId === row.caseId)
  assert.ok(sRecords.some(record => record.id === row.caseId))
  assert.equal(row.result.parse.draft.query.id, input.providerQueryId)
  sCacheProof.push(await verifyCache('output/search-s5-authorized-development/live-cache/', {
    domain: 'search', datasetHash: frozen.datasetHash, caseId: row.caseId, inputHash: hash(input.modelInput),
    provider: 'typesafe-ai+google_places', model: 'jev-latest', configHash: sAudit.configHash, runNumber: 1 }))
}
const sQueue = []
for (const input of sInputs) {
  const record = sRecords.find(record => record.id === input.caseId)
  assert.ok(record)
  assert.deepEqual(input.modelInput, record.modelInput)
  const row = sRows.find(row => row.caseId === input.caseId)
  if (row?.status === 'INTERPRETATION_COMPLETE_NO_LUNA') continue
  const minimumRequiredProviders = row ? row.status === 'PROVIDER_PENDING_LUNA' ? ['Luna'] : ['Places'] : ['Jev']
  const query = { id: input.providerQueryId, revision: input.queryRevision, text: input.modelInput.query }
  const candidates = generateLocationCandidates(query, 'BOOKING_REQUEST')
  const minimumDependency = minimumRequiredProviders.join(' + ')
  sQueue.push({ order: sQueue.length + 1, caseId: input.caseId,
    status: row?.status ?? 'UNATTEMPTED', inputHash: hash(input.modelInput), providerQueryId: input.providerQueryId,
    queryRevision: input.queryRevision, minimumRequiredProviders, minimumDependency,
    cachedJevReused: Boolean(row), freshJevRequired: !row,
    cachedParseHash: row ? hash(row.result.parse) : null,
    originalCacheKey: row ? sCacheProof.find(proof => proof.identity.caseId === input.caseId).key : null,
    conditionalDependencies: row?.status === 'PROVIDER_PENDING_OTHER' ? [] : [
      { provider: 'Places', condition: 'Only if accepted interpretation produces a source-owned location requiring application grounding; no model-controlled call.' },
      ...(!row ? [{ provider: 'Luna', condition: 'Only if current deterministic fallbackEligibility permits recovery after Jev. Never infer need from truth labels.' }] : []),
    ],
    deterministicInputObservations: { bookingCandidateCount: candidates.candidates.length,
      candidateGeneratorIssues: candidates.issues.map(issue => issue.code), notSemanticDependencyProof: true },
    dependencyAssessment: row ? 'CACHED_STATE_MINIMUM_PLUS_CONDITIONAL_GROUNDING' : 'JEV_REQUIRED_FUTURE_FALLBACK_AND_GROUNDING_UNKNOWN',
    skipAfterFailure: false })
}
assert.equal(sQueue.length, 109)
assert.equal(sQueue.filter(row => row.minimumDependency === 'Luna').length, 17)
assert.equal(sQueue.filter(row => row.minimumDependency === 'Places').length, 1)
assert.deepEqual(sQueue.filter(row => row.status === 'UNATTEMPTED').map(row => row.caseId), sAudit.unattemptedCaseIds)
const packet = await load('docs/search/s6-development/verifier-input.json')
const s6 = await load('docs/search/s6-development/verifier-package.json')
assert.deepEqual(developmentToolAuditPacket(packet.traces), packet)
assert.equal(packet.traces.length, 32)
assert.ok(packet.traces.every(trace => trace.split === 'DEVELOPMENT_ONLY'))
assert.equal(s6.datasetLabelsIncluded, false)
assert.equal(s6.heldOutIncluded, false)
const { packageHash, ...packageContent } = s6
assert.equal(hash(packageContent), packageHash)
const s6Text = JSON.stringify(s6)
assert.equal(frozen.records.filter(record => record.split === 'HELD_OUT').filter(record => s6Text.includes(record.id)).length, 0)
const lunaSource = await readFile(new URL('backend/services/search/complex/luna.ts', root), 'utf8')
const lunaPrompt = /const instructions = `([\s\S]*?)`/.exec(lunaSource)?.[1]
assert.ok(lunaPrompt && !lunaPrompt.includes('${') && !lunaPrompt.includes('\\'))
const manifest = { version: 'provider-light-resume-manifest-v1', preparedOn: '2026-10-07', scope: 'DEVELOPMENT_ONLY',
  queueFrozenBeforeInference: true, executionContractFrozen: false, finalResponsibilitySelectionMade: false,
  providerAvailability: { LunaNotBeforeUTC: '2026-10-08T03:10:08.833Z', LunaNotBeforeIST: '2026-10-08T08:40:08.833+05:30',
    LunaPreflightAfterWindow: 'ONE_SMALL_REQUEST_MAX_RETRIES_ZERO_STOP_ON_LIMIT',
    Places: 'PLACES_QUOTA_NO_RETRY_TIMESTAMP_DO_NOT_PROBE_UNTIL_RESTORATION_ESTABLISHED' },
  responsibility: { datasetHash: rPlan.datasetHash, criteria: EVIDENCE_CRITERIA_V5_CONFIG, jevConfigHash: rPlan.configHash,
    LunaConfig: RESPONSIBILITY_LUNA_CONFIG, LunaConfigHash: common.lunaConfigHash, LunaSchemaHash: hash(z.toJSONSchema(RESPONSIBILITY_LUNA_SCHEMA)),
    exactOrder: rQueue, orderHash: hash(rQueue),
    priorityCoverage: priorities.map(([name, predicate], index) => ({ priority: index + 1, name,
      existingSuccessful: records.filter(record => completedIds.has(record.id) && predicate(record)).length,
      queuedExclusivePriority: rQueue.filter(row => row.priority === index + 1).length })),
    allCasesRetainedFailuresPreserved: true, consistencyPlan: 'Risk-stratified consistency only after missing-development and coverage gates pass; never adapt the 77-case queue to observed successes.' },
  search: { datasetHash: frozen.datasetHash, splitHash: frozen.splitHash, parserSourceManifestHash: sAudit.sourceManifestHash,
    sourceManifest: sPlan.sourceManifest, JevStageConfigHash: sAudit.configHash, candidateGeneratorVersion: sPlan.candidateGeneratorVersion,
    Luna: { model: LUNA_MODEL, schemaVersion: LUNA_SCHEMA_VERSION, promptHash: digest(lunaPrompt), schemaHash: hash(z.toJSONSchema(lunaOutputSchema)), sourceHash: digest(lunaSource) },
    queue: sQueue, orderHash: hash(sQueue),
    minimumDependencyCounts: { 'Jev only': 91, Places: 1, Luna: 17, 'Jev + Places': 0, 'Jev + Luna': 0, 'Jev + Places + Luna': 0 },
    conditionalPaths: { 'Luna + Places': 'Up to 17 cached pending cases, only after accepted Luna output owns a location',
      'Jev + Places': 'Unattempted input: no eligible fallback, accepted source-owned location',
      'Jev + Luna': 'Unattempted input: eligible fallback, no accepted source-owned location',
      'Jev + Places + Luna': 'Unattempted input: eligible fallback plus accepted source-owned location' },
    fullDependencyCountsKnown: false, unknownFutureDependencyCases: 91,
    dependencyRule: 'Minimum required providers come from cached state; future combined counts remain conditional. No truth labels are used to decide provider orchestration. Freeze source order and conditions before inference.',
    noSuccessfulCurrentConfigInterpretationReruns: true },
  s6: { traceCount: 32, capabilityCount: 12, packetHash: packet.inputPacketHash, packageHash,
    exactTraceOrder: packet.traces.map(trace => trace.id), traceOrderHash: hash(packet.traces.map(trace => trace.id)),
    beforeInferenceFrozen: true, verifierExecuted: false, remaining: 'INFERENCE_PLUS_DISPOSITION_ONLY' },
  integrity: { normalizedEvidenceVerified: 113, V5JevCacheIdentitiesVerified: 193, LunaCacheIdentitiesVerified: 36,
    searchCacheIdentitiesVerified: 131, labelsOrSplitChanged: false, leakageCount: 0,
    verificationScope: 'Frozen hashes, development membership, exact modelInput/evidence, disjoint template families, development-only trace IDs and no held-out IDs in package. No held-out execution or label-based provider routing.',
    directlyInvalidatedProviderCacheEntries: 0, readyForConditionalProviderResume: true },
  callsThisContinuation: { Jev: 0, Places: 0, Luna: 0, heldOut: 0 },
  controls: { SearchRollout: 'OFF', dualShadow: 'OFF', autoAdjudication: 'OFF', productionConsequences: 'OFF',
    Phase9: 'NOT_STARTED', projectWideApplication: 'NOT_STARTED', publicGeneralization: 'NOT_STARTED' } }
manifest.manifestHash = hash(manifest)
const prior = await optionalCache('output/provider-light-2026-10-07/provider-resume-manifest.json')
if (prior) assert.deepEqual(prior, manifest, 'Frozen queue/package must not be silently replaced')
else await writeFile(new URL('provider-resume-manifest.json', out), JSON.stringify(manifest, null, 2) + '\n')
await writeFile(new URL('cache-config-integrity.json', out), JSON.stringify({ ...manifest.integrity,
  responsibilityJevCacheProof: jevCacheProof, responsibilityLunaCacheProof: common.cacheProof,
  searchCacheProof: sCacheProof, manifestHash: manifest.manifestHash }, null, 2) + '\n')
console.log(JSON.stringify({ manifestHash: manifest.manifestHash, responsibilityQueue: rQueue.length,
  firstPriorityIds: rQueue.slice(0, 3).map(row => row.caseId), searchMinimumDependencies: manifest.search.minimumDependencyCounts,
  s6PackageHash: packageHash, integrity: manifest.integrity, calls: manifest.callsThisContinuation }))
