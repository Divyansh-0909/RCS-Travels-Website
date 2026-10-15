import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDraft } from '../services/search/contracts.ts';
import { createDraftSession, editDraftField, mergeParsedRevision, validateDraftSession, registerTrustedLocationSelection } from '../services/search/locations/session.ts';
import { createLocationReview, editLocationReview, mergeLocationReview, applyTrustedLocation, reviewFollowups, preparePlaceSelection } from '../services/search/locations/review.ts';
import { followups } from '../services/search/locations/followup.ts';
import { resolveSessionTemporal } from '../services/search/locations/sessionTemporal.ts';
import { sourceRefs, mapSourceRefs } from '../services/search/locations/sessionRefs.ts';
import { createTestClock } from './helpers/testClock.js';

const clock = createTestClock('2026-10-02T10:00:00Z');
const ref = q => ({ kind: 'QUERY_SPAN', queryId: q.id, revision: q.revision, start: 0, end: q.text.length });
const resolved = (value, refs = []) => ({ state: 'RESOLVED', value, refs });
const unspecified = () => ({ state: 'UNSPECIFIED' });
const parsed = draft => ({ draft, route: 'SIMPLE_INCOMPLETE', issues: [], fallbackRequired: false });
const blank = (id = 'q', revision = 1) => { const d = emptyDraft({ id, revision, text: 'cab tomorrow' }); d.queryType = 'BOOKING_REQUEST'; d.complexity = 'SIMPLE'; return d; };
const relative = (anchor, refs) => resolved({ kind: 'RELATIVE', anchor }, refs);
const time = (hour, refs = []) => resolved({ kind: 'CLOCK', hour, minute: resolved(0, refs), notation: 'H24', period: unspecified(), precision: 'EXACT' }, refs);
const saved = (selectionId = 'home') => ({ selectionId, lat: 28, lng: 77, displayText: 'Home', confirmedAt: clock.now().toISOString(), source: 'USER_SELECTED_SAVED_PLACE', confirmedByUser: 'selection' });

test('immutable history recursively protects nested snapshots, source arrays, edits and registered locations', () => {
  const d = blank(); d.sharing = resolved(true, [ref(d.query)]);
  let session = createDraftSession(parsed(d), clock.now(), 'Asia/Kolkata');
  session = editDraftField(session, 'sharing', resolved(false));
  session = registerTrustedLocationSelection(session, saved());
  for (const value of [session, session.snapshots, session.snapshots[0], session.snapshots[0].query,
    session.snapshots[0].draft, session.snapshots[0].draft.sharing, session.snapshots[0].draft.sharing.refs,
    session.snapshots[0].draft.sharing.refs[0], session.edits, session.edits[0], session.edits[0].value,
    session.trustedSelectionRegistry, session.trustedSelectionRegistry[0], session.effectiveDraft, session.invalidations]) {
    assert.equal(Object.isFrozen(value), true);
    assert.throws(() => { value.mutated = true; }, TypeError);
  }
  assert.throws(() => { session.snapshots[0].draft.sharing.refs[0].revision = 99; }, TypeError);
  assert.equal(d.sharing.refs[0].revision, 1, 'caller-owned input remains independent');
});

test('source traversal preserves all nested provenance without treating ordinary arrays as source arrays', () => {
  const query = blank().query; const a = ref(query); const b = { kind: 'USER_FIELD', field: 'timing.time', revision: 2 };
  const data = { literal: 'ref', nested: [{ refs: [a], unused: null }, { sub: { refs: [b] } }], other: [1, 2] };
  assert.deepEqual(sourceRefs(data), [a, b]);
  const mapped = mapSourceRefs(data, () => [b]);
  assert.deepEqual(sourceRefs(mapped), [b, b]);
  assert.deepEqual(sourceRefs(data), [a, b]);
  assert.deepEqual(sourceRefs({ refs: [], other: ['ref'] }), []);
});

test('every supported scalar carries omitted parsed values and later explicit false replaces true', () => {
  for (const field of ['sharing', 'isOutstation', 'preferSafeRoute', 'needsCarrier']) {
    const a = blank(); a[field] = resolved(true, [ref(a.query)]);
    const b = blank('q', 2); const c = blank('q', 3); c[field] = resolved(false, [ref(c.query)]);
    const first = createDraftSession(parsed(a), clock.now(), 'Asia/Kolkata');
    const carried = mergeParsedRevision(first, parsed(b), clock.now(), 'Asia/Kolkata');
    assert.deepEqual(carried.effectiveDraft[field], a[field]);
    const changed = mergeParsedRevision(carried, parsed(c), clock.now(), 'Asia/Kolkata');
    assert.deepEqual(changed.effectiveDraft[field], c[field]);
  }
  const a = blank(); a.passengers = resolved(3, [ref(a.query)]);
  assert.deepEqual(mergeParsedRevision(createDraftSession(parsed(a), clock.now(), 'Asia/Kolkata'), parsed(blank('q', 2)), clock.now(), 'Asia/Kolkata').effectiveDraft.passengers, a.passengers);
});

