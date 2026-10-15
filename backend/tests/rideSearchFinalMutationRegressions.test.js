import test from 'node:test';
import assert from 'node:assert/strict';
import { createRideSearchParser } from '../services/search/parser.ts';
import { answer, locationField, unsupportedRequests } from '../services/search/extractor.ts';
import { collectObservations } from '../services/search/observations.ts';
import { emptyDraft } from '../services/search/contracts.ts';
import { issue, queryRef, resolved, unspecified } from '../services/search/fields.ts';
import { resolveTemporal } from '../services/search/temporal.ts';
import { missingFields, preserveUserFields, validateEndpoints, validateRoles } from '../services/search/validation.ts';
import { createTestClock } from './helpers/testClock.js';
import { bookingRouting, candidateFor, decisionFake, expressionChoices, inputFor } from './helpers/rideSearchFake.js';
import { assertSearchResult } from './helpers/rideSearchAssertions.js';

const clock = () => createTestClock('2026-10-02T12:00:00+05:30');
const batchOf = values => ({ choices: Object.fromEntries(Object.entries(values).map(([key, choice]) => [key, { choice, confidence: 0.9 }])) });
const refsFor = query => [queryRef(query, 0, query.text.length)];
async function parse(text, values, configure = input => input, routing = bookingRouting) {
  const input = configure(inputFor(text));
  const provider = decisionFake([routing, request => ({ ...expressionChoices(request), ...values })]);
  const result = await createRideSearchParser(provider, clock()).parse(input);
  assertSearchResult(result, input);
  return result;
}

test('bounded answer validation rejects absent and unoffered values with a classified error', () => {
  for (const batch of [batchOf({ other: 'A' }), batchOf({ role: 'unoffered' })]) {
    assert.throws(() => answer(batch, 'role', ['A']), error => error.code === 'JEV_INVALID_RESPONSE');
  }
  assert.equal(answer(batchOf({ role: 'A' }), 'role', ['A']), 'A');
});

test('second location candidate retains its own exact source rather than the first candidate source', () => {
  const input = inputFor('campus to airport');
  const candidates = [candidateFor(input, 'campus', 'A'), candidateFor(input, 'airport', 'B')];
  assert.deepEqual(locationField(batchOf({ role: 'B' }), 'role', candidates), resolved(
    { kind: 'QUERY_CANDIDATE', candidateId: 'B' }, [queryRef(input.query, 10, 17)],
  ));
});

test('negation and distant strength clauses preserve exactly the stated vehicle intent', async () => {
  for (const text of ["don't sedan", "don't   send sedan", 'do   not sedan', 'do not sedan', 'do   not send sedan']) {
    const result = await parse(text, { exclude_sedan: 'EXCLUDED' });
    assert.equal(result.draft.vehicleClass.state, 'EXCLUDED', text);
    assert.deepEqual(result.draft.vehicleClass.excluded, ['sedan']);
  }
  for (const [text, strength] of [['only   sedan', 'REQUIRED'], ['prefer sedan tomorrow only', 'PREFERRED'],
    ['prefer tomorrow, sedan', 'REQUIRED'], ['sedan tomorrow preferred', 'REQUIRED']]) {
    const result = await parse(text, { vehicle_class: 'sedan', vehicle_strength: strength,
      timing_mode: text.includes('tomorrow') ? 'SCHEDULED' : 'UNSPECIFIED' });
    assert.equal(result.fallbackRequired, false, text);
    assert.equal(result.draft.vehicleClass.strength, strength, text);
  }
  const wrong = await parse('only   sedan', { vehicle_class: 'sedan', vehicle_strength: 'PREFERRED' });
  assert.deepEqual(wrong.fallbackReasons, ['JEV_INVALID_RESPONSE']);
});

