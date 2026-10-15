import test from 'node:test';
import assert from 'node:assert/strict';
import { createRideSearchParser } from '../services/search/parser.ts';
import { emptyDraft, SEARCH_LIMITS } from '../services/search/contracts.ts';
import { issue, queryRef, resolved, ambiguous } from '../services/search/fields.ts';
import { validateRoles, preserveUserFields, observationLimit, missingFields } from '../services/search/validation.ts';
import { resolveTemporal } from '../services/search/temporal.ts';
import { collectObservations } from '../services/search/observations.ts';
import { createTestClock } from './helpers/testClock.js';
import { bookingRouting, candidateFor, decisionFake, expressionChoices, inputFor } from './helpers/rideSearchFake.js';
import { assertSearchResult } from './helpers/rideSearchAssertions.js';

const clock = () => createTestClock('2026-10-02T12:00:00+05:30');
async function run(text, choices = {}, configure = input => input, routing = bookingRouting) {
  const provider = decisionFake([routing, request => ({ ...expressionChoices(request), ...choices })]);
  const input = configure(inputFor(text));
  const result = await createRideSearchParser(provider, clock()).parse(input);
  assertSearchResult(result, input);
  return { result, provider };
}

test('provider classifications and candidate IDs cannot bypass consistency or membership checks', async () => {
  for (const routing of [
    { query_type: 'LOCATION_SEARCH', booking_complexity: 'SIMPLE' },
    { query_type: 'UNCLEAR_OR_UNRELATED', booking_complexity: 'COMPLEX' },
    { query_type: 'BOOKING_REQUEST', booking_complexity: 'NOT_APPLICABLE' },
    { query_type: 'INVENTED', booking_complexity: 'SIMPLE' },
  ]) {
    const { result } = await run('SUV', {}, undefined, routing);
    assert.equal(result.fallbackRequired, true);
    assert.equal(result.draft.queryType, 'UNCLEAR_OR_UNRELATED');
    assert.equal(result.draft.complexity, 'NOT_APPLICABLE');
  }
  for (const field of ['pickup_candidate', 'drop_candidate', 'passenger_candidate']) {
    const { result } = await run('3 people from campus to airport', { [field]: 'invented' });
    assert.deepEqual(result.fallbackReasons, ['JEV_INVALID_RESPONSE']);
    assert.equal(result.draft.passengers.state, 'UNSPECIFIED');
  }
  const location = await run('Pari Chowk', { location_search_candidate: 'fake' }, input => ({ ...input,
    candidates: [candidateFor(input, 'Pari Chowk', 'A')] }), { query_type: 'LOCATION_SEARCH', booking_complexity: 'NOT_APPLICABLE' });
  assert.deepEqual(location.result.fallbackReasons, ['JEV_INVALID_RESPONSE']);
  const missing = await run('Pari Chowk', {}, input => ({ ...input,
    candidates: [candidateFor(input, 'Pari Chowk', 'A')] }), { query_type: 'LOCATION_SEARCH', booking_complexity: 'NOT_APPLICABLE' });
  assert.equal(missing.result.draft.locationSearch.state, 'UNSPECIFIED');
  assert.ok(missing.result.issues.some(value => value.code === 'LOCATION_CANDIDATE_MISSING'));
});

test('empty and resource-excess queries stop without provider spend or fallback amplification', async () => {
  const empty = await run('   ');
  assert.equal(empty.result.route, 'UNCLEAR_OR_UNRELATED');
  assert.equal(empty.provider.requests.length, 0);
  const oversized = await run('a'.repeat(SEARCH_LIMITS.queryLength + 1));
  assert.equal(oversized.result.route, 'PARSER_UNAVAILABLE');
  assert.equal(oversized.provider.requests.length, 0);
  assert.equal(oversized.result.fallbackRequired, false);
  for (const text of [Array(9).fill('tomorrow').join(' '), Array(9).fill('6 PM').join(' '), Array(9).fill('3 people').join(' ')]) {
    const { result, provider } = await run(text);
    assert.equal(result.route, 'PARSER_UNAVAILABLE');
    assert.equal(provider.requests.length, 1);
    assert.ok(result.issues.some(value => value.code === 'LIMIT_EXCEEDED'));
  }
  const context = await run('SUV', {}, input => ({ ...input, trustedLocationSelections: [{ selectionId: 'saved', displayText: 'x'.repeat(12000) }] }));
  assert.equal(context.provider.requests.length, 0);
  assert.equal(context.result.fallbackRequired, false);
  assert.equal(context.result.issues[0].code, 'LIMIT_EXCEEDED');
});