test('scheduled components overlay independently and immediate replacement clears old scheduled components', () => {
  const a = blank(); const refs = [ref(a.query)]; a.timing = { mode: 'SCHEDULED', refs, date: relative('TOMORROW', refs), time: time(18, refs) };
  const original = createDraftSession(parsed(a), clock.now(), 'Asia/Kolkata');
  const b = blank('q', 2); b.timing = { mode: 'SCHEDULED', refs: [ref(b.query)], date: unspecified(), time: time(19, [ref(b.query)]) };
  const merged = mergeParsedRevision(original, parsed(b), clock.now(), 'Asia/Kolkata');
  assert.deepEqual(merged.effectiveDraft.timing.date, a.timing.date);
  assert.deepEqual(merged.effectiveDraft.timing.time, b.timing.time);
  const c = blank('q', 3); c.timing = { mode: 'SCHEDULED', refs: [ref(c.query)], date: relative('TODAY', [ref(c.query)]), time: unspecified() };
  const newer = mergeParsedRevision(merged, parsed(c), clock.now(), 'Asia/Kolkata');
  assert.deepEqual(newer.effectiveDraft.timing.date, c.timing.date);
  assert.deepEqual(newer.effectiveDraft.timing.time, b.timing.time);
  const immediate = blank('q', 4); immediate.timing = { mode: 'IMMEDIATE', refs: [ref(immediate.query)], date: unspecified(), time: unspecified() };
  assert.deepEqual(mergeParsedRevision(newer, parsed(immediate), clock.now(), 'Asia/Kolkata').effectiveDraft.timing, immediate.timing);
  const ambiguous = blank('q', 5); ambiguous.timing.mode = 'AMBIGUOUS'; ambiguous.timing.refs = [ref(ambiguous.query)];
  assert.equal(mergeParsedRevision(original, parsed(ambiguous), clock.now(), 'Asia/Kolkata').effectiveDraft.timing.mode, 'AMBIGUOUS');
});

test('unsupported clauses remain a union across versions and identical historical requests deduplicate', () => {
  const a = blank(); a.unsupportedRequests = [{ kind: 'STOP', candidateIds: [], reasonCode: 'UNSUPPORTED', refs: [ref(a.query)] }];
  const b = blank('q', 2); b.unsupportedRequests = [{ kind: 'RENTAL', candidateIds: [], reasonCode: 'UNSUPPORTED', refs: [ref(b.query)] }];
  const session = mergeParsedRevision(createDraftSession(parsed(a), clock.now(), 'Asia/Kolkata'), parsed(b), clock.now(), 'Asia/Kolkata');
  assert.deepEqual(session.effectiveDraft.unsupportedRequests, [...a.unsupportedRequests, ...b.unsupportedRequests]);
  assert.deepEqual(followups(session.effectiveDraft).filter(v => v.code === 'UNSUPPORTED_REQUEST').map(v => v.field), ['RENTAL', 'STOP']);
});

test('no query or explicit edit may bypass history validation; error categories stay distinguishable', () => {
  const d = blank(); const base = createDraftSession(parsed(d), clock.now(), 'Asia/Kolkata');
  assert.throws(() => mergeParsedRevision(base, parsed(blank()), clock.now(), 'Asia/Kolkata'), e => e.code === 'STALE_QUERY');
  assert.throws(() => createDraftSession(parsed(d), new Date('bad'), 'Asia/Kolkata'), e => e.code === 'INVALID_PARSE_RESULT');
  assert.throws(() => createDraftSession(parsed(d), clock.now(), ''), e => e.code === 'INVALID_PARSE_RESULT');
  assert.throws(() => editDraftField(base, 'bad', unspecified()), e => ['INVALID_EDIT', 'CORRUPT_PROVENANCE'].includes(e.code));
  assert.throws(() => editDraftField(base, 'vehicleClass', resolved('invalid')), e => e.code === 'INVALID_EDIT');
  assert.throws(() => editDraftField(base, 'pickup', { kind: 'USER_SELECTION', selectionId: 'missing' }), e => e.code === 'CORRUPT_PROVENANCE');
  const corrupt = structuredClone(base); corrupt.effectiveDraft.query.revision = 10;
  for (const invoke of [s => resolveSessionTemporal(s, clock), s => mergeParsedRevision(s, parsed(blank('q', 2)), clock.now(), 'Asia/Kolkata'),
    s => editDraftField(s, 'sharing', resolved(true)), s => registerTrustedLocationSelection(s, saved())]) {
    assert.throws(() => invoke(corrupt), e => e.code === 'CORRUPT_PROVENANCE');
  }
  assert.throws(() => validateDraftSession({ ...base, schemaVersion: 'invalid' }), e => e.code === 'CORRUPT_PROVENANCE');
});

