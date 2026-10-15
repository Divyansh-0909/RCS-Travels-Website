import test from 'node:test';
import assert from 'node:assert/strict';
import { applySelectedPlace, applyTrustedLocation, createLocationReview, editLocationReview, mergeLocationReview, preparePlaceSelection, reviewFollowups } from '../services/search/locations/review.ts';
import { createSearchGroundingService } from '../services/search/locations/service.ts';
import { emptyDraft } from '../services/search/contracts.ts';
import { inputFor } from './helpers/rideSearchFake.js';
import { searchFake, placesFake } from './helpers/rideSearchS3Fake.js';
import { createTestClock } from './helpers/testClock.js';

const clock = createTestClock('2026-10-02T10:00:00Z');
const parsed = draft => ({ draft, route: 'SIMPLE_INCOMPLETE', issues: [], fallbackRequired: false });
const formValue = value => ({ state: 'RESOLVED', value, refs: [] });
const known = (selectionId = 'saved') => ({ selectionId, displayText: 'Home', lat: 28, lng: 77, source: 'USER_SELECTED_SAVED_PLACE', confirmedByUser: 'selection', confirmedAt: clock.now().toISOString() });
const blank = () => { const draft = emptyDraft({ id: 'form', revision: 1, text: 'cab' }); draft.queryType = 'BOOKING_REQUEST'; draft.complexity = 'SIMPLE'; return draft; };

test('two endpoints can be selected without redundant search, with full history and quote invalidation', async () => {
  const text = 'SUV tomorrow from campus to Pari Chowk';
  const places = placesFake();
  const service = createSearchGroundingService(searchFake(text, { pickup: 'campus', drop: 'Pari Chowk', choices: { vehicle_class: 'suv', vehicle_strength: 'REQUIRED', timing_mode: 'SCHEDULED' } }), places, clock);
  const output = await service.parse(inputFor(text));
  let review = createLocationReview(output.parse, clock.now(), 'Asia/Kolkata', { fareQuote: 'q-old', route: 'r-old', locationConfirmation: 'c-old', reviewConfirmation: 'review-old' });
  for (const result of output.locations) {
    const current = preparePlaceSelection(review, result);
    const selected = await service.selectLocation(current, current.matches[0].placeId, review.revision);
    review = applySelectedPlace(review, selected);
  }
  assert.equal(places.calls.length, 4);
  assert.equal(review.revision, 2);
  assert.equal(review.selectionHistory.length, 2);
  assert.equal(review.selected.pickup.placeId, 'campus');
  assert.equal(review.selected.drop.placeId, 'Pari_Chowk');
  assert.equal(review.session.effectiveDraft.vehicleClass.value, 'suv');
  assert.equal(review.session.effectiveDraft.timing.date.value.anchor, 'TOMORROW');
  assert.equal(review.selectionHistory[0].query.text, text);
  assert.equal(review.selectionHistory[0].candidate.exactText, 'campus');
  assert.deepEqual(review.derived, { fareQuote: null, route: null, locationConfirmation: null, reviewConfirmation: null });
  const followup = reviewFollowups(review, output.issues, clock);
  assert.equal(followup.schedule.localDate, '2026-10-03');
  assert.equal(followup.followups[0].code, 'LOCATION_REVIEW_REQUIRED');
  assert.ok(followup.followups.some(value => value.code === 'TIME_REQUIRED'));
  assert.equal(followup.followups.some(value => value.code === 'FIELD_REQUIRED'), false);
  assert.equal(followup.followups.some(value => value.code === 'PLACE_SELECTION_REQUIRED'), false);
});

test('standalone target choice remains audited after selection without assigning an implicit destination', async () => {
  const service = createSearchGroundingService(searchFake('Pari Chowk', { type: 'LOCATION_SEARCH' }), placesFake(), clock);
  const output = await service.parse(inputFor('Pari Chowk'));
  const chosen = await service.chooseLocationTarget(output, 'pickup', 0);
  const review = createLocationReview(chosen.parse, clock.now(), 'Asia/Kolkata');
  const current = preparePlaceSelection(review, chosen.locations[0]);
  const selected = await service.selectLocation(current, 'Pari_Chowk', 0);
  const updated = applySelectedPlace(review, selected, chosen.targetRefs);
  assert.equal(updated.selected.pickup.placeId, 'Pari_Chowk');
  assert.equal(updated.selected.drop, undefined);
  assert.deepEqual(updated.selectionHistory[0].targetRefs, [{ kind: 'USER_FIELD', field: 'locationTarget', revision: 0 }]);
  assert.equal(updated.selectionHistory[0].target, 'pickup');
  assert.deepEqual(updated.selectionHistory[0].query, chosen.parse.draft.query);
  for (const refs of [[{ kind: 'USER_FIELD', field: 'drop', revision: 0 }], [{ kind: 'USER_FIELD', field: 'locationTarget', revision: 1 }],
    [{ kind: 'USER_FIELD', field: 'locationTarget', revision: -1 }], [{ kind: 'QUERY_SPAN', queryId: 'q', revision: 0, start: 0, end: 1 }]]) {
    assert.throws(() => applySelectedPlace(review, selected, refs));
  }
});

