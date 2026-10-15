import test from 'node:test';
import assert from 'node:assert/strict';
import { createSearchInterpretationService } from '../services/search/complex/service.ts';
import { ComplexProviderError } from '../services/search/complex/contracts.ts';
import { SearchProviderError } from '../services/search/provider.ts';
import { createLocationReview, editLocationReview, applyTrustedLocation, mergeLocationReview } from '../services/search/locations/review.ts';
import { createRideSearchParser } from '../services/search/parser.ts';
import { resolved } from '../services/search/fields.ts';
import { searchFake, placesFake } from './helpers/rideSearchS3Fake.js';
import { decisionFake, inputFor } from './helpers/rideSearchFake.js';
import { lunaFake, lunaOutput } from './helpers/rideSearchS4Fake.js';
import { createTestClock } from './helpers/testClock.js';

const clock = createTestClock('2026-10-02T10:00:00Z');
const complexDecisions = text => searchFake(text, { complexity: 'COMPLEX' });
const create = (decisions, luna = lunaFake(), places = placesFake()) => createSearchInterpretationService(decisions, places, luna, clock);

test('S4 invalid interpreted values and conflicting endpoints fail before Places', async () => {
  for (const modify of [
    draft => { draft.passengers = resolved(99, [{ kind: 'QUERY_SPAN', queryId: draft.query.id, revision: draft.query.revision, start: 0, end: 4 }]); },
    draft => { draft.pickup = structuredClone(draft.drop); },
    draft => { const pickup = draft.pickup; draft.pickup = draft.drop; draft.drop = pickup; },
  ]) {
    const text = 'from campus to airport'; const places = placesFake();
    const output = await create(complexDecisions(text), lunaFake(input => lunaOutput(input.query, { pickup: 'campus', drop: 'airport', modify })), places).parse(inputFor(text));
    assert.equal(output.issues.at(-1).code, 'LUNA_SCHEMA_ERROR'); assert.equal(places.calls.length, 0);
  }
});

test('model location spans cannot hide a stated timing conflict or an unsupported clause', async () => {
  for (const text of ['now tomorrow', 'from campus stop at Delta 1 then go to airport']) {
    const luna = lunaFake(input => lunaOutput(input.query, { modify(draft, locations) {
      locations.push({ key: 'mask', start: 0, end: text.length, exactText: text });
      draft.timing = { mode: 'UNSPECIFIED', refs: [], date: { state: 'UNSPECIFIED' }, time: { state: 'UNSPECIFIED' } };
    } }));
    const result = await create(complexDecisions(text), luna).parse(inputFor(text));
    if (text === 'now tomorrow') assert.equal(result.issues.at(-1).code, 'LUNA_SCHEMA_ERROR');
    else assert.ok(result.draft.unsupportedRequests.some(value => value.kind === 'STOP'));
  }
});

test('S4 interprets standalone and unrelated provider-fallback responses without inventing target or booking', async () => {
  for (const type of ['LOCATION_SEARCH', 'UNCLEAR_OR_UNRELATED']) {
    const luna = lunaFake(input => lunaOutput(input.query, { type, locationSearch: type === 'LOCATION_SEARCH' ? 'Pari Chowk' : undefined }));
    const output = await create(decisionFake([new SearchProviderError('JEV_TIMEOUT')]), luna).parse(inputFor('Pari Chowk'));
    assert.equal(output.parse.route, type); assert.equal(output.evaluationRoute, type === 'LOCATION_SEARCH' ? 'LUNA_PROVIDER_FALLBACK' : 'UNCLEAR');
    if (type === 'LOCATION_SEARCH') assert.ok(output.issues.some(value => value.code === 'LOCATION_TARGET_REQUIRED'));
  }
});

test('S4 complete parsed fields remain review-only, and source-span recovery is recorded', async () => {
  const text = 'SUV now from campus to airport';
  const luna = lunaFake(input => lunaOutput(input.query, { pickup: 'campus', drop: 'airport', modify(draft) {
    draft.vehicleClass = { state: 'RESOLVED', value: 'suv', strength: 'REQUIRED', excluded: [], refs: [{ kind: 'QUERY_SPAN', queryId: input.query.id, revision: input.query.revision, start: 0, end: 3 }] };
  } }));
  const output = await create(complexDecisions(text), luna).parse(inputFor(text));
  assert.equal(output.parse.route, 'INTERPRETED_COMPLETE'); assert.ok(output.locations.every(value => value.status === 'USER_SELECTION_REQUIRED'));
  const missingText = 'pickup campus';
  const missing = await create(searchFake(missingText, { choices: { pickup_presence: 'PRESENT' } }), lunaFake(input => lunaOutput(input.query, { pickup: 'campus', complexity: 'SIMPLE' }))).parse(inputFor(missingText));
  assert.equal(missing.telemetry.recoveredMissingCandidates, true, JSON.stringify(missing.issues));
});

