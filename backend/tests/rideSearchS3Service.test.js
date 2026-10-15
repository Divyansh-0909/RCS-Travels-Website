import assert from 'node:assert/strict';
import test from 'node:test';
import { createSearchGroundingService } from '../services/search/locations/service.ts';
import { createRideSearchParser } from '../services/search/parser.ts';
import { emptyDraft } from '../services/search/contracts.ts';
import { decisionFake, inputFor } from './helpers/rideSearchFake.js';
import { searchFake, placesFake } from './helpers/rideSearchS3Fake.js';
import { createTestClock } from './helpers/testClock.js';
import { reversalCohort, standaloneCohort } from './fixtures/rideSearchS3Locations.js';
const clock = createTestClock('2026-10-02T10:00:00Z');

test('S3 standalone with pickup/drop selects that explicit field; none asks target before Places', async () => {
  for (const { input, labels } of standaloneCohort) {
    const activeField = input.activeField;
    const places = placesFake();
    const service = createSearchGroundingService(searchFake('Pari Chowk', { type: 'LOCATION_SEARCH' }), places, clock);
    const output = await service.parse(inputFor('Pari Chowk'), { activeField, formRevision: 5 });
    assert.equal(output.parse.route, 'LOCATION_SEARCH');
    assert.equal(output.parse.draft.pickup.state, 'UNSPECIFIED');
    assert.equal(output.parse.draft.drop.state, 'UNSPECIFIED');
    if (activeField === null) {
      assert.equal(output.issues[0].code, 'LOCATION_TARGET_REQUIRED');
      assert.equal(places.calls.length, 0);
      const chosen = await service.chooseLocationTarget(output, 'pickup', 5);
      assert.equal(chosen.locations[0].target, 'pickup');
      assert.deepEqual(chosen.targetRefs, [{ kind: 'USER_FIELD', field: 'locationTarget', revision: 5 }]);
      assert.equal(output.locations.length, 0);
      await assert.rejects(service.chooseLocationTarget(output, 'drop', 4), /STALE/);
    } else {
      assert.equal(output.locations[0].target, activeField);
      assert.equal(output.locations[0].status, 'USER_SELECTION_REQUIRED');
      assert.equal(output.locations[0].candidate.start, labels.span.start);
      assert.equal(output.locations[0].candidate.end, labels.span.end);
      const selected = await service.selectLocation(output.locations[0], 'Pari_Chowk', 5);
      assert.equal(selected.confirmed.placeId, 'Pari_Chowk');
    }
  }
});

test('dedicated role reversal cohort retains direction independent of source order', async () => {
  let reversals = 0;
  for (const { input, labels } of reversalCohort) {
    const text = input.text;
    const decisions = searchFake(text, { pickup: 'campus', drop: 'Pari Chowk' });
    const output = await createSearchGroundingService(decisions, placesFake(), clock).parse(inputFor(text));
    assert.equal(output.parse.fallbackRequired, false, JSON.stringify(output.parse.issues));
    assert.equal(decisions.requests.length, 2);
    assert.equal(output.locations.length, 2, text);
    const pickup = output.locations.find(value => value.target === 'pickup');
    const drop = output.locations.find(value => value.target === 'drop');
    if (pickup.candidate.exactText !== 'campus' || drop.candidate.exactText !== 'Pari Chowk') reversals += 1;
    assert.equal(pickup.candidate.exactText, 'campus', text);
    assert.equal(drop.candidate.exactText, 'Pari Chowk', text);
    for (const [role, result] of [['pickup', pickup], ['drop', drop]]) {
      assert.deepEqual({ exactText: result.candidate.exactText, start: result.candidate.start, end: result.candidate.end }, labels[role], text);
      assert.equal(text.slice(labels[role].start, labels[role].end), labels[role].exactText);
    }
  }
  assert.equal(reversals, 0, 'Deterministic fake cohort reversal count; not live model accuracy');
});

