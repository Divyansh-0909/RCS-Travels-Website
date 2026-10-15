import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDraft } from '../services/search/contracts.ts';
import { validateLunaEvidence } from '../services/search/complex/evidence.ts';
import { collectObservations } from '../services/search/observations.ts';
import { queryRef, resolved, ambiguous } from '../services/search/fields.ts';
import { inputFor } from './helpers/rideSearchFake.js';
import { createTestClock } from './helpers/testClock.js';

const clock = createTestClock('2026-10-02T10:00:00Z');
const item = text => emptyDraft(inputFor(text).query);
const whole = draft => queryRef(draft.query, 0, draft.query.text.length);
const invalid = (draft, field) => validateLunaEvidence(draft).filter(issue => issue.field === field && issue.category === 'INVALID');

test('S4 marks every scalar hallucination INVALID, not merely diagnostically unsupported', () => {
  const cases = [
    ['3 people', 'passengers', 4],
    ['private ride', 'sharing', true],
    ['local ride', 'isOutstation', true],
    ['fastest route', 'preferSafeRoute', true],
    ['no carrier', 'needsCarrier', true],
  ];
  for (const [text, field, value] of cases) {
    const draft = item(text);
    draft[field] = resolved(value, [whole(draft)]);
    assert.deepEqual(invalid(draft, field).map(issue => issue.code), ['LUNA_UNSUPPORTED_FACT'], text);
  }
  const temporal = item('tomorrow at 6 PM');
  const observations = collectObservations(temporal.query, []);
  temporal.timing.date = resolved({ kind: 'RELATIVE', anchor: 'TODAY' }, [observations.dates[0].ref]);
  temporal.timing.time = resolved({ ...observations.times[0].value, precision: 'APPROXIMATE' }, [observations.times[0].ref]);
  assert.deepEqual(invalid(temporal, 'timing.date').map(issue => issue.code), ['LUNA_UNSUPPORTED_FACT']);
  assert.deepEqual(invalid(temporal, 'timing.time').map(issue => issue.code), ['LUNA_UNSUPPORTED_FACT']);
});

test('S4 requires a complete query binding despite mixed provenance and partial reference ends', () => {
  const draft = item('3 people and 4 people');
  const [three, four] = collectObservations(draft.query, []).passengers;
  const userRef = { kind: 'USER_FIELD', field: 'passengers', revision: 1 };
  draft.passengers = resolved(3, [userRef, queryRef(draft.query, three.ref.start, three.ref.end - 1)]);
  assert.deepEqual(invalid(draft, 'passengers').map(issue => issue.code), ['LUNA_UNSUPPORTED_FACT']);
  draft.passengers = resolved(3, [userRef, three.ref]);
  assert.deepEqual(invalid(draft, 'passengers'), []);
  draft.passengers = ambiguous([3, 4], 'PASSENGER_CONFLICT', [three.ref, queryRef(draft.query, four.ref.start, four.ref.end - 1)]);
  assert.deepEqual(invalid(draft, 'passengers').map(issue => issue.code), ['LUNA_UNSUPPORTED_FACT']);
});

test('S4 rejects an invented alternative after observing two vehicle classes', () => {
  const draft = item('SUV or sedan');
  draft.vehicleClass = ambiguous(['suv', 'hatchback'], 'VEHICLE_CONFLICT', [whole(draft)]);
  assert.deepEqual(invalid(draft, 'vehicleClass').map(issue => issue.code), ['LUNA_UNSUPPORTED_FACT']);
});