test('uncertain exclusion and SUV scope diagnostics retain only relevant source evidence', async () => {
  const uncertain = await parse('sedan', { vehicle_class: 'sedan', vehicle_strength: 'REQUIRED', exclude_sedan: 'UNCLEAR' });
  assert.deepEqual(uncertain.issues.find(value => value.code === 'PRODUCT_POLICY_UNRESOLVED'),
    issue('PRODUCT_POLICY_UNRESOLVED', 'vehicleClass', 'POLICY', [queryRef(uncertain.draft.query, 0, 5)]));
  const scoped = await parse('sedan but no SUV', { vehicle_class: 'sedan', vehicle_strength: 'REQUIRED', exclude_suv: 'EXCLUDED' });
  assert.deepEqual(scoped.draft.vehicleClass.excluded, ['suv', 'suv_premium']);
  assert.equal(scoped.issues.some(value => value.code === 'SUV_EXCLUSION_SCOPE_UNRESOLVED'), false);
  const ordinary = await parse('not sedan', { exclude_sedan: 'EXCLUDED' });
  assert.equal(ordinary.issues.some(value => value.code === 'SUV_EXCLUSION_SCOPE_UNRESOLVED'), false);
});

test('unclear strength/class and explicit-any with a mandatory class remain ambiguous', async () => {
  for (const values of [
    { vehicle_class: 'UNCLEAR', vehicle_strength: 'REQUIRED' },
    { vehicle_class: 'sedan', vehicle_strength: 'UNCLEAR' },
    { vehicle_class: 'sedan', vehicle_strength: 'REQUIRED', vehicle_any: 'EXPLICIT_ANY' },
  ]) {
    const result = await parse('any car, sedan only', values);
    assert.equal(result.draft.vehicleClass.state, 'AMBIGUOUS');
    assert.ok(result.issues.some(value => value.code === 'VEHICLE_CONFLICT'));
  }
  const mixed = await parse('not SUV, prefer sedan', { vehicle_class: 'sedan', vehicle_strength: 'PREFERRED', exclude_suv: 'EXCLUDED' });
  assert.equal(mixed.draft.vehicleClass.state, 'RESOLVED');
  assert.equal(mixed.draft.vehicleClass.value, 'sedan');
  const invented = await parse('hatchback', { vehicle_class: 'sedan', vehicle_strength: 'PREFERRED' });
  assert.deepEqual(invented.fallbackReasons, ['JEV_INVALID_RESPONSE']);
});

test('known unsupported categories remain source-bound; unclear capability requests fallback', async () => {
  for (const [text, kind] of [['stop at Delta 1', 'STOP'], ['come back in the evening', 'RETURN_JOURNEY'],
    ['rent for 8 hours', 'RENTAL'], ['AC car', 'AC_PREFERENCE'], ['SUV if available', 'CONDITIONAL_PREFERENCE']]) {
    const result = await parse(text, { unsupported_service: kind,
      ...(text.includes('SUV') ? { vehicle_class: 'suv', vehicle_strength: 'PREFERRED' } : {}),
      ...(text.includes('evening') ? { timing_mode: 'SCHEDULED' } : {}) });
    assert.equal(result.fallbackRequired, false, text);
    assert.ok(result.draft.unsupportedRequests.some(value => value.kind === kind), text);
  }
  const uncertain = await parse('cab', { unsupported_service: 'UNCLEAR' });
  assert.ok(uncertain.fallbackReasons.includes('EXTRACTION_BINDING_UNRESOLVED'));
  const inconsistent = await parse('AC car', { unsupported_service: 'RENTAL' });
  assert.deepEqual(inconsistent.fallbackReasons, ['EXTRACTION_BINDING_UNRESOLVED']);
  assert.deepEqual(inconsistent.draft.unsupportedRequests.map(value => value.kind), ['AC_PREFERENCE']);
});