test('S4 simple incomplete, complete, standalone, unsupported and unrelated paths do not spend Luna requests', async () => {
  const cases = [
    ['SUV tomorrow', { choices: { vehicle_class: 'suv', vehicle_strength: 'REQUIRED', timing_mode: 'SCHEDULED' } }, 'FOLLOW_UP_ONLY'],
    ['campus to airport', { pickup: 'campus', drop: 'airport' }, 'FOLLOW_UP_ONLY'],
    ['Pari Chowk', { type: 'LOCATION_SEARCH' }, 'FOLLOW_UP_ONLY'],
    ['hello', { type: 'UNCLEAR_OR_UNRELATED' }, 'UNCLEAR'],
    ['3 people', {}, 'UNSUPPORTED'],
  ];
  for (const [text, options, route] of cases) {
    const luna = lunaFake(); const result = await create(searchFake(text, options), luna).parse(inputFor(text));
    assert.equal(luna.calls.length, 0, text); assert.equal(result.telemetry.lunaAttempts, 0);
    assert.equal(result.evaluationRoute, route);
    if (text === 'SUV tomorrow') {
      assert.equal(result.draft.vehicleClass.value, 'suv'); assert.equal(result.draft.timing.date.value.anchor, 'TOMORROW');
      for (const field of ['pickup', 'drop']) assert.equal(result.draft[field].state, 'UNSPECIFIED');
      assert.equal(result.draft.timing.time.state, 'UNSPECIFIED');
    }
  }
  const invalid = inputFor('SUV'); invalid.query.revision = -1;
  const luna = lunaFake(); const result = await create(decisionFake(), luna).parse(invalid);
  assert.equal(result.parse.route, 'PARSER_UNAVAILABLE'); assert.equal(luna.calls.length, 0);
});

test('S4 complex interpretation uses code-owned source spans and existing Places selection without booking', async () => {
  const text = 'pick me from college then stop at Delta 1 and go to airport';
  const places = placesFake();
  const luna = lunaFake(input => lunaOutput(input.query, { pickup: 'college', drop: 'airport' }));
  const result = await create(complexDecisions(text), luna, places).parse(inputFor(text));
  assert.equal(result.evaluationRoute, 'LUNA_COMPLEX', JSON.stringify(result.issues));
  assert.equal(result.parse.fallbackRequired, false); assert.equal(result.parse.route, 'INTERPRETED_INCOMPLETE');
  assert.equal(luna.calls.length, 1); assert.equal(result.telemetry.newSourceSpans, 2);
  assert.equal(result.draft.complexity, 'COMPLEX');
  assert.ok(result.draft.unsupportedRequests.some(value => value.kind === 'STOP'));
  assert.equal(result.locations.length, 2); assert.equal(places.calls.length, 2);
  assert.ok(result.locations.every(value => value.status === 'USER_SELECTION_REQUIRED'));
  assert.ok(result.draft.candidates.every(value => value.method === 'LUNA_SOURCE_SPAN'));
  assert.ok(result.followups.some(value => value.code === 'UNSUPPORTED_REQUEST'));
});

test('S4 preserves the multi-stop conditional example as unsupported, including a friend pickup', async () => {
  const text = 'Pick me from college tomorrow, get my friend from Delta 1, then go to IGI, but if his flight changes just take me directly.';
  const output = await create(complexDecisions(text), lunaFake(input => lunaOutput(input.query, { pickup: 'college', drop: 'IGI' }))).parse(inputFor(text));
  assert.equal(output.evaluationRoute, 'LUNA_COMPLEX', JSON.stringify(output.issues));
  assert.ok(output.draft.unsupportedRequests.some(value => value.kind === 'STOP'));
  assert.ok(output.draft.unsupportedRequests.some(value => value.kind === 'CONDITIONAL_PREFERENCE'));
  assert.equal(output.draft.timing.date.value.anchor, 'TOMORROW');
  assert.equal(output.parse.route, 'INTERPRETED_INCOMPLETE');
});