test('vehicle invention, erased exclusions, and partial bindings remain invalid while mixed valid references bind safely', () => {
  for (const [text, vehicleClass] of [
    ['no SUV', { state: 'UNSPECIFIED' }],
    ['a ride', { state: 'EXPLICIT_ANY', excluded: [] }],
    ['SUV', { state: 'RESOLVED', value: 'sedan', strength: 'REQUIRED', excluded: [] }],
    ['prefer SUV', { state: 'RESOLVED', value: 'suv', strength: 'REQUIRED', excluded: [] }],
  ]) {
    const draft = item(text);
    draft.vehicleClass = { ...vehicleClass, ...(vehicleClass.state === 'UNSPECIFIED' ? {} : { refs: [whole(draft)] }) };
    assert.deepEqual(invalid(draft, 'vehicleClass').map(issue => issue.code), ['LUNA_UNSUPPORTED_FACT'], text);
  }
  const bound = item('a ride with SUV');
  const vehicle = collectObservations(bound.query, []).vehicles[0];
  bound.vehicleClass = { state: 'RESOLVED', value: 'suv', strength: 'REQUIRED', excluded: [], refs: [queryRef(bound.query, 0, 1), vehicle.ref] };
  assert.deepEqual(invalid(bound, 'vehicleClass'), []);
  bound.vehicleClass.refs = [queryRef(bound.query, vehicle.ref.start, vehicle.ref.end - 1)];
  assert.deepEqual(invalid(bound, 'vehicleClass').map(issue => issue.code), ['LUNA_UNSUPPORTED_FACT']);
});

test('S4 preserves whitespace-sensitive exclusion, required, and preferred vehicle grammar', () => {
  for (const text of ['do\t not\n send\t an SUV', 'do not sedan', "don't\t send\n a sedan", 'without\n an\t hatchback']) {
    const draft = item(text);
    const vehicle = collectObservations(draft.query, []).vehicles[0];
    draft.vehicleClass = { state: 'EXCLUDED', excluded: vehicle.value === 'suv' ? ['suv', 'suv_premium'] : [vehicle.value], refs: [vehicle.ref] };
    assert.deepEqual(invalid(draft, 'vehicleClass'), [], text);
  }
  for (const [text, strength] of [['only\tSUV', 'REQUIRED'], ['SUV\n only', 'REQUIRED'], ['preferred\t sedan', 'PREFERRED'], ['sedan\n preferred', 'PREFERRED']]) {
    const draft = item(text);
    const vehicle = collectObservations(draft.query, []).vehicles[0];
    draft.vehicleClass = { state: 'RESOLVED', value: vehicle.value, strength, excluded: [], refs: [vehicle.ref] };
    assert.deepEqual(invalid(draft, 'vehicleClass'), [], text);
  }
  const longNegative = item('do not send sedan from campus to the far airport terminal main entrance');
  longNegative.vehicleClass = { state: 'EXCLUDED', excluded: ['sedan'], refs: [whole(longNegative)] };
  assert.deepEqual(invalid(longNegative, 'vehicleClass'), []);
  const longPreferred = item('prefer SUV from campus to the far airport terminal main entrance');
  longPreferred.vehicleClass = { state: 'RESOLVED', value: 'suv', strength: 'REQUIRED', excluded: [], refs: [whole(longPreferred)] };
  assert.deepEqual(invalid(longPreferred, 'vehicleClass').map(issue => issue.code), ['LUNA_UNSUPPORTED_FACT']);
});

test('S4 rejects IMMEDIATE when a controlled-clock query also states a date or time', () => {
  clock.set('2026-10-02T10:00:00Z');
  for (const text of ['now tomorrow', 'right now at 6 PM']) {
    const draft = item(text);
    const observations = collectObservations(draft.query, []);
    draft.timing.mode = 'IMMEDIATE';
    draft.timing.refs = observations.now;
    assert.deepEqual(invalid(draft, 'timing').map(issue => issue.code), ['TEMPORAL_CONFLICT'], `${clock.now().toISOString()} ${text}`);
  }
});

test('S4 timing ambiguity requires supplied timing information; omission remains unspecified', () => {
  const omitted = item('a ride');
  omitted.timing = { ...omitted.timing, mode: 'AMBIGUOUS', refs: [whole(omitted)] };
  assert.deepEqual(invalid(omitted, 'timing').map(issue => issue.code), ['TEMPORAL_CONFLICT']);
  for (const text of ['around 7', 'now tomorrow', 'now']) {
    const stated = item(text);
    stated.timing = { ...stated.timing, mode: 'AMBIGUOUS', refs: [whole(stated)] };
    assert.deepEqual(invalid(stated, 'timing'), []);
  }
});