test('relative follow-up anchoring preserves distinct query IDs/revisions and original timezone without relaxing current scheduling bounds', () => {
  const before = createTestClock('2026-10-02T23:59:00+05:30');
  const d = blank('first', 1); const refs = [ref(d.query)];
  d.timing = { mode: 'SCHEDULED', refs, date: relative('TOMORROW', refs), time: time(18, refs) };
  let session = createDraftSession(parsed(d), before.now(), 'Asia/Kolkata');
  session = mergeParsedRevision(session, parsed(blank('second', 1)), createTestClock('2026-10-03T12:00:00+05:30').now(), 'Asia/Kolkata');
  const tooLate = resolveSessionTemporal(session, createTestClock('2026-10-03T17:40:00+05:30'));
  assert.equal(tooLate.localDate, '2026-10-03');
  assert.equal(tooLate.scheduledAt, undefined);
  assert.deepEqual(tooLate.issues.map(v => v.code), ['SCHEDULE_TOO_SOON']);
  const noTime = editDraftField(session, 'timing.time', unspecified());
  assert.equal(resolveSessionTemporal(noTime, before).localDate, '2026-10-03');
  assert.equal(resolveSessionTemporal(noTime, before).localTime, undefined);
  const nonIst = createDraftSession(parsed(d), before.now(), 'America/New_York');
  assert.equal(resolveSessionTemporal(nonIst, before).sourceTimeZone, 'America/New_York');
  assert.equal(resolveSessionTemporal(nonIst, before).localTime, '03:30');
});

test('policy issues tied to carried interpretation survive reparse and explicit corrections can clear their provenance', () => {
  const d = blank(); const refs = [ref(d.query)]; d.vehicleClass = { state: 'EXCLUDED', excluded: ['suv'], refs };
  const first = parsed(d); first.issues = [{ code: 'PRODUCT_POLICY_UNRESOLVED', field: 'vehicleClass', category: 'POLICY', refs }];
  const review = createLocationReview(first, clock.now(), 'Asia/Kolkata');
  const next = mergeLocationReview(review, parsed(blank('q', 2)), clock.now(), 'Asia/Kolkata');
  assert.ok(reviewFollowups(next, [], clock).followups.some(v => v.code === 'PRODUCT_POLICY_UNRESOLVED'));
  const corrected = editLocationReview(review, 'vehicleClass', { state: 'RESOLVED', value: 'sedan', strength: 'REQUIRED', excluded: [], refs: [] });
  assert.equal(reviewFollowups(corrected, [], clock).followups.some(v => v.code === 'PRODUCT_POLICY_UNRESOLVED'), false);
  const latest = mergeLocationReview(corrected, parsed(blank('q', 2)), clock.now(), 'Asia/Kolkata');
  assert.equal(reviewFollowups(latest, [], clock).followups.some(v => v.code === 'PRODUCT_POLICY_UNRESOLVED'), false);
});

test('unbound policy warnings remain visible rather than being silently discarded', () => {
  const d = blank(); const refs = [ref(d.query)]; const output = parsed(d);
  output.issues = ['capability', 'queryType'].map(field => ({ code: 'PRODUCT_POLICY_UNRESOLVED', field, category: 'POLICY', refs }));
  output.issues.push({ code: 'GLOBAL_POLICY_UNRESOLVED', field: 'provider', category: 'POLICY', refs: [] });
  const review = createLocationReview(output, clock.now(), 'Asia/Kolkata');
  assert.deepEqual(reviewFollowups(review, [], clock).followups.filter(v => v.code.includes('POLICY')).map(v => v.field), ['capability', 'provider', 'queryType']);
});

