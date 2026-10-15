import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createResponsibilityEvidence, evidenceCategory, responsibilityCaseType } from './helpers/responsibilityEvidence.js'
import { createResponsibilityAnalystFake } from './helpers/responsibilityAnalystFake.js'
import { DEFAULT_RESPONSIBILITY_POLICY, provisionalResponsibilityRoute } from '../services/responsibilityPolicyGate.js'
import { responsibilityCaseState } from '../services/responsibilityCaseState.js'
import {
  createAppendOnlyResponsibilityArtifactWriter,
  createJevResponsibilityAdapter,
  createReadOnlyResponsibilityBenchmarkLoader,
  createResponsibilityBenchmarkRunner,
  normalizeJevResponsibility,
  simulateJevResponsibilityRoute,
} from '../benchmarks/responsibility/benchmark.js'

const start = '2026-09-25T06:00:00.000Z'
const bundle = (caseId = 'benchmark-case') => {
  const journal = createResponsibilityEvidence({ caseId, bookingId: `booking-${caseId}`,
    caseType: responsibilityCaseType.DRIVER_CANCELLATION, occurredAt: start })
  journal.record({ category: evidenceCategory.BOOKING, kind: 'booking', source: 'fixture', value: {} })
  journal.record({ category: evidenceCategory.ASSIGNMENT, kind: 'assignment', source: 'fixture', value: {}, quality: { fresh: true } })
  journal.record({ category: evidenceCategory.CANCELLATION, kind: 'cancellation', source: 'fixture',
    value: { initiator: 'driver', avoidable: true, platformIssueObserved: false }, quality: { fresh: true } })
  return journal.snapshot()
}
const jevResponse = ({ classification = 'DRIVER_CAUSED', confidence = 0.9, sufficient = 0.9,
  platform = 0.1, external = 0.1, review = 0.1, severity = 0 } = {}) => ({
  model: 'jev-test', usage: { input_tokens: 7, output_tokens: 3 }, answers: {
    responsibility: { choice: classification, confidence }, evidenceSufficient: { noul: sufficient },
    platformMateriallyContributed: { noul: platform }, externalCauseMaterial: { noul: external },
    needsHumanReview: { noul: review }, severity: { score: severity, confidence: 0.8 },
  },
})

test('Jev adapter uses systemOne choice, noul, and score answers without inventing a Phase 5 envelope', async () => {
  let request = null
  const adapter = createJevResponsibilityAdapter({ client: { systemOne: async value => { request = value; return jevResponse() } }, model: 'jev-test' })
  const result = await adapter.analyzeResponsibilityCase(bundle())
  assert.equal(request.questions.responsibility.type, 'choice')
  assert.equal(request.questions.evidenceSufficient.type, 'noul')
  assert.equal(request.questions.severity.type, 'score')
  assert.equal(result.normalized.classification, 'DRIVER_CAUSED')
  assert.equal(result.normalized.directPolicyGateCompatible, false)
  assert.deepEqual(result.raw.usage, { inputTokens: 7, outputTokens: 3 })
})

test('benchmark simulation enforces thresholds, frozen policy allowlists, and cross-question consistency', () => {
  const evidence = bundle()
  const eligible = normalizeJevResponsibility(jevResponse())
  assert.equal(Object.isFrozen(DEFAULT_RESPONSIBILITY_POLICY), true)
  assert.equal(simulateJevResponsibilityRoute({ evidence, result: eligible }).route, provisionalResponsibilityRoute.PROVISIONAL_AUTO_UPHELD)
  const belowFloor = normalizeJevResponsibility(jevResponse({ confidence: 0.799 }))
  assert.equal(simulateJevResponsibilityRoute({ evidence, result: belowFloor }).route, provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW)
  const highSeverity = normalizeJevResponsibility(jevResponse({ severity: 2 }))
  assert.equal(simulateJevResponsibilityRoute({ evidence, result: highSeverity }).route, provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW)
  const conflicting = normalizeJevResponsibility(jevResponse({ platform: 0.9 }))
  const gate = simulateJevResponsibilityRoute({ evidence, result: conflicting })
  assert.equal(gate.route, provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW)
  assert.equal(gate.failedGates.some(item => item.code === 'CROSS_QUESTION_CONSISTENCY'), true)
})