test('positive classes, exclusions and strength cannot be invented or silently contradicted', async () => {
  for (const [text, choices] of [
    ['SUV', { vehicle_class: 'sedan', vehicle_strength: 'REQUIRED' }],
    ['SUV', { vehicle_class: 'suv', vehicle_strength: 'NOT_APPLICABLE' }],
    ['SUV', { vehicle_any: 'EXPLICIT_ANY' }],
    ['SUV', { exclude_sedan: 'EXCLUDED' }],
    ['SUV only', { vehicle_class: 'suv', vehicle_strength: 'PREFERRED' }],
    ['prefer SUV', { vehicle_class: 'suv', vehicle_strength: 'REQUIRED' }],
  ]) {
    const { result } = await run(text, choices);
    assert.deepEqual(result.fallbackReasons, ['JEV_INVALID_RESPONSE'], text);
  }
  for (const text of ['SUV or sedan', 'SUV preferred, but sedan only']) {
    const { result } = await run(text, { vehicle_class: 'suv', vehicle_strength: 'PREFERRED' });
    assert.equal(result.draft.vehicleClass.state, 'AMBIGUOUS');
    assert.deepEqual(result.draft.vehicleClass.alternatives, ['suv', 'sedan']);
  }
  const ignored = await run('anything except sedan', { vehicle_any: 'EXPLICIT_ANY' });
  assert.deepEqual(ignored.result.draft.vehicleClass.excluded, ['sedan']);
  assert.equal(ignored.result.fallbackRequired, false);
  assert.equal(ignored.result.draft.vehicleClass.state, 'EXCLUDED');
  const unclear = await run('any car', { vehicle_any: 'UNCLEAR', exclude_sedan: 'UNCLEAR' });
  assert.equal(unclear.result.draft.vehicleClass.state, 'EXPLICIT_ANY');
  assert.ok(!unclear.result.issues.some(value => value.code === 'VEHICLE_CONFLICT'));
  const unmatched = await run('SUV');
  assert.equal(unmatched.result.draft.vehicleClass.state, 'AMBIGUOUS');
  assert.equal(unmatched.result.fallbackRequired, true);
  const anyUnmatched = await run('any car');
  assert.equal(anyUnmatched.result.draft.vehicleClass.state, 'EXPLICIT_ANY');
  assert.ok(!anyUnmatched.result.issues.some(value => value.code === 'EXTRACTION_BINDING_UNRESOLVED'));
});

test('actual classes and flag values preserve true, false, absent and contradictory states', async () => {
  for (const [text, vehicle] of [['hatchback only', 'hatchback'], ['sedan preferred', 'sedan'], ['premium SUV', 'suv_premium'], ['suv_premium', 'suv_premium']]) {
    const { result } = await run(text, { vehicle_class: vehicle, vehicle_strength: text.includes('preferred') ? 'PREFERRED' : 'REQUIRED' });
    assert.equal(result.draft.vehicleClass.value, vehicle);
  }
  const fields = { sharing: 'shared', isOutstation: 'outstation', preferSafeRoute: 'safe route', needsCarrier: 'roof carrier' };
  for (const [field, phrase] of Object.entries(fields)) {
    for (const [text, choice, value] of [[phrase, 'YES', true], [`no ${phrase}`, 'NO', false]]) {
      const { result } = await run(text, { [field]: choice });
      assert.equal(result.draft[field].state, 'RESOLVED');
      assert.equal(result.draft[field].value, value, text);
    }
    for (const choice of ['UNCLEAR', 'NOT_MENTIONED']) {
      const { result } = await run(phrase, { [field]: choice });
      assert.equal(result.draft[field].state, 'AMBIGUOUS');
      assert.equal(result.fallbackRequired, true);
    }
    const invented = await run(phrase, { [field]: 'NO' });
    assert.deepEqual(invented.result.fallbackReasons, ['JEV_INVALID_RESPONSE']);
    const conflict = await run(`${phrase} but no ${phrase}`, { [field]: 'YES' });
    assert.equal(conflict.result.draft[field].state, 'AMBIGUOUS');
  }
});

