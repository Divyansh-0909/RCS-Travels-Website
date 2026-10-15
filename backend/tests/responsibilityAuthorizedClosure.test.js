import test from 'node:test'
import assert from 'node:assert/strict'
import { phase81DevelopmentDataset, phase81WaiverDevelopmentDataset, phase81DevelopmentHash } from '../benchmarks/responsibility/phase81Development.js'
import { createEvidenceCriteriaV3Adapter, EVIDENCE_CRITERIA_V3_CONFIG } from '../benchmarks/responsibility/evidenceCriteriaV3.js'
import { createEvidenceCriteriaV2Adapter, EVIDENCE_CRITERIA_V2_CONFIG } from '../benchmarks/responsibility/evidenceCriteriaV2.js'
import { applyDevelopmentSeverityGuard } from '../benchmarks/responsibility/developmentSeverityGate.js'
import { nextDevelopmentCacheIdentity, reusableLunaDevelopmentEntry } from '../benchmarks/responsibility/developmentCache.js'
import { benchmarkCacheKey } from '../benchmarks/common/cache.js'
import { safeRateLimitDetail, pacedDevelopmentProvider } from '../benchmarks/responsibility/pacedDevelopment.js'

test('development fixture lineage is independent of inference and retains the exact approved comparison cohort', () => {
  const records = [...phase81DevelopmentDataset(), ...phase81WaiverDevelopmentDataset()]
  assert.equal(records.length, 113)
  assert.equal(phase81DevelopmentHash(records), '981f6717b9a549a7b653d8dbcde6fdf3cea8f2151a9e76baac534d92dab1120c')
})
test('v3 changes only review/aggravation criteria and keeps the same normalization, guard and finite provider boundary', async () => {
  const requests = []; const client = { async systemOne(request, options) {
    requests.push(request); assert.deepEqual(options, { timeout: 60000, retry: { maxRetries: 0 } })
    return { model: 'test', answers: Object.fromEntries(Object.keys(request.questions).map(key => [key,
      { choice: key === 'responsibility' ? 'PLATFORM_CAUSED' : ['evidenceSufficient','platformMateriallyContributed','needsHumanReview'].includes(key) ? 'YES' : 'NO', confidence: 0.9 }])) }
  } }
  const evidence = { contradictions: [] }
  const v2 = await createEvidenceCriteriaV2Adapter({ client }).analyzeResponsibilityCase(evidence)
  const adapter = createEvidenceCriteriaV3Adapter({ client }); const v3 = await adapter.analyzeResponsibilityCase(evidence)
  assert.deepEqual(v3, v2); assert.equal(requests[1].state, evidence)
  for (const key of Object.keys(requests[0].questions)) if (!['needsHumanReview','aggravatingEvidencePresent'].includes(key)) assert.deepEqual(requests[0].questions[key], requests[1].questions[key])
  assert.notEqual(EVIDENCE_CRITERIA_V2_CONFIG.questionsHash, EVIDENCE_CRITERIA_V3_CONFIG.questionsHash)
  assert.equal(EVIDENCE_CRITERIA_V3_CONFIG.questionsHash, 'c56460cafe307ea886187fd213d6a89ef0ad363734210ba3f6ddffa3e9cada1d')
  assert.equal(adapter.configVersion, 'responsibility-evidence-criteria-development-v3'); assert.equal(adapter.provider, 'typesafe-ai'); assert.equal(adapter.model, 'jev-latest')
  assert.equal(EVIDENCE_CRITERIA_V3_CONFIG.status, 'DEVELOPMENT_ONLY_NOT_FROZEN')
  assert.equal(EVIDENCE_CRITERIA_V3_CONFIG.guardChanged, false); assert.equal(EVIDENCE_CRITERIA_V3_CONFIG.productionChanged, false)
})
test('the factual guard does not treat generic affirmative data as corroborated serious conduct', () => {
  const record = phase81DevelopmentDataset().find(r => r.id === 'driver_cancellation-ordinary_driver_evidence')
  const run = { raw: { decisions: { aggravatingEvidencePresent: 'NO' } }, gate: { route: 'PROVISIONAL_AUTO_UPHELD', failedGates: [] } }
  assert.equal(applyDevelopmentSeverityGuard(run, record.evidence).gate.route, 'PROVISIONAL_AUTO_UPHELD')
  assert.equal(run.gate.failedGates.length, 0)
  for (const facts of [{ driverAcknowledgedAvoidingPickupForPersonalErrand: true, driverAuthenticatedDisableDispatch: false },
    { driverAuthenticatedDisableDispatch: true, driverAcknowledgedAvoidingPickupForPersonalErrand: false },
    { secondOverlappingBookingAccepted: true, driverAcknowledgedIncompatibleTimes: false }]) {
    const partial = structuredClone(record.evidence); partial.timeline[0].value = facts
    assert.equal(applyDevelopmentSeverityGuard(run, partial).gate.route, 'PROVISIONAL_AUTO_UPHELD')
  }
})
test('cached success requires the complete domain identity, successful normalized output and exact Luna model', () => {
  const identity = { domain: 'responsibility', datasetHash: 'd', caseId: 'c', inputHash: 'e', provider: 'openai', model: 'gpt-6-luna', configHash: 'p', runNumber: 1 }
  const entry = value => ({ identity, key: benchmarkCacheKey(identity), value })
  const record = { id: 'c', evidenceHash: 'e' }
  for (const value of [{ error: 'timeout', normalized: {} }, { normalized: null }, {}, { normalized: {} }]) {
    const found = reusableLunaDevelopmentEntry([entry(value)], record, 'p', ['d'])
    assert.equal(found, undefined)
  }
  const good = entry({ normalized: {}, raw: { model: 'gpt-6-luna' } })
  assert.equal(reusableLunaDevelopmentEntry([good], record, 'p', ['d']), good)
  assert.equal(nextDevelopmentCacheIdentity([{ identity: undefined }], identity).cacheHit, false)
  for (const field of ['domain','datasetHash','caseId','inputHash','provider','model','configHash']) {
    const other = { ...identity, [field]: 'other' }; assert.equal(nextDevelopmentCacheIdentity([{ ...good, identity: other }], identity).cacheHit, false)
  }
})
test('provider retry timing preserves zero, absent and date headers; excessive server delays halt subsequent calls', async () => {
  const error = headers => ({ name: 'RateLimitError', status: 429, message: 'tokens per minute TPM Limit:  100000', headers })
  assert.deepEqual(safeRateLimitDetail(error({ 'retry-after': '0' }), 0), { category: 'RATE_LIMIT', axis: 'TPM', limit: 100000, retryAfterMs: 0 })
  assert.equal(safeRateLimitDetail(error({}), 0).retryAfterMs, null)
  assert.equal(safeRateLimitDetail(error({ 'retry-after': 'Thu, 01 Jan 1970 00:00:01 GMT' }), 0).retryAfterMs, 1000)
  let calls = 0
  const provider = pacedDevelopmentProvider({ analyzeResponsibilityCase: async () => { calls++; throw error({ 'retry-after': '61' }) } },
    { requestLimit: 3, minIntervalMs: 0, maxDelayMs: 60000, now: () => 0, random: () => 0, wait: async () => {} })
  await assert.rejects(provider.analyzeResponsibilityCase({}), /RESPONSIBILITY_PROVIDER_DEFERRED/)
  await assert.rejects(provider.analyzeResponsibilityCase({}), /RESPONSIBILITY_PROVIDER_PAUSED:SERVER_DELAY_EXCEEDS_BUDGET/)
  assert.equal(calls, 1)
})