test('explicit destination/time follow-ups preserve SUV and original tomorrow provenance', async () => {
  const output = await createSearchGroundingService(searchFake('SUV tomorrow', { choices: { vehicle_class: 'suv', vehicle_strength: 'REQUIRED', timing_mode: 'SCHEDULED' } }), placesFake(), clock).parse(inputFor('SUV tomorrow'));
  const original = createLocationReview(output.parse, clock.now(), 'Asia/Kolkata');
  let updated = applyTrustedLocation(original, 'drop', known());
  updated = editLocationReview(updated, 'timing.time', formValue({ kind: 'CLOCK', hour: 6, minute: formValue(0), notation: 'H12', period: formValue('PM'), precision: 'EXACT' }));
  assert.deepEqual(updated.session.effectiveDraft.vehicleClass, original.session.effectiveDraft.vehicleClass);
  assert.deepEqual(updated.session.effectiveDraft.timing.date, original.session.effectiveDraft.timing.date);
  assert.equal(updated.session.effectiveDraft.drop.refs[0].kind, 'USER_FIELD');
  assert.equal(updated.session.effectiveDraft.timing.time.refs[0].field, 'timing.time');
  assert.equal(reviewFollowups(updated, [], clock).schedule.scheduledAt, '2026-10-03T12:30:00.000Z');
  assert.equal(updated.session.effectiveDraft.pickup.state, 'UNSPECIFIED');
  assert.equal(original.session.effectiveDraft.drop.state, 'UNSPECIFIED');
});

test('a standalone destination follow-up preserves the ongoing booking intent and its missing-field requirements', async () => {
  const initial = await createSearchGroundingService(searchFake('SUV tomorrow', { choices: { vehicle_class: 'suv', vehicle_strength: 'REQUIRED', timing_mode: 'SCHEDULED' } }), placesFake(), clock).parse({ ...inputFor('SUV tomorrow'), query: { id: 'booking-original', revision: 1, text: 'SUV tomorrow' } });
  const original = createLocationReview(initial.parse, clock.now(), 'Asia/Kolkata');
  const service = createSearchGroundingService(searchFake('Pari Chowk', { type: 'LOCATION_SEARCH' }), placesFake(), clock);
  const output = await service.parse({ ...inputFor('Pari Chowk'), query: { id: 'destination-followup', revision: 1, text: 'Pari Chowk' } }, { activeField: 'drop', formRevision: original.revision });
  const merged = mergeLocationReview(original, output.parse, clock.now(), 'Asia/Kolkata');
  assert.equal(merged.session.effectiveDraft.queryType, 'BOOKING_REQUEST', 'booking context survives before any place selection');
  assert.equal(merged.session.effectiveDraft.complexity, 'SIMPLE');
  const current = preparePlaceSelection(merged, output.locations[0]);
  const updated = applySelectedPlace(merged, await service.selectLocation(current, 'Pari_Chowk', merged.revision));
  assert.equal(updated.session.effectiveDraft.queryType, 'BOOKING_REQUEST');
  assert.equal(updated.session.effectiveDraft.vehicleClass.value, 'suv');
  assert.deepEqual(updated.session.effectiveDraft.timing.date, original.session.effectiveDraft.timing.date);
  assert.ok(reviewFollowups(updated, [], clock).followups.some(value => value.code === 'FIELD_REQUIRED' && value.field === 'pickup'));
  assert.ok(reviewFollowups(updated, [], clock).followups.some(value => value.code === 'TIME_REQUIRED'));
  assert.equal(updated.session.snapshots.at(-1).draft.queryType, 'LOCATION_SEARCH', 'raw classifier history stays unchanged');
});

