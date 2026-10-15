import test from 'node:test';
import assert from 'node:assert/strict';
import { createRideSearchParser } from '../services/search/parser.ts';
import { bookingDraftSchema } from '../services/search/contracts.ts';
import { SearchProviderError } from '../services/search/provider.ts';
import { createTestClock } from './helpers/testClock.js';
import { bookingRouting, candidateFor, decisionFake, expressionChoices, inputFor } from './helpers/rideSearchFake.js';
import { assertSearchResult } from './helpers/rideSearchAssertions.js';

const clock = () => createTestClock('2026-10-02T12:00:00+05:30');
async function parse(text, choices, routing = bookingRouting, configure = input => input) {
  const provider = decisionFake([routing, request => ({ ...expressionChoices(request), ...choices })]);
  const input = configure(inputFor(text));
  const result = await createRideSearchParser(provider, clock()).parse(input);
  assertSearchResult(result, input);
  return { result, provider };
}

test('standalone location stays separate from pickup/drop, with or without injected candidates', async () => {
  const route = { query_type: 'LOCATION_SEARCH', booking_complexity: 'NOT_APPLICABLE' };
  const absent = await parse('Pari Chowk', {}, route);
  assert.equal(absent.result.route, 'LOCATION_SEARCH');
  assert.equal(absent.provider.requests.length, 1);
  assert.equal(absent.result.draft.locationSearch.state, 'UNSPECIFIED');
  const selected = await parse('Pari Chowk', { location_search_candidate: 'A' }, route,
    input => ({ ...input, candidates: [candidateFor(input, 'Pari Chowk', 'A')] }));
  assert.equal(selected.result.draft.locationSearch.value.candidateId, 'A');
  assert.equal(selected.result.draft.pickup.state, 'UNSPECIFIED');
  assert.equal(selected.result.draft.drop.state, 'UNSPECIFIED');
});

test('SUV tomorrow remains SIMPLE incomplete without fallback or fabricated endpoints/time', async () => {
  const { result, provider } = await parse('SUV tomorrow', {
    vehicle_class: 'suv', vehicle_strength: 'REQUIRED', timing_mode: 'SCHEDULED',
  });
  assert.equal(result.route, 'SIMPLE_INCOMPLETE');
  assert.equal(result.fallbackRequired, false);
  assert.equal(result.draft.complexity, 'SIMPLE');
  assert.equal(result.draft.vehicleClass.value, 'suv');
  assert.equal(result.temporal.localDate, '2026-10-03');
  for (const field of ['pickup', 'drop']) assert.equal(result.draft[field].state, 'UNSPECIFIED');
  assert.equal(result.draft.timing.time.state, 'UNSPECIFIED');
  assert.equal(result.temporal.scheduledAt, undefined);
  assert.equal(provider.requests.length, 2);
  assert.equal(bookingDraftSchema.safeParse(result.draft).success, true);
});

test('route-only requests stay simple and direction-selected with supplied IDs', async () => {
  for (const text of ['campus to airport', 'campus se airport', 'airport jaana hai campus se', 'pick me at campus and drop at airport']) {
    const { result } = await parse(text, { pickup_candidate: 'A', drop_candidate: 'B',
      pickup_presence: 'PRESENT', drop_presence: 'PRESENT', role_consistency: 'CONSISTENT' }, bookingRouting,
    input => ({ ...input, candidates: [candidateFor(input, 'campus', 'A'), candidateFor(input, 'airport', 'B')] }));
    assert.equal(result.fallbackRequired, false, text);
    assert.equal(result.draft.pickup.value.candidateId, 'A', text);
    assert.equal(result.draft.drop.value.candidateId, 'B', text);
    assert.equal(result.draft.timing.mode, 'UNSPECIFIED', text);
  }
});

test('explicit now differs from missing timing and date-only scheduled intent', async () => {
  const now = await parse('cab now', { timing_mode: 'IMMEDIATE' });
  assert.equal(now.result.draft.timing.mode, 'IMMEDIATE');
  const missing = await parse('SUV', { vehicle_class: 'suv', vehicle_strength: 'REQUIRED' });
  assert.equal(missing.result.draft.timing.mode, 'UNSPECIFIED');
  const date = await parse('tomorrow', { timing_mode: 'SCHEDULED' });
  assert.equal(date.result.draft.timing.date.value.anchor, 'TOMORROW');
  assert.equal(date.result.draft.timing.time.state, 'UNSPECIFIED');
});

test('exact clocks, vague dayparts and approximate ambiguous clocks remain distinct', async () => {
  for (const text of ['6 PM', '18:00', '6 in the evening']) {
    const { result } = await parse(text, { timing_mode: 'SCHEDULED' });
    assert.equal(result.temporal.localTime, '18:00', text);
    assert.equal(result.temporal.scheduledAt, undefined);
  }
  const evening = await parse('evening', { timing_mode: 'SCHEDULED' });
  assert.equal(evening.result.draft.timing.time.value.kind, 'DAYPART');
  assert.equal(evening.result.temporal.localTime, undefined);
  const around = await parse('around 7', { timing_mode: 'SCHEDULED' });
  assert.equal(around.result.draft.timing.time.value.precision, 'APPROXIMATE');
  assert.equal(around.result.draft.timing.time.value.period.state, 'RESOLVED');
});

