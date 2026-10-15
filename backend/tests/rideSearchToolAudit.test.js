import test from 'node:test'
import assert from 'node:assert/strict'
import { developmentToolAuditPacket, toolAuditReviewSchema, SEARCH_CAPABILITY_INVENTORY } from '../benchmarks/search/toolAudit.js'

const trace = { id: 'dev-1', split: 'DEVELOPMENT_ONLY', capabilityIds: ['jev_decisions'], description: 'Synthetic router batch', requestCount: 1, inputTokens: 606, outputTokens: 99, latencyMs: 334 }
test('S6 packet is strictly development-only, bounded, deterministic and grants no model tools', () => {
  const packet = developmentToolAuditPacket([trace])
  assert.equal(packet.inputPacketHash, developmentToolAuditPacket([trace]).inputPacketHash)
  assert.deepEqual(packet.modelCallableTools, []); assert.equal(packet.modelControlledGooglePlaces, false)
  assert.equal(packet.oneShotFormResolution, true); assert.equal(SEARCH_CAPABILITY_INVENTORY.length, 12)
  for (const bad of [{ ...trace, split: 'HELD_OUT' }, { ...trace, labels: {} }, { ...trace, capabilityIds: ['financial_consequences'] }, { ...trace, requestCount: -1 }]) assert.throws(() => developmentToolAuditPacket([bad]))
  assert.throws(() => developmentToolAuditPacket([trace, trace]), /DUPLICATE/)
})
test('advisory verifier output cannot cite foreign traces/capabilities, unbound packets or execution privileges', () => {
  const packet = developmentToolAuditPacket([trace]); const schema = toolAuditReviewSchema(packet)
  const finding = { capability: 'jev_decisions', category: 'DESCRIPTION', severity: 'IMPROVEMENT', developmentTraceIds: ['dev-1'], observedProblem: 'Check wording', proposedChange: 'Review independently', deterministicChecksRequired: ['Preserve form resolution'] }
  const result = { inventoryVersion: packet.inventoryVersion, inputPacketHash: packet.inputPacketHash, modelCallableToolsRequired: false, findings: [finding], limitations: ['Tiny development sample'] }
  assert.deepEqual(schema.parse(result), result)
  for (const modify of [r => { r.inputPacketHash = '0'.repeat(64) }, r => { r.findings[0].developmentTraceIds = ['held-out'] }, r => { r.findings[0].capability = 'strike' }, r => { r.execute = true }, r => { r.findings[0].proposedChange = 'x'.repeat(1201) }]) {
    const bad = structuredClone(result); modify(bad); assert.throws(() => schema.parse(bad))
  }
})
