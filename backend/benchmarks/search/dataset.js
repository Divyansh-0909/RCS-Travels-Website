import { createHash } from 'node:crypto'
import { coreGroups, exploratoryQueries, instantiate } from './templates.js'

export const SEARCH_BENCHMARK_VERSION = 'ride-search-benchmark-v1-review-proposal'
export const SEARCH_BENCHMARK_SEED = 'rcs-search-s5-family-split-2026-10-04'
export const SEARCH_BENCHMARK_CLOCK = '2026-10-04T12:00:00+05:30'
export const SEARCH_BENCHMARK_TIME_ZONE = 'Asia/Kolkata'
export const SEARCH_BENCHMARK_CAPABILITY_VERSION = 'ride-search-s4'
export const CORE_RECORD_COUNT = 320
export const EXPLORATORY_RECORD_COUNT = 40
export const SEARCH_BENCHMARK_FROZEN_HASH = null
export const labelled = value => ({ status: 'LABELLED', value })
export const notLabelled = reason => ({ status: 'NOT_LABELLED', reason })
const digest = value => createHash('sha256').update(value).digest('hex')
const rank = family => digest(`${SEARCH_BENCHMARK_SEED}:${family}`)
const unspecified = () => ({ state: 'UNSPECIFIED' })
const scalar = value => value === undefined || value === null ? unspecified() : { state: 'RESOLVED', value }

export function searchLabelSpans(text, phrase) {
  if (!phrase) return []
  const result = []
  let offset = text.indexOf(phrase)
  while (offset !== -1) {
    result.push({ start: offset, end: offset + phrase.length, exactText: phrase })
    offset = text.indexOf(phrase, offset + phrase.length)
  }
  if (result.length === 0) throw new Error('SEARCH_GOLD_SPAN_NOT_IN_QUERY')
  return result
}

function expectedMissing(fields, booking) {
  const missing = []
  if (!booking) return missing
  if (!fields.pickup) missing.push('pickup')
  if (!fields.drop) missing.push('drop')
  if (fields.vehicle?.state !== 'RESOLVED') missing.push('vehicleClass')
  if (!fields.timingMode) missing.push('timing')
  if (fields.timingMode === 'SCHEDULED') {
    if (!fields.date) missing.push('timing.date')
    if (!fields.time && !fields.unresolved?.includes('time')) missing.push('timing.time')
  }
  return missing
}

function expected(text, fields) {
  const queryType = fields.queryType ?? 'BOOKING_REQUEST'
  const complexity = queryType === 'BOOKING_REQUEST' ? fields.complexity ?? 'SIMPLE' : 'NOT_APPLICABLE'
  const value = {
    queryType, complexity, pickupSpans: searchLabelSpans(text, fields.pickup), dropSpans: searchLabelSpans(text, fields.drop),
    stopSpans: (fields.stops ?? []).flatMap(phrase => searchLabelSpans(text, phrase)),
    locationSearchSpans: queryType === 'LOCATION_SEARCH' ? [{ start: 0, end: text.length, exactText: text }] : [],
    groundingTarget: queryType === 'LOCATION_SEARCH' ? fields.activeField ?? 'LOCATION_TARGET_REQUIRED' : 'BY_ROLE',
    placeSelectionRequired: queryType !== 'UNCLEAR_OR_UNRELATED',
    vehicle: fields.vehicle ?? unspecified(), timingMode: fields.timingMode ?? 'UNSPECIFIED',
    date: scalar(fields.date), time: scalar(fields.time), passengers: scalar(fields.passengers),
    flags: Object.fromEntries(['sharing', 'isOutstation', 'preferSafeRoute', 'needsCarrier'].map(key => [key, scalar(fields[key])])),
    unsupportedRequests: fields.unsupported ?? [], missingFields: expectedMissing(fields, queryType === 'BOOKING_REQUEST'),
    ambiguities: [...(fields.ambiguity ?? []), ...(fields.policy ?? [])],
    fallbackExpected: complexity === 'COMPLEX' ? 'REQUIRED' : 'NOT_REQUIRED',
    routing: queryType === 'LOCATION_SEARCH' ? 'LOCATION' : queryType === 'UNCLEAR_OR_UNRELATED' ? 'CLARIFY'
      : complexity === 'COMPLEX' ? 'LUNA_REQUIRED' : 'JEV_SIMPLE',
  }
  const labels = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, labelled(item)]))
  labels.resolvedDate = notLabelled('COMPONENT_SCORING_ONLY_NO_TIMESTAMP_DEFAULTS')
  labels.resolvedTime = notLabelled('COMPONENT_SCORING_ONLY_NO_TIMESTAMP_DEFAULTS')
  for (const field of fields.unresolved ?? []) labels[field] = notLabelled('UNRESOLVED_POLICY_OR_JUDGMENT')
  return labels
}