test('a booking follow-up to a standalone query adopts booking classification without rewriting the earlier query', async () => {
  const initial = await createSearchGroundingService(searchFake('Pari Chowk', { type: 'LOCATION_SEARCH' }), placesFake(), clock).parse(inputFor('Pari Chowk'));
  const review = createLocationReview(initial.parse, clock.now(), 'Asia/Kolkata');
  const next = await createSearchGroundingService(searchFake('SUV tomorrow', { choices: { vehicle_class: 'suv', vehicle_strength: 'REQUIRED', timing_mode: 'SCHEDULED' } }), placesFake(), clock).parse({ ...inputFor('SUV tomorrow'), query: { id: 'booking-followup', revision: 1, text: 'SUV tomorrow' } });
  const merged = mergeLocationReview(review, next.parse, clock.now(), 'Asia/Kolkata');
  assert.equal(merged.session.effectiveDraft.queryType, 'BOOKING_REQUEST');
  assert.equal(merged.session.effectiveDraft.complexity, 'SIMPLE');
  assert.equal(merged.session.snapshots[0].draft.queryType, 'LOCATION_SEARCH');
  assert.equal(merged.session.effectiveDraft.vehicleClass.value, 'suv');
  assert.ok(reviewFollowups(merged, undefined, clock).followups.some(value => value.code === 'TIME_REQUIRED'));
});

test('reparse drops obsolete parse diagnostics and final location review appears only for two unconfirmed endpoints', () => {
  const output = { ...parsed(blank()), issues: [{ code: 'FIELD_REQUIRED', field: 'drop', category: 'MISSING', refs: [] }] };
  let review = createLocationReview(output, clock.now(), 'Asia/Kolkata');
  const merged = mergeLocationReview(review, parsed({ ...blank(), query: { id: 'next', revision: 1, text: 'cab' } }), clock.now(), 'Asia/Kolkata');
  assert.deepEqual(merged.parseIssues, []);
  assert.equal(reviewFollowups(review, undefined, clock).followups.some(value => value.code === 'LOCATION_REVIEW_REQUIRED'), false);
  review = applyTrustedLocation(review, 'pickup', known('pickup'));
  assert.equal(reviewFollowups(review, undefined, clock).followups.some(value => value.code === 'LOCATION_REVIEW_REQUIRED'), false);
  review = applyTrustedLocation(review, 'drop', { ...known('drop'), lat: 29 });
  assert.deepEqual(reviewFollowups(review, undefined, clock).followups.find(value => value.code === 'LOCATION_REVIEW_REQUIRED'), { code: 'LOCATION_REVIEW_REQUIRED', field: 'locations', category: 'grounding', priority: 1 });
  const confirmed = { ...review, derived: { ...review.derived, locationConfirmation: 'confirmed' } };
  assert.equal(reviewFollowups(confirmed, undefined, clock).followups.some(value => value.code === 'LOCATION_REVIEW_REQUIRED'), false);
});

test('trusted map/current/saved choices and corrections bypass Google and remain locked across reparse', () => {
  let review = createLocationReview(parsed(blank()), clock.now(), 'Asia/Kolkata');
  for (const source of ['USER_SELECTED_CURRENT_LOCATION', 'USER_CONFIRMED_MAP_PIN', 'USER_SELECTED_SAVED_PLACE']) {
    review = applyTrustedLocation(review, 'pickup', { ...known(source), source });
  }
  const originalHistory = review.selectionHistory.slice();
  review = applyTrustedLocation(review, 'pickup', known('new-home'));
  assert.equal(review.selected.pickup.selectionId, 'new-home');
  assert.deepEqual(review.selectionHistory.slice(0, 3), originalHistory);
  review = applyTrustedLocation(review, 'drop', known('new-home'));
  assert.equal(reviewFollowups(review, [], clock).followups[0].code, 'SAME_GROUNDED_ENDPOINTS');
  assert.throws(() => applyTrustedLocation(review, 'pickup', { ...known('new-home'), lat: 30 }), /CONFLICTING/);
  const next = blank(); next.query.revision = 2;
  const merged = mergeLocationReview(review, parsed(next), clock.now(), 'Asia/Kolkata');
  assert.equal(merged.selected.pickup.selectionId, 'new-home');
  assert.equal(merged.session.effectiveDraft.pickup.value.selectionId, 'new-home');
  const removed = editLocationReview(merged, 'pickup', { state: 'UNSPECIFIED' });
  assert.equal(removed.selected.pickup, undefined);
});