test('temporal inconsistency and unresolved selections are explicit and fail closed', async () => {
  for (const [text, mode] of [['SUV', 'IMMEDIATE'], ['SUV', 'SCHEDULED'], ['SUV', 'AMBIGUOUS']]) {
    const { result } = await run(text, { vehicle_class: 'suv', vehicle_strength: 'REQUIRED', timing_mode: mode });
    assert.deepEqual(result.fallbackReasons, ['JEV_INVALID_RESPONSE']);
  }
  for (const [text, mode] of [['tomorrow', 'IMMEDIATE'], ['now tomorrow', 'SCHEDULED'], ['tomorrow', 'UNSPECIFIED'], ['tomorrow', 'AMBIGUOUS']]) {
    const { result } = await run(text, { timing_mode: mode });
    assert.equal(result.draft.timing.mode, 'AMBIGUOUS');
    assert.ok(result.fallbackReasons.includes('TEMPORAL_CONFLICT'));
    assert.equal(result.temporal.scheduledAt, undefined);
  }
  for (const choice of ['NONE', 'UNCLEAR']) {
    const { result } = await run('3 people tomorrow at 7 PM', { timing_mode: 'SCHEDULED', passenger_candidate: choice });
    assert.equal(result.draft.passengers.state, 'AMBIGUOUS');
    assert.deepEqual(result.draft.passengers.alternatives, [3]);
  }
});

test('role diagnostics never rewrite endpoints or accept overlapping candidates', async () => {
  for (const choices of [{ pickup_presence: 'UNCLEAR' }, { role_consistency: 'CONFLICT' },
    { pickup_candidate: 'A', pickup_presence: 'ABSENT' }, { pickup_candidate: 'A', pickup_presence: 'PRESENT', role_consistency: 'NO_ROLES' }]) {
    const { result } = await run('campus to airport', choices, input => ({ ...input, candidates: [candidateFor(input, 'campus', 'A')] }));
    assert.ok(result.fallbackReasons.includes('ROLE_CONFLICT'));
  }
  const overlap = await run('campus main gate', { pickup_candidate: 'A', drop_candidate: 'B', pickup_presence: 'PRESENT', drop_presence: 'PRESENT', role_consistency: 'CONSISTENT' }, input => ({ ...input,
    candidates: [candidateFor(input, 'campus main gate', 'A'), candidateFor(input, 'main gate', 'B')] }));
  assert.ok(overlap.result.fallbackReasons.includes('ROLE_CONFLICT'));
});

test('unsupported model indicators preserve the original clause, without free text generation', async () => {
  const { result } = await run('cab with a child seat', { unsupported_service: 'OTHER' });
  assert.equal(result.draft.unsupportedRequests[0].kind, 'OTHER');
  assert.equal(result.draft.unsupportedRequests[0].refs[0].end, 'cab with a child seat'.length);
  assert.ok(result.issues.some(value => value.code === 'UNSUPPORTED_REQUEST'));
  const invented = await run('cab with a child seat', { unsupported_service: 'STOP' });
  assert.equal(invented.result.draft.unsupportedRequests.length, 0);
  assert.ok(invented.result.fallbackReasons.includes('EXTRACTION_BINDING_UNRESOLVED'));
  const unclear = await run('cab with a child seat', { unsupported_service: 'UNCLEAR' });
  assert.ok(unclear.result.fallbackReasons.includes('EXTRACTION_BINDING_UNRESOLVED'));
  const present = await run('stop at Delta 1', { unsupported_service: 'STOP' });
  assert.equal(present.result.draft.unsupportedRequests.length, 1);
});

