import { isDeepStrictEqual } from 'node:util'
import { collectObservations } from '../../services/search/observations.ts'
import { emptyDraft } from '../../services/search/contracts.ts'
import { missingFields } from '../../services/search/validation.ts'
import { searchPrediction } from './prediction.js'
import { validateSearchDataset } from './validation.js'
import { searchBenchmarkDatasetHash } from './dataset.js'

// A deliberately narrow proof grammar for class approval, never a production parser.
// It contains no family names, template values, expected labels or provider decisions.
const clause = /(?:^|\b)(from\b|to\b|pickup\s*:|destination\s*:|pick me from\b|drop me at\b)\s*/gi
const boundary = /\s+(?:tomorrow|today|day after tomorrow|on \d|at \d|premium SUV|hatchback|sedan|suv)\b|[,;]/i
const stripCourtesy = text => text.replace(/^(?:please|need|request|ride request|cab request|hello|booking request)[:,]\s*/i, '')
const bookingMarker = /\b(?:cab|ride|book|now|tomorrow|today|hatchback|sedan|suv|people)\b/i
const span = (text, start, end) => ({ start, end, exactText: text.slice(start, end) })
function roles(text) {
  const matches = [...text.matchAll(clause)]
  const result = { pickup: [], drop: [] }
  for (let index = 0; index < matches.length; index += 1) {
    const marker = matches[index]; const start = marker.index + marker[0].length
    const rest = text.slice(start, matches[index + 1]?.index ?? text.length)
    const stop = rest.search(boundary); let phrase = (stop < 0 ? rest : rest.slice(0, stop)).trim()
    phrase = phrase.replace(/\s+and(?:\s+.*)?$/i, '').trim()
    if (phrase) result[/from|pickup/i.test(marker[1]) ? 'pickup' : 'drop'].push(span(text, start, start + phrase.length))
  }
  // The only unmarked grammar admitted is a single explicit X to Y direction.
  if (!result.pickup.length && result.drop.length === 1 && /^.+\s+to\s+/i.test(text) && matches.length === 1) {
    const phrase = stripCourtesy(text.slice(0, matches[0].index).trim())
    if (!bookingMarker.test(phrase)) result.pickup.push(span(text, text.indexOf(phrase), text.indexOf(phrase) + phrase.length))
  }
  return result
}
const field = observation => observation ? { state: 'RESOLVED', value: observation.value, refs: [observation.ref] } : { state: 'UNSPECIFIED' }
function vehicle(query, observations) {
  const required = []; const excluded = []
  for (const item of observations.vehicles) {
    const prefix = query.text.slice(0, item.ref.start)
    if (/\b(?:no|not|except|don't send an?)\s*$/i.test(prefix)) excluded.push(item.value)
    else required.push(item.value)
  }
  if (new Set(required).size > 1 || required.some(value => excluded.includes(value))) throw new Error('VEHICLE_JUDGMENT_REQUIRED')
  if (required.length && observations.anyVehicle.length) throw new Error('VEHICLE_JUDGMENT_REQUIRED')
  if (excluded.includes('suv')) throw new Error('SUV_POLICY_UNRESOLVED')
  if (required.length) return { state: 'RESOLVED', value: required[0], strength: /\bprefer\b/i.test(query.text) ? 'PREFERRED' : 'REQUIRED', excluded }
  if (excluded.length) return { state: 'EXCLUDED', excluded }
  return observations.anyVehicle.length ? { state: 'EXPLICIT_ANY', excluded: [] } : { state: 'UNSPECIFIED' }
}
function attachRoles(query, roleSpans, draft) {
  for (const role of ['pickup', 'drop']) {
    if (roleSpans[role].length > 1) throw new Error('DIRECTION_JUDGMENT_REQUIRED')
    for (const source of roleSpans[role]) {
      const candidateId = `${role}:${source.start}:${source.end}`
      draft.candidates.push({ candidateId, queryId: query.id, queryRevision: 1, ...source, method: 'DIRECTIONAL_CLAUSE', generatorVersion: 'approval-proof-v1' })
      draft[role] = { state: 'RESOLVED', value: { kind: 'QUERY_CANDIDATE', candidateId }, refs: [] }
    }
  }
}
function checkTemporalProof(observed) {
  if (observed.dates.length > 1 || observed.times.length > 1 || observed.unsupported.length || observed.passengers.length) throw new Error('SEMANTIC_REVIEW_REQUIRED')
  const date = observed.dates[0]
  if (date?.value.kind === 'WEEKDAY' || (date?.value.kind === 'ABSOLUTE' && date.value.year.state !== 'RESOLVED')) throw new Error('DATE_POLICY_UNRESOLVED')
  const time = observed.times[0]
  if (time && (time.value.kind === 'DAYPART' || time.value.period?.state === 'AMBIGUOUS' || time.value.precision === 'APPROXIMATE')) throw new Error('TIME_CLARIFICATION_REQUIRED')
  if (observed.now.length && (date || time)) throw new Error('TEMPORAL_CONFLICT')
  return { mode: observed.now.length ? 'IMMEDIATE' : date || time ? 'SCHEDULED' : 'UNSPECIFIED', refs: [], date: field(date), time: field(time) }
}
function attachFlags(observed, draft) {
  for (const key of ['sharing', 'isOutstation', 'preferSafeRoute', 'needsCarrier']) {
    if (new Set(observed.flags[key].map(item => item.value)).size > 1) throw new Error('FLAG_CONFLICT')
    draft[key] = field(observed.flags[key][0])
  }
}
function classify(query, draft, observed) {
  const date = observed.dates[0]; const time = observed.times[0]
  const booking = draft.candidates.length || observed.vehicles.length || observed.anyVehicle.length || date || time || observed.now.length
  const unrelated = /^what is the weather near .+\?$/i.test(stripCourtesy(query.text))
  if (!booking && !unrelated && /\b(?:book|cab|ride|pick|drop|if|unless|return|rent|tomorrow|today)\b/i.test(query.text)) throw new Error('QUERY_CLASS_JUDGMENT_REQUIRED')
  if (!booking && !unrelated && !/\b(?:chowk|gate|delta|garden|market|library|hostel|metro|avenue|campus|bus stand|circle|road|station|tower|clinic|centre|college|airport|IGI|Delhi|Noida|knowledge park)\b/i.test(query.text)) throw new Error('LOCATION_CLASS_JUDGMENT_REQUIRED')
  draft.queryType = booking ? 'BOOKING_REQUEST' : unrelated ? 'UNCLEAR_OR_UNRELATED' : 'LOCATION_SEARCH'
  draft.complexity = booking ? 'SIMPLE' : 'NOT_APPLICABLE'
  return { booking, unrelated }
}
function derive(record) {
  const query = { id: record.id, revision: 1, text: record.modelInput.query }
  if (/\b(?:if|unless|otherwise|actually|instead|or|but|return|rent|London time|UTC)\b/i.test(query.text)) throw new Error('INTERPRETATION_OUTSIDE_PROOF_GRAMMAR')
  const roleSpans = roles(query.text)
  const draft = emptyDraft(query)
  attachRoles(query, roleSpans, draft)
  const observed = collectObservations(query, draft.candidates)
  draft.timing = checkTemporalProof(observed)
  draft.vehicleClass = vehicle(query, observed)
  attachFlags(observed, draft)
  const { booking, unrelated } = classify(query, draft, observed)
  const issues = booking ? missingFields(draft) : []
  const prediction = searchPrediction({ draft, issues })
  return { ...prediction, pickupSpans: roleSpans.pickup, dropSpans: roleSpans.drop, stopSpans: [],
    locationSearchSpans: booking || unrelated ? [] : [span(query.text, 0, query.text.length)],
    groundingTarget: booking || unrelated ? 'BY_ROLE' : record.modelInput.context.activeField ?? 'LOCATION_TARGET_REQUIRED',
    placeSelectionRequired: !unrelated, fallbackExpected: 'NOT_REQUIRED', routing: booking ? 'JEV_SIMPLE' : unrelated ? 'CLARIFY' : 'LOCATION' }
}
export function validateDeterministicApproval(records) {
  let datasetValidationError = null
  try { validateSearchDataset(records) } catch (error) { datasetValidationError = error.message }
  const candidates = records.filter(record => record.cohort === 'CORE' && record.truth.derivation === 'FROZEN_SPEC_DETERMINISTIC')
  const results = candidates.map(record => {
    const failures = []; const proofs = []
    if (datasetValidationError && datasetValidationError !== 'INVALID_GOLD_SOURCE_SPAN') failures.push('DATASET_STRUCTURE_INVALID')
    if (record.truth.unresolvedPolicies.length || record.truth.reviewReasons.length) failures.push('POLICY_OR_JUDGMENT_PRESENT')
    if (record.truth.provenance !== 'UNREVIEWED_PROPOSED_SYNTHETIC') failures.push('UNEXPECTED_LABEL_PROVENANCE')
    try {
      validateSearchDataset([record], { full: false })
      const independentlyDerived = derive(record)
      for (const [key, expected] of Object.entries(record.truth.expected)) {
        if (['resolvedDate', 'resolvedTime'].includes(key)) {
          if (expected.status !== 'NOT_LABELLED') failures.push(`${key}:TIMESTAMP_NOT_PROVABLE`)
        } else if (expected.status !== 'LABELLED' || !Object.hasOwn(independentlyDerived, key)
          || !isDeepStrictEqual(expected.value, independentlyDerived[key])) failures.push(`${key}:INDEPENDENT_DERIVATION_MISMATCH`)
        else proofs.push({ field: key, rule: `FROZEN_S1_S4_${key}`, method: 'QUERY_GRAMMAR_AND_EXISTING_DETERMINISTIC_VALIDATION' })
      }
    } catch (error) { failures.push(error.message) }
    return { caseId: record.id, eligible: failures.length === 0, disposition: failures.length ? 'REVIEW_REQUIRED' : 'CLASS_APPROVAL_ELIGIBLE', failures, proofs }
  })
  return { version: 'search-class-approval-proof-v1', datasetHash: searchBenchmarkDatasetHash(records), approvalGranted: false, datasetValidationError,
    originalDeterministic: candidates.length, stillDeterministic: results.filter(result => result.eligible).length,
    movedToReview: results.filter(result => !result.eligible).length, results }
}