test('standalone suggestions cannot overwrite a target correction or clearing, but a fresh explicit search can', async () => {
  const service = createSearchGroundingService(searchFake('Pari Chowk', { type: 'LOCATION_SEARCH' }), placesFake(), clock);
  const output = await service.parse(inputFor('Pari Chowk'), { activeField: 'drop', formRevision: 0 });
  const review = createLocationReview(output.parse, clock.now(), 'Asia/Kolkata');
  const corrected = applyTrustedLocation(review, 'drop', known());
  assert.throws(() => preparePlaceSelection(corrected, output.locations[0]), /STALE_GROUNDING_RESULT/);
  const cleared = editLocationReview(corrected, 'drop', { state: 'UNSPECIFIED' });
  assert.throws(() => preparePlaceSelection(cleared, output.locations[0]), /STALE_GROUNDING_RESULT/);
  assert.equal(corrected.session.effectiveDraft.queryType, 'BOOKING_REQUEST');
  assert.equal(corrected.session.snapshots[0].draft.queryType, 'LOCATION_SEARCH');
  const freshService = createSearchGroundingService(searchFake('Pari Chowk', { type: 'LOCATION_SEARCH' }), placesFake(), clock);
  const fresh = await freshService.parse({ ...inputFor('Pari Chowk'), query: { id: 'fresh', revision: 1, text: 'Pari Chowk' } }, { activeField: 'drop', formRevision: cleared.revision });
  const merged = mergeLocationReview(cleared, fresh.parse, clock.now(), 'Asia/Kolkata');
  const current = preparePlaceSelection(merged, fresh.locations[0]);
  const selected = await freshService.selectLocation(current, 'Pari_Chowk', merged.revision);
  assert.equal(applySelectedPlace(merged, selected).selected.drop.placeId, 'Pari_Chowk');
});

test('stale Details cannot overwrite a correction or a new query revision', async () => {
  const service = createSearchGroundingService(searchFake('campus to airport', { pickup: 'campus', drop: 'airport' }), placesFake(), clock);
  const output = await service.parse(inputFor('campus to airport'));
  const review = createLocationReview(output.parse, clock.now(), 'Asia/Kolkata');
  const found = output.locations[0];
  const selected = await service.selectLocation(found, found.matches[0].placeId, 0);
  const corrected = applyTrustedLocation(review, 'pickup', known());
  assert.throws(() => applySelectedPlace(corrected, selected), /STALE/);
  assert.throws(() => preparePlaceSelection(corrected, found), /STALE/);
  assert.throws(() => preparePlaceSelection(review, { ...found, formRevision: 1 }), /STALE/);
  assert.throws(() => preparePlaceSelection(review, { ...found, candidate: { ...found.candidate, candidateId: 'other' } }), /STALE/);
  const next = blank(); next.query = { ...review.session.effectiveDraft.query, revision: 4 };
  const merged = mergeLocationReview(review, parsed(next), clock.now(), 'Asia/Kolkata');
  assert.throws(() => preparePlaceSelection(merged, found), /STALE/);
  assert.equal(merged.selected.pickup, undefined);
  assert.throws(() => applySelectedPlace(review, { ...selected, query: { ...selected.query, id: 'different' }, candidate: { ...selected.candidate, queryId: 'different' } }), /STALE_QUERY/);
});

test('endpoint rerouting clears grounded selection and stale derived state; unrelated edits preserve route when safe', () => {
  const review = createLocationReview(parsed(blank()), clock.now(), 'Asia/Kolkata', { fareQuote: 'q', route: 'r', locationConfirmation: 'c', reviewConfirmation: 'review' });
  const changed = editLocationReview(review, 'vehicleClass', { state: 'RESOLVED', value: 'suv', strength: 'PREFERRED', excluded: [], refs: [] });
  assert.equal(changed.derived.fareQuote, null);
  assert.equal(changed.derived.route, 'r');
  assert.equal(changed.derived.locationConfirmation, 'c');
  const unchanged = mergeLocationReview(review, parsed({ ...blank(), query: { id: 'other', revision: 1, text: 'cab' } }), clock.now(), 'Asia/Kolkata');
  assert.equal(unchanged.derived.fareQuote, null);
  const selected = applyTrustedLocation(review, 'pickup', known());
  const next = blank(); next.query.revision = 2;
  // A parser cannot replace the explicit correction; a new explicit control can.
  const parsedAgain = mergeLocationReview(selected, parsed(next), clock.now(), 'Asia/Kolkata');
  assert.equal(parsedAgain.selected.pickup.selectionId, 'saved');
  assert.equal(parsedAgain.derived.locationConfirmation, null);
});

