import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLunaOutput, newSpanCount } from '../services/search/complex/locations.ts';
import { validateLunaEvidence } from '../services/search/complex/evidence.ts';
import { preservePartial, trustedFields, mergeInterpretedReview } from '../services/search/complex/trusted.ts';
import { fallbackEligibility } from '../services/search/complex/eligibility.ts';
import { emptyDraft } from '../services/search/contracts.ts';
import { queryRef, resolved, ambiguous } from '../services/search/fields.ts';
import { createTestClock } from './helpers/testClock.js';
import { inputFor, candidateFor } from './helpers/rideSearchFake.js';
import { lunaOutput } from './helpers/rideSearchS4Fake.js';
import { createLocationReview, editLocationReview } from '../services/search/locations/review.ts';

const input = (text = 'from campus to airport', candidates = []) => ({ ...inputFor(text), candidates,
  partialDraft: null, trustedFields: [], fallbackReasons: ['COMPLEX_QUERY'], now: '2026-10-02T10:00:00Z' });
const whole = query => queryRef(query, 0, query.text.length);
const draft = text => emptyDraft(input(text).query);

test('Luna candidate aliases reuse existing exact spans and stable code-owned identities', () => {
  const context = input(); context.candidates = [candidateFor(context, 'campus', 'existing')];
  const raw = lunaOutput(context.query, { pickup: 'campus', drop: 'airport' });
  const result = normalizeLunaOutput(context, raw);
  assert.equal(result.pickup.value.candidateId, 'existing'); assert.equal(result.candidates.length, 2);
  assert.deepEqual(normalizeLunaOutput(context, raw), result); assert.equal(newSpanCount(result, context.candidates), 1);
  raw.locations[0].key = 'existing'; raw.draft.pickup.value.candidateId = 'existing';
  assert.deepEqual(normalizeLunaOutput(context, raw), result);
  raw.draft.unsupportedRequests = [{ kind: 'STOP', candidateIds: ['existing'], refs: [whole(context.query)], reasonCode: 'stop' }];
  assert.deepEqual(normalizeLunaOutput(context, raw).unsupportedRequests[0].candidateIds, ['existing']);
});

test('Luna invalid aliases, provenance, geography and memberships fail closed without repair', () => {
  const context = input(); context.candidates = [candidateFor(context, 'campus', 'existing')];
  const mutations = [
    output => output.locations.push({ ...output.locations[0] }),
    output => { output.locations[1].key = 'existing'; },
    output => { output.locations[1].end = 500; },
    output => { output.locations[1].exactText = 'invented'; },
    output => { output.draft.pickup.value.candidateId = 'missing'; },
    output => { output.draft.pickup.value = { kind: 'USER_SELECTION', selectionId: 'fabricated' }; },
    output => { output.draft.pickup.refs[0].start = 0; },
    output => { output.draft.pickup.refs[0].queryId = 'wrong'; },
    output => { output.draft.pickup.refs[0].revision = 4; },
    output => { output.draft.pickup.refs[0] = { kind: 'USER_FIELD', field: 'pickup', revision: 3 }; },
    output => { output.draft.pickup.placeId = 'invented'; },
    output => { output.draft.query.text = 'different'; },
    output => { output.draft.unsupportedRequests = [{ kind: 'STOP', candidateIds: ['bad'], refs: [whole(context.query)], reasonCode: 'stop' }]; },
  ];
  for (const mutate of mutations) {
    const raw = lunaOutput(context.query, { pickup: 'campus', drop: 'airport' }); mutate(raw);
    assert.throws(() => normalizeLunaOutput(context, raw), /LUNA_SCHEMA_ERROR|invalid/i);
  }
  const unicode = input('from 😀 campus to airport');
  const raw = lunaOutput(unicode.query, { pickup: '😀 campus', drop: 'airport' });
  assert.equal(normalizeLunaOutput(unicode, raw).candidates[0].exactText, '😀 campus');
  raw.locations[0].start += 1; raw.locations[0].exactText = unicode.query.text.slice(raw.locations[0].start, raw.locations[0].end);
  assert.throws(() => normalizeLunaOutput(unicode, raw));
  raw.locations[0].start -= 1; raw.locations[0].end = raw.locations[0].start + 1; raw.locations[0].exactText = '😀'[0];
  assert.throws(() => normalizeLunaOutput(unicode, raw));
});