function coreRecord(group, index) {
  const template = group.templates[index % group.templates.length]
  const variantIndex = Math.floor(index / group.templates.length)
  const { text: rawText, fields } = instantiate(template, index, variantIndex)
  const courtesy = ['', 'Please: ', 'Need: ', 'Request: ', 'Ride request: ', 'Cab request: ', 'Hello, ', 'Booking request: ']
  const prefixIndex = group.id === 'partial' || (!fields.pickup && !fields.drop && fields.queryType !== 'LOCATION_SEARCH')
    ? Math.floor(variantIndex / 4) : Math.floor(index / 30)
  let text = courtesy[prefixIndex] + rawText.replace(/\bsuv_premium\b/g, 'premium SUV')
  const negationOverlay = group.id === 'complete-simple' && fields.vehicle.value !== 'sedan'
  if (negationOverlay) { text += ', no sedan'; fields.vehicle.excluded = ['sedan'] }
  const id = `core-${group.id}-${String(index + 1).padStart(3, '0')}`
  return { id, familyId: template.id, templateFamily: template.id, category: group.id, cohort: 'CORE',
    ordinaryOrAdversarial: template.review.length ? 'ADVERSARIAL' : 'ORDINARY',
    tags: [group.id, ...template.review, ...(negationOverlay ? ['VEHICLE_NEGATION'] : [])], split: 'UNASSIGNED',
    modelInput: { query: text, context: { clock: SEARCH_BENCHMARK_CLOCK, timeZone: SEARCH_BENCHMARK_TIME_ZONE,
      capabilityVersion: SEARCH_BENCHMARK_CAPABILITY_VERSION, activeField: fields.activeField ?? null } },
    truth: { status: 'PROPOSED', provenance: 'UNREVIEWED_PROPOSED_SYNTHETIC', reviewerMetadata: null, disagreementResolved: false,
      derivation: template.review.length ? 'JUDGMENT_REVIEW_REQUIRED' : 'FROZEN_SPEC_DETERMINISTIC',
      reviewReasons: [...template.review], unresolvedPolicies: fields.policy ?? [], expected: expected(text, fields) },
  }
}

function exploratoryRecord(text, index) {
  return { id: `exploratory-${String(index + 1).padStart(3, '0')}`, familyId: `exploratory-${index % 8}`, templateFamily: `exploratory-${index % 8}`,
    category: 'exploratory-hindi-hinglish', cohort: 'EXPLORATORY', ordinaryOrAdversarial: 'EXPLORATORY', tags: ['EXPLORATORY_LANGUAGE'], split: 'EXPLORATORY_ONLY',
    modelInput: { query: text, context: { clock: SEARCH_BENCHMARK_CLOCK, timeZone: SEARCH_BENCHMARK_TIME_ZONE,
      capabilityVersion: SEARCH_BENCHMARK_CAPABILITY_VERSION, activeField: null } },
    truth: { status: 'PROPOSED', provenance: 'UNREVIEWED_PROPOSED_SYNTHETIC', reviewerMetadata: null, disagreementResolved: false,
      derivation: 'JUDGMENT_REVIEW_REQUIRED', reviewReasons: ['EXPLORATORY_LANGUAGE_NOT_FROZEN'], unresolvedPolicies: ['EXPLORATORY_LANGUAGE'],
      expected: Object.fromEntries(['queryType', 'complexity', 'pickupSpans', 'dropSpans', 'vehicle', 'timingMode', 'date', 'time', 'passengers',
        'flags', 'unsupportedRequests', 'missingFields', 'ambiguities', 'fallbackExpected', 'routing'].map(key => [key, notLabelled('HUMAN_LANGUAGE_REVIEW_REQUIRED')])) },
  }
}

export function buildSearchBenchmarkDataset() {
  const core = coreGroups.flatMap(group => Array.from({ length: group.count }, (_entry, index) => coreRecord(group, index)))
  const heldOut = new Set()
  for (const group of coreGroups) {
    const families = group.templates.map(template => template.id).sort((a, b) => rank(a).localeCompare(rank(b)))
    for (const family of families.slice(0, Math.max(1, Math.round(families.length * 0.25)))) heldOut.add(family)
  }
  return [...core.map(record => ({ ...record, split: heldOut.has(record.familyId) ? 'HELD_OUT' : 'DEVELOPMENT' })),
    ...exploratoryQueries.map(exploratoryRecord)]
}

export function searchBenchmarkDatasetHash(records = buildSearchBenchmarkDataset()) { return digest(JSON.stringify(records)) }

export function searchBenchmarkIndex(records = buildSearchBenchmarkDataset()) {
  const count = predicate => records.filter(predicate).length
  const groups = key => Object.fromEntries([...new Set(records.map(record => record[key]))].map(value => [value, count(record => record[key] === value)]))
  return { total: records.length, core: count(record => record.cohort === 'CORE'), exploratory: count(record => record.cohort === 'EXPLORATORY'),
    development: count(record => record.split === 'DEVELOPMENT'), heldOut: count(record => record.split === 'HELD_OUT'),
    families: new Set(records.map(record => record.familyId)).size, categories: groups('category'), cohorts: groups('ordinaryOrAdversarial'),
    deterministicallyLabelled: count(record => record.truth.derivation === 'FROZEN_SPEC_DETERMINISTIC'),
    reviewRequired: count(record => record.truth.reviewReasons.length > 0), unresolvedPolicyCases: count(record => record.truth.unresolvedPolicies.length > 0),
    datasetHash: searchBenchmarkDatasetHash(records) }
}

export function buildSearchBenchmarkReviewExport(records = buildSearchBenchmarkDataset()) {
  return { version: SEARCH_BENCHMARK_VERSION, datasetHash: searchBenchmarkDatasetHash(records), index: searchBenchmarkIndex(records), reviewState: 'UNREVIEWED_PROPOSAL', records }
}

export function heldOutSignoffGate(records = buildSearchBenchmarkDataset(), reviewerMetadata) {
  if (!reviewerMetadata?.reviewerIds?.length || !reviewerMetadata.reviewedAt || !reviewerMetadata.receiptId) return { allowed: false, reason: 'REVIEWER_METADATA_REQUIRED' }
  if (reviewerMetadata.datasetHash !== searchBenchmarkDatasetHash(records)) return { allowed: false, reason: 'DATASET_HASH_MISMATCH' }
  if (records.some(record => record.cohort === 'CORE' && record.truth.provenance !== 'HUMAN_REVIEWED_SYNTHETIC')) return { allowed: false, reason: 'HELD_OUT_RECORDS_NOT_HUMAN_REVIEWED' }
  return { allowed: true, reason: null }
}