test('realistic partial and complete simple examples ground only stated locations', async () => {
  const cases = [
    ['SUV tomorrow from campus to Pari Chowk', 'campus', 'Pari Chowk', { vehicle_class: 'suv', vehicle_strength: 'REQUIRED', timing_mode: 'SCHEDULED' }],
    ['cab now from hostel gate to botanical garden', 'hostel gate', 'botanical garden', { timing_mode: 'IMMEDIATE' }],
    ['from campus to airport at 6 PM', 'campus', 'airport', { timing_mode: 'SCHEDULED' }],
    ['anything except sedan from campus to Delhi', 'campus', 'Delhi', { exclude_sedan: 'EXCLUDED', vehicle_any: 'EXPLICIT_ANY' }],
    ['SUV tomorrow', undefined, undefined, { vehicle_class: 'suv', vehicle_strength: 'REQUIRED', timing_mode: 'SCHEDULED' }],
  ];
  for (const [text, pickup, drop, choices] of cases) {
    const places = placesFake();
    const output = await createSearchGroundingService(searchFake(text, { pickup, drop, choices }), places, clock).parse(inputFor(text));
    assert.equal(output.parse.fallbackRequired, false, `${text}: ${JSON.stringify(output.parse.issues)}`);
    assert.equal(output.locations.length, pickup ? 2 : 0, text);
    assert.equal(places.calls.length, output.locations.length);
    assert.ok(places.calls.every(call => call[0] === 'search'), 'No details before explicit selection');
  }
});

test('a vehicle preference before a bare destination remains a partial booking, not an invented origin', async () => {
  for (const text of ['SUV to airport', 'SUV tomorrow to airport', 'SUV only to airport']) {
    const choices = { vehicle_class: 'suv', vehicle_strength: 'REQUIRED', timing_mode: text.includes('tomorrow') ? 'SCHEDULED' : 'UNSPECIFIED' };
    const output = await createSearchGroundingService(searchFake(text, { drop: 'airport', choices }), placesFake(), clock).parse(inputFor(text));
    assert.equal(output.parse.fallbackRequired, false, JSON.stringify(output.parse.issues));
    assert.equal(output.parse.draft.vehicleClass.value, 'suv');
    assert.equal(output.parse.draft.pickup.state, 'UNSPECIFIED');
    assert.equal(output.locations.length, 1);
    assert.equal(output.locations[0].target, 'drop');
  }
});

test('complex/failed/unclear routing never performs semantic recovery or Places calls', async () => {
  for (const options of [{ complexity: 'COMPLEX' }, { type: 'UNCLEAR_OR_UNRELATED' }]) {
    const places = placesFake();
    const output = await createSearchGroundingService(searchFake('campus to airport via Pari Chowk', options), places, clock).parse(inputFor('campus to airport via Pari Chowk'));
    assert.equal(places.calls.length, 0);
    if (options.complexity) {
      assert.equal(output.parse.route, 'COMPLEX_FALLBACK_REQUIRED');
      assert.equal(output.parse.draft.unsupportedRequests[0].kind, 'STOP');
      assert.equal(output.parse.draft.query.text.slice(output.parse.draft.unsupportedRequests[0].refs[0].start).startsWith('via Pari'), true);
    }
    await assert.rejects(createSearchGroundingService(searchFake('x'), places, clock).chooseLocationTarget(output, 'pickup', 0), /NOT_LOCATION_SEARCH/);
  }
  const places = placesFake();
  const output = await createSearchGroundingService(decisionFake([new Error('secret')]), places, clock).parse(inputFor('from campus to airport'));
  assert.equal(output.parse.fallbackRequired, true);
  assert.equal(places.calls.length, 0);
  const invalid = await createSearchGroundingService(decisionFake(), places, clock).parse({ ...inputFor('x'), query: { id: 'q', revision: -1, text: 'x' } });
  assert.equal(invalid.parse.draft, undefined);
});

test('invalid role IDs, same candidates and reversal risk prevent Places calls', async () => {
  for (const choices of [{ pickup_candidate: 'unknown' }, { role_consistency: 'REVERSAL_RISK' }, { drop_candidate: 'NONE_OR_UNCLEAR' }]) {
    const places = placesFake();
    const output = await createSearchGroundingService(searchFake('campus to airport', { pickup: 'campus', drop: 'airport', choices }), places, clock).parse(inputFor('campus to airport'));
    assert.equal(output.parse.fallbackRequired, true);
    assert.equal(places.calls.length, 0);
  }
});