test('S4 Jev timeout/provider/schema failures can fallback exactly once; auth cannot', async () => {
  for (const code of ['JEV_TIMEOUT', 'JEV_PROVIDER_ERROR', 'JEV_SCHEMA_ERROR', 'JEV_INVALID_RESPONSE', 'JEV_AUTH_ERROR']) {
    const luna = lunaFake(input => lunaOutput(input.query, { complexity: 'SIMPLE' }));
    const result = await create(decisionFake([new SearchProviderError(code)]), luna).parse(inputFor('take me tomorrow'));
    assert.equal(luna.calls.length, code === 'JEV_AUTH_ERROR' ? 0 : 1, code);
    if (code !== 'JEV_AUTH_ERROR') {
      assert.equal(result.evaluationRoute, 'LUNA_PROVIDER_FALLBACK');
      assert.equal(result.draft.pickup.state, 'UNSPECIFIED'); assert.equal(result.draft.drop.state, 'UNSPECIFIED');
      assert.equal(result.draft.timing.time.state, 'UNSPECIFIED');
    }
  }
});

test('S4 Places infrastructure failure cannot call Luna, including after a successful interpretation', async () => {
  const broken = placesFake(); broken.searchAutocomplete = async () => { throw new Error('private key'); };
  const simple = lunaFake();
  const first = await create(searchFake('from campus to airport', { pickup: 'campus', drop: 'airport' }), simple, broken).parse(inputFor('from campus to airport'));
  assert.equal(simple.calls.length, 0); assert.ok(first.issues.some(value => value.code.includes('PROVIDER')));
  const luna = lunaFake(input => lunaOutput(input.query, { pickup: 'campus', drop: 'airport' }));
  const second = await create(complexDecisions('from campus to airport'), luna, broken).parse(inputFor('from campus to airport'));
  assert.equal(luna.calls.length, 1); assert.ok(second.issues.some(value => value.code.includes('PROVIDER')));
  assert.ok(!JSON.stringify(second).includes('private key'));
});

test('S4 both providers fail safely with redacted structured errors and no invented state', async () => {
  for (const failure of ['LUNA_TIMEOUT', 'LUNA_AUTH_ERROR', 'LUNA_PROVIDER_ERROR', 'LUNA_SCHEMA_ERROR', 'LUNA_REFUSAL', 'LUNA_CANCELLED', 'LUNA_CONFIG_ERROR', 'arbitrary']) {
    const luna = lunaFake(() => { throw failure === 'arbitrary' ? new Error('secret') : new ComplexProviderError(failure); });
    const places = placesFake();
    const output = await create(decisionFake([new SearchProviderError('JEV_TIMEOUT')]), luna, places).parse(inputFor('SUV tomorrow'));
    assert.equal(output.evaluationRoute, 'FOLLOW_UP_ONLY'); assert.equal(luna.calls.length, 1); assert.equal(places.calls.length, 0);
    assert.equal(output.draft.vehicleClass.state, 'UNSPECIFIED'); assert.equal(output.draft.pickup.state, 'UNSPECIFIED');
    assert.ok(output.issues.some(value => value.code === (failure === 'arbitrary' ? 'LUNA_SCHEMA_ERROR' : failure)));
    assert.equal(output.telemetry.schemaFailures, ['arbitrary', 'LUNA_SCHEMA_ERROR'].includes(failure) ? 1 : 0);
    assert.equal(output.issues.at(-1).field, 'parser'); assert.equal(output.issues.at(-1).category, 'DEPENDENCY');
    assert.ok(!JSON.stringify(output).includes('secret'));
  }
});

