import test from 'node:test';
import assert from 'node:assert/strict';
import { createRideSearchParser } from '../services/search/parser.ts';
import { routingRequest } from '../services/search/questions.ts';
import { parseInputSchema, emptyDraft } from '../services/search/contracts.ts';
import { validateEndpoints, missingFields, preserveUserFields } from '../services/search/validation.ts';
import { issue, queryRef, resolved } from '../services/search/fields.ts';
import { createTestClock } from './helpers/testClock.js';
import { bookingRouting, candidateFor, decisionFake, expressionChoices, inputFor } from './helpers/rideSearchFake.js';
import { assertSearchResult } from './helpers/rideSearchAssertions.js';

const clock = () => createTestClock('2026-10-02T12:00:00+05:30');
async function parse(text, choices) {
  const input = inputFor(text);
  const provider = decisionFake([bookingRouting, request => ({ ...expressionChoices(request), ...choices })]);
  const result = await createRideSearchParser(provider, clock()).parse(input);
  assertSearchResult(result, input);
  return result;
}

test('plain, spaced and verbose exclusion phrases preserve the exact class and source diagnostics', async () => {
  for (const text of ['no sedan', 'not sedan', 'without sedan', "don't send a sedan", 'do not send a sedan',
    'do not    send   a   sedan', 'do not sedan', 'anything except sedan']) {
    const result = await parse(text, { exclude_sedan: 'EXCLUDED', vehicle_any: text.startsWith('anything') ? 'EXPLICIT_ANY' : 'NOT_STATED' });
    assert.equal(result.draft.vehicleClass.state, 'EXCLUDED', text);
    assert.deepEqual(result.draft.vehicleClass.excluded, ['sedan']);
    assert.equal(result.fallbackRequired, false);
  }
  const notExcluded = await parse('not now, sedan only', { vehicle_class: 'sedan', vehicle_strength: 'REQUIRED' });
  assert.equal(notExcluded.draft.vehicleClass.state, 'RESOLVED');
  const distant = await parse(`prefer ${'a '.repeat(25)}sedan only`, { vehicle_class: 'sedan', vehicle_strength: 'REQUIRED' });
  assert.equal(distant.draft.vehicleClass.strength, 'REQUIRED');
});

test('strength binds to its own clause, including prefix/suffix and multiple whitespace', async () => {
  for (const [text, strength] of [['only sedan', 'REQUIRED'], ['sedan   only', 'REQUIRED'], ['prefer   sedan', 'PREFERRED'], ['sedan   preferred', 'PREFERRED']]) {
    const result = await parse(text, { vehicle_class: 'sedan', vehicle_strength: strength });
    assert.equal(result.draft.vehicleClass.strength, strength);
    const wrong = await parse(text, { vehicle_class: 'sedan', vehicle_strength: strength === 'REQUIRED' ? 'PREFERRED' : 'REQUIRED' });
    assert.deepEqual(wrong.fallbackReasons, ['JEV_INVALID_RESPONSE']);
  }
  for (const text of ['only tomorrow, sedan preferred', 'prefer tomorrow, sedan only']) {
    const expected = text.includes('preferred') ? 'PREFERRED' : 'REQUIRED';
    const result = await parse(text, { vehicle_class: 'sedan', vehicle_strength: expected, timing_mode: 'SCHEDULED' });
    assert.equal(result.draft.vehicleClass.strength, expected);
  }
});

test('context cap accepts exact boundary and rejects one extra unit before any request', async () => {
  const base = parseInputSchema.parse({ ...inputFor('Pari Chowk'), trustedLocationSelections: [{ selectionId: 'saved', displayText: 'x' }] });
  const required = 12000 - routingRequest(base, clock().now().toISOString()).state.length + 1;
  for (const extra of [0, 1]) {
    const input = { ...base, trustedLocationSelections: [{ selectionId: 'saved', displayText: 'x'.repeat(required + extra) }] };
    const provider = decisionFake([{ query_type: 'LOCATION_SEARCH', booking_complexity: 'NOT_APPLICABLE' }]);
    const result = await createRideSearchParser(provider, clock()).parse(input);
    assert.equal(provider.requests.length, extra ? 0 : 1);
    assert.equal(result.route, extra ? 'PARSER_UNAVAILABLE' : 'LOCATION_SEARCH');
  }
});

test('touching half-open spans are distinct endpoints; containment and equal selections are not', () => {
  const input = inputFor('campus airport');
  const draft = emptyDraft(input.query);
  draft.candidates = [candidateFor(input, 'campus', 'A'), candidateFor(input, ' airport', 'B')];
  const refs = [queryRef(input.query, 0, input.query.text.length)];
  draft.pickup = resolved({ kind: 'QUERY_CANDIDATE', candidateId: 'A' }, refs);
  draft.drop = resolved({ kind: 'QUERY_CANDIDATE', candidateId: 'B' }, refs);
  const distinct = [];
  validateEndpoints(draft, distinct);
  assert.deepEqual(distinct, []);
  draft.drop = resolved({ kind: 'USER_SELECTION', selectionId: 'other' }, refs);
  const mixed = [];
  validateEndpoints(draft, mixed);
  assert.deepEqual(mixed, []);
  draft.pickup = resolved({ kind: 'USER_SELECTION', selectionId: 'other' }, refs);
  const same = [];
  validateEndpoints(draft, same);
  assert.equal(same[0].code, 'ROLE_CONFLICT');
  assert.deepEqual(same[0].refs, [...refs, ...refs]);
});

test('follow-up required fields report grounding and missing date/time with stable actionable metadata', () => {
  const input = inputFor('campus');
  const draft = emptyDraft(input.query);
  const refs = [queryRef(input.query, 0, 6)];
  draft.pickup = resolved({ kind: 'QUERY_CANDIDATE', candidateId: 'A' }, refs);
  draft.vehicleClass = { state: 'RESOLVED', value: 'sedan', strength: 'REQUIRED', excluded: [], refs };
  draft.timing = { ...draft.timing, mode: 'SCHEDULED', refs };
  assert.deepEqual(missingFields(draft), [
    issue('PLACES_GROUNDING_REQUIRED', 'pickup', 'DEPENDENCY', refs), issue('FIELD_REQUIRED', 'drop', 'MISSING'),
    issue('DATE_REQUIRED', 'timing.date', 'MISSING'), issue('TIME_REQUIRED', 'timing.time', 'MISSING'),
  ]);
  const original = structuredClone(draft);
  original.needsCarrier = resolved(false, refs);
  preserveUserFields(draft, { formDraft: original });
  assert.deepEqual(draft.vehicleClass, original.vehicleClass);
  assert.equal(draft.needsCarrier.value, false);
});

test('a stale ungrounded location candidate cannot attach itself to a different query revision', async () => {
  const input = inputFor('campus');
  const previous = emptyDraft(input.query);
  previous.candidates = [candidateFor(input, 'campus', 'A')];
  previous.pickup = resolved({ kind: 'QUERY_CANDIDATE', candidateId: 'A' }, [queryRef(input.query, 0, 6)]);
  const provider = decisionFake([bookingRouting, { vehicle_class: 'sedan', vehicle_strength: 'REQUIRED' }]);
  const result = await createRideSearchParser(provider, clock()).parse({ ...inputFor('sedan'), query: { id: 'new', revision: 4, text: 'sedan' }, formDraft: previous });
  assert.deepEqual(result.fallbackReasons, ['JEV_SCHEMA_ERROR']);
  assert.equal(result.draft.pickup.state, 'UNSPECIFIED');
});
