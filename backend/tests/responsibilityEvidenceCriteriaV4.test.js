import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { evidenceCriteriaV3Questions } from '../benchmarks/responsibility/evidenceCriteriaV3.js'
import { EVIDENCE_CRITERIA_V4_CONFIG, evidenceCriteriaV4Questions, createEvidenceCriteriaV4Adapter } from '../benchmarks/responsibility/evidenceCriteriaV4.js'
import { simulateJevResponsibilityRoute } from '../benchmarks/responsibility/benchmark.js'
import { phase81DevelopmentDataset, phase81WaiverDevelopmentDataset } from '../benchmarks/responsibility/phase81Development.js'

test('v4 changes only two independent finite criteria; dataset and factual guard remain separate', () => {
  const v3 = evidenceCriteriaV3Questions(); const v4 = evidenceCriteriaV4Questions()
  assert.deepEqual(Object.keys(v4), Object.keys(v3))
  assert.deepEqual(Object.keys(v4).filter(k => JSON.stringify(v4[k]) !== JSON.stringify(v3[k])), ['externalCauseMaterial', 'needsHumanReview'])
  assert.equal(EVIDENCE_CRITERIA_V4_CONFIG.questionsHash, createHash('sha256').update(JSON.stringify(v4)).digest('hex'))
  assert.equal(EVIDENCE_CRITERIA_V4_CONFIG.questionsHash, '121d1154118876e25c0d395760dcc9026a4bc7cf19fcf08e79917c431f636425')
  assert.equal(EVIDENCE_CRITERIA_V4_CONFIG.version, 'responsibility-evidence-criteria-development-v4')
  assert.equal(EVIDENCE_CRITERIA_V4_CONFIG.model, 'jev-latest'); assert.equal(EVIDENCE_CRITERIA_V4_CONFIG.sdkVersion, '0.6.0')
  assert.equal(EVIDENCE_CRITERIA_V4_CONFIG.status, 'DEVELOPMENT_ONLY_NOT_FROZEN')
  assert.equal(EVIDENCE_CRITERIA_V4_CONFIG.guardChanged, false); assert.equal(EVIDENCE_CRITERIA_V4_CONFIG.productionChanged, false)
  for (const [name, q] of Object.entries(v4)) {
    assert.equal(q.type, 'choice')
    if (name !== 'responsibility') assert.deepEqual(Object.keys(q.criteria), ['YES', 'NO', 'UNCLEAR'])
  }
  const copy = evidenceCriteriaV4Questions(); delete copy.responsibility
  assert.ok(evidenceCriteriaV4Questions().responsibility)
  assert.match(v4.externalCauseMaterial.instructions, /Do not infer approval from a rider request alone/)
  assert.match(v4.externalCauseMaterial.instructions, /YES for a verified external cause/)
  assert.match(v4.needsHumanReview.instructions, /serious reliability facts/)
})

test('adapter receives evidence alone and cannot force a waiver around an unresolved cause or serious review', async () => {
  const record = phase81WaiverDevelopmentDataset()[0]
  let decisions = { responsibility: 'VALID_WAIVED', evidenceSufficient: 'YES', platformMateriallyContributed: 'NO',
    externalCauseMaterial: 'NO', needsHumanReview: 'NO', seriousReliabilityFailure: 'NO', aggravatingEvidencePresent: 'NO', ordinaryDriverFailure: 'NO' }
  const adapter = createEvidenceCriteriaV4Adapter({ client: { systemOne: async (input, options) => {
    assert.equal(input.state, record.modelInput.evidence); assert.equal(input.model, 'jev-latest')
    assert.deepEqual(input.questions, evidenceCriteriaV4Questions())
    assert.deepEqual(options, { timeout: 60000, retry: { maxRetries: 0 } })
    return { model: 'jev-fixture', answers: Object.fromEntries(Object.entries(decisions).map(([key, choice]) => [key, { choice, confidence: 0.97 }])) }
  } } })
  assert.equal(adapter.provider, 'typesafe-ai'); assert.equal(adapter.model, 'jev-latest')
  assert.equal(adapter.configVersion, EVIDENCE_CRITERIA_V4_CONFIG.version)
  const initial = await adapter.analyzeResponsibilityCase(record.modelInput.evidence)
  assert.equal(simulateJevResponsibilityRoute({ evidence: record.evidence, result: initial.normalized }).route, 'PROVISIONAL_AUTO_WAIVED')
  for (const changes of [{ externalCauseMaterial: 'YES' }, { externalCauseMaterial: 'UNCLEAR' }, { evidenceSufficient: 'NO' }, { needsHumanReview: 'YES' }]) {
    const original = decisions; decisions = { ...decisions, ...changes }
    const run = await adapter.analyzeResponsibilityCase(record.modelInput.evidence)
    assert.equal(simulateJevResponsibilityRoute({ evidence: record.evidence, result: run.normalized }).route, 'NEEDS_ADMIN_REVIEW')
    decisions = original
  }
  const ordinary = phase81DevelopmentDataset().find(r => r.id === 'driver_cancellation-ordinary_driver_evidence')
  const serious = { ...initial.normalized, classification: 'DRIVER_CAUSED', severity: 'HIGH', needsHumanReview: true }
  assert.equal(simulateJevResponsibilityRoute({ evidence: ordinary.evidence, result: serious }).route, 'NEEDS_ADMIN_REVIEW')
})
