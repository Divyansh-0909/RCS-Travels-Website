import { generateLocationCandidates } from '../../../services/search/locations/candidates.ts';
import { identityHash } from './adapters.js';

export const PILOT_SELECTION = [
  ['core-standalone-002', 'English location-only'], ['core-complete-simple-001', 'English scheduled journey and exclusion'],
  ['core-date-only-001', 'English incomplete pickup-only'], ['core-vehicle-preferences-002', 'English exclusion-only'],
  ['core-role-order-003', 'English reversed phrase order'], ['core-assisted-services-003', 'English flags and negation'],
  ['core-ambiguity-conflict-001', 'English conflicting clocks'], ['core-unclear-noisy-candidates-001', 'English unrelated intent'],
  ['hh-v1-seed-001', 'Romanized relative date and omitted minutes'], ['hh-v1-seed-007', 'Romanized positive and negative vehicle'],
  ['hh-v1-added-023', 'Romanized reversed roles and clock'], ['hh-v1-added-028', 'Romanized conditional alternatives'],
  ['hh-v1-added-030', 'Romanized negative vehicle and any alternative'], ['hh-v1-seed-040', 'Hinglish negative sharing'],
  ['hh-v1-added-032', 'Hinglish corrected destination'], ['hh-v1-added-033', 'Hinglish conditional preferred class'],
  ['hh-v1-seed-021', 'Devanagari location-only'], ['hh-v1-added-001', 'Devanagari route and daypart clock'],
  ['hh-v1-added-002', 'Devanagari route with daypart'], ['hh-v1-added-003', 'Devanagari corrected destination'],
  ['hh-v1-added-004', 'Devanagari exclusion and conditional preference'], ['hh-v1-added-007', 'Devanagari unsupported rental'],
  ['hh-v1-added-016', 'Devanagari immediate route and negative sharing'], ['hh-v1-added-018', 'Devanagari unresolved timezone boundary'],
];

const categorical = (instructions, choices) => ({ kind: 'choice', instructions, choices });
const ternary = { YES: 'Yes, established by the original source and supplied policy.', NO: 'No.', AMBIGUOUS: 'Uncertain or conflicting source evidence.' };
const MISSING_FIELDS = ['pickup', 'drop', 'vehicleClass', 'timing', 'timing.date', 'timing.time'];
const UNSUPPORTED = ['PASSENGER_COUNT', 'STOP', 'RETURN_JOURNEY', 'RENTAL', 'AC_PREFERENCE', 'CONDITIONAL_PREFERENCE', 'OTHER'];