test('S4 stale or cancelled work is fenced before Luna and after Luna and Places', async () => {
  const text = 'from campus to airport'; const input = inputFor(text);
  const controller = new AbortController(); controller.abort();
  const luna = lunaFake();
  assert.equal((await create(complexDecisions(text), luna).parse(input, { activeField: null, formRevision: 0, signal: controller.signal })).issues.at(-1).code, 'STALE_QUERY_RESULT');
  assert.equal(luna.calls.length, 0);
  let query = input.query;
  const changing = lunaFake(value => { query = { ...query, revision: 4 }; return lunaOutput(value.query); });
  const result = await create(complexDecisions(text), changing).parse(input, { activeField: null, formRevision: 0, currentQuery: () => query });
  assert.equal(result.issues.at(-1).code, 'STALE_QUERY_RESULT'); assert.equal(result.locations.length, 0);
  query = input.query;
  const places = placesFake(); const search = places.searchAutocomplete.bind(places);
  places.searchAutocomplete = async value => { query = { ...query, text: 'new query' }; return search(value); };
  const afterPlaces = await create(complexDecisions(text), lunaFake(value => lunaOutput(value.query, { pickup: 'campus', drop: 'airport' })), places)
    .parse(input, { activeField: null, formRevision: 0, currentQuery: () => query });
  assert.equal(afterPlaces.issues.at(-1).code, 'STALE_QUERY_RESULT'); assert.equal(afterPlaces.locations.length, 0);
});

test('S4 trusted explicit vehicle and grounded pickup win, conflicts are observable and history stays immutable', async () => {
  const seed = inputFor('SUV tomorrow'); seed.query.revision = 2;
  const parsed = await createRideSearchParser(searchFake(seed.query.text, { choices: { vehicle_class: 'suv', vehicle_strength: 'REQUIRED', timing_mode: 'SCHEDULED' } }), clock).parse(seed);
  let review = createLocationReview(parsed, clock.now(), seed.timeZone);
  review = editLocationReview(review, 'vehicleClass', { state: 'RESOLVED', value: 'sedan', strength: 'REQUIRED', excluded: [], refs: [] });
  review = applyTrustedLocation(review, 'pickup', { selectionId: 'saved', source: 'USER_SELECTED_SAVED_PLACE', lat: 28.4, lng: 77.4, displayText: 'saved', confirmedAt: clock.now().toISOString(), confirmedByUser: 'selection' });
  const original = JSON.stringify(review); const text = 'SUV from campus to airport';
  const luna = lunaFake(input => lunaOutput(input.query, { pickup: 'campus', drop: 'airport', modify(draft) {
    draft.vehicleClass = { state: 'RESOLVED', value: 'suv', strength: 'REQUIRED', excluded: [], refs: [{ kind: 'QUERY_SPAN', queryId: input.query.id, revision: input.query.revision, start: 0, end: 3 }] };
  } }));
  const result = await create(complexDecisions(text), luna).parse(inputFor(text), { activeField: null, formRevision: review.revision, review });
  assert.equal(result.draft.vehicleClass.value, 'sedan', JSON.stringify(result.issues));
  assert.equal(result.draft.pickup.value.selectionId, 'saved'); assert.equal(result.locations.length, 1);
  assert.equal(result.telemetry.trustedConflicts, 2); assert.equal(JSON.stringify(review), original);
  assert.deepEqual(result.review.parseIssues.filter(value => value.code === 'TRUSTED_STATE_CONFLICT').map(value => value.category), ['AMBIGUOUS', 'AMBIGUOUS']);
  assert.ok(luna.calls[0].input.trustedFields.some(value => value.field === 'pickup'));
  assert.equal(result.review.session.snapshots.length, 2);
  assert.equal(result.parse.draft.pickup.value.selectionId, 'saved');
  assert.throws(() => mergeLocationReview(result.review, result.interpretationSnapshot, clock.now(), seed.timeZone), /STALE_QUERY/);
});

test('S4 future-Luna recovery does not silently invent date policy, exact time, or a pickup', async () => {
  for (const text of ['take me to airport tomorrow', 'take me to airport Friday', 'take me to airport 5 December', 'take me to airport around 7', 'take me to airport evening']) {
    const luna = lunaFake(input => lunaOutput(input.query, { drop: 'airport' }));
    const result = await create(complexDecisions(text), luna).parse(inputFor(text));
    assert.equal(result.evaluationRoute, 'LUNA_COMPLEX', JSON.stringify(result.issues));
    assert.equal(result.draft.pickup.state, 'UNSPECIFIED');
    assert.equal(result.parse.temporal.scheduledAt, undefined);
    if (text.includes('Friday')) {
      assert.equal(result.parse.temporal.localDate, undefined); // Same weekday with no time needs form selection.
      assert.ok(result.parse.issues.some(value => value.code === 'DATE_COMPONENT_REQUIRED'));
    }
    if (text.includes('December')) assert.equal(result.parse.temporal.localDate, '2026-12-05');
    if (text.includes('evening')) assert.equal(result.draft.timing.time.value.kind, 'DAYPART');
  }
});
