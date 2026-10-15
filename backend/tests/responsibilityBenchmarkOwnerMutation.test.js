import test from 'node:test'
import assert from 'node:assert/strict'
import { phase81Dataset } from '../benchmarks/responsibility/phase81.js'
import { simulateJevResponsibilityRoute } from '../benchmarks/responsibility/benchmark.js'
import { DEFAULT_RESPONSIBILITY_POLICY } from '../services/responsibilityPolicyGate.js'

const original = phase81Dataset('development').find(r => r.id === 'driver_cancellation-ordinary_driver_evidence').evidence
const result = { classification: 'DRIVER_CAUSED', severity: 'MODERATE', confidence: 1, evidenceSufficient: true,
  needsHumanReview: false, externalCauseMaterial: false, platformMateriallyContributed: false }
const gate = evidence => simulateJevResponsibilityRoute({ evidence, result })
const category = DEFAULT_RESPONSIBILITY_POLICY.cases.DRIVER_CANCELLATION.freshnessRequiredCategories[0]
const modifiedSamples = change => {
  const evidence = structuredClone(original)
  evidence.timeline.filter(item => item.category === category).forEach(change)
  return evidence
}

test('affirmative freshness metadata, finite explicit age and separate invalid timestamps are independently significant', () => {
  const maxAge = DEFAULT_RESPONSIBILITY_POLICY.cases.DRIVER_CANCELLATION.maxAgeMsByCategory[category]
  const staleDates = item => { item.observedAt = '2026-09-01T00:00:00Z'; item.receivedAt = '2026-09-25T00:00:00Z' }
  for (const quality of [{ fresh: true }, { ageMs: 0 }, { ageMs: maxAge }]) {
    assert.equal(gate(modifiedSamples(item => { staleDates(item); item.quality = quality })).route, 'PROVISIONAL_AUTO_UPHELD')
  }
  assert.equal(gate(modifiedSamples(item => { staleDates(item); item.quality = { fresh: false } })).route, 'NEEDS_ADMIN_REVIEW')
  for (const field of ['observedAt', 'receivedAt']) {
    assert.equal(gate(modifiedSamples(item => { item.quality = {}; item[field] = 'invalid-date' })).route, 'NEEDS_ADMIN_REVIEW')
  }
})

test('missing quality never throws and a derived evidence reference cannot name unavailable provenance', () => {
  const noQuality = modifiedSamples(item => { delete item.quality; item.observedAt = null })
  assert.equal(gate(noQuality).route, 'NEEDS_ADMIN_REVIEW')
  const derived = structuredClone(original)
  derived.timeline[0].basis = 'derived'; derived.timeline[0].derivedFrom = ['absent-evidence-id']
  const decision = gate(derived)
  assert.equal(decision.route, 'NEEDS_ADMIN_REVIEW')
  assert.ok(decision.failedGates.some(g => g.code === 'EVIDENCE_QUALITY' && !g.pass))
})
