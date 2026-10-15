import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDraft } from '../services/search/contracts.ts';
import { normalizeLunaOutput } from '../services/search/complex/locations.ts';
import { applyFormFields, requiresTrustedReview, preservePartial, mergeInterpretedReview } from '../services/search/complex/trusted.ts';
import { createSearchInterpretationService } from '../services/search/complex/service.ts';
import { createLocationReview, editLocationReview, applyTrustedLocation } from '../services/search/locations/review.ts';
import { createRideSearchParser } from '../services/search/parser.ts';
import { queryRef, resolved, ambiguous } from '../services/search/fields.ts';
import { candidateFor, inputFor } from './helpers/rideSearchFake.js';
import { searchFake, placesFake } from './helpers/rideSearchS3Fake.js';
import { lunaFake, lunaOutput } from './helpers/rideSearchS4Fake.js';
import { createTestClock } from './helpers/testClock.js';

const clock = createTestClock('2026-10-02T10:00:00Z');
const user = field => [{ kind: 'USER_FIELD', field, revision: 2 }];
const parseRecord = draft => ({ draft, route: 'UNCLEAR_OR_UNRELATED', issues: [], fallbackRequired: false, fallbackReasons: [], providerMetadata: {} });
const complex = text => searchFake(text, { complexity: 'COMPLEX' });
const context = text => ({ ...inputFor(text), candidates: [], partialDraft: null, trustedFields: [], fallbackReasons: ['COMPLEX_QUERY'], now: clock.now().toISOString() });

test('same location wording at different offsets remains distinct, and wrong text cannot borrow an existing identity', () => {
  const input = context('campus then campus');
  input.candidates = [candidateFor(input, 'campus', 'first')];
  const raw = lunaOutput(input.query, { pickup: 'campus' });
  raw.locations = [{ key: 'second', start: 12, end: 18, exactText: 'campus' }];
  raw.draft.pickup = resolved({ kind: 'QUERY_CANDIDATE', candidateId: 'second' }, [queryRef(input.query, 12, 18)]);
  const draft = normalizeLunaOutput(input, raw);
  assert.equal(draft.candidates.length, 2);
  assert.notEqual(draft.pickup.value.candidateId, 'first');
  assert.deepEqual(draft.candidates.map(value => [value.start, value.end]), [[0, 6], [12, 18]]);
  assert.deepEqual(normalizeLunaOutput(input, raw), draft);
  raw.locations[0] = { key: 'other', start: 0, end: 6, exactText: 'wrong!' };
  raw.draft.pickup = resolved({ kind: 'QUERY_CANDIDATE', candidateId: 'other' }, [queryRef(input.query, 0, 6)]);
  assert.throws(() => normalizeLunaOutput(input, raw), /LUNA_SCHEMA_ERROR/);
  for (const [start, end] of [[1, 6], [0, 7]]) {
    raw.locations[0] = { key: 'other', start, end, exactText: 'campus' };
    assert.throws(() => normalizeLunaOutput(input, raw), /LUNA_SCHEMA_ERROR/);
  }
});

test('new stop aliases are rebound to application-owned identities, and location refs must cover exactly their own spans', () => {
  const input = context('from campus stop at Delta 1 then go to airport');
  const raw = lunaOutput(input.query, { pickup: 'campus', drop: 'airport' });
  const start = input.query.text.indexOf('Delta 1');
  raw.locations.push({ key: 'stop', start, end: start + 7, exactText: 'Delta 1' });
  raw.draft.unsupportedRequests = [{ kind: 'STOP', candidateIds: ['stop'], refs: [queryRef(input.query, start, start + 7)], reasonCode: 'UNSUPPORTED_STOP' }];
  const draft = normalizeLunaOutput(input, raw);
  assert.equal(draft.unsupportedRequests[0].candidateIds[0], draft.candidates.find(value => value.exactText === 'Delta 1').candidateId);
  assert.notEqual(draft.unsupportedRequests[0].candidateIds[0], 'stop');
  raw.draft.pickup.refs[0].end += 1;
  assert.throws(() => normalizeLunaOutput(input, raw), /LUNA_SCHEMA_ERROR/);
});