// No labels, row IDs, rationale or gold query type enter this provider input.
export function commonTasks(input) {
  const query = input.query;
  const location = generateLocationCandidates(query, 'LOCATION_SEARCH');
  const route = generateLocationCandidates(query, 'BOOKING_REQUEST');
  const map = new Map([...location.candidates, ...route.candidates].map(candidate => [`${candidate.start}:${candidate.end}`, candidate]));
  const candidates = [...map.values()];
  if (candidates.length > 24 || candidates.reduce((sum, candidate) => sum + candidate.exactText.length, 0) > 8000) throw new Error('PILOT_CANDIDATE_LIMIT');
  const options = Object.fromEntries(candidates.map(candidate => [candidate.candidateId,
    JSON.stringify({ text: candidate.exactText, start: candidate.start, end: candidate.end })]));
  Object.assign(options, { NONE: 'This location role is absent.', OTHER_OR_UNAVAILABLE: 'A location is stated but none of the supplied spans is exact.',
    AMBIGUOUS: 'Multiple competing locations or uncertain role.' });
  const questions = {
    query_type: categorical('Classify the original customer input. A named place alone is location search; a route, vehicle, passenger or ride timing shorthand is booking intent.',
      { LOCATION_SEARCH: 'Location lookup without affirmative ride-form intent.', BOOKING_REQUEST: 'Ride request or ride-form shorthand.', UNCLEAR_OR_UNRELATED: 'Unclear or unrelated input.' }),
    complexity: categorical('One representable journey can be SIMPLE despite missing fields. Under RCS policy, alternatives, conditions, stops, explicit changed-mind corrections (including settled corrections requiring superseded provenance), and conflicting clauses are COMPLEX. Non-booking input requires NOT_APPLICABLE.',
      { SIMPLE: 'One representable journey.', COMPLEX: 'Complex semantics.', NOT_APPLICABLE: 'Not a booking request.' }),
    booking_intent: categorical('Is affirmative ride-form intent present?', { YES: 'Booking request or shorthand.', NO: 'Location-only or unrelated.', AMBIGUOUS: 'Genuinely uncertain intent.' }),
    pickup: categorical('Select the exact source pickup span, never a drop or extra stop. Do not infer geography.', options),
    drop: categorical('Select the exact source destination span, never the pickup or an extra stop.', options),
    vehicle: categorical('Choose the positive requested wire vehicle class. Exclusions alone do not positively request a class. Do not resolve conflicting positive classes.',
      { hatchback: 'Hatchback.', sedan: 'Sedan.', suv: 'Regular SUV / XL.', suv_premium: 'Premium SUV.',
        EXPLICIT_ANY: 'Explicit positive acceptance of any vehicle.', NOT_MENTIONED: 'No positive class or any acceptance.', AMBIGUOUS: 'Unresolved positive alternatives.' }),
    timing_mode: categorical('Read immediate versus scheduled timing; do not invent a time or treat omitted minutes as resolved. Negated immediate wording is not an immediate request.',
      { IMMEDIATE: 'Immediate now.', SCHEDULED: 'Future or scheduled time/date/daypart.', UNSPECIFIED: 'No timing intent.', AMBIGUOUS: 'Competing timing intent.' }),
    sharing: categorical('Read the sharing preference, preserving Hindi and English negation.', { YES: 'Sharing wanted.', NO: 'Sharing excluded / solo.', NOT_MENTIONED: 'Absent.', AMBIGUOUS: 'Conflicting or conditional.' }),
    ambiguity: categorical('Is there unresolved source ambiguity or conflict requiring user resolution? Preserve competing destinations/times/conditions; an explicit settled correction alone is not ambiguity.', ternary),
  };
  for (const vehicle of ['hatchback', 'sedan', 'suv', 'suv_premium']) questions[`exclude_${vehicle}`] = categorical(
    `Is ${vehicle} explicitly excluded? Generic negative SUV/XL excludes suv AND suv_premium; regular/premium subtype exclusions remain specific.`, ternary);
  for (const field of MISSING_FIELDS) questions[`missing_${field.replaceAll('.', '_')}`] = categorical(
    `For a BOOKING_REQUEST, is ${field} missing and requiring form entry under the supplied policy? Judge missing fields, not Places grounding or minute-ambiguity diagnostics.`, ternary);
  for (const kind of UNSUPPORTED) questions[`unsupported_${kind}`] = categorical(`Does the request contain ${kind}? Preserve advisory or planned capability requests as present without claiming they are bookable.`, ternary);
  return { candidates, request: { state: JSON.stringify({ originalQuery: query, context: input.context,
    policy: 'search-owner-policy-P1-P11-v2; one interpretation then editable unconfirmed form; passenger allocation advisory; stops planned and not bookable; AC/rental/return/conditional unsupported material semantics retained; actual vehicle selection required even for ANY/exclusion-only; omitted date/time requirements depend on stated timing mode; preserve all alternatives and exact original UTF-16 spans.',
    candidates }), questions } };
}

const allowed = values => ({ allowed: [...new Set(values)] });
const spanMatches = (a, b) => a.start === b.start && a.end === b.end && a.exactText === b.exactText;

