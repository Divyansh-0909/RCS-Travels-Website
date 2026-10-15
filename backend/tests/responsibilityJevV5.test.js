import test from 'node:test'
import assert from 'node:assert/strict'
import { createJevV5ResponsibilityAnalyst, jevV5AnalysisEnvelope, JEV_V5_EXECUTION_VERSION } from '../services/responsibilityJevV5.js'
import { EVIDENCE_CRITERIA_V5_CONFIG, evidenceCriteriaV5Questions } from '../benchmarks/responsibility/evidenceCriteriaV5.js'
import { phase81DevelopmentDataset } from '../benchmarks/responsibility/phase81Development.js'
import { normalizeEvidenceAware } from '../benchmarks/responsibility/evidenceAwareSeverity.js'
import { responsibilityEvidenceHash, validateAnalysisAgainstEvidence } from '../services/responsibilityAnalyst.js'
import { evaluateResponsibilityPolicy, responsibilityEvaluationKey, DEFAULT_RESPONSIBILITY_POLICY } from '../services/responsibilityPolicyGate.js'
const records = phase81DevelopmentDataset()
const evidence = records.find(record => record.id === 'driver_cancellation-ordinary_driver_evidence').evidence
function response(classification = 'DRIVER_CAUSED') {
  const answers = Object.fromEntries(Object.keys(evidenceCriteriaV5Questions()).map(key => [key, { choice: 'NO', confidence: 0.97 }]))
  answers.responsibility.choice = classification
  answers.evidenceSufficient.choice = 'YES'
  answers.ordinaryDriverFailure.choice = classification === 'DRIVER_CAUSED' ? 'YES' : 'NO'
  answers.platformMateriallyContributed.choice = classification === 'PLATFORM_CAUSED' ? 'YES' : 'NO'
  return { model: 'jev-1.13.0', answers, usage: { input_tokens: 20, output_tokens: 8 } }
}
const run = () => normalizeEvidenceAware(response(), evidence)
function gate(bundle, envelope) {
  const evidenceHash = responsibilityEvidenceHash(bundle)
  return evaluateResponsibilityPolicy({ evidence: bundle, analysisEnvelope: envelope, evidenceHash,
    currentState: 'POLICY_EVALUATION', idempotencyKey: responsibilityEvaluationKey({ caseId: bundle.caseId,
      evidenceHash, analysisId: envelope.analysisId, policyVersion: DEFAULT_RESPONSIBILITY_POLICY.policyVersion }) })
}
test('V5 production adapter preserves exact frozen request and existing analyst interface', async () => {
  let calls = 0
  const analyst = createJevV5ResponsibilityAnalyst({ client: { async systemOne(request, options) {
    calls++
    assert.deepEqual(request, { model: 'jev-latest', state: evidence, questions: evidenceCriteriaV5Questions() })
    assert.deepEqual(options, { timeout: 60000, retry: { maxRetries: 0 } })
    return response()
  } } })
  assert.equal(analyst.provider, 'typesafe-ai')
  assert.equal(analyst.model, EVIDENCE_CRITERIA_V5_CONFIG.model)
  assert.equal(analyst.configVersion, EVIDENCE_CRITERIA_V5_CONFIG.version)
  const envelope = await analyst.analyzeResponsibilityCase(evidence)
  assert.equal(calls, 1)
  assert.equal(envelope.provider, 'typesafe-ai')
  assert.equal(envelope.model, 'jev-1.13.0')
  assert.equal(envelope.contractVersion, 'responsibility-analysis-v1')
  assert.equal(envelope.output.caseId, evidence.caseId)
  assert.equal(envelope.output.confidence, 0.97)
  assert.equal(envelope.output.suggestedClassification, 'DRIVER_CAUSED')
  assert.equal(envelope.output.severityAssessment, 'MODERATE')
  assert.equal(envelope.output.suggestedActionCategory, 'AUTO_UPHOLD_CANDIDATE')
  assert.equal(validateAnalysisAgainstEvidence(evidence, envelope).valid, true)
  assert.equal(gate(evidence, envelope).route, 'PROVISIONAL_AUTO_UPHELD')
  for (const field of ['factsSupporting', 'factsAgainst', 'inferences', 'contradictions', 'missingEvidence']) assert.deepEqual(envelope.output[field], [])
  assert.equal(envelope.output.explanationSummary, 'Bounded Jev V5 categorical recommendation. No freeform facts or citations were returned; independent evidence and policy checks determine eligibility.')
  assert.equal(JEV_V5_EXECUTION_VERSION, 'responsibility-jev-v5-production-envelope-v1')
})
test('all V5 model vetoes remain review vetoes in the production envelope', () => {
  for (const modify of [value => { value.normalized.evidenceSufficient = false },
    value => { value.normalized.needsHumanReview = true }, value => { value.normalized.externalCauseMaterial = true },
    value => { value.raw.decisions.aggravatingEvidencePresent = 'YES' }, value => { value.normalized.platformMateriallyContributed = true }]) {
    const value = run()
    modify(value)
    const envelope = jevV5AnalysisEnvelope(evidence, value)
    assert.equal(envelope.output.suggestedActionCategory, 'ADMIN_REVIEW')
    assert.equal(gate(evidence, envelope).route, 'NEEDS_ADMIN_REVIEW')
  }
  const platform = normalizeEvidenceAware(response('PLATFORM_CAUSED'), evidence)
  platform.normalized.platformMateriallyContributed = false
  assert.equal(jevV5AnalysisEnvelope(evidence, platform).output.suggestedActionCategory, 'ADMIN_REVIEW')
})
test('safe platform/waived recommendations and unresolved classifications retain exact action mapping', () => {
  for (const classification of ['PLATFORM_CAUSED', 'VALID_WAIVED', 'EXTERNAL_OR_UNCERTAIN']) {
    const value = normalizeEvidenceAware(response(classification), evidence)
    assert.equal(jevV5AnalysisEnvelope(evidence, value).output.suggestedActionCategory,
      classification === 'EXTERNAL_OR_UNCERTAIN' ? 'ADMIN_REVIEW' : 'AUTO_WAIVE_CANDIDATE')
  }
  const unknown = run()
  unknown.normalized.classification = 'INVENTED'
  assert.throws(() => jevV5AnalysisEnvelope(evidence, unknown))
})
test('analysis identity binds evidence, raw categorical output, execution version and question configuration', () => {
  const value = run(), original = jevV5AnalysisEnvelope(evidence, value)
  assert.equal(jevV5AnalysisEnvelope(evidence, structuredClone(value)).analysisId, original.analysisId)
  const changedRaw = structuredClone(value)
  changedRaw.raw.confidences.responsibility = 0.96
  assert.notEqual(jevV5AnalysisEnvelope(evidence, changedRaw).analysisId, original.analysisId)
  const changedEvidence = structuredClone(evidence)
  changedEvidence.bookingId = 'other-booking'
  assert.notEqual(jevV5AnalysisEnvelope(changedEvidence, value).analysisId, original.analysisId)
})
test('malformed evidence is rejected before any model call and provider failures are preserved', async () => {
  let calls = 0
  const failure = new Error('fixture-provider-failure')
  const analyst = createJevV5ResponsibilityAnalyst({ client: { async systemOne() { calls++; throw failure } } })
  await assert.rejects(analyst.analyzeResponsibilityCase({}), /Invalid input/)
  assert.equal(calls, 0)
  await assert.rejects(analyst.analyzeResponsibilityCase(evidence), error => error === failure)
  assert.equal(calls, 1)
})