test('form scalar ambiguity and whole timing edits are retained without treating them as place selections', () => {
  const input = inputFor('SUV tomorrow');
  const draft = emptyDraft(input.query);
  const review = createLocationReview(parseRecord(draft), clock.now(), input.timeZone);
  const form = emptyDraft(input.query);
  form.sharing = ambiguous([true, false], 'USER_UNDECIDED', user('sharing'));
  form.timing = { mode: 'SCHEDULED', refs: user('timing'), date: resolved({ kind: 'RELATIVE', anchor: 'TOMORROW' }, user('timing.date')), time: { state: 'UNSPECIFIED' } };
  const next = applyFormFields(review, form);
  assert.equal(next.session.effectiveDraft.sharing.state, 'AMBIGUOUS');
  assert.equal(next.session.effectiveDraft.timing.mode, 'SCHEDULED');
  assert.equal(next.session.effectiveDraft.timing.date.value.anchor, 'TOMORROW');
  assert.equal(requiresTrustedReview(form), false);
  form.pickup = ambiguous([{ kind: 'QUERY_CANDIDATE', candidateId: 'one' }], 'UNCLEAR', [queryRef(form.query, 0, 3)]);
  assert.equal(requiresTrustedReview(form), false);
  form.pickup = resolved({ kind: 'QUERY_CANDIDATE', candidateId: 'one' }, user('pickup'));
  assert.equal(requiresTrustedReview(form), false);
});

test('equivalent model and explicit user values do not create false conflicts merely because their source refs differ', () => {
  const input = inputFor('SUV from campus');
  const draft = emptyDraft(input.query);
  const candidate = candidateFor(input, 'campus', 'campus');
  draft.candidates = [candidate];
  let review = createLocationReview(parseRecord(draft), clock.now(), input.timeZone);
  review = editLocationReview(review, 'vehicleClass', { state: 'RESOLVED', value: 'suv', strength: 'REQUIRED', excluded: [], refs: [] });
  const next = structuredClone(draft); next.query.revision += 1;
  next.candidates = []; next.pickup = { state: 'UNSPECIFIED' };
  next.vehicleClass = { state: 'RESOLVED', value: 'suv', strength: 'REQUIRED', excluded: [], refs: [queryRef(next.query, 0, 3)] };
  const merged = mergeInterpretedReview(parseRecord(next), clock.now(), input.timeZone, review);
  assert.ok(!merged.parseIssues.some(value => value.code === 'TRUSTED_STATE_CONFLICT'));
});

test('partial date/time reuse never promotes an ambiguous schedule to a determined schedule', () => {
  const query = inputFor('tomorrow at 6 PM').query;
  const partial = emptyDraft(query);
  partial.timing = { mode: 'AMBIGUOUS', refs: [queryRef(query, 0, query.text.length)], date: resolved({ kind: 'RELATIVE', anchor: 'TOMORROW' }, [queryRef(query, 0, 8)]), time: resolved({ kind: 'DAYPART', value: 'EVENING' }, [queryRef(query, 12, 16)]) };
  const scheduled = emptyDraft(query); scheduled.timing.mode = 'SCHEDULED';
  const original = structuredClone(scheduled);
  preservePartial(scheduled, partial);
  assert.deepEqual(scheduled, original);
  const ambiguousNext = emptyDraft(query); ambiguousNext.timing.mode = 'AMBIGUOUS';
  partial.timing.mode = 'SCHEDULED';
  const unchanged = structuredClone(ambiguousNext);
  preservePartial(ambiguousNext, partial);
  assert.deepEqual(ambiguousNext, unchanged);
});

test('a query superseded during Luna interpretation spends no Places requests and keeps the old result nonoperative', async () => {
  const text = 'from campus to airport'; const input = inputFor(text); let current = input.query;
  const places = placesFake();
  const luna = lunaFake(value => { current = { ...input.query, revision: input.query.revision + 1 }; return lunaOutput(value.query, { pickup: 'campus', drop: 'airport' }); });
  const result = await createSearchInterpretationService(complex(text), places, luna, clock).parse(input, { activeField: null, formRevision: 0, currentQuery: () => current });
  assert.equal(result.issues.at(-1).code, 'STALE_QUERY_RESULT');
  assert.equal(places.calls.length, 0);
  assert.equal(result.locations.length, 0);
});

