import assert from 'node:assert/strict'
import { responsibilityEvidenceHash } from '../../services/responsibilityAnalyst.js'
import { stableSerializeResponsibilityEvidence } from '../../services/responsibilityEvidence.js'
import { jevV5AnalysisEnvelope } from '../../services/responsibilityJevV5.js'
import { normalizeEvidenceAware } from '../../benchmarks/responsibility/evidenceAwareSeverity.js'
import { responsibilityShadowLogicalKey } from '../../services/responsibilityShadowConfig.js'

/** Explicit one-to-one aliases for generated identities. Values, timestamps and nulls remain compared. */
export function createPhase9CanonicalMap() {
  const aliases = new Map(), names = new Map()
  const register = (value, name) => {
    if (value == null) return
    assert.equal(typeof value, 'string')
    if (aliases.has(value)) { assert.equal(aliases.get(value), name); return }
    assert.ok(!names.has(name), `canonical identity collision: ${name}`)
    aliases.set(value, name); names.set(name, value)
  }
  const string = value => {
    let result = aliases.get(value) ?? value
    const compounds = [...aliases].filter(([actual]) => actual.length >= 16).sort((a, b) => b[0].length - a[0].length)
    // Resolve forward references inside ledger aliases; keep short tokens such
    // as OTPs confined to whole values. Cycles fail rather than erase evidence.
    for (let round = 0; round <= aliases.size; round++) {
      const previous = result
      for (const [actual, name] of compounds) result = result.replaceAll(actual, name)
      if (result === previous) return result
    }
    assert.fail('cyclic canonical identity')
  }
  const normalize = value => {
    if (Object.prototype.toString.call(value) === '[object Date]') return value.toISOString()
    if (typeof value === 'string') return string(value)
    if (Array.isArray(value)) return value.map(normalize)
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalize(item)]))
    return value
  }
  return { register, normalize, manifest: () => Object.fromEntries(aliases) }
}

export function registerPhase9Actors(map, actors) {
  map.register(actors.id, '@scenario')
  const fields = ['id', 'clerkId', 'phone', 'bookingCode', 'vehicleNumber', 'payoutUpiId']
  for (const field of fields) map.register(actors.customer[field], `@customer.${field}`)
  for (const driver of actors.drivers) {
    for (const field of fields) map.register(driver[field], `@driver.${driver.group}.${field}`)
    map.register(driver.activeVehicleId, `@vehicle.${driver.group}`)
  }
  for (const [role, row] of Object.entries(actors.bookingStates)) {
    map.register(row.id, `@fixture.booking.${role}`)
    map.register(row.reference, `@fixture.reference.${role}`)
  }
}

const sorted = (rows, key) => [...rows].sort((a, b) => String(key(a)).localeCompare(String(key(b))))

function registerShadowIdentities(map, state) {
  for (const row of state.shadowResults) {
    const evidence = state.cases.find(item => item.id === row.caseId).evidenceSnapshot
    const response = state.analystCalls.find(item => item.caseId === row.caseId).response
    assert.equal(row.analysisProviderId, jevV5AnalysisEnvelope(evidence, normalizeEvidenceAware(response, evidence)).analysisId)
    const canonicalEvidence = map.normalize(evidence)
    const canonicalId = jevV5AnalysisEnvelope(canonicalEvidence, normalizeEvidenceAware(response, canonicalEvidence)).analysisId
    map.register(row.analysisProviderId, canonicalId)
  }
}

export function canonicalPhase9State(map, state) {
  map.register(state.booking.id, '@booking')
  map.register(state.booking.reference, '@booking.reference')
  map.register(state.booking.otp, '@booking.otp')
  map.register(state.booking.shareToken, '@booking.shareToken')
  for (const row of state.cases.filter(item => item.evidenceVersion === 'test-v1')) map.register(row.id, '@preexisting.case')
  for (const row of state.authorities.final) map.register(row.id, '@preexisting.final')
  for (const row of state.authorities.liabilities) map.register(row.id, '@preexisting.liability')
  for (const row of state.authorities.compensation) map.register(row.id, '@preexisting.compensation')
  for (const row of state.financial.payments) map.register(row.id, `@payment.${row.purpose}`)
  for (const row of state.offers) map.register(row.id, `@offer.${map.normalize(row.driverId)}`)
  for (const row of state.financial.wallets) map.register(row.id, `@wallet.${map.normalize(row.eventKey)}`)
  for (const row of state.incidents) map.register(row.id, `@cancellation.${map.normalize(row.driverId)}`)
  for (const [group, rows, key] of [
    ['route', state.routes, row => `${map.normalize(row.bookingId)}.${row.event}.${row.calculatedAt.toISOString()}`],
    ['notification', state.notifications, row => row.providerMessageId ?? `${row.purpose}.${row.attemptedAt.toISOString()}`],
    ['evidence', state.evidence, row => map.normalize(row.caseId)],
    ['work', state.work, row => map.normalize(row.caseId)],
    ['shadow', state.shadowResults, row => map.normalize(row.caseId)],
    ['webhook', state.webhooks, row => row.eventId],
    ['allocation', state.allocations, row => map.normalize(row.bookingId)],
    ['liability-entry', state.liabilityEntries, row => map.normalize(row.eventKey)],
  ]) for (const row of rows) map.register(row.id, `@${group}.${key(row)}`)
  // Raw hashes must match their raw snapshots before canonical hashes can replace identity-dependent values.
  for (const row of state.cases) {
    if (row.evidenceVersion === 'test-v1') {
      assert.equal(row.evidenceHash, 'test-hash')
      assert.equal(row.state, 'FINAL_UPHELD')
      continue
    }
    assert.equal(row.evidenceHash, responsibilityEvidenceHash(row.evidenceSnapshot))
    const canonicalHash = responsibilityEvidenceHash(map.normalize(row.evidenceSnapshot))
    map.register(row.evidenceHash, canonicalHash)
  }
  for (const row of state.work) {
    const evidenceHash = state.evidence.find(item => item.id === row.evidenceVersionId).evidenceHash
    assert.equal(row.logicalKey, responsibilityShadowLogicalKey({ caseId: row.caseId, evidenceHash }))
  }
  registerShadowIdentities(map, state)
  const canonical = map.normalize(state)
  for (const [key, rows] of Object.entries(canonical)) {
    if (Array.isArray(rows)) canonical[key] = sorted(rows, row => row.id ?? stableSerializeResponsibilityEvidence(row))
  }
  for (const key of ['payments', 'wallets', 'drivers']) canonical.financial[key] = sorted(canonical.financial[key], row => row.id)
  for (const key of ['final', 'liabilities', 'compensation']) canonical.authorities[key] = sorted(canonical.authorities[key], row => row.id)
  const serialized = stableSerializeResponsibilityEvidence(canonical)
  assert.doesNotMatch(serialized, /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
    'unregistered random identity must fail rather than silently disappear')
  return canonical
}