test('unsupported location linkage includes boundary-contained phrases and excludes both outside phrases', () => {
  const input = inputFor('campus, stop at Delta 1, airport');
  const candidates = [candidateFor(input, 'campus', 'before'), candidateFor(input, 'stop at Delta 1', 'whole'),
    candidateFor(input, 'Delta 1', 'inside'), candidateFor(input, 'airport', 'after')];
  const records = unsupportedRequests(collectObservations(input.query), candidates, 'BACKEND_CAPABILITY_UNSUPPORTED');
  assert.deepEqual(records[0].candidateIds, ['whole', 'inside']);
});

test('location search selection does not report a missing candidate when one was selected', async () => {
  const result = await parse('Pari Chowk', { location_search_candidate: 'B' }, input => ({ ...input,
    candidates: [candidateFor(input, 'Pari', 'A'), candidateFor(input, 'Pari Chowk', 'B')] }),
  { query_type: 'LOCATION_SEARCH', booking_complexity: 'NOT_APPLICABLE' });
  assert.equal(result.route, 'LOCATION_SEARCH');
  assert.deepEqual(result.issues, []);
});

test('resource-limit diagnostics retain LIMIT_EXCEEDED rather than unrelated invalid-provenance', async () => {
  const result = await parse('x'.repeat(2001), {});
  assert.deepEqual(result.issues, [issue('LIMIT_EXCEEDED', 'query', 'INVALID')]);
});

test('safe provider failure retains successful routing while removing untrusted extraction', async () => {
  const provider = decisionFake([bookingRouting, new Error('private transport failure')]);
  const input = inputFor('sedan');
  const result = await createRideSearchParser(provider, clock()).parse(input);
  assertSearchResult(result, input);
  assert.equal(result.draft.queryType, 'BOOKING_REQUEST');
  assert.equal(result.draft.complexity, 'SIMPLE');
  assert.equal(result.draft.vehicleClass.state, 'UNSPECIFIED');
});

test('a fully extracted simple draft only needs grounding; a missing mentioned candidate requires future fallback', async () => {
  const complete = await parse('from campus to airport sedan now', { pickup_candidate: 'A', drop_candidate: 'B',
    pickup_presence: 'PRESENT', drop_presence: 'PRESENT', role_consistency: 'CONSISTENT',
    vehicle_class: 'sedan', vehicle_strength: 'REQUIRED', timing_mode: 'IMMEDIATE' }, input => ({ ...input,
    candidates: [candidateFor(input, 'campus', 'A'), candidateFor(input, 'airport', 'B')] }));
  assert.equal(complete.route, 'SIMPLE_COMPLETE');
  assert.equal(complete.fallbackRequired, false);
  assert.deepEqual(complete.issues.map(value => value.code), ['PLACES_GROUNDING_REQUIRED', 'PLACES_GROUNDING_REQUIRED']);
  const missing = await parse('from campus', { pickup_presence: 'PRESENT', role_consistency: 'CONSISTENT' });
  assert.equal(missing.route, 'COMPLEX_FALLBACK_REQUIRED');
  assert.deepEqual(missing.fallbackReasons, ['LOCATION_CANDIDATE_MISSING']);
});

test('role presence and NO_ROLES must agree with each resolved endpoint independently', () => {
  const input = inputFor('campus airport');
  for (const role of ['pickup', 'drop']) {
    const draft = emptyDraft(input.query);
    draft.candidates = [candidateFor(input, 'campus', 'A')];
    draft[role] = resolved({ kind: 'QUERY_CANDIDATE', candidateId: 'A' }, [queryRef(input.query, 0, 6)]);
    const choices = { pickup_presence: 'ABSENT', drop_presence: 'ABSENT', role_consistency: 'CONSISTENT' };
    const absent = [];
    validateRoles(draft, batchOf(choices), absent);
    assert.deepEqual(absent, [issue('ROLE_CONFLICT', role, 'INVALID', draft[role].refs)]);
    choices[`${role}_presence`] = 'PRESENT';
    choices.role_consistency = 'NO_ROLES';
    const inconsistent = [];
    validateRoles(draft, batchOf(choices), inconsistent);
    assert.deepEqual(inconsistent, [issue('ROLE_CONFLICT', 'locations', 'INVALID')]);
  }
});