test('same-candidate roles without directional markers require clarification, and successful interpretations clear prior fallback reasons', async () => {
  const text = 'campus'; const places = placesFake();
  const bad = lunaFake(input => lunaOutput(input.query, { pickup: 'campus', drop: 'campus' }));
  const rejected = await createSearchInterpretationService(complex(text), places, bad, clock).parse(inputFor(text));
  assert.equal(rejected.parse.route, 'INTERPRETED_INCOMPLETE');
  assert.ok(rejected.parse.issues.some(value => value.code === 'ROLE_CONFLICT' && value.field === 'locations'));
  const good = await createSearchInterpretationService(complex(text), placesFake(), lunaFake(), clock).parse(inputFor(text));
  assert.equal(good.parse.fallbackRequired, false); assert.deepEqual(good.parse.fallbackReasons, []);
  assert.equal(good.telemetry.recoveredMissingCandidates, false);
});

test('mixed Places selections and provider failure require follow-up rather than a simple-success route', async () => {
  const text = 'SUV now from campus to airport'; const places = placesFake();
  const search = places.searchAutocomplete.bind(places);
  places.searchAutocomplete = async request => { if (request.input === 'airport') throw new Error('offline'); return search(request); };
  const decisions = searchFake(text, { pickup: 'campus', drop: 'airport', choices: { vehicle_class: 'suv', vehicle_strength: 'REQUIRED', timing_mode: 'IMMEDIATE' } });
  const luna = lunaFake();
  const result = await createSearchInterpretationService(decisions, places, luna, clock).parse(inputFor(text));
  assert.equal(result.parse.route, 'SIMPLE_COMPLETE');
  assert.equal(result.evaluationRoute, 'FOLLOW_UP_ONLY'); assert.equal(luna.calls.length, 0);
  assert.equal(result.telemetry.recoveredMissingCandidates, false);
  assert.ok(result.issues.some(value => value.code === 'PLACE_SELECTION_REQUIRED'));
  assert.ok(result.issues.some(value => value.code.includes('PROVIDER')));
});

test('an authoritative review wins over an older form snapshot and its registered selection does not prevent interpretation', async () => {
  const seed = inputFor('a ride'); seed.query.revision = 2;
  const parsed = await createRideSearchParser(searchFake(seed.query.text), clock).parse(seed);
  let review = createLocationReview(parsed, clock.now(), seed.timeZone);
  review = editLocationReview(review, 'vehicleClass', { state: 'RESOLVED', value: 'sedan', strength: 'REQUIRED', excluded: [], refs: [] });
  review = applyTrustedLocation(review, 'pickup', { selectionId: 'saved', source: 'USER_SELECTED_SAVED_PLACE', lat: 28.4, lng: 77.4, displayText: 'saved', confirmedAt: clock.now().toISOString(), confirmedByUser: 'selection' });
  const input = inputFor('SUV from campus to airport');
  input.formDraft = emptyDraft(seed.query);
  input.formDraft.pickup = resolved({ kind: 'USER_SELECTION', selectionId: 'saved' }, user('pickup'));
  input.formDraft.vehicleClass = { state: 'RESOLVED', value: 'suv', strength: 'REQUIRED', excluded: [], refs: user('vehicleClass') };
  input.trustedLocationSelections = [{ selectionId: 'saved', displayText: 'saved' }];
  const luna = lunaFake(value => lunaOutput(value.query, { pickup: 'campus', drop: 'airport' }));
  const result = await createSearchInterpretationService(complex(input.query.text), placesFake(), luna, clock).parse(input, { activeField: null, formRevision: review.revision, review });
  assert.equal(luna.calls.length, 1);
  assert.equal(result.draft.pickup.value.selectionId, 'saved', JSON.stringify(result.issues));
  assert.equal(result.draft.vehicleClass.value, 'sedan');
  assert.equal(result.review.session.edits.length, review.session.edits.length);
});
