import { routingRequest, SEARCH_QUESTION_CONTRACT_VERSION } from '../../../services/search/questions.ts';
import { missingFields } from '../../../services/search/validation.ts';
import { commonTasks, commonLabels } from './pilot.js';
import { validateRequest } from './adapters.js';

export const ALIGNED_CONTRACT_VERSION = 'search-decision-common-v5-policy-aligned';
export const REQUIRED_FIELD_POLICY = Object.freeze({
  authority: 'search-owner-decisions-2026-10-06 P7-P10; validation.missingFields; locations.formResolution',
  nonBooking: 'No booking missing-field projection for LOCATION_SEARCH or UNCLEAR_OR_UNRELATED.',
  locations: 'UNSPECIFIED requires field entry. A resolved query span needs Places grounding, not an absent-field label. AMBIGUOUS needs alternative resolution, not an absent-field label.',
  vehicle: 'A concrete class must be selected for submission, including explicit ANY and exclusion-only preferences. Retain exclusions; never choose a class from a negative clause.',
  unspecifiedTiming: 'UNSPECIFIED timing requires the parent timing field only; date/time child missing-field flags are not applicable yet.',
  immediateTiming: 'IMMEDIATE requires no scheduled date/time fields.',
  scheduledTiming: 'SCHEDULED requires date/time only when the respective source field is UNSPECIFIED. An ambiguous field instead needs conflict resolution.',
  incompleteTime: 'A stated daypart or hour without minutes is not an absent source-time field. Preserve EXACT_TIME_REQUIRED and TIME_MINUTE_REQUIRED controls; never invent minutes.',
  unsupported: 'Source feature presence and submission support are separate. Passenger allocation and straightforward soft AC-if-available are advisory. Other material unsupported semantics block submission. Missing values alone do not trigger another model turn.',
});

// This is an application-policy projection over an already source-bound draft,
// not a model answer and not a complete form-readiness or booking decision.
export function requiredFieldProjection(draft) {
  if (draft.queryType !== 'BOOKING_REQUEST') return { applicable: false, missingFields: [], issues: [], submissionAllowed: false };
  const issues = missingFields(draft);
  return { applicable: true,
    missingFields: [...new Set(issues.filter(value => value.category === 'MISSING').map(value => value.field))].sort(),
    issues, submissionAllowed: false };
}

// Keep v4's implementation available for historical request reconstruction.
// V5 has a new identity and never borrows v4 predictions as new accuracy.
export function alignedTasks(input) {
  const legacy = commonTasks(input);
  const questions = Object.fromEntries(Object.entries(legacy.request.questions)
    .filter(([name]) => !name.startsWith('missing_'))
    .map(([name, question]) => [name, { ...question, choices: { ...question.choices } }]));
  const routing = routingRequest({ query: input.query, candidates: legacy.candidates,
    timeZone: input.context?.timeZone ?? 'Asia/Kolkata' }, input.context?.clock ?? 'UNSPECIFIED_CLOCK');
  questions.query_type = routing.questions.query_type;
  questions.complexity = routing.questions.booking_complexity;
  questions.booking_intent.instructions = 'Is affirmative ride-form intent present? A route, vehicle/exclusion-only request or timing shorthand can establish booking intent despite missing fields. Location-only or clearly unrelated input is NO; unresolved intent is AMBIGUOUS.';
  for (const role of ['pickup', 'drop']) questions[role].instructions += ' NONE means that source role is absent; OTHER_OR_UNAVAILABLE means it is stated but no supplied exact span represents it; AMBIGUOUS means competing unresolved alternatives. A settled correction selects the corrected role while retaining superseded provenance. A location-only lookup assigns neither booking role.';
  questions.vehicle.instructions += ' Preserve explicit ANY separately from a concrete selection. Generic negative SUV excludes both SUV classes; it never positively selects sedan or hatchback.';
  questions.ambiguity.instructions = 'Does the original source contain competing unresolved alternatives or a material conflict? Missing fields, ungrounded spans, unsupported features, omitted minutes and routine form review alone are not source ambiguity. A settled explicit correction alone is not ambiguity, even though routing may be COMPLEX.';
  for (const vehicle of ['hatchback', 'sedan', 'suv', 'suv_premium']) {
    questions[`exclude_${vehicle}`].instructions += ' If the class is unmentioned or merely differs from a positive class, answer NO. Use AMBIGUOUS only for conflicting or unresolved source exclusion wording.';
  }
  for (const kind of ['PASSENGER_COUNT', 'STOP', 'RETURN_JOURNEY', 'RENTAL', 'AC_PREFERENCE', 'CONDITIONAL_PREFERENCE', 'OTHER']) {
    questions[`unsupported_${kind}`].instructions += ' This is source-feature presence, not a complexity or submission decision. Missing fields, lack of Places grounding and uncertainty are not OTHER unsupported services. Advisory passenger/soft AC and planned stops remain distinguishable through application policy.';
  }
  const state = { ...JSON.parse(legacy.request.state), contractVersion: ALIGNED_CONTRACT_VERSION,
    productionQuestionContract: SEARCH_QUESTION_CONTRACT_VERSION, policy: REQUIRED_FIELD_POLICY };
  const request = { state: JSON.stringify(state), questions };
  validateRequest(request);
  return { candidates: legacy.candidates, request,
    derivedTasks: { missingFields: { status: 'DETERMINISTIC_POLICY_ONLY', source: 'validation.missingFields',
      requires: 'Source-bound parser draft; legacy absent-field labels and complete form controls scored separately.' } },
    unsupportedTasks: ['ARBITRARY_COMPLEX_JSON', 'PLACES_GROUNDING', 'BOOKING_CONFIRMATION'] };
}

export function alignedLabels(expected, candidates, blockedFields = []) {
  const labels = commonLabels(expected, candidates);
  if (Array.isArray(expected.ambiguities)) {
    const controlOnly = new Set(['EXACT_TIME_REQUIRED', 'TIME_PERIOD_REQUIRED', 'TIME_MINUTE_REQUIRED', 'TIME_PRECISION_CONFIRMATION']);
    const conflict = [expected.date, expected.time, expected.vehicle].some(field => field?.state === 'AMBIGUOUS')
      || expected.conditionalAlternatives?.includes('CONDITIONAL_DESTINATIONS');
    labels.ambiguity = conflict ? { allowed: ['YES'] }
      : expected.ambiguities.every(code => controlOnly.has(code)) ? { allowed: ['NO'] } : null;
  }
  return Object.fromEntries(Object.entries(labels)
    .filter(([name]) => !name.startsWith('missing_'))
    .map(([name, value]) => [name, blockedFields.includes(name) ? null : value]));
}