test('trusted explicit form choices survive a partial revision, and new input overrides only its field', async () => {
  const form = emptyDraft({ id: 'previous', revision: 2, text: 'sedan shared now campus airport' });
  const refs = [queryRef(form.query, 0, form.query.text.length)];
  form.queryType = 'BOOKING_REQUEST'; form.complexity = 'SIMPLE';
  form.vehicleClass = { state: 'RESOLVED', value: 'sedan', strength: 'PREFERRED', excluded: [], refs };
  form.sharing = resolved(true, refs);
  form.pickup = resolved({ kind: 'USER_SELECTION', selectionId: 'campus' }, refs);
  form.drop = resolved({ kind: 'USER_SELECTION', selectionId: 'airport' }, refs);
  form.timing = { ...form.timing, mode: 'IMMEDIATE', refs };
  const configure = input => ({ ...input, formDraft: form, trustedLocationSelections: [{ selectionId: 'campus', displayText: 'campus' }, { selectionId: 'airport', displayText: 'airport' }] });
  const { result } = await run('SUV only', { vehicle_class: 'suv', vehicle_strength: 'REQUIRED' }, configure);
  assert.equal(result.route, 'SIMPLE_COMPLETE');
  assert.equal(result.draft.sharing.value, true);
  assert.equal(result.draft.timing.mode, 'IMMEDIATE');
  assert.equal(result.draft.pickup.value.selectionId, 'campus');
  assert.equal(result.draft.vehicleClass.value, 'suv');
  assert.deepEqual(result.draft.sharing.refs, [{ kind: 'USER_FIELD', field: 'sharing', revision: 2 }]);
  const again = await run('SUV only', { vehicle_class: 'suv', vehicle_strength: 'REQUIRED' }, input => ({ ...configure(input),
    query: { ...input.query, revision: 4 }, formDraft: result.draft }));
  assert.equal(again.result.route, 'SIMPLE_COMPLETE');
  assert.equal(again.result.draft.sharing.value, true);
  assert.deepEqual(again.result.draft.sharing.refs, [{ kind: 'USER_FIELD', field: 'sharing', revision: 3 }]);
  const identical = structuredClone(form); identical.drop = structuredClone(identical.pickup);
  const same = await run('SUV', { vehicle_class: 'suv', vehicle_strength: 'REQUIRED' }, input => ({ ...configure(input), formDraft: identical }));
  assert.ok(same.result.fallbackReasons.includes('ROLE_CONFLICT'));
  const invalidForm = structuredClone(form); invalidForm.sharing.refs[0].revision = 0;
  const invalid = await run('SUV', {}, input => ({ ...configure(input), formDraft: invalidForm }));
  assert.equal(invalid.provider.requests.length, 0);
  assert.equal(invalid.result.route, 'PARSER_UNAVAILABLE');
});

test('carried relative dates cannot silently change their original calendar anchor', async () => {
  const original = await run('tomorrow at 6 PM', { timing_mode: 'SCHEDULED' });
  const followup = await run('SUV', { vehicle_class: 'suv', vehicle_strength: 'REQUIRED' }, input => ({ ...input,
    query: { ...input.query, revision: 4 }, formDraft: original.result.draft }));
  assert.equal(followup.result.temporal.localDate, undefined);
  assert.equal(followup.result.temporal.scheduledAt, undefined);
  assert.ok(followup.result.issues.some(value => value.code === 'DATE_ANCHOR_CONTEXT_REQUIRED'));
});

test('unsupported clauses and advisory counts survive trusted form follow-ups', async () => {
  const original = await run('3 people rent for 8 hours');
  const followup = await run('stop at Delta 1', {}, input => ({ ...input, query: { ...input.query, revision: 4 }, formDraft: original.result.draft }));
  assert.equal(followup.result.draft.passengers.value, 3);
  assert.deepEqual(followup.result.draft.unsupportedRequests.map(value => value.kind), ['STOP', 'RENTAL', 'PASSENGER_COUNT']);
  assert.ok(followup.result.issues.some(value => value.code === 'UNSUPPORTED_REQUEST'));
  const again = await run('SUV', { vehicle_class: 'suv', vehicle_strength: 'REQUIRED' }, input => ({ ...input,
    query: { ...input.query, revision: 5 }, formDraft: followup.result.draft }));
  assert.equal(again.result.draft.unsupportedRequests.length, 3);
});

test('invalid fractional or negative passenger count is never shortened into a positive integer', async () => {
  for (const text of ['3.5 people', '-3 people', '0 people']) {
    const { result } = await run(text);
    assert.equal(result.draft.passengers.state, 'UNSPECIFIED');
    assert.deepEqual(result.fallbackReasons, ['JEV_SCHEMA_ERROR']);
  }
});