test('S4 a simultaneous now and future date cannot become an operative scheduled draft', () => {
  const draft = item('now tomorrow');
  draft.timing.mode = 'SCHEDULED'; draft.timing.refs = [whole(draft)];
  assert.deepEqual(invalid(draft, 'timing').map(issue => issue.code), ['TEMPORAL_CONFLICT']);
});

test('unsupported facts use at least one complete supporting ref, and repeated validation preserves bounded history', () => {
  const draft = item('ride then stop at Alpha');
  const stop = collectObservations(draft.query, []).unsupported[0];
  draft.unsupportedRequests = [{ kind: 'STOP', refs: [queryRef(draft.query, 0, 4), stop.ref], candidateIds: [], reasonCode: 'BACKEND_CAPABILITY_UNSUPPORTED' }];
  assert.deepEqual(invalid(draft, 'unsupportedRequests'), []);
  assert.equal(draft.unsupportedRequests.length, 1);
  const once = structuredClone(draft.unsupportedRequests);
  validateLunaEvidence(draft); assert.deepEqual(draft.unsupportedRequests, once);
  draft.unsupportedRequests[0].refs = [queryRef(draft.query, stop.ref.start, stop.ref.end - 1)];
  assert.deepEqual(invalid(draft, 'unsupportedRequests').map(issue => issue.code), ['LUNA_UNSUPPORTED_FACT']);
  const passengers = item('3 people'); passengers.passengers = resolved(3, [whole(passengers)]);
  validateLunaEvidence(passengers); const first = structuredClone(passengers.unsupportedRequests);
  validateLunaEvidence(passengers); assert.deepEqual(passengers.unsupportedRequests, first);
  const overlap = item('stop at Delta for 3 people');
  overlap.unsupportedRequests = [{ kind: 'PASSENGER_COUNT', refs: [whole(overlap)], candidateIds: [], reasonCode: 'PASSENGER_ALLOCATION_NOT_ENFORCED' }];
  assert.deepEqual(invalid(overlap, 'unsupportedRequests'), []);
  assert.deepEqual(new Set(overlap.unsupportedRequests.map(value => value.kind)), new Set(['STOP', 'PASSENGER_COUNT']));
});

test('S4 keeps each unsupported clause and recognizes every friend-pickup spelling', () => {
  const stops = item('stop at Alpha, then stop at Beta');
  const observations = collectObservations(stops.query, []);
  stops.unsupportedRequests = [{ kind: 'STOP', refs: [observations.unsupported[0].ref], candidateIds: [], reasonCode: 'BACKEND_CAPABILITY_UNSUPPORTED' }];
  assert.deepEqual(invalid(stops, 'unsupportedRequests'), []);
  validateLunaEvidence(stops);
  assert.deepEqual(stops.unsupportedRequests.filter(value => value.kind === 'STOP').map(value => value.refs[0]), observations.unsupported.map(value => value.ref));

  for (const text of ['get my friend from Alpha', 'collect friend from Alpha', 'pick up friend from Alpha', 'pick up my friend from Alpha', 'pick  up  my  friend from Alpha', 'pick  up friend from Alpha', 'get  friend from Alpha', 'get my  friend from Alpha']) {
    const draft = item(text);
    const observed = collectObservations(draft.query, []).unsupported.find(value => value.kind === 'STOP');
    validateLunaEvidence(draft);
    const stop = draft.unsupportedRequests.find(value => value.kind === 'STOP');
    assert.ok(stop, text);
    const action = text.match(/^(?:get|collect|pick\s+up)\s+(?:my\s+)?friend/i)[0];
    assert.deepEqual(stop.refs, [observed?.ref ?? queryRef(draft.query, 0, action.length)], text);
  }
});