test('unmodified endpoint confirmation survives a new query that leaves those fields alone', () => {
  const original = blank();
  const review = createLocationReview(parsed(original), clock.now(), 'Asia/Kolkata', { fareQuote: 'q', route: 'r', locationConfirmation: 'c', reviewConfirmation: 'review' });
  const unmodified = mergeLocationReview(review, parsed({ ...original, query: { id: 'other', revision: 1, text: 'cab' } }), clock.now(), 'Asia/Kolkata');
  assert.equal(unmodified.derived.locationConfirmation, 'c');
});

test('unbound policy requirements remain visible and a policy with any current source remains applicable', () => {
  const draft = blank();
  const unbound = { code: 'VEHICLE_POLICY_UNRESOLVED', field: 'vehicleClass', category: 'POLICY', refs: [] };
  const review = createLocationReview({ ...parsed(draft), issues: [unbound] }, clock.now(), 'Asia/Kolkata');
  assert.ok(reviewFollowups(review, [], clock).followups.some(value => value.code === unbound.code));

  const next = blank(); next.query.text = 'SUV only except sedan';
  const currentRef = { kind: 'QUERY_SPAN', queryId: next.query.id, revision: next.query.revision, start: 0, end: 3 };
  const otherRef = { ...currentRef, start: 16, end: 21 };
  next.vehicleClass = { state: 'RESOLVED', value: 'suv', strength: 'REQUIRED', excluded: [], refs: [currentRef] };
  const linked = { code: 'SUV_FAMILY_POLICY_UNRESOLVED', field: 'vehicleClass', category: 'POLICY', refs: [currentRef, otherRef] };
  const linkedReview = createLocationReview({ ...parsed(next), issues: [linked] }, clock.now(), 'Asia/Kolkata');
  assert.ok(reviewFollowups(linkedReview, [], clock).followups.some(value => value.code === linked.code));
  next.vehicleClass.refs.push(otherRef);
  const oneSource = { ...linked, refs: [currentRef] };
  const multipleSources = createLocationReview({ ...parsed(next), issues: [oneSource] }, clock.now(), 'Asia/Kolkata');
  assert.ok(reviewFollowups(multipleSources, [], clock).followups.some(value => value.code === linked.code));
});

test('explicit vehicle correction clears obsolete interpretation conflict without erasing unsupported clauses', () => {
  const draft = blank(); draft.query.text = 'SUV or sedan with AC';
  const ref = { kind: 'QUERY_SPAN', queryId: draft.query.id, revision: draft.query.revision, start: 0, end: 12 };
  draft.vehicleClass = { state: 'AMBIGUOUS', alternatives: ['suv', 'sedan'], reasonCode: 'VEHICLE_CONFLICT', refs: [ref] };
  draft.unsupportedRequests = [{ kind: 'AC_PREFERENCE', candidateIds: [], reasonCode: 'UNSUPPORTED', refs: [ref] }];
  const conflict = { code: 'VEHICLE_CONFLICT', field: 'vehicleClass', category: 'AMBIGUOUS', refs: [ref] };
  const review = createLocationReview({ ...parsed(draft), issues: [conflict] }, clock.now(), 'Asia/Kolkata');
  assert.ok(reviewFollowups(review, [], clock).followups.some(value => value.code === 'VEHICLE_CONFLICT'));
  const updated = editLocationReview(review, 'vehicleClass', { state: 'RESOLVED', value: 'sedan', strength: 'REQUIRED', excluded: [], refs: [] });
  const followups = reviewFollowups(updated, [], clock).followups;
  assert.equal(followups.some(value => value.code === 'VEHICLE_CONFLICT' || value.field === 'vehicleClass' && value.code === 'FIELD_AMBIGUOUS'), false);
  assert.ok(followups.some(value => value.code === 'UNSUPPORTED_REQUEST' && value.field === 'AC_PREFERENCE'));
  assert.deepEqual(updated.session.snapshots[0].draft.vehicleClass, draft.vehicleClass);
});