test('followup ambiguity is field-specific; a temporal name alone cannot make a provider failure a time ambiguity', () => {
  const d = blank(); const refs = [ref(d.query)];
  d.timing.mode = 'AMBIGUOUS'; d.timing.refs = refs;
  for (const field of ['sharing', 'isOutstation', 'preferSafeRoute', 'needsCarrier']) d[field] = { state: 'AMBIGUOUS', alternatives: [true, false], reasonCode: 'CONFLICT', refs };
  const issues = [{ code: 'TIME_PROVIDER', field: 'timing.date', category: 'DEPENDENCY', refs }, { code: 'DATE_ISSUE', field: 'timing.date', category: 'AMBIGUOUS', refs }];
  const values = followups(d, issues);
  assert.equal(values.find(v => v.code === 'TIME_PROVIDER').category, 'review');
  assert.equal(values.find(v => v.code === 'DATE_ISSUE').category, 'temporalambiguity');
  assert.deepEqual(values.filter(v => v.code === 'FIELD_AMBIGUOUS').map(v => v.field), ['isOutstation', 'needsCarrier', 'preferSafeRoute', 'sharing']);
  assert.ok(values.some(v => v.field === 'timing' && v.code === 'TIMING_AMBIGUOUS'));
});

test('review consumes invalidations and retains earlier confirmations only across unrelated safe edits', () => {
  let review = createLocationReview(parsed(blank()), clock.now(), 'Asia/Kolkata');
  assert.deepEqual(review.derived, { fareQuote: null, route: null, locationConfirmation: null, reviewConfirmation: null });
  review = applyTrustedLocation(review, 'pickup', saved());
  assert.deepEqual(review.session.invalidations, { fare: false, route: false, locationConfirmation: false });
  review = { ...review, derived: { fareQuote: 'q', route: 'r', locationConfirmation: 'c', reviewConfirmation: 'v' } };
  const next = editLocationReview(review, 'sharing', resolved(false));
  assert.deepEqual(next.derived, { fareQuote: null, route: 'r', locationConfirmation: 'c', reviewConfirmation: null });
  assert.deepEqual(next.selected.pickup, saved());
  assert.deepEqual(next.selectionHistory[0].targetRefs, []);
  assert.equal(next.selectionHistory[0].formRevision, 1);
});

test('followups preserve every ambiguous field name, exact diagnostic, category and priority', () => {
  const d = blank(); const refs = [ref(d.query)];
  const ambiguous = alternatives => ({ state: 'AMBIGUOUS', alternatives, reasonCode: 'CONFLICTING_VALUES', refs });
  for (const field of ['locationSearch', 'pickup', 'drop']) d[field] = ambiguous([{ kind: 'QUERY_CANDIDATE', candidateId: 'a' }, { kind: 'QUERY_CANDIDATE', candidateId: 'b' }]);
  d.vehicleClass = { ...ambiguous(['suv', 'sedan']), excluded: [] };
  d.passengers = ambiguous([2, 3]);
  for (const field of ['sharing', 'isOutstation', 'preferSafeRoute', 'needsCarrier']) d[field] = ambiguous([true, false]);
  d.timing = { mode: 'AMBIGUOUS', refs, date: ambiguous([{ kind: 'RELATIVE', anchor: 'TODAY' }, { kind: 'RELATIVE', anchor: 'TOMORROW' }]), time: ambiguous([{ kind: 'DAYPART', value: 'MORNING' }, { kind: 'DAYPART', value: 'EVENING' }]) };
  d.unsupportedRequests = [{ kind: 'RENTAL', candidateIds: [], reasonCode: 'UNSUPPORTED', refs }];
  const issues = [{ code: 'PRODUCT_POLICY_UNRESOLVED', field: 'vehicleClass', category: 'POLICY', refs }, { code: 'ROLE_CONFLICT', field: 'pickup', category: 'AMBIGUOUS', refs }];
  const values = followups(d, issues);
  const fields = values.filter(value => value.code === 'FIELD_AMBIGUOUS').map(value => value.field).sort();
  assert.deepEqual(fields, ['locationSearch', 'pickup', 'drop', 'vehicleClass', 'passengers', 'sharing', 'isOutstation', 'preferSafeRoute', 'needsCarrier', 'timing.date', 'timing.time'].sort());
  for (const value of values.filter(value => value.code === 'FIELD_AMBIGUOUS')) {
    const category = value.field === 'locationSearch' ? 'grounding' : value.field.startsWith('timing') ? 'temporalambiguity' : 'review';
    assert.equal(value.category, category);
    assert.equal(value.priority, category === 'grounding' ? 1 : category === 'temporalambiguity' ? 3 : 5);
  }
  assert.deepEqual(values.find(value => value.code === 'ROLE_CONFLICT'), { code: 'ROLE_CONFLICT', field: 'pickup', category: 'conflict', priority: 0 });
  assert.deepEqual(values.find(value => value.code === 'TIMING_AMBIGUOUS'), { code: 'TIMING_AMBIGUOUS', field: 'timing', category: 'temporalambiguity', priority: 3 });
  assert.deepEqual(values.find(value => value.code === 'UNSUPPORTED_REQUEST' && value.field === 'RENTAL'), { code: 'UNSUPPORTED_REQUEST', field: 'RENTAL', category: 'unsupported/policy', priority: 4 });
  assert.deepEqual(values.find(value => value.code === 'PRODUCT_POLICY_UNRESOLVED'), { code: 'PRODUCT_POLICY_UNRESOLVED', field: 'vehicleClass', category: 'unsupported/policy', priority: 4 });
});