export function commonLabels(expected, candidates) {
  const result = { query_type: allowed([expected.queryType]), complexity: allowed([expected.complexity]),
    booking_intent: expected.queryType === 'UNCLEAR_OR_UNRELATED' ? null : allowed([expected.queryType === 'BOOKING_REQUEST' ? 'YES' : 'NO']),
    timing_mode: allowed([expected.timingMode]), sharing: allowed([expected.flags.sharing?.state === 'AMBIGUOUS' ? 'AMBIGUOUS'
      : expected.flags.sharing?.state === 'RESOLVED' ? expected.flags.sharing.value ? 'YES' : 'NO' : 'NOT_MENTIONED']) };
  for (const role of ['pickup', 'drop']) {
    const spans = expected[`${role}Spans`];
    const matches = candidates.filter(candidate => spans.some(span => spanMatches(span, candidate))).map(candidate => candidate.candidateId);
    const conditionalDrop = role === 'drop' && expected.conditionalAlternatives?.includes('CONDITIONAL_DESTINATIONS');
    result[role] = allowed(conditionalDrop ? ['AMBIGUOUS'] : !spans.length ? ['NONE'] : matches.length ? matches : ['OTHER_OR_UNAVAILABLE']);
  }
  const vehicle = expected.vehicle;
  result.ambiguity = Array.isArray(expected.ambiguities) ? allowed([expected.ambiguities.length ? 'YES' : 'NO']) : null;
  result.vehicle = allowed([vehicle.state === 'RESOLVED' ? vehicle.value : vehicle.state === 'EXPLICIT_ANY' ? 'EXPLICIT_ANY'
    : vehicle.state === 'AMBIGUOUS' ? 'AMBIGUOUS' : 'NOT_MENTIONED']);
  for (const value of ['hatchback', 'sedan', 'suv', 'suv_premium']) result[`exclude_${value}`] = allowed([(vehicle.excluded ?? []).includes(value) ? 'YES' : 'NO']);
  for (const field of MISSING_FIELDS) result[`missing_${field.replaceAll('.', '_')}`] = expected.queryType !== 'BOOKING_REQUEST' ? null
    : allowed([expected.missingFields.includes(field) ? 'YES' : 'NO']);
  for (const kind of UNSUPPORTED) result[`unsupported_${kind}`] = allowed([expected.unsupportedRequests.includes(kind) ? 'YES' : 'NO']);
  return result;
}

export function labelView(row, language) {
  if (language === 'ENGLISH') {
    const expected = row.truth.expected;
    const keys = ['queryType', 'complexity', 'pickupSpans', 'dropSpans', 'vehicle', 'timingMode', 'flags', 'missingFields', 'unsupportedRequests', 'ambiguities'];
    if (keys.some(key => expected[key]?.status !== 'LABELLED')) throw new Error('PILOT_UNLABELLED_TASK');
    return Object.fromEntries(keys.map(key => [key, expected[key].value]));
  }
  const flags = Object.fromEntries(Object.entries(row.expected.flags).map(([key, value]) => [key,
    value === 'UNSPECIFIED' ? { state: 'UNSPECIFIED' } : { state: 'RESOLVED', value }]));
  return { ...row.expected, flags };
}

export function scoreCommon(rows) {
  const questions = new Set(rows.flatMap(row => Object.keys(row.labels)));
  const metrics = Object.fromEntries([...questions].map(name => {
    const eligible = rows.filter(row => row.labels[name] !== null);
    return [name, { correct: eligible.filter(row => row.labels[name].allowed.includes(row.observation?.normalized?.choices[name]?.choice)).length,
      total: eligible.length, observed: eligible.filter(row => row.observation?.normalized?.choices[name]).length }];
  }));
  const labels = [...questions];
  return { cases: rows.length, valid: rows.filter(row => row.observation?.normalized).length,
    exactAllLabelledTasks: rows.filter(row => labels.every(name => row.labels[name] === null
      || row.labels[name].allowed.includes(row.observation?.normalized?.choices[name]?.choice))).length, metrics };
}

export function freezePlan(content) { return { ...content, planHash: identityHash(content) }; }