test('vehicle any, exclusion, required and preference are not collapsed', async () => {
  const any = await parse('any car', { vehicle_any: 'EXPLICIT_ANY' });
  assert.equal(any.result.draft.vehicleClass.state, 'EXPLICIT_ANY');
  const excluded = await parse('anything except sedan', { vehicle_any: 'EXPLICIT_ANY', exclude_sedan: 'EXCLUDED' });
  assert.equal(excluded.result.draft.vehicleClass.state, 'EXCLUDED');
  assert.deepEqual(excluded.result.draft.vehicleClass.excluded, ['sedan']);
  for (const [text, strength] of [['SUV only', 'REQUIRED'], ['prefer SUV', 'PREFERRED']]) {
    const { result } = await parse(text, { vehicle_class: 'suv', vehicle_strength: strength });
    assert.equal(result.draft.vehicleClass.strength, strength);
  }
  const noSUV = await parse("don't send an SUV", { exclude_suv: 'EXCLUDED' });
  assert.deepEqual(noSUV.result.draft.vehicleClass.excluded, ['suv', 'suv_premium']);
  assert.equal(noSUV.result.issues.some(value => value.code === 'SUV_EXCLUSION_SCOPE_UNRESOLVED'), false);
  const conflict = await parse('SUV only, but no SUV', { vehicle_class: 'suv', vehicle_strength: 'REQUIRED', exclude_suv: 'EXCLUDED', exclude_suv_premium: 'EXCLUDED' });
  assert.equal(conflict.result.draft.vehicleClass.state, 'AMBIGUOUS');
  assert.equal(conflict.result.fallbackRequired, false); // user clarification, not fabricated selection
});

test('complex conditional stops never enter simple extraction; unsupported clauses remain visible', async () => {
  const { result, provider } = await parse('pick me from college, then pick my friend from Delta 1, then go to IGI, but if his flight changes take me directly', {},
    { query_type: 'BOOKING_REQUEST', booking_complexity: 'COMPLEX' });
  assert.equal(result.route, 'COMPLEX_FALLBACK_REQUIRED');
  assert.deepEqual(result.fallbackReasons, ['COMPLEX_QUERY']);
  assert.equal(provider.requests.length, 1);
  assert.ok(result.draft.unsupportedRequests.some(value => value.kind === 'STOP'));
  assert.ok(result.draft.unsupportedRequests.some(value => value.kind === 'CONDITIONAL_PREFERENCE'));
  assert.equal(result.draft.pickup.state, 'UNSPECIFIED');
});

test('unsupported requests and advisory passenger count survive simple parsing', async () => {
  const { result } = await parse('rent for 8 hours, come back in the evening, stop at Delta 1, AC car for 3 people', { timing_mode: 'SCHEDULED' });
  assert.equal(result.draft.passengers.value, 3);
  const kinds = result.draft.unsupportedRequests.map(value => value.kind);
  for (const kind of ['RENTAL', 'RETURN_JOURNEY', 'STOP', 'AC_PREFERENCE', 'PASSENGER_COUNT']) assert.ok(kinds.includes(kind));
  assert.equal(result.temporal.scheduledAt, undefined);
});

test('provider timeout/failure produces safe draft, redacted errors and future fallback only', async () => {
  for (const code of ['JEV_TIMEOUT', 'JEV_PROVIDER_ERROR', 'JEV_SCHEMA_ERROR', 'JEV_INVALID_RESPONSE']) {
    const provider = decisionFake([bookingRouting, new SearchProviderError(code)]);
    const result = await createRideSearchParser(provider, clock()).parse(inputFor('SUV tomorrow'));
    assert.deepEqual(result.fallbackReasons, [code]);
    assert.equal(result.draft.vehicleClass.state, 'UNSPECIFIED');
    assert.equal(result.temporal, undefined);
    assert.equal(result.providerMetadata.attemptedRequests, 2);
  }
  const provider = decisionFake([new Error('secret-provider-response')]);
  const result = await createRideSearchParser(provider, clock()).parse(inputFor('cab now'));
  assert.equal(JSON.stringify(result).includes('secret-provider-response'), false);
});

test('missing candidates remain dependency issues without thresholding diagnostic probabilities', async () => {
  const { result } = await parse('from campus to airport', { pickup_presence: 'PRESENT', drop_presence: 'PRESENT' });
  assert.ok(result.issues.some(value => value.code === 'LOCATION_CANDIDATE_MISSING'));
  assert.equal(result.draft.pickup.state, 'UNSPECIFIED');
  assert.equal(result.providerMetadata.diagnostics.pickup_mentioned, 0.99);
  const ordinary = await parse('SUV tomorrow', { vehicle_class: 'suv', vehicle_strength: 'REQUIRED', timing_mode: 'SCHEDULED' });
  assert.equal(ordinary.result.fallbackRequired, false); // same diagnostic 0.99, no asserted location
});

test('unknown IDs, role reversal and unexpected same-candidate assignments fail closed', async () => {
  for (const choices of [{ pickup_candidate: 'invented' }, { role_consistency: 'REVERSAL_RISK' },
    { pickup_candidate: 'A', drop_candidate: 'A', pickup_presence: 'PRESENT', drop_presence: 'PRESENT' }]) {
    const { result } = await parse('campus to airport', choices, bookingRouting,
      input => ({ ...input, candidates: [candidateFor(input, 'campus', 'A')] }));
    assert.equal(result.fallbackRequired, true);
  }
});

test('invalid query revisions/spans fail before provider calls; unrelated input needs one routing call', async () => {
  const provider = decisionFake();
  const input = inputFor('campus');
  const candidate = candidateFor(input, 'campus', 'A');
  candidate.queryRevision = 2;
  const invalid = await createRideSearchParser(provider, clock()).parse({ ...input, candidates: [candidate] });
  assert.equal(invalid.route, 'PARSER_UNAVAILABLE');
  assert.equal(provider.requests.length, 0);
  const unrelated = await parse('hello', {}, { query_type: 'UNCLEAR_OR_UNRELATED', booking_complexity: 'NOT_APPLICABLE' });
  assert.equal(unrelated.result.route, 'UNCLEAR_OR_UNRELATED');
  assert.equal(unrelated.provider.requests.length, 1);
});