test('date anchors select the exact historical query and user edit, never merely a matching revision number', () => {
  const first = blank('first', 1); const a = [ref(first.query)];
  first.timing = { mode: 'SCHEDULED', refs: a, date: relative('TOMORROW', a), time: time(18, a) };
  const second = blank('second', 1); const b = [ref(second.query)];
  second.timing = { mode: 'SCHEDULED', refs: b, date: relative('TOMORROW', b), time: time(18, b) };
  const initial = createDraftSession(parsed(first), new Date('2026-10-02T10:00:00+05:30'), 'Asia/Kolkata');
  let session = mergeParsedRevision(initial, parsed(second), new Date('2026-10-03T10:00:00+05:30'), 'Asia/Kolkata');
  assert.equal(resolveSessionTemporal(session, createTestClock('2026-10-03T10:00:00+05:30')).localDate, '2026-10-04');
  const third = blank('second', 2); const c = [ref(third.query)];
  third.timing = { mode: 'SCHEDULED', refs: c, date: relative('TOMORROW', c), time: time(18, c) };
  session = mergeParsedRevision(session, parsed(third), new Date('2026-10-04T10:00:00+05:30'), 'Asia/Kolkata');
  assert.equal(resolveSessionTemporal(session, createTestClock('2026-10-04T10:00:00+05:30')).localDate, '2026-10-05');
  session = editDraftField(session, 'sharing', resolved(false), new Date('2026-10-04T10:00:00+05:30'));
  session = editDraftField(session, 'timing.date', relative('TOMORROW', []), new Date('2026-10-05T10:00:00+05:30'));
  assert.equal(resolveSessionTemporal(session, createTestClock('2026-10-05T10:00:00+05:30')).localDate, '2026-10-06');
});

test('relative follow-ups replace stale scheduling diagnostics and preserve exact field and policy categories', () => {
  const anchorClock = createTestClock('2026-10-02T12:00:00+05:30');
  const d = blank(); const refs = [ref(d.query)];
  const partialClock = resolved({ kind: 'CLOCK', hour: 12, minute: resolved(15, refs), notation: 'H24', period: unspecified(), precision: 'EXACT' }, refs);
  d.timing = { mode: 'SCHEDULED', refs, date: relative('TODAY', refs), time: partialClock };
  const session = createDraftSession(parsed(d), anchorClock.now(), 'Asia/Kolkata');
  assert.deepEqual(resolveSessionTemporal(session, createTestClock('2026-10-02T12:10:00+05:30')).issues,
    [{ code: 'SCHEDULE_TOO_SOON', field: 'timing', category: 'INVALID', refs, values: undefined }]);
  const unanchored = editDraftField(session, 'timing.date', relative('TOMORROW', []));
  assert.deepEqual(resolveSessionTemporal(unanchored, anchorClock).issues,
    [{ code: 'DATE_ANCHOR_CONTEXT_REQUIRED', field: 'timing.date', category: 'POLICY', refs: [{ kind: 'USER_FIELD', field: 'timing.date', revision: 1 }], values: undefined }]);
  const ambiguous = editDraftField(session, 'timing', { mode: 'AMBIGUOUS', refs: [], date: relative('TOMORROW', []), time: unspecified() });
  assert.deepEqual(resolveSessionTemporal(ambiguous, anchorClock), { issues: [] });
  const noDate = editDraftField(session, 'timing.date', unspecified());
  const nonIst = createDraftSession(parsed(noDate.snapshots[0].draft), anchorClock.now(), 'America/New_York');
  assert.deepEqual(resolveSessionTemporal(editDraftField(nonIst, 'timing.date', unspecified()), anchorClock), { issues: [] });
});