test('directional guards reject reversal across explicit role forms, whitespace and word order', () => {
  for (const text of ['pick   me   at campus and drop at airport', 'pick me   up   at campus and drop me   off   at airport',
    'pickup   at campus and drop   at airport', 'pick me at   campus and drop me at   airport',
    'from campus and drop   me at airport', 'to airport then pick me at campus', 'campus    se airport']) {
    const input = inputFor(text);
    for (const swapped of [false, true]) {
      const draft = emptyDraft(input.query);
      draft.candidates = [candidateFor(input, 'campus', 'A'), candidateFor(input, 'airport', 'B')];
      for (const [role, id] of [['pickup', swapped ? 'B' : 'A'], ['drop', swapped ? 'A' : 'B']]) {
        draft[role] = locationField(batchOf({ role: id }), 'role', draft.candidates);
      }
      const issues = [];
      validateRoles(draft, batchOf({ pickup_presence: 'PRESENT', drop_presence: 'PRESENT', role_consistency: 'CONSISTENT' }), issues);
      assert.equal(issues.length > 0, swapped, text);
      const conflicted = text.includes(' se ') ? ['drop'] : ['pickup', 'drop'];
      assert.deepEqual(issues, swapped ? conflicted.map(role => issue('ROLE_CONFLICT', role, 'INVALID', draft[role].refs)) : [], text);
    }
  }
});

test('reversal-risk diagnostic is a role conflict rather than an unrecognized provider enum', () => {
  const draft = emptyDraft(inputFor('cab').query);
  const issues = [];
  validateRoles(draft, batchOf({ pickup_presence: 'ABSENT', drop_presence: 'ABSENT', role_consistency: 'REVERSAL_RISK' }), issues);
  assert.deepEqual(issues, [issue('ROLE_CONFLICT', 'locations', 'AMBIGUOUS')]);
});

test('endpoint validation permits partial and confirmed selections, and preserves overlap evidence', () => {
  const query = inputFor('campus airport').query;
  const fields = [unspecified(), resolved({ kind: 'USER_SELECTION', selectionId: 'one' }, refsFor(query))];
  for (const pickup of fields) for (const drop of fields) {
    const draft = { ...emptyDraft(query), pickup, drop };
    const issues = [];
    validateEndpoints(draft, issues);
    assert.equal(issues.length, pickup.state === 'RESOLVED' && drop.state === 'RESOLVED' ? 1 : 0);
  }
  const input = inputFor(query.text);
  const draft = emptyDraft(query);
  draft.candidates = [candidateFor(input, 'campus', 'A'), candidateFor(input, 'campus airport', 'B')];
  draft.pickup = locationField(batchOf({ role: 'B' }), 'role', draft.candidates);
  draft.drop = locationField(batchOf({ role: 'A' }), 'role', draft.candidates);
  const issues = [];
  validateEndpoints(draft, issues);
  assert.deepEqual(issues, [issue('ROLE_CONFLICT', 'locations', 'AMBIGUOUS', [...draft.pickup.refs, ...draft.drop.refs])]);
  draft.candidates = [candidateFor(input, 'campus', 'A'), candidateFor(input, ' airport', 'B')];
  const distinct = [];
  validateEndpoints(draft, distinct);
  assert.deepEqual(distinct, [], 'touching reversed source order is still non-overlapping');
  for (const role of ['pickup', 'drop']) {
    const missing = structuredClone(draft);
    missing[role].value.candidateId = 'missing';
    const independent = [];
    validateEndpoints(missing, independent);
    assert.deepEqual(independent, [], 'membership is rejected by provenance, not guessed by the overlap guard');
  }
});

