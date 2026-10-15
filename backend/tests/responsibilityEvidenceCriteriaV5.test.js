import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { evidenceCriteriaV4Questions } from '../benchmarks/responsibility/evidenceCriteriaV4.js'
import { EVIDENCE_CRITERIA_V5_CONFIG, evidenceCriteriaV5Questions, createEvidenceCriteriaV5Adapter } from '../benchmarks/responsibility/evidenceCriteriaV5.js'
import { phase81WaiverDevelopmentDataset } from '../benchmarks/responsibility/phase81Development.js'
import { simulateJevResponsibilityRoute } from '../benchmarks/responsibility/benchmark.js'

test('v5 is one finite review-criterion change, with provider/version identity and no guard or label mutation', () => {
  const v4 = evidenceCriteriaV4Questions(), v5 = evidenceCriteriaV5Questions()
  assert.deepEqual(Object.keys(v5), Object.keys(v4))
  assert.deepEqual(Object.keys(v5).filter(key => JSON.stringify(v5[key]) !== JSON.stringify(v4[key])), ['needsHumanReview'])
  assert.deepEqual(Object.keys(v5.needsHumanReview.criteria), ['YES', 'NO', 'UNCLEAR'])
  assert.equal(v5.needsHumanReview.type, 'choice')
  assert.match(v5.needsHumanReview.instructions, /Serious corroborated conduct requires YES/)
  assert.match(v5.needsHumanReview.criteria.NO, /affirmative ordinary driver causation/)
  assert.match(v5.needsHumanReview.criteria.YES, /critical contradiction/)
  assert.match(v5.needsHumanReview.criteria.UNCLEAR, /Do not assume missing facts/)
  assert.equal(EVIDENCE_CRITERIA_V5_CONFIG.questionsHash, createHash('sha256').update(JSON.stringify(v5)).digest('hex'))
  assert.equal(EVIDENCE_CRITERIA_V5_CONFIG.version, 'responsibility-evidence-criteria-development-v5')
  assert.equal(EVIDENCE_CRITERIA_V5_CONFIG.model, 'jev-latest')
  assert.equal(EVIDENCE_CRITERIA_V5_CONFIG.sdkVersion, '0.6.0')
  assert.equal(EVIDENCE_CRITERIA_V5_CONFIG.status, 'DEVELOPMENT_ONLY_NOT_FROZEN')
  assert.equal(EVIDENCE_CRITERIA_V5_CONFIG.guardChanged, false)
  assert.equal(EVIDENCE_CRITERIA_V5_CONFIG.productionChanged, false)
  const copy = evidenceCriteriaV5Questions(); delete copy.responsibility
  assert.ok(evidenceCriteriaV5Questions().responsibility)
})

test('v5 sends only identical normalized evidence and still denies waiver for unresolved causes/review', async () => {
  const record = phase81WaiverDevelopmentDataset()[0]
  let answer = { responsibility: 'VALID_WAIVED', evidenceSufficient: 'YES', platformMateriallyContributed: 'NO',
    externalCauseMaterial: 'NO', needsHumanReview: 'NO', seriousReliabilityFailure: 'NO', aggravatingEvidencePresent: 'NO', ordinaryDriverFailure: 'NO' }
  const adapter = createEvidenceCriteriaV5Adapter({ client: { systemOne: async (input, options) => {
    assert.equal(input.state, record.modelInput.evidence)
    assert.deepEqual(input.questions, evidenceCriteriaV5Questions())
    assert.equal(input.model, 'jev-latest')
    assert.deepEqual(options, { timeout: 60000, retry: { maxRetries: 0 } })
    return { model: 'jev-fixture', answers: Object.fromEntries(Object.entries(answer).map(([key, choice]) => [key, { choice, confidence: .97 }])) }
  } } })
  assert.equal(adapter.configVersion, EVIDENCE_CRITERIA_V5_CONFIG.version)
  assert.equal(adapter.provider, 'typesafe-ai'); assert.equal(adapter.model, 'jev-latest')
  const initial = await adapter.analyzeResponsibilityCase(record.modelInput.evidence)
  assert.equal(simulateJevResponsibilityRoute({ evidence: record.evidence, result: initial.normalized }).route, 'PROVISIONAL_AUTO_WAIVED')
  for (const field of ['externalCauseMaterial', 'needsHumanReview']) {
    const old = answer; answer = { ...answer, [field]: 'YES' }
    const result = await adapter.analyzeResponsibilityCase(record.modelInput.evidence)
    assert.equal(simulateJevResponsibilityRoute({ evidence: record.evidence, result: result.normalized }).route, 'NEEDS_ADMIN_REVIEW')
    answer = old
  }
})