test('runner gives the exact same evidence snapshot to both systems and captures provider failures', async () => {
  const evidence = bundle('same-evidence')
  let existingEvidence = null
  let jevEvidence = null
  const existing = createResponsibilityAnalystFake('driver_caused')
  const runner = createResponsibilityBenchmarkRunner({
    existingAnalyst: { ...existing, analyzeResponsibilityCase: async value => { existingEvidence = value; return existing.analyzeResponsibilityCase(value) } },
    jevAdapter: { provider: 'typesafe-ai', model: 'jev-test', configVersion: 'test', analyzeResponsibilityCase: async value => {
      jevEvidence = value
      return { raw: { answers: {} }, normalized: normalizeJevResponsibility(jevResponse()) }
    } },
  })
  const [record] = await runner.run([{ caseId: evidence.caseId, evidence, groundTruth: { label: null, source: 'UNLABELED' } }])
  assert.strictEqual(existingEvidence, evidence)
  assert.strictEqual(jevEvidence, evidence)
  assert.equal(record.existing.error, null)
  assert.equal(record.jev.gate.route, provisionalResponsibilityRoute.PROVISIONAL_AUTO_UPHELD)
  const failed = await createResponsibilityBenchmarkRunner({
    existingAnalyst: { provider: 'openai', model: 'test', analyzeResponsibilityCase: async () => { throw new Error('Bearer secret') } },
    jevAdapter: { provider: 'typesafe-ai', model: 'test', configVersion: 'test', analyzeResponsibilityCase: async () => { throw new Error('timeout') } },
  }).run([{ caseId: evidence.caseId, evidence, groundTruth: { label: null, source: 'UNLABELED' } }])
  assert.equal(failed[0].existing.error.includes('secret'), false)
  assert.equal(failed[0].jev.error, 'timeout')
})

test('read-only loader uses appeal-final then admin-human ground truth and leaves non-human outcomes unlabeled', async () => {
  const evidence = bundle('loader-case')
  const rows = [
    { id: 'final', state: responsibilityCaseState.FINAL_UPHELD, evidenceSnapshot: evidence,
      finalDecision: { outcome: 'FINAL_UPHELD', classification: 'DRIVER_CAUSED', consequenceLevel: 'LEVEL_1', source: 'APPEAL_REVIEW', appealId: 'appeal-1' }, adminReview: null },
    { id: 'review', state: responsibilityCaseState.NEEDS_ADMIN_REVIEW, evidenceSnapshot: evidence, finalDecision: null,
      adminReview: { decision: 'WAIVE', classification: 'VALID_WAIVED', consequenceLevel: 'LEVEL_0' } },
    { id: 'frozen', state: responsibilityCaseState.FINAL_WAIVED, evidenceSnapshot: evidence,
      finalDecision: { outcome: 'FINAL_WAIVED', classification: 'VALID_WAIVED', consequenceLevel: 'LEVEL_0', source: 'AUTO_WAIVER', appealId: null }, adminReview: null },
    { id: 'open', state: responsibilityCaseState.AI_REVIEW, evidenceSnapshot: evidence, finalDecision: null, adminReview: null },
  ]
  let query = null
  const loader = createReadOnlyResponsibilityBenchmarkLoader({ responsibilityCase: { findMany: async value => { query = value; return rows } } })
  const loaded = await loader.load({ take: 4 })
  assert.deepEqual(loaded.map(item => item.label?.source ?? null), ['FINAL_APPEAL', 'ADMIN_HUMAN', null, null])
  assert.deepEqual(loaded.map(item => item.label?.responsibility ?? null), ['DRIVER_CAUSED', 'VALID_WAIVED', null, null])
  assert.equal('bookingId' in query.select, false)
  assert.equal('update' in query, false)
})

test('Jev benchmark simulation rejects stale evidence that the production gate also requires to be fresh', () => {
  const journal = createResponsibilityEvidence({
    caseId: 'stale-case', bookingId: 'stale-booking', caseType: responsibilityCaseType.DRIVER_CANCELLATION, occurredAt: start,
  })
  journal.record({ category: evidenceCategory.BOOKING, kind: 'booking', source: 'fixture', value: {} })
  journal.record({ category: evidenceCategory.ASSIGNMENT, kind: 'assignment', source: 'fixture', value: {}, quality: { ageMs: 60 * 60 * 1000 } })
  journal.record({ category: evidenceCategory.CANCELLATION, kind: 'cancellation', source: 'fixture', value: {}, quality: { ageMs: 60 * 60 * 1000 } })
  const gate = simulateJevResponsibilityRoute({ evidence: journal.snapshot(), result: normalizeJevResponsibility(jevResponse()) })
  assert.equal(gate.route, provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW)
  assert.equal(gate.failedGates.some(item => item.code === 'EVIDENCE_FRESHNESS'), true)
})

test('artifacts are JSONL append-only and benchmark code has no consequence execution imports', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'rcs-responsibility-benchmark-'))
  try {
    const writer = createAppendOnlyResponsibilityArtifactWriter({ outputDir, runId: 'unit' })
    const records = [{ existing: { error: null }, jev: { error: null }, caseKey: 'safe' }]
    await writer.append(records)
    await writer.append(records)
    assert.equal((await readFile(writer.artifacts, 'utf8')).trim().split('\n').length, 2)
    assert.equal((await readFile(writer.summary, 'utf8')).trim().split('\n').length, 2)
  } finally {
    await rm(outputDir, { recursive: true, force: true })
  }
  const directory = new URL('../benchmarks/responsibility/', import.meta.url)
  for (const file of (await readdir(directory)).filter(name => name.endsWith('.js'))) {
    const source = await readFile(new URL(file, directory), 'utf8')
    assert.equal(/responsibility(?:Consequences|Financial|Reliability|Finalization|Notice|Appeal)/.test(source), false, file)
    assert.equal(/\b(?:db|prisma|prismaClient|tx)\.[\w$]+\.(?:create|createMany|update|updateMany|delete|deleteMany|upsert)\(/.test(source), false, file)
  }
})
