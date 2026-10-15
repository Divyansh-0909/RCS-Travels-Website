import { z } from 'zod'
import { createHash } from 'node:crypto'

export const SEARCH_CAPABILITY_INVENTORY = [
  ['jev_decisions', 'MODEL_DECISION'], ['luna_interpretation', 'MODEL_INTERPRETATION'],
  ['places_autocomplete', 'APPLICATION_ORCHESTRATED'], ['places_details', 'APPLICATION_ORCHESTRATED'],
  ['candidate_generation', 'DETERMINISTIC'], ['candidate_provenance', 'DETERMINISTIC'],
  ['temporal_resolution', 'DETERMINISTIC'], ['timezone_conversion', 'DETERMINISTIC'],
  ['draft_merging', 'DETERMINISTIC'], ['booking_validation', 'DETERMINISTIC'], ['form_readiness', 'DETERMINISTIC'],
  ['booking_payment_dispatch', 'NOT_SEARCH_TOOL'],
].map(([id, classification]) => ({ id, classification, modelCallable: false }))

export function developmentToolAuditPacket(traces) {
  const traceSchema = z.strictObject({ id: z.string().min(1), split: z.literal('DEVELOPMENT_ONLY'),
    capabilityIds: z.array(z.enum(SEARCH_CAPABILITY_INVENTORY.map(capability => capability.id))).min(1),
    description: z.string().min(1).max(1200), requestCount: z.number().int().nonnegative(),
    inputTokens: z.number().int().nonnegative().nullable(), outputTokens: z.number().int().nonnegative().nullable(),
    latencyMs: z.number().nonnegative().nullable() })
  const validated = z.array(traceSchema).min(1).max(32).parse(traces)
  if (new Set(validated.map(trace => trace.id)).size !== validated.length) throw new Error('DUPLICATE_DEVELOPMENT_TRACE')
  const packet = { inventoryVersion: 'search-s6-development-inventory-v2', capabilities: SEARCH_CAPABILITY_INVENTORY,
    modelCallableTools: [], modelControlledGooglePlaces: false, oneShotFormResolution: true, traces: validated }
  return { ...packet, inputPacketHash: createHash('sha256').update(JSON.stringify(packet)).digest('hex') }
}

export function toolAuditReviewSchema(packet) {
  const text = z.string().min(1).max(1200)
  return z.strictObject({ inventoryVersion: z.literal(packet.inventoryVersion), inputPacketHash: z.literal(packet.inputPacketHash),
    modelCallableToolsRequired: z.boolean(), findings: z.array(z.strictObject({
      capability: z.enum(packet.capabilities.map(capability => capability.id)),
      category: z.enum(['BOUNDARY', 'NAME', 'DESCRIPTION', 'SCHEMA', 'OUTPUT', 'RECOVERY', 'REDUNDANCY', 'MISSING_CAPABILITY', 'UNNECESSARY_CAPABILITY', 'TOKEN_WASTE']),
      severity: z.enum(['BLOCKER', 'IMPROVEMENT', 'INFORMATION']),
      developmentTraceIds: z.array(z.enum(packet.traces.map(trace => trace.id))).min(1).max(16),
      observedProblem: text, proposedChange: text, deterministicChecksRequired: z.array(text).min(1).max(16),
    })).max(30), limitations: z.array(text).max(12) })
}