test('lower-level validators expose consistency and invalid temporal signals before any booking', () => {
  const query = inputFor('now').query;
  const draft = emptyDraft(query);
  const refs = [queryRef(query, 0, 3)];
  const local = [];
  draft.pickup = resolved({ kind: 'QUERY_CANDIDATE', candidateId: 'missing-A' }, refs);
  draft.drop = resolved({ kind: 'QUERY_CANDIDATE', candidateId: 'missing-B' }, refs);
  validateRoles(draft, { choices: { pickup_presence: { choice: 'PRESENT' }, drop_presence: { choice: 'PRESENT' }, role_consistency: { choice: 'CONSISTENT' } } }, local);
  assert.deepEqual(local, []); // final provenance rejects the missing IDs; role checker cannot invent candidates
  draft.timing = { mode: 'SCHEDULED', refs, date: resolved({ kind: 'RELATIVE', anchor: 'TOMORROW' }, refs),
    time: resolved({ kind: 'CLOCK', hour: 24, minute: resolved(0, refs), notation: 'H24', period: { state: 'UNSPECIFIED' }, precision: 'EXACT' }, refs) };
  const temporal = resolveTemporal(draft, clock().now(), 'Asia/Kolkata');
  assert.ok(temporal.issues.some(value => value.code === 'TEMPORAL_CONFLICT'));
  assert.equal(temporal.scheduledAt, undefined);
  assert.equal(observationLimit({ dates: [], times: [], passengers: [] }, 0, 0), false);
  const old = emptyDraft({ ...query, revision: 2 });
  old.passengers = ambiguous([2, 3], 'COUNT_UNCLEAR', refs);
  preserveUserFields(draft, { query, formDraft: old });
  assert.equal(draft.passengers.state, 'AMBIGUOUS');
  assert.ok(missingFields(draft).some(value => value.code === 'UNSUPPORTED_REQUEST' && value.field === 'PASSENGER_COUNT'));
  assert.deepEqual(issue('TEST', 'field', 'INVALID', refs, ['value']).values, ['value']);
});

test('multiple independent revisions never share mutable parser state or source identities', async () => {
  const provider = { async decide(request) { return decisionFake([request.questions.query_type ? bookingRouting : { ...expressionChoices(request), timing_mode: 'SCHEDULED' }]).decide(request); } };
  const parser = createRideSearchParser(provider, clock());
  const [one, two] = await Promise.all([parser.parse(inputFor('tomorrow')), parser.parse({ ...inputFor('today'), query: { id: 'other', revision: 9, text: 'today' } })]);
  assert.equal(one.draft.timing.date.refs[0].queryId, 'search-case');
  assert.equal(two.draft.timing.date.refs[0].queryId, 'other');
  assert.equal(two.draft.timing.date.refs[0].revision, 9);
  assert.notEqual(one.temporal.localDate, two.temporal.localDate);
  const observations = collectObservations(inputFor('hatchback without carrier local private fastest route').query, []);
  for (const field of ['sharing', 'isOutstation', 'preferSafeRoute', 'needsCarrier']) assert.equal(observations.flags[field][0].value, false);
});

test('non-Error provider failures are redacted and never generate draft values', async () => {
  const provider = { async decide() { throw 'private-provider-failure'; } };
  const result = await createRideSearchParser(provider, clock()).parse(inputFor('SUV tomorrow'));
  assert.deepEqual(result.fallbackReasons, ['JEV_PROVIDER_ERROR']);
  assert.equal(result.draft.vehicleClass.state, 'UNSPECIFIED');
  assert.equal(JSON.stringify(result).includes('private-provider-failure'), false);
});

test('explicit directional evidence rejects distinct swapped IDs even when Jev says consistent', async () => {
  for (const text of ['from campus to airport', 'pick me at campus and drop at airport', 'airport jaana hai campus se']) {
    const { result } = await run(text, { pickup_candidate: 'B', drop_candidate: 'A', pickup_presence: 'PRESENT', drop_presence: 'PRESENT', role_consistency: 'CONSISTENT' },
      input => ({ ...input, candidates: [candidateFor(input, 'campus', 'A'), candidateFor(input, 'airport', 'B')] }));
    assert.ok(result.fallbackReasons.includes('ROLE_CONFLICT'), text);
    assert.equal(result.draft.pickup.value.candidateId, 'B'); // validation does not silently rewrite it
  }
});

test('unsupported stops retain source-ordered supplied candidate references in both routes', async () => {
  for (const complexity of ['SIMPLE', 'COMPLEX']) {
    const { result } = await run('stop at Delta 1 then campus', {}, input => ({ ...input,
      candidates: [candidateFor(input, 'campus', 'B'), candidateFor(input, 'Delta 1', 'A')] }),
    { query_type: 'BOOKING_REQUEST', booking_complexity: complexity });
    assert.deepEqual(result.draft.unsupportedRequests[0].candidateIds, ['A', 'B']);
  }
});
