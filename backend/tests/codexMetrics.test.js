import test from 'node:test'
import assert from 'node:assert/strict'
import { phase81DevelopmentDataset } from '../benchmarks/responsibility/phase81Development.js'
import { guardedCodexResponsibility } from '../benchmarks/codex/responsibility.js'
import { codexConsistency, compareCodexDevelopment, scoreCodexCohort, unsafeGuardedCount } from '../benchmarks/codex/metrics.js'
import { output } from './helpers/codexFixtures.js'

const record = phase81DevelopmentDataset().find(row => row.id === 'driver_cancellation-missing_provenance')
const makeRow = () => ({ id: record.id, label: record.label, results: { codex: guardedCodexResponsibility({
  output, model: 'gpt-6-luna', usage: { inputTokens: 100, outputTokens: 40, requestCount: 1 }, latencyMs: 5,
}, record.evidence) } })
const consistencyReceipt = () => ({ results: Array.from({ length: 5 }, (_, index) => ({
  identity: { caseId: record.id, observation: index + 1, backendId: 'luna-codex', configHash: 'frozen-fixture' },
  result: { success: true, guardedRun: makeRow().results.codex },
})) })

test('Codex comparison reports unmeasured cohorts when no model output exists', () => {
  const empty = compareCodexDevelopment([], [], [])
  assert.equal(empty.codexComplete, 0); assert.equal(empty.totalDevelopment, 113)
  assert.equal(empty.cohortA.full113, false); assert.equal(empty.cohortA.scores.codex, null)
  assert.equal(empty.cohortB.scores.luna, null)
  assert.deepEqual(empty.cohortB.classificationAgreement, { numerator: 0, denominator: 0, value: null })
  assert.equal(empty.originalApiComparisonGate, 'STILL_REQUIRED'); assert.equal(empty.selectedProductionCandidate, 'NONE')
  assert.equal(empty.heldOutExecuted, false)
  assert.equal(empty.cohortB.selectionBias, 'API_AVAILABLE_SUBSET_NOT_REPRESENTATIVE_OF_FULL113')
  assert.equal(empty.executionDifferences, 'KNOWN_DIFFERENT_CONFIG_AND_EXECUTION_SURFACES; CAUSAL_ATTRIBUTION_OF_OUTPUT_DIFFERENCES_UNMEASURED')
})
test('Codex partial metrics retain safety denominators, raw and guarded results and measured operations', () => {
  const row = makeRow(), result = scoreCodexCohort([row], 'codex')
  assert.equal(result.cases, 1); assert.equal(result.guardedUnsafeOutcomes, 0)
  assert.equal(result.canonicalRawAndGated.raw.responsibilityAccuracy.numerator, 1)
  assert.equal(result.canonicalRawAndGated.gated.reviewRecall.numerator, 1)
  assert.deepEqual(result.safeWaive, { predicted: 0, eligible: 0, correct: 0, precision: null, recall: null })
  assert.deepEqual(result.evidenceSufficiency, { falsePositives: 0, falseNegatives: 0, caseIds: [] })
  assert.deepEqual(result.safetyCoverage, { missingEvidence: 1, criticalContradictions: 0, zeroDenominatorIsUnmeasured: true })
  assert.ok(result.classified); assert.ok(result.operations)
  assert.equal(result.classified.overall.accuracy, 1); assert.equal(result.classified.macroF1, 0.25)
  assert.deepEqual(result.classified.perClass.EXTERNAL_OR_UNCERTAIN, { precision: 1, recall: 1, f1: 1 })
  assert.deepEqual(result.operations, { count: 1, latencyMs: { mean: 5, p50: 5, p95: 5, p99: null, count: 1 },
    usage: { inputTokens: { total: 100, mean: 100, count: 1 }, outputTokens: { total: 40, mean: 40, count: 1 },
      totalTokens: { total: 0, mean: 0, count: 0 }, requestCount: { total: 1, mean: 1, count: 1 } } })
  assert.equal(result.cost, 'NOT_COMPARABLE_NO_AUTHORITATIVE_PRICE_SCHEDULE')
  const falsePositive = structuredClone(row); falsePositive.results.codex.normalized.evidenceSufficient = true
  assert.equal(scoreCodexCohort([falsePositive], 'codex').evidenceSufficiency.falsePositives, 1)
  const falseNegative = structuredClone(row); falseNegative.label.evidenceSufficient = true
  assert.equal(scoreCodexCohort([falseNegative], 'codex').evidenceSufficiency.falseNegatives, 1)
  falsePositive.id = 'fp-fixture'; falseNegative.id = 'fn-fixture'
  assert.deepEqual(scoreCodexCohort([falsePositive, falseNegative], 'codex').evidenceSufficiency,
    { falsePositives: 1, falseNegatives: 1, caseIds: ['fp-fixture', 'fn-fixture'] })
  const conflict = structuredClone(row); conflict.label.requiredMissingEvidence = []; conflict.label.contradictionCritical = true
  assert.deepEqual(scoreCodexCohort([row, conflict], 'codex').safetyCoverage,
    { missingEvidence: 1, criticalContradictions: 1, zeroDenominatorIsUnmeasured: true })
})
test('Codex metrics count every unsafe guarded outcome without double-counting a case', () => {
  for (const route of ['PROVISIONAL_AUTO_UPHELD', 'PROVISIONAL_AUTO_WAIVED', 'unknown']) {
    const row = makeRow(); row.results.codex.gate.route = route
    assert.equal(unsafeGuardedCount([row], 'codex'), 1)
  }
  const waived = makeRow(); waived.results.codex.gate.route = 'PROVISIONAL_AUTO_WAIVED'
  waived.label = { ...waived.label, autoWaiveAllowed: true, needsReview: false }
  assert.deepEqual(scoreCodexCohort([waived], 'codex').safeWaive, { predicted: 1, eligible: 1, correct: 1, precision: 1, recall: 1 })
  assert.equal(unsafeGuardedCount([waived], 'codex'), 0)
  const upheld = structuredClone(waived); upheld.results.codex.gate.route = 'PROVISIONAL_AUTO_UPHELD'
  upheld.label.autoUpholdAllowed = true
  assert.equal(unsafeGuardedCount([upheld], 'codex'), 0)
  for (const route of ['PROVISIONAL_AUTO_UPHELD', 'PROVISIONAL_AUTO_WAIVED']) {
    const wrong = makeRow(); wrong.label = { ...wrong.label, needsReview: false }
    wrong.results.codex.gate.route = route
    assert.equal(unsafeGuardedCount([wrong], 'codex'), 1)
  }
  const distribution = Array.from({ length: 5 }, (_, index) => {
    const item = makeRow(); item.id = `waive-fixture-${index}`
    item.label = { ...item.label, needsReview: false, autoWaiveAllowed: index < 4 }
    if ([0, 1, 4].includes(index)) item.results.codex.gate.route = 'PROVISIONAL_AUTO_WAIVED'
    return item
  })
  assert.deepEqual(scoreCodexCohort(distribution, 'codex').safeWaive, { predicted: 3, eligible: 4, correct: 2, precision: 2 / 3, recall: 0.5 })
})
test('Codex comparison joins only identical inputs/labels and reports API agreement on exact overlap', () => {
  const row = makeRow(), v5 = { ...row, results: { criteriaV5: row.results.codex } }, api = { ...row, results: { luna: row.results.codex } }
  const comparison = compareCodexDevelopment([row], [v5], [api])
  assert.equal(comparison.cohortA.cases, 1); assert.equal(comparison.cohortB.cases, 1)
  assert.deepEqual(comparison.cohortB.classificationAgreement, { numerator: 1, denominator: 1, value: 1 })
  assert.equal(compareCodexDevelopment([row], [v5], []).cohortB.cases, 0)
  const disagreement = structuredClone(api); disagreement.results.luna.normalized.classification = 'DRIVER_CAUSED'
  assert.equal(compareCodexDevelopment([row], [v5], [disagreement]).cohortB.classificationAgreement.numerator, 0)
  assert.throws(() => compareCodexDevelopment([row, row], [v5], [api]), { message: 'CODEX_DUPLICATE_CASE' })
  assert.throws(() => compareCodexDevelopment([row], [], []), { message: 'CODEX_COMPARISON_INPUT_MISMATCH' })
  for (const original of [v5, api]) {
    const changed = structuredClone(original); changed.label.needsReview = !changed.label.needsReview
    assert.throws(() => compareCodexDevelopment([row], [original === v5 ? changed : v5], [original === api ? changed : api]), { message: 'CODEX_COMPARISON_INPUT_MISMATCH' })
    const wrong = structuredClone(original)
    Object.values(wrong.results)[0].developmentGuard.evidenceHash = 'wrong input'
    assert.throws(() => compareCodexDevelopment([row], [original === v5 ? wrong : v5], [original === api ? wrong : api]), { message: 'CODEX_COMPARISON_INPUT_MISMATCH' })
  }
  const full = Array.from({ length: 113 }, (_, index) => ({ ...row, id: `fixture-development-${index}` }))
  const existing = full.map(item => ({ ...item, results: { criteriaV5: item.results.codex } }))
  assert.equal(compareCodexDevelopment(full, existing, []).cohortA.full113, true)
  const cohort = full.slice(0, 3), baselines = existing.slice(0, 3)
  const apiSubset = cohort.map((item, index) => {
    const run = structuredClone(item.results.codex)
    if (index !== 0) run.normalized.classification = 'DRIVER_CAUSED'
    return { ...item, results: { luna: run } }
  })
  assert.deepEqual(compareCodexDevelopment(cohort, baselines, apiSubset).cohortB.classificationAgreement,
    { numerator: 1, denominator: 3, value: 1 / 3 })
})
test('Codex consistency records changed fields and exact observations without majority voting', () => {
  const receipt = consistencyReceipt(), stable = codexConsistency(receipt, [record.id])
  assert.deepEqual(stable, { status: 'PASS', cases: 1, observations: 5, unstable: [], majorityVotingApplied: false })
  const second = receipt.results[1].result.guardedRun
  second.normalized.classification = 'DRIVER_CAUSED'; second.normalized.severity = 'HIGH'
  second.normalized.evidenceSufficient = true; second.normalized.needsHumanReview = false
  second.gate.route = 'PROVISIONAL_AUTO_UPHELD'
  const third = receipt.results[2].result.guardedRun; third.gate.route = 'PROVISIONAL_AUTO_WAIVED'
  const failed = codexConsistency(receipt, [record.id])
  assert.equal(failed.status, 'FAIL'); assert.equal(failed.unstable[0].caseId, record.id)
  assert.deepEqual(failed.unstable[0].fields, ['classification', 'severity', 'evidenceSufficiency', 'review', 'route', 'safeUphold', 'safeWaive'])
  assert.deepEqual(failed.unstable[0].observations.classification[1], { observation: 2, value: 'DRIVER_CAUSED' })
  assert.deepEqual(failed.unstable[0].observations.severity[1], { observation: 2, value: 'HIGH' })
  assert.deepEqual(failed.unstable[0].observations.evidenceSufficiency[1], { observation: 2, value: true })
  assert.deepEqual(failed.unstable[0].observations.review[1], { observation: 2, value: false })
  assert.deepEqual(failed.unstable[0].observations.route[1], { observation: 2, value: 'PROVISIONAL_AUTO_UPHELD' })
  assert.deepEqual(failed.unstable[0].observations.safeUphold[1], { observation: 2, value: true })
  assert.deepEqual(failed.unstable[0].observations.safeWaive[2], { observation: 3, value: true })
  assert.equal(failed.unstable[0].observations.safeUphold[0].value, false)
  assert.equal(failed.unstable[0].observations.safeWaive[0].value, false)
})
test('Codex consistency cannot pass with missing repeats, API reuse, mixed configs or wrong observation identities', () => {
  assert.equal(codexConsistency({ results: [] }, []).status, 'INCOMPLETE')
  assert.equal(codexConsistency(consistencyReceipt(), [record.id, record.id]).status, 'INCOMPLETE')
  const partial = consistencyReceipt(); partial.results.pop()
  assert.equal(codexConsistency(partial, [record.id]).status, 'INCOMPLETE')
  const withForeign = consistencyReceipt()
  withForeign.results.push(...consistencyReceipt().results.map(row => ({ ...row, identity: { ...row.identity, caseId: 'foreign' } })))
  assert.equal(codexConsistency(withForeign, [record.id]).status, 'INCOMPLETE')
  assert.equal(codexConsistency(withForeign, [record.id, record.id]).status, 'INCOMPLETE')
  const reversed = consistencyReceipt(); reversed.results.reverse()
  assert.equal(codexConsistency(reversed, [record.id]).status, 'PASS')
  for (const [field, value] of [['backendId', 'luna-api'], ['observation', 6], ['caseId', 'foreign'], ['configHash', 'other']]) {
    const receipt = consistencyReceipt(); receipt.results[0].identity[field] = value
    assert.equal(codexConsistency(receipt, [record.id]).status, 'INCOMPLETE')
  }
  const failure = consistencyReceipt(); failure.results[0].result.success = false
  assert.equal(codexConsistency(failure, [record.id]).status, 'INCOMPLETE')
})