test('Luna role alternatives must each retain their own exact evidence span', () => {
  const context = input(); const raw = lunaOutput(context.query, { pickup: 'campus', drop: 'airport' });
  raw.draft.pickup = ambiguous([raw.draft.pickup.value, raw.draft.drop.value], 'ROLE_CONFLICT', [...raw.draft.pickup.refs, ...raw.draft.drop.refs]);
  assert.equal(normalizeLunaOutput(context, raw).pickup.state, 'AMBIGUOUS');
  raw.draft.pickup.refs.pop(); assert.throws(() => normalizeLunaOutput(context, raw), /LUNA_SCHEMA_ERROR/);
});

test('Luna scalar values must match explicit query evidence, including dates/time ambiguity and booleans', () => {
  for (const [text, field, value] of [
    ['3 people', 'passengers', 4], ['private ride', 'sharing', true], ['outstation', 'isOutstation', false],
    ['safe route', 'preferSafeRoute', false], ['no carrier', 'needsCarrier', true],
  ]) {
    const item = draft(text); item[field] = resolved(value, [whole(item.query)]);
    assert.ok(validateLunaEvidence(item).some(issue => issue.code === 'LUNA_UNSUPPORTED_FACT'), text);
  }
  const date = draft('tomorrow'); date.timing = { mode: 'SCHEDULED', refs: [whole(date.query)],
    date: resolved({ kind: 'RELATIVE', anchor: 'TODAY' }, [whole(date.query)]), time: { state: 'UNSPECIFIED' } };
  assert.ok(validateLunaEvidence(date).some(issue => issue.field === 'timing.date'));
  const time = draft('around 7'); time.timing = { mode: 'SCHEDULED', refs: [whole(time.query)], date: { state: 'UNSPECIFIED' },
    time: resolved({ kind: 'CLOCK', hour: 7, minute: resolved(0, [whole(time.query)]), notation: 'H12', period: resolved('PM', [whole(time.query)]), precision: 'APPROXIMATE' }, [whole(time.query)]) };
  assert.equal(validateLunaEvidence(time).some(issue => issue.field === 'timing.time'), false);
  time.timing.time.value.period = resolved('AM', [whole(time.query)]);
  assert.ok(validateLunaEvidence(time).some(issue => issue.field === 'timing.time'));
  const vague = draft('3 people'); vague.passengers = ambiguous([3], 'UNCLEAR', [whole(vague.query)]);
  assert.ok(!validateLunaEvidence(vague).some(issue => issue.code === 'LUNA_UNSUPPORTED_FACT'));
  vague.passengers.refs = [queryRef(vague.query, 2, 8)];
  assert.ok(validateLunaEvidence(vague).some(issue => issue.code === 'LUNA_UNSUPPORTED_FACT'));
});

test('Luna preserves exclusions, exact-any and required/preferred semantics and rejects contradictory inventions', () => {
  for (const [text, preference, valid] of [
    ['any car', { state: 'EXPLICIT_ANY', excluded: [] }, true],
    ['a ride', { state: 'EXPLICIT_ANY', excluded: [] }, false],
    ['anything except sedan', { state: 'EXCLUDED', excluded: ['sedan'] }, true],
    ['no SUV', { state: 'EXCLUDED', excluded: ['suv'] }, false],
    ['no SUV', { state: 'EXCLUDED', excluded: ['suv', 'suv_premium'] }, true],
    ['no SUV', { state: 'UNSPECIFIED' }, false],
    ['SUV only', { state: 'RESOLVED', value: 'suv', strength: 'REQUIRED', excluded: [] }, true],
    ['SUV only', { state: 'RESOLVED', value: 'suv', strength: 'PREFERRED', excluded: [] }, false],
    ['prefer SUV', { state: 'RESOLVED', value: 'suv', strength: 'PREFERRED', excluded: [] }, true],
    ['prefer SUV', { state: 'RESOLVED', value: 'suv', strength: 'REQUIRED', excluded: [] }, false],
    ['SUV', { state: 'RESOLVED', value: 'sedan', strength: 'REQUIRED', excluded: [] }, false],
    ['SUV or sedan', { state: 'AMBIGUOUS', alternatives: ['suv', 'sedan'], reasonCode: 'VEHICLE_CONFLICT' }, true],
    ['SUV', { state: 'AMBIGUOUS', alternatives: ['suv', 'hatchback'], reasonCode: 'VEHICLE_CONFLICT' }, false],
  ]) {
    const item = draft(text); item.vehicleClass = { ...preference, ...(preference.state === 'UNSPECIFIED' ? {} : { refs: [whole(item.query)] }) };
    const invalid = validateLunaEvidence(item).some(value => value.code === 'LUNA_UNSUPPORTED_FACT');
    assert.equal(!invalid, valid, text + JSON.stringify(preference));
  }
  const outside = draft('SUV'); outside.vehicleClass = { state: 'RESOLVED', value: 'suv', strength: 'REQUIRED', excluded: [], refs: [queryRef(outside.query, 1, 3)] };
  assert.ok(validateLunaEvidence(outside).some(value => value.code === 'LUNA_UNSUPPORTED_FACT'));
});

