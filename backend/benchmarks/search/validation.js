import { z } from 'zod'
import { CORE_RECORD_COUNT, EXPLORATORY_RECORD_COUNT, heldOutSignoffGate } from './dataset.js'

const expectedSchema = z.union([z.strictObject({ status: z.literal('LABELLED'), value: z.json() }),
  z.strictObject({ status: z.literal('NOT_LABELLED'), reason: z.string().min(1) })])
const recordSchema = z.strictObject({
  id: z.string().min(1), familyId: z.string().min(1), templateFamily: z.string().min(1), category: z.string().min(1),
  cohort: z.enum(['CORE', 'EXPLORATORY']), ordinaryOrAdversarial: z.enum(['ORDINARY', 'ADVERSARIAL', 'EXPLORATORY']),
  tags: z.array(z.string()), split: z.enum(['DEVELOPMENT', 'HELD_OUT', 'EXPLORATORY_ONLY']),
  modelInput: z.strictObject({ query: z.string().min(1).max(2000), context: z.strictObject({
    clock: z.iso.datetime({ offset: true }), timeZone: z.string().min(1), capabilityVersion: z.string().min(1),
    activeField: z.enum(['pickup', 'drop']).nullable(),
  }) }),
  truth: z.strictObject({ status: z.enum(['PROPOSED', 'APPROVED']), provenance: z.enum(['UNREVIEWED_PROPOSED_SYNTHETIC', 'HUMAN_REVIEWED_SYNTHETIC']),
    reviewerMetadata: z.json().nullable(), disagreementResolved: z.boolean(), derivation: z.enum(['FROZEN_SPEC_DETERMINISTIC', 'JUDGMENT_REVIEW_REQUIRED']),
    reviewReasons: z.array(z.string()), unresolvedPolicies: z.array(z.string()), expected: z.record(z.string(), expectedSchema),
  }),
})
const spanSchema = z.strictObject({ start: z.number().int().nonnegative(), end: z.number().int().positive(), exactText: z.string().min(1) })
const splitSurrogate = (text, offset) => /[\uD800-\uDBFF]/.test(text[offset - 1] ?? '') && /[\uDC00-\uDFFF]/.test(text[offset] ?? '')

function verifySpans(record) {
  for (const field of ['pickupSpans', 'dropSpans', 'stopSpans', 'locationSearchSpans']) {
    const expected = record.truth.expected[field]
    if (expected?.status !== 'LABELLED') continue
    for (const span of z.array(spanSchema).parse(expected.value)) {
      if (span.end <= span.start || span.end > record.modelInput.query.length
        || record.modelInput.query.slice(span.start, span.end) !== span.exactText
        || splitSurrogate(record.modelInput.query, span.start) || splitSurrogate(record.modelInput.query, span.end)) throw new Error('INVALID_GOLD_SOURCE_SPAN')
    }
  }
}

export function validateSearchDataset(records, { full = true } = {}) {
  const parsed = z.array(recordSchema).parse(records)
  const ids = new Set(); const queries = new Set(); const families = new Map()
  for (const record of parsed) {
    if (ids.has(record.id) || queries.has(record.modelInput.query)) throw new Error('DUPLICATE_SEARCH_RECORD')
    ids.add(record.id); queries.add(record.modelInput.query)
    if (families.has(record.familyId) && families.get(record.familyId) !== record.split) throw new Error('TEMPLATE_FAMILY_SPLIT_LEAKAGE')
    families.set(record.familyId, record.split)
    if (record.familyId !== record.templateFamily) throw new Error('TEMPLATE_FAMILY_ID_MISMATCH')
    if ((record.cohort === 'EXPLORATORY') !== (record.split === 'EXPLORATORY_ONLY')) throw new Error('EXPLORATORY_SPLIT_MIXED')
    verifySpans(record)
  }
  if (full && (parsed.filter(row => row.cohort === 'CORE').length !== CORE_RECORD_COUNT
    || parsed.filter(row => row.cohort === 'EXPLORATORY').length !== EXPLORATORY_RECORD_COUNT)) throw new Error('SEARCH_BENCHMARK_COUNT_MISMATCH')
  return { records: parsed.length, templateFamilyLeakage: 0 }
}

export function requireReviewedHeldOut(records, receipt) {
  validateSearchDataset(records)
  const gate = heldOutSignoffGate(records, receipt)
  if (!gate.allowed) throw new Error(gate.reason)
  if (records.some(record => record.cohort === 'CORE' && (record.truth.status !== 'APPROVED'
    || !record.truth.disagreementResolved || record.truth.reviewerMetadata === null))) throw new Error('CORE_REVIEW_INCOMPLETE')
  return records.filter(record => record.split === 'HELD_OUT')
}