test('follow-up requirements distinguish confirmed, ambiguous, absent and advisory fields', () => {
  const query = inputFor('cab').query;
  const refs = refsFor(query);
  const draft = emptyDraft(query);
  assert.deepEqual(missingFields(draft), [issue('FIELD_REQUIRED', 'pickup', 'MISSING'), issue('FIELD_REQUIRED', 'drop', 'MISSING'),
    issue('VEHICLE_SELECTION_REQUIRED', 'vehicleClass', 'MISSING'), issue('TIMING_REQUIRED', 'timing', 'MISSING')]);
  draft.pickup = resolved({ kind: 'USER_SELECTION', selectionId: 'P' }, refs);
  draft.drop = resolved({ kind: 'USER_SELECTION', selectionId: 'D' }, refs);
  draft.vehicleClass = { state: 'RESOLVED', value: 'sedan', strength: 'REQUIRED', excluded: [], refs };
  draft.timing = { mode: 'SCHEDULED', refs, date: resolved({ kind: 'RELATIVE', anchor: 'TOMORROW' }, refs),
    time: resolved({ kind: 'DAYPART', value: 'EVENING' }, refs) };
  assert.deepEqual(missingFields(draft), []);
  draft.passengers = resolved(3, refs);
  draft.unsupportedRequests = [{ kind: 'OTHER', refs, candidateIds: [], reasonCode: 'review' }];
  assert.deepEqual(missingFields(draft), [issue('UNSUPPORTED_REQUEST', 'PASSENGER_COUNT', 'UNSUPPORTED', refs)]);
  draft.unsupportedRequests.push({ kind: 'PASSENGER_COUNT', refs, candidateIds: [], reasonCode: 'advisory' });
  assert.deepEqual(missingFields(draft), []);
  draft.pickup = { state: 'AMBIGUOUS', alternatives: [draft.pickup.value], reasonCode: 'CLARIFY_LOCATION', refs };
  assert.deepEqual(missingFields(draft), [], 'ambiguity is retained for clarification without fabricating grounding');
});

test('trusted form carry neither overwrites new explicit fields nor creates absent evidence or duplicate clauses', () => {
  const query = inputFor('cab').query;
  const refs = refsFor(query);
  const draft = emptyDraft(query);
  const trusted = emptyDraft(query);
  draft.vehicleClass = { state: 'RESOLVED', value: 'sedan', strength: 'REQUIRED', excluded: [], refs };
  trusted.vehicleClass = { state: 'RESOLVED', value: 'suv', strength: 'PREFERRED', excluded: [], refs };
  draft.timing = { ...draft.timing, mode: 'IMMEDIATE', refs };
  trusted.timing = { ...trusted.timing, mode: 'SCHEDULED', refs, date: resolved({ kind: 'RELATIVE', anchor: 'TOMORROW' }, refs) };
  draft.unsupportedRequests = [{ kind: 'STOP', refs, candidateIds: [], reasonCode: 'original' }];
  trusted.unsupportedRequests = structuredClone(draft.unsupportedRequests);
  const original = structuredClone(draft);
  preserveUserFields(draft, { formDraft: trusted });
  assert.deepEqual(draft, original);
  const absent = emptyDraft(query);
  preserveUserFields(absent, { formDraft: emptyDraft(query) });
  assert.deepEqual(absent, emptyDraft(query));
});

