import test from 'node:test'
import assert from 'node:assert/strict'
import { createEvidenceAwareSeverityAdapter, normalizeEvidenceAware, EVIDENCE_AWARE_SEVERITY_CONFIG } from '../benchmarks/responsibility/evidenceAwareSeverity.js'
const evidence = { contradictions: [] }
const response = overrides => ({ model: 'jev1.13.0', answers: Object.fromEntries(Object.entries({ responsibility: 'DRIVER_CAUSED',
  evidenceSufficient: 'YES', platformMateriallyContributed: 'NO', externalCauseMaterial: 'NO', needsHumanReview: 'NO',
  seriousReliabilityFailure: 'NO', aggravatingEvidencePresent: 'NO', ordinaryDriverFailure: 'YES', ...overrides })
  .map(([key, choice]) => [key, { choice, confidence: 0.91 }])) })
test('categorical evidence-aware severity does not infer Level 2 from ordinary failure; both affirmative predicates required', () => {
  assert.equal(normalizeEvidenceAware(response(), evidence).normalized.severity, 'MODERATE')
  for (const predicates of [{ seriousReliabilityFailure: 'YES' }, { aggravatingEvidencePresent: 'YES' }, { aggravatingEvidencePresent: 'UNCLEAR' }]) {
    const result = normalizeEvidenceAware(response(predicates), evidence)
    assert.equal(result.normalized.severity, 'MODERATE'); assert.equal(result.normalized.level2AutomationEligible, false)
  }
  const result = normalizeEvidenceAware(response({ seriousReliabilityFailure: 'YES', aggravatingEvidencePresent: 'YES' }), evidence)
  assert.equal(result.raw.rawSeverity, 'HIGH'); assert.equal(result.normalized.level2AutomationEligible, true)
})
test('raw high judgment is retained while non-driver, review, missing evidence, platform/external cause and contradictions prevent automated Level 2', () => {
  for (const overrides of [{ responsibility: 'PLATFORM_CAUSED' }, { responsibility: 'VALID_WAIVED' }, { responsibility: 'EXTERNAL_OR_UNCERTAIN' },
    { needsHumanReview: 'YES' }, { evidenceSufficient: 'NO' }, { platformMateriallyContributed: 'YES' }, { externalCauseMaterial: 'YES' },
    { ordinaryDriverFailure: 'UNCLEAR' }]) {
    const result = normalizeEvidenceAware(response({ seriousReliabilityFailure: 'YES', aggravatingEvidencePresent: 'YES', ...overrides }), evidence)
    assert.equal(result.raw.rawSeverity, 'HIGH'); assert.equal(result.normalized.level2AutomationEligible, false)
    if (overrides.responsibility) assert.equal(result.normalized.severity, 'LOW')
  }
  assert.equal(normalizeEvidenceAware(response({ seriousReliabilityFailure: 'YES', aggravatingEvidencePresent: 'YES' }),
    { contradictions: [{}] }).normalized.level2AutomationEligible, false)
  assert.equal(normalizeEvidenceAware(response({ ordinaryDriverFailure: 'NO' }), evidence).normalized.needsHumanReview, true)
})
test('invalid categorical answers fail closed; confidence is preserved without a Boolean threshold; SDK receives independent contextual questions', async () => {
  for (const invalid of [null, {}, { model: 'jev' }, { model: 'jev', answers: {} }]) assert.throws(() => normalizeEvidenceAware(invalid, evidence), /JEV_ANSWER_INVALID/)
  for (const value of ['MAYBE', null, 0.5]) {
    const invalid = response(); invalid.answers.aggravatingEvidencePresent.choice = value
    assert.throws(() => normalizeEvidenceAware(invalid, evidence), /JEV_ANSWER_INVALID/)
  }
  for (const value of [-1, 1.01, NaN, null]) {
    const invalid = response(); invalid.answers.responsibility.confidence = value
    assert.throws(() => normalizeEvidenceAware(invalid, evidence), /JEV_ANSWER_INVALID/)
  }
  const lowConfidence = response(); lowConfidence.answers.ordinaryDriverFailure.confidence = 0.01
  assert.equal(normalizeEvidenceAware(lowConfidence, evidence).normalized.severity, 'MODERATE')
  const usage = response(); usage.usage = { input_tokens: 120, output_tokens: 30 }
  assert.equal(normalizeEvidenceAware(usage, evidence).raw.usage.inputTokens, 120)
  assert.equal(normalizeEvidenceAware(usage, evidence).raw.usage.outputTokens, 30)
  const adapter = createEvidenceAwareSeverityAdapter({ client: { async systemOne(input, options) {
    assert.equal(input.state, evidence); assert.equal(Object.keys(input.questions).length, 8)
    assert.equal(options.retry.maxRetries, 0); assert.equal(options.timeout, 60000)
    return response()
  } } })
  assert.equal((await adapter.analyzeResponsibilityCase(evidence)).normalized.severity, 'MODERATE')
})
test('experiment prompt/config identity is reproducible and the finite SDK contract cannot silently change', async () => {
  assert.equal(EVIDENCE_AWARE_SEVERITY_CONFIG.questionsHash, '59ddc699d07482c3060598daf8f5cbcf7d38e97ffdb5adab1dc8f02f7dea2f67')
  assert.equal(EVIDENCE_AWARE_SEVERITY_CONFIG.version, 'responsibility-evidence-aware-development-v1')
  assert.equal(EVIDENCE_AWARE_SEVERITY_CONFIG.status, 'DEVELOPMENT_EXPERIMENT_NOT_FROZEN')
  assert.equal(EVIDENCE_AWARE_SEVERITY_CONFIG.model, 'jev-latest'); assert.equal(EVIDENCE_AWARE_SEVERITY_CONFIG.sdkVersion, '0.6.0')
  assert.equal(EVIDENCE_AWARE_SEVERITY_CONFIG.probabilityThresholds, null)
  const adapter = createEvidenceAwareSeverityAdapter({ client: { async systemOne(input) {
    assert.equal(input.model, 'jev-latest')
    for (const [name, question] of Object.entries(input.questions)) {
      assert.equal(question.type, 'choice'); assert.ok(question.instructions.length > 20)
      if (name !== 'responsibility') assert.deepEqual(Object.keys(question.criteria), ['YES', 'NO', 'UNCLEAR'])
    }
    return response()
  } } })
  assert.equal(adapter.configVersion, EVIDENCE_AWARE_SEVERITY_CONFIG.version)
  const result = await adapter.analyzeResponsibilityCase(evidence)
  assert.equal(result.normalized.directAnalystContractCompatible, false); assert.equal(result.normalized.directPolicyGateCompatible, false)
  for (const confidence of [0, 1]) { const valid = response(); valid.answers.responsibility.confidence = confidence; assert.equal(normalizeEvidenceAware(valid, evidence).normalized.confidence, confidence) }
  assert.equal(normalizeEvidenceAware(response({ seriousReliabilityFailure: 'YES', aggravatingEvidencePresent: 'YES', ordinaryDriverFailure: 'NO' }), evidence).normalized.needsHumanReview, false)
  assert.equal(normalizeEvidenceAware(response({ responsibility: 'VALID_WAIVED', ordinaryDriverFailure: 'NO' }), evidence).normalized.needsHumanReview, false)
  assert.equal(normalizeEvidenceAware(response(), evidence).raw.rawSeverity, 'MODERATE')
})