test('candidate hook invalid outputs fail closed and no extraction after failure', async () => {
  for (const generated of [{ candidates: [], issues: [{ code: 'LIMIT_EXCEEDED', field: 'candidates', category: 'INVALID', refs: [] }] },
    { candidates: [{ candidateId: 'invalid' }], issues: [] }]) {
    const provider = searchFake('SUV tomorrow');
    const output = await createRideSearchParser(provider, clock, () => generated).parse(inputFor('SUV tomorrow'));
    assert.equal(provider.requests.length, 1);
    assert.ok(output.issues.length > 0);
    assert.equal(output.fallbackRequired, generated.issues.length > 0);
    assert.equal(output.route, generated.issues.length ? 'COMPLEX_FALLBACK_REQUIRED' : 'PARSER_UNAVAILABLE');
    assert.deepEqual(output.fallbackReasons, generated.issues.length ? ['LIMIT_EXCEEDED'] : []);
    assert.equal(output.issues[0].code, generated.issues.length ? 'LIMIT_EXCEEDED' : 'INVALID_INPUT_PROVENANCE');
  }
});

test('an invalid generator cannot hide the shared candidate-count resource error', async () => {
  const provider = searchFake('Airport');
  const generated = query => ({ candidates: Array.from({ length: 25 }, (_, index) => ({ candidateId: `c-${index}`, queryId: query.id, queryRevision: query.revision, exactText: query.text, start: 0, end: query.text.length, method: 'WHOLE_LOCATION_QUERY', generatorVersion: 'test' })), issues: [] });
  const output = await createRideSearchParser(provider, clock, generated).parse(inputFor('Airport'));
  assert.equal(provider.requests.length, 1);
  assert.equal(output.route, 'PARSER_UNAVAILABLE');
  assert.deepEqual(output.issues.map(value => value.code), ['LIMIT_EXCEEDED']);
});

test('simple and unrelated grounding results retain only their real locations, diagnostics and empty target provenance', async () => {
  for (const type of ['BOOKING_REQUEST', 'UNCLEAR_OR_UNRELATED']) {
    const text = type === 'BOOKING_REQUEST' ? 'campus to airport' : 'weather';
    const places = placesFake();
    const output = await createSearchGroundingService(searchFake(text, { type, pickup: 'campus', drop: 'airport' }), places, clock).parse(inputFor(text));
    assert.deepEqual(output.targetRefs, []);
    assert.equal(output.locations.length, type === 'BOOKING_REQUEST' ? 2 : 0);
    assert.equal(output.issues.length, type === 'BOOKING_REQUEST' ? 2 : 0);
    assert.equal(output.issues.every(value => value.code === 'PLACE_SELECTION_REQUIRED'), true);
    assert.equal(places.calls.length, type === 'BOOKING_REQUEST' ? 2 : 0);
  }
});

test('trusted form endpoints remain grounded without requesting new Google suggestions', async () => {
  const form = emptyDraft({ id: 'form', revision: 2, text: 'Home Office' });
  form.queryType = 'BOOKING_REQUEST'; form.complexity = 'SIMPLE';
  const refs = [{ kind: 'QUERY_SPAN', queryId: 'form', revision: 2, start: 0, end: 11 }];
  form.pickup = { state: 'RESOLVED', value: { kind: 'USER_SELECTION', selectionId: 'home' }, refs };
  form.drop = { state: 'RESOLVED', value: { kind: 'USER_SELECTION', selectionId: 'office' }, refs };
  const places = placesFake();
  const service = createSearchGroundingService(searchFake('SUV tomorrow', { choices: { vehicle_class: 'suv', vehicle_strength: 'REQUIRED', timing_mode: 'SCHEDULED' } }), places, clock);
  const output = await service.parse({ ...inputFor('SUV tomorrow'), formDraft: form, trustedLocationSelections: [{ selectionId: 'home', displayText: 'Home' }, { selectionId: 'office', displayText: 'Office' }] });
  assert.equal(output.parse.fallbackRequired, false);
  assert.equal(output.parse.draft.pickup.value.selectionId, 'home');
  assert.deepEqual(output.locations, []);
  assert.deepEqual(output.issues, []);
  assert.deepEqual(places.calls, []);
});

test('a forged standalone location reference is rejected before any Places call', async () => {
  const places = placesFake();
  const service = createSearchGroundingService(searchFake('Pari Chowk', { type: 'LOCATION_SEARCH' }), places, clock);
  const output = await service.parse(inputFor('Pari Chowk'));
  output.parse.draft.locationSearch.value.candidateId = 'not-offered';
  await assert.rejects(service.chooseLocationTarget(output, 'pickup', 0), /UNKNOWN_LOCATION_CANDIDATE/);
  assert.equal(places.calls.length, 0);
  await assert.rejects(service.parse(inputFor('Pari Chowk'), { activeField: 'drop', formRevision: -1 }));
});
