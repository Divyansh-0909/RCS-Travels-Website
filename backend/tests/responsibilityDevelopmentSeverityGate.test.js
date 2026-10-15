import test from 'node:test'
import assert from 'node:assert/strict'
import { applyDevelopmentSeverityGuard } from '../benchmarks/responsibility/developmentSeverityGate.js'
import { createHash } from 'node:crypto'
const run = () => ({ normalized: { classification: 'DRIVER_CAUSED', severity: 'MODERATE' }, raw: {}, error: null,
  gate: { route: 'PROVISIONAL_AUTO_UPHELD', humanReviewRequired: false, failedGates: [] } })
const timeline = value => ({ timeline: [{ id: 'fact1', availability: 'available', basis: 'direct', value }] })
test('all candidate providers receive the same evidence-based serious-case review guard; raw answers and original simulated gates are immutable', () => {
  for (const value of [{ secondOverlappingBookingAccepted: true, driverAcknowledgedIncompatibleTimes: true },
    { driverAuthenticatedDisableDispatch: true, driverAcknowledgedAvoidingPickupForPersonalErrand: true }]) {
    const original = run(); const guarded = applyDevelopmentSeverityGuard(original, timeline(value))
    assert.equal(guarded.gate.route, 'NEEDS_ADMIN_REVIEW'); assert.equal(guarded.gate.humanReviewRequired, true)
    assert.equal(guarded.prediction.autoUpholdAllowed, false); assert.deepEqual(guarded.developmentGuard.evidenceIds, ['fact1'])
    assert.deepEqual(guarded.raw, original.raw); assert.equal(original.gate.route, 'PROVISIONAL_AUTO_UPHELD')
    assert.equal(guarded.developmentGuard.productionApplied, false)
    assert.equal(guarded.developmentGuard.version, 'development-evidenced-aggravation-review-v1')
    assert.equal(guarded.developmentGuard.evidenceHash, createHash('sha256').update(JSON.stringify(timeline(value))).digest('hex'))
    assert.equal(guarded.gate.failedGates[0].code, 'DEVELOPMENT_EVIDENCED_AGGRAVATION_REVIEW')
    assert.equal(guarded.gate.failedGates[0].pass, false)
    assert.equal(guarded.gate.failedGates[0].detail, 'affirmative-aggravating-evidence')
  }
})
test('incident words, partial/false/derived/unavailable facts and model confidence cannot create aggravating evidence', () => {
  for (const value of [null, [], 'late/offline/failed pickup', {}, { secondOverlappingBookingAccepted: true },
    { secondOverlappingBookingAccepted: false, driverAcknowledgedIncompatibleTimes: true },
    { driverAuthenticatedDisableDispatch: true }, { driverAuthenticatedDisableDispatch: false, driverAcknowledgedAvoidingPickupForPersonalErrand: true }]) {
    assert.equal(applyDevelopmentSeverityGuard(run(), timeline(value)).gate.route, 'PROVISIONAL_AUTO_UPHELD')
  }
  for (const edit of [item => { item.availability = 'unavailable' }, item => { item.basis = 'derived' }]) {
    const evidence = timeline({ secondOverlappingBookingAccepted: true, driverAcknowledgedIncompatibleTimes: true }); edit(evidence.timeline[0])
    assert.deepEqual(applyDevelopmentSeverityGuard(run(), evidence).developmentGuard.evidenceIds, [])
  }
})
test('cross-question aggravation still requires review; missing/failed response cannot become automation', () => {
  const contradicted = run(); contradicted.raw.decisions = { aggravatingEvidencePresent: 'YES', seriousReliabilityFailure: 'NO' }
  const guarded = applyDevelopmentSeverityGuard(contradicted, timeline({}))
  assert.equal(guarded.gate.route, 'NEEDS_ADMIN_REVIEW')
  assert.equal(guarded.gate.failedGates[0].detail, 'reported-aggravation-requires-review')
  for (const failed of [{ ...run(), raw: null, gate: null, normalized: null, error: 'TIMEOUT' }, { ...run(), gate: null }]) {
    assert.equal(applyDevelopmentSeverityGuard(failed, timeline({})).prediction.autoUpholdAllowed, false)
  }
  const failed = { ...run(), error: 'SCHEMA_FAILURE' }
  assert.equal(applyDevelopmentSeverityGuard(failed, timeline({ secondOverlappingBookingAccepted: true, driverAcknowledgedIncompatibleTimes: true })).gate.route, 'PROVISIONAL_AUTO_UPHELD')
  assert.equal(applyDevelopmentSeverityGuard(failed, timeline({})).prediction.autoUpholdAllowed, false)
})