test('partial temporal diagnostics preserve field attribution and mixed-context dates cannot re-anchor', () => {
  const query = inputFor('date at 6').query;
  const refs = refsFor(query);
  const draft = emptyDraft(query);
  draft.timing = { mode: 'SCHEDULED', refs, date: resolved({ kind: 'ABSOLUTE', day: unspecified(),
    month: resolved(12, refs), year: resolved(2026, refs) }, refs), time: resolved({ kind: 'CLOCK', hour: 6,
    minute: unspecified(), notation: 'H12', period: resolved('PM', refs), precision: 'EXACT' }, refs) };
  assert.deepEqual(resolveTemporal(draft, clock().now(), 'Asia/Kolkata').issues, [
    issue('DATE_COMPONENT_REQUIRED', 'timing.date', 'AMBIGUOUS', refs), issue('TIME_MINUTE_REQUIRED', 'timing.time', 'AMBIGUOUS', refs),
  ]);
  draft.timing.date.value.day = resolved(5, refs);
  draft.timing.date.value.month = unspecified();
  assert.deepEqual(resolveTemporal(draft, clock().now(), 'Asia/Kolkata').issues, [
    issue('DATE_COMPONENT_REQUIRED', 'timing.date', 'AMBIGUOUS', refs), issue('TIME_MINUTE_REQUIRED', 'timing.time', 'AMBIGUOUS', refs),
  ]);
  const mixed = [...refs, { kind: 'USER_FIELD', field: 'timing', revision: query.revision }];
  draft.timing.date = resolved({ kind: 'RELATIVE', anchor: 'TOMORROW' }, mixed);
  assert.equal(resolveTemporal(draft, clock().now(), 'Asia/Kolkata').localDate, undefined);
  for (const mode of ['IMMEDIATE', 'UNSPECIFIED', 'AMBIGUOUS']) {
    draft.timing.mode = mode;
    assert.deepEqual(resolveTemporal(draft, clock().now(), 'Asia/Kolkata'), { issues: [] });
  }
});

test('bare-clock notation, approximate whitespace and independent dayparts preserve their exact meaning', () => {
  for (const [text, notation, period] of [['at 18', 'H24', 'UNSPECIFIED'], ['at 12', 'H12', 'RESOLVED']]) {
    const [time] = collectObservations(inputFor(text).query, []).times;
    assert.equal(time.value.notation, notation);
    assert.equal(time.value.period.state, period);
  }
  for (const text of ['around   7', 'about   7 PM']) {
    const [time] = collectObservations(inputFor(text).query, []).times;
    assert.equal(time.text, text);
    assert.equal(time.value.precision, 'APPROXIMATE');
  }
  const times = collectObservations(inputFor('morning, 6 in the evening, night').query, []).times;
  assert.deepEqual(times.map(value => [value.text, value.value.kind]), [
    ['6 in the evening', 'CLOCK'], ['morning', 'DAYPART'], ['night', 'DAYPART'],
  ]);
});

test('standalone and whitespace-expanded unsupported and advisory clauses preserve full spans', () => {
  for (const [text, kind] of [['stop   at Delta 1', 'STOP'], ['pick up   my friend', 'STOP'],
    ['pick up my   friend', 'STOP'], ['AC', 'AC_PREFERENCE'], ['AC   car', 'AC_PREFERENCE']]) {
    const query = inputFor(text).query;
    const records = collectObservations(query, []).unsupported;
    assert.deepEqual(records, [{ kind, ref: queryRef(query, 0, text.length) }], text);
  }
  const luggage = collectObservations(inputFor('without luggage   carrier').query, []).flags.needsCarrier;
  assert.deepEqual(luggage.map(value => [value.text, value.value]), [['without luggage   carrier', false]]);
  for (const text of ['1 passenger', '1 person']) {
    assert.deepEqual(collectObservations(inputFor(text).query, []).passengers.map(value => [value.text, value.value]), [[text, 1]]);
  }
  const query = inputFor('any   car').query;
  assert.deepEqual(collectObservations(query, []).anyVehicle, [queryRef(query, 0, query.text.length)]);
});

test('explicit four-digit early calendar years retain their source year and are rejected as past scheduling', async () => {
  const result = await parse('0026-10-03 at 6 PM', { timing_mode: 'SCHEDULED' });
  assert.equal(result.draft.timing.date.value.year.value, 26);
  assert.equal(result.temporal.localDate, '0026-10-03');
  assert.equal(result.temporal.scheduledAt, undefined);
  assert.ok(result.issues.some(value => value.code === 'SCHEDULE_TOO_SOON'));
});