test('Luna cannot invent now/future timing or unsupported services; explicit unsupported clauses are retained', () => {
  for (const [text, mode] of [['a ride', 'IMMEDIATE'], ['now tomorrow', 'IMMEDIATE'], ['a ride', 'SCHEDULED'], ['now', 'SCHEDULED'], ['tomorrow', 'UNSPECIFIED'], ['now', 'UNSPECIFIED']]) {
    const item = draft(text); item.timing.mode = mode;
    assert.ok(validateLunaEvidence(item).some(value => value.code === 'TEMPORAL_CONFLICT'), text + mode);
  }
  const invented = draft('ride from campus to airport');
  invented.unsupportedRequests = [{ kind: 'RENTAL', refs: [whole(invented.query)], candidateIds: [], reasonCode: 'rental' }];
  assert.ok(validateLunaEvidence(invented).some(value => value.code === 'LUNA_UNSUPPORTED_FACT'));
  const stated = draft('rent a car then stop at campus and come back with AC if available for 3 people');
  stated.unsupportedRequests = [{ kind: 'RENTAL', refs: [whole(stated.query)], candidateIds: [], reasonCode: 'rental' }];
  stated.passengers = resolved(3, [whole(stated.query)]);
  const result = validateLunaEvidence(stated);
  assert.ok(!result.some(value => value.code === 'LUNA_UNSUPPORTED_FACT'));
  assert.deepEqual(new Set(stated.unsupportedRequests.map(value => value.kind)), new Set(['RENTAL', 'STOP', 'RETURN_JOURNEY', 'AC_PREFERENCE', 'CONDITIONAL_PREFERENCE', 'PASSENGER_COUNT']));
});

test('safe partial extraction survives unspecified fallback fields, while trusted user provenance stays in session', () => {
  const item = draft('SUV tomorrow at 6 PM'); const raw = lunaOutput(item.query).draft;
  const partial = { ...raw, candidates: [] };
  partial.vehicleClass = { state: 'RESOLVED', value: 'suv', strength: 'REQUIRED', excluded: [], refs: [queryRef(item.query, 0, 3)] };
  preservePartial(item, partial); assert.deepEqual(item.timing, partial.timing); assert.deepEqual(item.vehicleClass, partial.vehicleClass);
  const scheduled = draft(item.query.text); scheduled.timing.mode = 'SCHEDULED';
  preservePartial(scheduled, partial); assert.deepEqual(scheduled.timing.date, partial.timing.date); assert.deepEqual(scheduled.timing.time, partial.timing.time);
  const immediate = draft(item.query.text); immediate.timing.mode = 'IMMEDIATE';
  preservePartial(immediate, partial); assert.equal(immediate.timing.mode, 'IMMEDIATE');
  const explicit = draft('SUV'); explicit.vehicleClass = { state: 'RESOLVED', value: 'suv', strength: 'REQUIRED', excluded: [], refs: [{ kind: 'USER_FIELD', field: 'vehicleClass', revision: 0 }] };
  explicit.timing.refs = [{ kind: 'USER_FIELD', field: 'timing', revision: 0 }];
  const target = draft('SUV'); preservePartial(target, explicit); assert.equal(target.vehicleClass.state, 'UNSPECIFIED');
  preservePartial(target, null); assert.equal(target.vehicleClass.state, 'UNSPECIFIED');
});