test('later revisions of the same standalone query select their own snapshot and candidate', async () => {
  const text = 'Pari Chowk';
  const run = revision => createSearchGroundingService(searchFake(text, { type: 'LOCATION_SEARCH' }), placesFake(), clock).parse({ ...inputFor(text), query: { id: 'same-query', revision, text } }, { activeField: 'drop', formRevision: 0 });
  const first = await run(1);
  const original = createLocationReview(first.parse, clock.now(), 'Asia/Kolkata');
  const service = createSearchGroundingService(searchFake(text, { type: 'LOCATION_SEARCH' }), placesFake(), clock);
  const second = await service.parse({ ...inputFor(text), query: { id: 'same-query', revision: 2, text } }, { activeField: 'drop', formRevision: original.revision });
  const merged = mergeLocationReview(original, second.parse, clock.now(), 'Asia/Kolkata');
  const current = preparePlaceSelection(merged, second.locations[0]);
  const selected = await service.selectLocation(current, 'Pari_Chowk', merged.revision);
  const updated = applySelectedPlace(merged, selected);
  assert.equal(updated.selectionHistory[0].query.revision, 2);
  assert.equal(updated.session.snapshots[0].query.revision, 1);
});

test('resolved pickup and corrected time remove obsolete missing and temporal diagnostics', async () => {
  const stale = { code: 'FIELD_REQUIRED', field: 'pickup', category: 'MISSING', refs: [] };
  const review = applyTrustedLocation(createLocationReview({ ...parsed(blank()), issues: [stale] }, clock.now(), 'Asia/Kolkata'), 'pickup', known());
  assert.equal(reviewFollowups(review, [], clock).followups.some(value => value.code === 'FIELD_REQUIRED' && value.field === 'pickup'), false);

  const text = 'tomorrow at 6';
  const output = await createSearchGroundingService(searchFake(text, { choices: { timing_mode: 'SCHEDULED' } }), placesFake(), clock).parse(inputFor(text));
  const temporal = createLocationReview(output.parse, clock.now(), 'Asia/Kolkata');
  assert.equal(reviewFollowups(temporal, [], clock).followups.some(value => value.code === 'TIME_PERIOD_REQUIRED'), false);
  assert.equal(reviewFollowups(temporal, [], clock).schedule.localTime, '18:00');
  const corrected = editLocationReview(temporal, 'timing.time', formValue({ kind: 'CLOCK', hour: 6, minute: formValue(0), notation: 'H12', period: formValue('PM'), precision: 'EXACT' }));
  assert.equal(reviewFollowups(corrected, [], clock).followups.some(value => value.code === 'TIME_PERIOD_REQUIRED'), false);
  assert.deepEqual(corrected.session.effectiveDraft.timing.date, temporal.session.effectiveDraft.timing.date);
});

test('clearing standalone text fails stale suggestion rebasing with the safe error even without an endpoint edit', async () => {
  const text = 'Pari Chowk';
  const output = await createSearchGroundingService(searchFake(text, { type: 'LOCATION_SEARCH' }), placesFake(), clock).parse(inputFor(text), { activeField: 'drop', formRevision: 0 });
  const original = createLocationReview(output.parse, clock.now(), 'Asia/Kolkata');
  const cleared = editLocationReview(original, 'locationSearch', { state: 'UNSPECIFIED' });
  assert.equal(cleared.endpointEdits.drop, undefined);
  assert.throws(() => preparePlaceSelection(cleared, output.locations[0]), error => error.message === 'STALE_GROUNDING_RESULT');
  const selected = await createSearchGroundingService(searchFake(text), placesFake(), clock).selectLocation(output.locations[0], 'Pari_Chowk', 0);
  assert.throws(() => applySelectedPlace(original, selected, [{ kind: 'USER_FIELD', field: 'pickup', revision: 0 }]), error => error.message === 'INVALID_TARGET_PROVENANCE');
});

test('unsupported field preferences remain visible after correcting a different aspect of that field', () => {
  const draft = blank(); draft.query.text = 'SUV with AC';
  const refs = [{ kind: 'QUERY_SPAN', queryId: draft.query.id, revision: draft.query.revision, start: 0, end: draft.query.text.length }];
  draft.vehicleClass = { state: 'RESOLVED', value: 'suv', strength: 'REQUIRED', excluded: [], refs };
  const unsupported = { code: 'UNSUPPORTED_REQUEST', field: 'vehicleClass', category: 'UNSUPPORTED', refs };
  const original = createLocationReview({ ...parsed(draft), issues: [unsupported] }, clock.now(), 'Asia/Kolkata');
  const updated = editLocationReview(original, 'vehicleClass', { state: 'RESOLVED', value: 'sedan', strength: 'REQUIRED', excluded: [], refs: [] });
  assert.ok(reviewFollowups(updated, [], clock).followups.some(value => value.code === 'UNSUPPORTED_REQUEST' && value.field === 'vehicleClass'));
});
