import assert from 'node:assert/strict'
import test from 'node:test'
import { phase81Dataset } from '../benchmarks/responsibility/phase81.js'
import { simulateJevResponsibilityRoute, benchmarkPredictionFromRun, runJevResponsibilityAnalyst } from '../benchmarks/responsibility/benchmark.js'
import { DEFAULT_RESPONSIBILITY_POLICY } from '../services/responsibilityPolicyGate.js'
import { responsibilityBenchmarkRecordSchema, resolveResponsibilityGroundTruth } from '../benchmarks/responsibility/contracts.js'
import { aggregateBenchmarkOperationalStats, classifyBenchmarkDisagreements, scoreResponsibilityBenchmark,
  scoreProbabilityCalibration, aggregateBenchmarkConsistency, checkPredictionInputSeparation } from '../benchmarks/responsibility/metrics.js'

const record = phase81Dataset('development').find(row => row.id === 'driver_cancellation-ordinary_driver_evidence')
const result = { classification: 'DRIVER_CAUSED', severity: 'MODERATE', confidence: 1, evidenceSufficient: true,
  needsHumanReview: false, externalCauseMaterial: false, platformMateriallyContributed: false }
const runGate = (evidence = record.evidence, overrides = {}, policy = DEFAULT_RESPONSIBILITY_POLICY) => simulateJevResponsibilityRoute({ evidence, result: { ...result, ...overrides }, policy })
const failed = (gate, code) => gate.failedGates.find(item => item.code === code)
test('benchmark freshness permits one authoritative fresh sample and rejects missing, unproven and stale samples independently', () => {
  const category = DEFAULT_RESPONSIBILITY_POLICY.cases.DRIVER_CANCELLATION.freshnessRequiredCategories[0]
  const maxAge = DEFAULT_RESPONSIBILITY_POLICY.cases.DRIVER_CANCELLATION.maxAgeMsByCategory[category]
  const change = quality => { const evidence = structuredClone(record.evidence); evidence.timeline.filter(item => item.category === category).forEach(item => { item.quality = quality }); return evidence }
  assert.equal(runGate(change({ fresh: true })).route, 'PROVISIONAL_AUTO_UPHELD')
  assert.equal(runGate(change({ ageMs: maxAge })).route, 'PROVISIONAL_AUTO_UPHELD')
  assert.equal(runGate(change({ ageMs: maxAge + 1 })).route, 'NEEDS_ADMIN_REVIEW')
  const multi = change({ ageMs: maxAge + 1 }); const sample = structuredClone(multi.timeline.find(item => item.category === category))
  sample.id = 'second-fresh-observation'; sample.quality = { fresh: true }; multi.timeline.push(sample)
  assert.equal(runGate(multi).route, 'PROVISIONAL_AUTO_UPHELD')
  const dates = change({}); const item = dates.timeline.find(item => item.category === category)
  item.observedAt = null
  assert.equal(runGate(dates).route, 'NEEDS_ADMIN_REVIEW')
  item.observedAt = record.evidence.occurredAt; item.receivedAt = null
  assert.equal(runGate(dates).route, 'NEEDS_ADMIN_REVIEW')
  item.receivedAt = record.evidence.occurredAt
  assert.equal(runGate(dates).route, 'PROVISIONAL_AUTO_UPHELD')
  const missing = structuredClone(record.evidence); missing.timeline = missing.timeline.filter(item => item.category !== category)
  assert.equal(failed(runGate(missing), 'EVIDENCE_FRESHNESS').detail, `stale-or-unproven:${category}`)
})
test('benchmark availability, missing provenance, derived references and gate audit partition fail closed', () => {
  const required = DEFAULT_RESPONSIBILITY_POLICY.cases.DRIVER_CANCELLATION.requiredCategories[0]
  const unavailable = structuredClone(record.evidence)
  unavailable.timeline.filter(item => item.category === required).forEach(item => { item.availability = 'unavailable' })
  assert.equal(failed(runGate(unavailable), 'REQUIRED_EVIDENCE').detail, `missing:${required}`)
  for (const quality of [{ invalid: true }, { provenance: 'missing' }]) {
    const evidence = structuredClone(record.evidence); evidence.timeline[0].quality = quality
    assert.equal(failed(runGate(evidence), 'EVIDENCE_QUALITY').detail, `invalid:${evidence.timeline[0].id}`)
  }
  const derived = structuredClone(record.evidence)
  derived.timeline[0].basis = 'derived'; derived.timeline[0].derivedFrom = [derived.timeline[1].id, 'invented']
  assert.ok(failed(runGate(derived), 'EVIDENCE_QUALITY'))
  derived.timeline[0].derivedFrom = [derived.timeline[1].id]
  assert.equal(runGate(derived).route, 'PROVISIONAL_AUTO_UPHELD')
  derived.timeline[0].basis = 'observed'
  assert.equal(runGate(derived).route, 'PROVISIONAL_AUTO_UPHELD')
  const unknown = runGate(record.evidence, {}, { policyVersion: 'fixture', cases: {} })
  assert.equal(unknown.failedGates[0].detail, 'unknown-or-disabled')
  assert.equal(unknown.humanReviewRequired, true)
  const contradiction = runGate({ ...record.evidence, contradictions: [{ code: 'unresolved' }] })
  assert.equal(failed(contradiction, 'MATERIAL_CONTRADICTIONS').detail, 'unresolved')
  assert.ok(contradiction.passedGates.every(item => item.pass))
  assert.ok(contradiction.failedGates.every(item => !item.pass))
})
test('no benchmark prediction can convert missing gate or contradictory provider recommendations into operative eligibility', () => {
  const eligible = benchmarkPredictionFromRun({ normalized: result, gate: runGate() })
  assert.equal(eligible.autoUpholdAllowed, true); assert.equal(eligible.autoWaiveAllowed, false)
  assert.equal(eligible.evidenceSufficient, true); assert.equal(eligible.needsReview, false)
  const waived = benchmarkPredictionFromRun({ normalized: { ...result, classification: 'VALID_WAIVED' },
    gate: runGate(record.evidence, { classification: 'VALID_WAIVED' }) })
  assert.equal(waived.autoWaiveAllowed, false); assert.equal(waived.autoUpholdAllowed, false)
  assert.equal(waived.needsReview, true)
  assert.equal(waived.consequenceLevel, 'LEVEL_0')
  for (const run of [null, {}, { normalized: result }, { normalized: null, gate: runGate() }]) {
    const prediction = benchmarkPredictionFromRun(run)
    assert.equal(prediction.autoUpholdAllowed, false); assert.equal(prediction.needsReview, true)
    assert.equal(prediction.evidenceSufficient, false)
  }
  const low = benchmarkPredictionFromRun({ normalized: { ...result, severity: 'LOW' }, gate: runGate() })
  assert.equal(low.consequenceLevel, 'LEVEL_1')
  const highReview = benchmarkPredictionFromRun({ normalized: { ...result, severity: 'HIGH' }, gate: runGate(record.evidence, { severity: 'HIGH' }) })
  assert.equal(highReview.consequenceLevel, 'LEVEL_2'); assert.equal(highReview.autoUpholdAllowed, false)
})
test('redacted provider failures preserve category without retaining secret fragments or unbounded messages', async () => {
  const envelope = async error => runJevResponsibilityAnalyst(record.evidence, { adapter: { provider: 'fake', model: 'fake', analyzeResponsibilityCase: async () => { throw error } } })
  const secret = await envelope(new Error(`Bearer   token-secret sk-fake-secret ${'x'.repeat(400)}`))
  assert.equal(secret.error.length, 240); assert.equal(secret.error.includes('token-secret'), false); assert.equal(secret.error.includes('fake-secret'), false)
  assert.ok(secret.error.startsWith('[redacted] [redacted]'))
  assert.equal((await envelope({ message: 'timeout' })).errorCategory, 'PROVIDER')
  assert.equal((await envelope(new Error('network outage'))).errorCategory, 'PROVIDER')
  assert.equal((await envelope(new Error('JEV_ANSWER_INVALID'))).errorCategory, 'SCHEMA')
})
test('ground truth hash anchors and null-candidate filtering do not accept evidence drift', () => {
  for (const hash of [`x${record.evidenceHash}`, `${record.evidenceHash}x`]) assert.equal(responsibilityBenchmarkRecordSchema.safeParse({ ...record, evidenceHash: hash }).success, false)
  assert.deepEqual(resolveResponsibilityGroundTruth([null, false, record.label, undefined]), record.label)
})
test('false waiver and contradiction metrics independently detect review/evidence failures and safe unknown labels', () => {
  const label = { ...record.label, responsibility: 'PLATFORM_CAUSED', autoWaiveAllowed: false, autoUpholdAllowed: false, needsReview: true,
    contradictionCritical: true, requiredMissingEvidence: ['notification'], evidenceSufficient: false }
  const prediction = { responsibility: 'PLATFORM_CAUSED', autoWaiveAllowed: true, autoUpholdAllowed: false, needsReview: true, evidenceSufficient: false, consequenceLevel: 'LEVEL_0' }
  assert.equal(scoreResponsibilityBenchmark([{ label, prediction }]).safety.falseAutoWaive, 1)
  const driver = { ...label, responsibility: 'DRIVER_CAUSED', autoWaiveAllowed: null }
  assert.equal(scoreResponsibilityBenchmark([{ label: driver, prediction }]).safety.falseAutoWaive, 1)
  const safe = scoreResponsibilityBenchmark([{ label, prediction: { ...prediction, autoWaiveAllowed: false } }])
  assert.equal(safe.safety.contradictionSafety, 0); assert.equal(safe.safety.missingEvidenceSafety, 0)
  assert.equal(checkPredictionInputSeparation({ modelInput: { evidence: ['__BENCHMARK_LABEL_SENTINEL__'] } }), false)
  assert.equal(checkPredictionInputSeparation({ modelInput: { evidence: [{ safe: true }, { label: 'DRIVER_CAUSED' }] } }), false)
  assert.equal(checkPredictionInputSeparation({ modelInput: { evidence: ['__BENCHMARK_LABEL_SENTINEL__', { safe: true }] } }), false)
})
test('empty operation statistics, ordered calibration buckets and missing consistency identity are explicit', () => {
  const empty = aggregateBenchmarkOperationalStats([])
  assert.equal(empty.latencyMs.mean, 0); assert.equal(empty.latencyMs.p50, 0); assert.equal(empty.latencyMs.p95, 0)
  assert.ok(Object.values(empty.usage).every(field => field.mean === 0))
  const label = { ...record.label, responsibility: 'DRIVER_CAUSED' }
  const row = probabilities => ({ label, predictedResponsibility: 'DRIVER_CAUSED', probabilities })
  const calibration = scoreProbabilityCalibration([row({ DRIVER_CAUSED: .9, PLATFORM_CAUSED: .1 }), row({ DRIVER_CAUSED: .1, PLATFORM_CAUSED: .9 }),
    row({ DRIVER_CAUSED: 0, PLATFORM_CAUSED: 1 }), row({ DRIVER_CAUSED: -1, PLATFORM_CAUSED: 2 })])
  assert.equal(calibration.count, 3)
  assert.equal(scoreProbabilityCalibration([row({ DRIVER_CAUSED: -.1, PLATFORM_CAUSED: .5, VALID_WAIVED: .3, EXTERNAL_OR_UNCERTAIN: .3 })]).count, 0)
  assert.equal(scoreProbabilityCalibration([row({ DRIVER_CAUSED: 1.0000001, PLATFORM_CAUSED: 0 })]).count, 0)
  assert.deepEqual(calibration.buckets.map(bucket => bucket.bucket), [0, 1, 9])
  assert.equal(aggregateBenchmarkConsistency([{ id: '' }, { id: 42 }, {}]).groupCount, 0)
  const matrix = classifyBenchmarkDisagreements([{ id: 'x', label, existingPrediction: { responsibility: 'PLATFORM_CAUSED', consequenceLevel: 'LEVEL_0' }, jevPrediction: { responsibility: 'EXTERNAL_OR_UNCERTAIN', consequenceLevel: 'LEVEL_2' } },
    { id: 'ignored', label: { ...label, source: 'UNLABELED' }, existingPrediction: {}, jevPrediction: {} }])
  assert.deepEqual(matrix.bothWrong, ['x']); assert.deepEqual(matrix.bothCorrectSeverityDisagreement, [])
  const singleCorrect = classifyBenchmarkDisagreements([{ id: 'one-correct', label,
    existingPrediction: { responsibility: 'DRIVER_CAUSED', consequenceLevel: 'LEVEL_1' },
    jevPrediction: { responsibility: 'PLATFORM_CAUSED', consequenceLevel: 'LEVEL_2' } }])
  assert.deepEqual(singleCorrect.bothCorrectSeverityDisagreement, [])
  const distinctLevels = aggregateBenchmarkConsistency([{ id: 'severity', prediction: { responsibility: 'DRIVER_CAUSED', consequenceLevel: 'LEVEL_1' } },
    { id: 'severity', prediction: { responsibility: 'DRIVER_CAUSED', consequenceLevel: 'LEVEL_2' } }])
  assert.equal(distinctLevels.consistencyRate, 0)
})
