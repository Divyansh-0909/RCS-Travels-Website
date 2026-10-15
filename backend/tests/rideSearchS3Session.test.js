import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDraft } from '../services/search/contracts.ts';
import { createDraftSession, DraftSessionError, editDraftField, mergeParsedRevision, registerTrustedLocationSelection, validateDraftSession } from '../services/search/locations/session.ts';
import { resolveSessionTemporal } from '../services/search/locations/sessionTemporal.ts';
import { followups } from '../services/search/locations/followup.ts';
import { createTestClock } from './helpers/testClock.js';
const clock = createTestClock('2026-10-02T10:00:00Z');

const result = draft => ({ draft, route: 'SIMPLE_INCOMPLETE', issues: [], fallbackRequired: false, fallbackReasons: [], providerMetadata: { attemptedRequests: 0, completedRequests: 0, batches: [], decisions: [], diagnostics: {} } });
const ref = query => ({ kind: 'QUERY_SPAN', queryId: query.id, revision: query.revision, start: 0, end: query.text.length });
function draft(id, revision, text) {
  const value = emptyDraft({ id, revision, text });
  value.queryType = 'BOOKING_REQUEST'; value.complexity = 'SIMPLE';
  return value;
}
function scheduled(id, revision, text = 'tomorrow') {
  const value = draft(id, revision, text); const refs = [ref(value.query)];
  value.timing = { mode: 'SCHEDULED', refs, date: { state: 'RESOLVED', value: { kind: 'RELATIVE', anchor: 'TOMORROW' }, refs }, time: { state: 'UNSPECIFIED' } };
  return value;
}

test('sessions retain historical spans and preserve omitted parsed values', () => {
  const old = draft('ride', 1, 'share ride'); old.sharing = { state: 'RESOLVED', value: true, refs: [ref(old.query)] };
  const next = draft('ride', 2, 'book ride');
  const session = mergeParsedRevision(createDraftSession(result(old), new Date('2026-10-02T12:00:00+05:30'), 'Asia/Kolkata'), result(next), new Date('2026-10-03T12:00:00+05:30'), 'Asia/Kolkata');
  assert.equal(session.effectiveDraft.sharing.value, true);
  assert.equal(session.effectiveDraft.sharing.refs[0].revision, 1);
  assert.equal(Object.isFrozen(session.snapshots[0].draft), true);
});

test('explicit corrections lock their own field across parser revisions', () => {
  const first = draft('ride', 1, 'share'); first.sharing = { state: 'RESOLVED', value: true, refs: [ref(first.query)] };
  let session = createDraftSession(result(first), new Date('2026-10-02T12:00:00+05:30'), 'Asia/Kolkata');
  session = editDraftField(session, 'sharing', { state: 'RESOLVED', value: false, refs: [] });
  const next = draft('ride', 2, 'share'); next.sharing = { state: 'RESOLVED', value: true, refs: [ref(next.query)] };
  session = mergeParsedRevision(session, result(next), new Date('2026-10-02T13:00:00+05:30'), 'Asia/Kolkata');
  assert.equal(session.effectiveDraft.sharing.value, false);
  assert.deepEqual(session.effectiveDraft.sharing.refs, [{ kind: 'USER_FIELD', field: 'sharing', revision: 1 }]);
});

test('a historical query candidate stays bound to its original snapshot', () => {
  const old = draft('ride', 1, 'from Airport');
  const candidate = { candidateId: 'old-airport', queryId: 'ride', queryRevision: 1, exactText: 'Airport', start: 5, end: 12, method: 'LABELLED_FIELD', generatorVersion: 'test' };
  old.candidates = [candidate]; old.pickup = { state: 'RESOLVED', value: { kind: 'QUERY_CANDIDATE', candidateId: candidate.candidateId }, refs: [ref(old.query)] };
  const next = draft('ride', 2, 'from Airport');
  const session = mergeParsedRevision(createDraftSession(result(old), new Date('2026-10-02T12:00:00+05:30'), 'Asia/Kolkata'), result(next), new Date('2026-10-02T12:01:00+05:30'), 'Asia/Kolkata');
  assert.equal(session.effectiveDraft.pickup.value.candidateId, 'old-airport');
  assert.equal(session.effectiveDraft.candidates.length, 0);
  assert.equal(session.effectiveDraft.pickup.refs[0].revision, 1);
});

test('date provenance keeps its trusted original anchor when a time is explicitly edited', () => {
  let session = createDraftSession(result(scheduled('ride', 1)), new Date('2026-10-02T23:59:00+05:30'), 'Asia/Kolkata');
  session = editDraftField(session, 'timing.time', { state: 'RESOLVED', value: { kind: 'CLOCK', hour: 6, minute: { state: 'RESOLVED', value: 0, refs: [] }, notation: 'H12', period: { state: 'RESOLVED', value: 'PM', refs: [] }, precision: 'EXACT' }, refs: [] });
  const temporal = resolveSessionTemporal(session, createTestClock('2026-10-02T23:59:00+05:30'));
  assert.equal(temporal.localDate, '2026-10-03');
  assert.equal(temporal.localTime, '18:00');
  assert.equal(temporal.scheduledAt, '2026-10-03T12:30:00.000Z');
  assert.deepEqual(session.effectiveDraft.timing.refs, session.snapshots[0].draft.timing.refs);
});

test('historical temporal anchoring retains location span ownership after a new query and a direct time edit', () => {
  const initial = scheduled('zone-landmark', 1, 'tomorrow from UTC Tower');
  initial.candidates = [{ candidateId: 'utc-tower', queryId: initial.query.id, queryRevision: 1,
    exactText: 'UTC Tower', start: 14, end: 23, method: 'LABELLED_FIELD', generatorVersion: 'test' }];
  let session = createDraftSession(result(initial), clock.now(), 'Asia/Kolkata');
  session = mergeParsedRevision(session, result(draft('zone-landmark', 2, 'prefer sedan')), clock.now(), 'Asia/Kolkata');
  session = editDraftField(session, 'timing.time', { state: 'RESOLVED', value: { kind: 'CLOCK', hour: 6,
    minute: { state: 'RESOLVED', value: 0, refs: [] }, notation: 'H12', period: { state: 'RESOLVED', value: 'PM', refs: [] }, precision: 'EXACT' }, refs: [] });
  const temporal = resolveSessionTemporal(session, clock);
  assert.equal(temporal.localDate, '2026-10-03'); assert.equal(temporal.localTime, '18:00');
  assert.ok(['Asia/Kolkata', 'Asia/Calcutta'].includes(temporal.sourceTimeZone));
  assert.equal(temporal.sourceExpression, initial.query.text);
  assert.equal(session.effectiveDraft.query.revision, 2);
});

test('invalid snapshots and unregistered location selections fail safely', () => {
  const invalid = draft('ride', 1, 'x'); invalid.pickup = { state: 'RESOLVED', value: { kind: 'QUERY_CANDIDATE', candidateId: 'missing' }, refs: [ref(invalid.query)] };
  assert.throws(() => createDraftSession(result(invalid), clock.now(), 'Asia/Kolkata'), error => error instanceof DraftSessionError && error.code === 'INVALID_PARSE_RESULT');
  const session = createDraftSession(result(draft('ride', 1, 'x')), clock.now(), 'Asia/Kolkata');
  assert.throws(() => editDraftField(session, 'pickup', { kind: 'USER_SELECTION', selectionId: 'not-registered' }), DraftSessionError);
  const selected = registerTrustedLocationSelection(session, { selectionId: 'saved', lat: 12.1, lng: 77.1, displayText: 'Home', confirmedAt: '2026-10-02T12:00:00.000Z', confirmedByUser: 'selection', source: 'USER_SELECTED_SAVED_PLACE' });
  assert.equal(editDraftField(selected, 'pickup', { kind: 'USER_SELECTION', selectionId: 'saved' }).effectiveDraft.pickup.state, 'RESOLVED');
});

test('followups are deterministic and omit resolved Places requirements', () => {
  const value = draft('ride', 1, 'x');
  const issues = followups(value, [{ code: 'PLACES_GROUNDING_REQUIRED', field: 'pickup', category: 'DEPENDENCY', refs: [] }, { code: 'ROLE_CONFLICT', field: 'drop', category: 'AMBIGUOUS', refs: [] }], [], new Set(['pickup']));
  assert.deepEqual(issues.map(issue => issue.code), ['ROLE_CONFLICT', 'FIELD_REQUIRED', 'FIELD_REQUIRED', 'TIMING_REQUIRED', 'VEHICLE_SELECTION_REQUIRED']);
});

test('timing merges carry both components and component edits apply in chronological order', () => {
  const first = scheduled('ride', 1); const refs = [ref(first.query)];
  first.timing.time = { state: 'RESOLVED', value: { kind: 'CLOCK', hour: 7, minute: { state: 'RESOLVED', value: 0, refs }, notation: 'H12', period: { state: 'RESOLVED', value: 'AM', refs }, precision: 'EXACT' }, refs };
  const next = draft('ride', 2, 'again');
  let session = mergeParsedRevision(createDraftSession(result(first), new Date('2026-10-02T12:00:00+05:30'), 'Asia/Kolkata'), result(next), new Date('2026-10-02T13:00:00+05:30'), 'Asia/Kolkata');
  assert.equal(session.effectiveDraft.timing.mode, 'SCHEDULED');
  assert.equal(session.effectiveDraft.timing.date.state, 'RESOLVED');
  assert.equal(session.effectiveDraft.timing.time.state, 'RESOLVED');
  session = editDraftField(session, 'timing', { mode: 'SCHEDULED', refs: [], date: { state: 'UNSPECIFIED' }, time: { state: 'UNSPECIFIED' } });
  session = editDraftField(session, 'timing.time', { state: 'RESOLVED', value: { kind: 'CLOCK', hour: 8, minute: { state: 'RESOLVED', value: 0, refs: [] }, notation: 'H24', period: { state: 'UNSPECIFIED' }, precision: 'EXACT' }, refs: [] });
  assert.equal(session.effectiveDraft.timing.time.value.hour, 8);
  const immediate = draft('other', 1, 'now'); immediate.timing = { ...immediate.timing, mode: 'IMMEDIATE', refs: [ref(immediate.query)] };
  assert.throws(() => editDraftField(createDraftSession(result(immediate), clock.now(), 'Asia/Kolkata'), 'timing.time', { state: 'UNSPECIFIED' }), DraftSessionError);
});

test('sessions reject non-operative results, stale histories, tampering, and preserve invalidations', () => {
  const first = draft('ride', 1, 'x');
  assert.throws(() => createDraftSession({ ...result(first), route: 'PARSER_UNAVAILABLE' }, clock.now(), 'Asia/Kolkata'), DraftSessionError);
  assert.throws(() => createDraftSession({ ...result(first), fallbackRequired: true }, clock.now(), 'Asia/Kolkata'), DraftSessionError);
  let session = editDraftField(createDraftSession(result(first), clock.now(), 'Asia/Kolkata'), 'sharing', { state: 'RESOLVED', value: false, refs: [] });
  session = registerTrustedLocationSelection(session, { selectionId: 'home', lat: 12, lng: 77, displayText: 'Home', confirmedAt: '2026-10-02T12:00:00.000Z', confirmedByUser: 'selection', source: 'USER_SELECTED_SAVED_PLACE' });
  assert.equal(session.invalidations.fare, true);
  assert.equal(session.invalidations.fare, true);
  const stale = structuredClone(session); stale.snapshots.push(structuredClone(session.snapshots[0]));
  assert.throws(() => mergeParsedRevision(stale, result(draft('ride', 2, 'x')), clock.now(), 'Asia/Kolkata'), DraftSessionError);
  const forged = structuredClone(session); forged.effectiveDraft.sharing.value = true;
  assert.throws(() => editDraftField(forged, 'sharing', { state: 'RESOLVED', value: false, refs: [] }), DraftSessionError);
});

test('user-relative dates require an edit timestamp and scheduling uses the current clock', () => {
  let session = createDraftSession(result(draft('ride', 1, 'x')), new Date('2026-10-02T12:00:00+05:30'), 'Asia/Kolkata');
  const relative = { state: 'RESOLVED', value: { kind: 'RELATIVE', anchor: 'TOMORROW' }, refs: [] };
  session = editDraftField(session, 'timing.date', relative);
  assert.equal(resolveSessionTemporal(session, createTestClock('2026-10-02T12:00:00+05:30')).issues[0].code, 'DATE_ANCHOR_CONTEXT_REQUIRED');
  session = editDraftField(session, 'timing.date', relative, new Date('2026-10-02T23:59:00+05:30'));
  session = editDraftField(session, 'timing.time', { state: 'RESOLVED', value: { kind: 'CLOCK', hour: 6, minute: { state: 'RESOLVED', value: 0, refs: [] }, notation: 'H12', period: { state: 'RESOLVED', value: 'PM', refs: [] }, precision: 'EXACT' }, refs: [] });
  const late = resolveSessionTemporal(session, createTestClock('2026-10-03T17:40:00+05:30'));
  assert.ok(late.issues.some(issue => issue.code === 'SCHEDULE_TOO_SOON'));
});

test('session ledgers reject altered snapshots, identities, selections, edits and field provenance', () => {
  const base = createDraftSession(result(draft('ride', 1, 'cab')), clock.now(), 'Asia/Kolkata');
  assert.throws(() => mergeParsedRevision(base, result(draft('ride', 1, 'changed')), clock.now(), 'Asia/Kolkata'), /STALE_QUERY/);
  const mutations = [
    value => { value.schemaVersion = 'other'; }, value => { value.snapshots = []; },
    value => { value.snapshots[0].anchorDate = 'bad'; }, value => { value.snapshots[0].timeZone = ''; },
    value => { value.snapshots[0].draft.sharing = { state: 'BAD' }; },
    value => { value.snapshots[0].query.text = 'different'; },
    value => { value.trustedSelectionRegistry = [{ selectionId: 'secret', lat: 91 }]; },
    value => { value.edits = [{ field: 'bad', revision: 1, value: { state: 'UNSPECIFIED' } }]; },
    value => { value.edits = [{ field: 'sharing', revision: 3, value: { state: 'UNSPECIFIED' } }]; },
    value => { value.edits = [{ field: 'sharing', revision: 1, editedAt: 'bad', value: { state: 'UNSPECIFIED' } }]; },
    value => { value.edits = [{ field: 'sharing', revision: 1, value: { state: 'RESOLVED', value: true, refs: [ref(base.effectiveDraft.query)] } }]; },
  ];
  for (const mutate of mutations) { const value = structuredClone(base); mutate(value); assert.throws(() => validateDraftSession(value), DraftSessionError); }
  const invalidSpan = structuredClone(base);
  invalidSpan.snapshots[0].draft.sharing = { state: 'RESOLVED', value: true, refs: [{ ...ref(base.effectiveDraft.query), revision: 2 }] };
  assert.throws(() => validateDraftSession(invalidSpan), DraftSessionError);
  assert.throws(() => editDraftField(base, 'timing.date', { state: 'UNSPECIFIED' }, new Date('invalid')), DraftSessionError);
  assert.throws(() => editDraftField(base, 'vehicleClass', { state: 'RESOLVED', value: 'truck', refs: [] }), DraftSessionError);
  assert.throws(() => editDraftField(base, 'pickup', { kind: 'QUERY_CANDIDATE', candidateId: 'made-up' }), DraftSessionError);
  const ambiguous = draft('ride', 1, 'campus');
  ambiguous.candidates = [{ candidateId: 'c', queryId: 'ride', queryRevision: 1, exactText: 'campus', start: 0, end: 6, method: 'WHOLE_LOCATION_QUERY', generatorVersion: 'v' }];
  ambiguous.pickup = { state: 'AMBIGUOUS', alternatives: [{ kind: 'QUERY_CANDIDATE', candidateId: 'c' }], reasonCode: 'ROLE_CONFLICT', refs: [ref(ambiguous.query)] };
  assert.equal(createDraftSession(result(ambiguous), clock.now(), 'Asia/Kolkata').effectiveDraft.pickup.state, 'AMBIGUOUS');
  let registered = registerTrustedLocationSelection(base, { selectionId: 'map', displayText: 'Map', lat: 12, lng: 77, source: 'USER_CONFIRMED_MAP_PIN', confirmedByUser: 'selection', confirmedAt: clock.now().toISOString() });
  assert.throws(() => registerTrustedLocationSelection(registered, registered.trustedSelectionRegistry[0]), DraftSessionError);
  registered = editDraftField(registered, 'sharing', { state: 'RESOLVED', value: false, refs: [] }, clock.now());
  assert.equal(registered.edits[0].editedAt, clock.now().toISOString());
});

test('immediate and scheduled revisions keep timing modes, and explicit absolute/weekday dates remain distinct', () => {
  let immediate = draft('ride', 2, 'now'); immediate.timing.mode = 'IMMEDIATE'; immediate.timing.refs = [ref(immediate.query)];
  const merged = mergeParsedRevision(createDraftSession(result(scheduled('ride', 1)), clock.now(), 'Asia/Kolkata'), result(immediate), clock.now(), 'Asia/Kolkata');
  assert.equal(merged.effectiveDraft.timing.mode, 'IMMEDIATE');
  assert.deepEqual(resolveSessionTemporal(merged, clock), { issues: [] });
  let session = createDraftSession(result(draft('ride', 1, 'cab')), clock.now(), 'Asia/Kolkata');
  session = editDraftField(session, 'timing.date', { state: 'UNSPECIFIED' });
  assert.deepEqual(resolveSessionTemporal(session, clock), { issues: [] });
  const value = n => ({ state: 'RESOLVED', value: n, refs: [] });
  session = editDraftField(session, 'timing.date', value({ kind: 'ABSOLUTE', year: value(2026), month: value(10), day: value(3) }));
  assert.equal(resolveSessionTemporal(session, clock).localDate, '2026-10-03');
  session = editDraftField(session, 'timing.date', { state: 'AMBIGUOUS', alternatives: [{ kind: 'RELATIVE', anchor: 'TODAY' }, { kind: 'RELATIVE', anchor: 'TOMORROW' }], reasonCode: 'DATE_AMBIGUOUS', refs: [] });
  assert.equal(resolveSessionTemporal(session, clock).localDate, undefined);
  session = editDraftField(session, 'timing.date', value({ kind: 'WEEKDAY', weekday: 'FRIDAY', qualifier: 'NEXT' }));
  assert.equal(resolveSessionTemporal(session, clock).localDate, '2026-10-09');
});

test('location-search edits stay standalone, while explicit booking-field edits establish the accumulated booking intent', () => {
  const standalone = emptyDraft({ id: 'location', revision: 1, text: 'Pari Chowk' });
  standalone.queryType = 'LOCATION_SEARCH';
  const base = createDraftSession(result(standalone), clock.now(), 'Asia/Kolkata');
  const selection = { selectionId: 'saved', lat: 28, lng: 77, displayText: 'Pari Chowk', source: 'USER_SELECTED_SAVED_PLACE', confirmedByUser: 'selection', confirmedAt: clock.now().toISOString() };
  const registered = registerTrustedLocationSelection(base, selection);
  const search = editDraftField(registered, 'locationSearch', { kind: 'USER_SELECTION', selectionId: 'saved' });
  assert.equal(search.effectiveDraft.queryType, 'LOCATION_SEARCH');
  assert.equal(search.effectiveDraft.complexity, 'NOT_APPLICABLE');
  assert.deepEqual(search.effectiveDraft.locationSearch.refs, [{ kind: 'USER_FIELD', field: 'locationSearch', revision: 1 }]);
  const pickup = editDraftField(search, 'pickup', { kind: 'USER_SELECTION', selectionId: 'saved' });
  assert.equal(pickup.effectiveDraft.queryType, 'BOOKING_REQUEST');
  assert.equal(pickup.effectiveDraft.complexity, 'SIMPLE');
  assert.equal(pickup.snapshots[0].draft.queryType, 'LOCATION_SEARCH');
  assert.throws(() => registerTrustedLocationSelection(registered, selection), error => error.code === 'INVALID_EDIT');
  assert.throws(() => registerTrustedLocationSelection(base, { ...selection, lat: 91 }));
});

test('merged unsupported clauses are retained once without dropping independent requests', () => {
  const first = draft('ride', 1, 'AC car');
  const a = { kind: 'AC_PREFERENCE', candidateIds: [], reasonCode: 'AC_ENFORCEMENT_UNSUPPORTED', refs: [ref(first.query)] };
  first.unsupportedRequests = [a];
  const second = draft('ride', 2, 'AC car');
  second.unsupportedRequests = [{ ...a, refs: [ref(second.query)] }];
  const base = createDraftSession(result(first), clock.now(), 'Asia/Kolkata');
  const merged = mergeParsedRevision(base, result(second), clock.now(), 'Asia/Kolkata');
  assert.equal(merged.effectiveDraft.unsupportedRequests.length, 2, 'separate source occurrences remain distinct');
  const third = draft('third', 1, 'rental');
  third.unsupportedRequests = [{ kind: 'RENTAL', candidateIds: [], reasonCode: 'RENTAL_UNSUPPORTED', refs: [ref(third.query)] }];
  const final = mergeParsedRevision(merged, result(third), clock.now(), 'Asia/Kolkata');
  assert.deepEqual(final.effectiveDraft.unsupportedRequests.map(value => value.kind), ['AC_PREFERENCE', 'AC_PREFERENCE', 'RENTAL']);
  assert.deepEqual(base.effectiveDraft.unsupportedRequests, [a]);
});

test('either endpoint change invalidates confirmation and immutable initial sessions start with clean derived flags', () => {
  const base = createDraftSession(result(draft('ride', 1, 'cab')), clock.now(), 'Asia/Kolkata');
  assert.deepEqual(base.invalidations, { fare: false, route: false, locationConfirmation: false });
  for (const target of ['pickup', 'drop']) {
    const next = draft('ride', 2, 'Airport');
    const candidate = { candidateId: target, queryId: 'ride', queryRevision: 2, exactText: 'Airport', start: 0, end: 7, method: 'WHOLE_LOCATION_QUERY', generatorVersion: 'test' };
    next.candidates = [candidate];
    next[target] = { state: 'RESOLVED', value: { kind: 'QUERY_CANDIDATE', candidateId: target }, refs: [ref(next.query)] };
    assert.deepEqual(mergeParsedRevision(base, result(next), clock.now(), 'Asia/Kolkata').invalidations, { fare: true, route: true, locationConfirmation: true });
  }
  const invalidated = { ...base, invalidations: { fare: true, route: true, locationConfirmation: true } };
  const omitted = mergeParsedRevision(invalidated, result(draft('new', 1, 'cab')), clock.now(), 'Asia/Kolkata');
  assert.deepEqual(omitted.invalidations, invalidated.invalidations);
});

test('canonical user edit provenance and registry membership survive deliberate ledger tampering', () => {
  const base = createDraftSession(result(draft('ride', 1, 'cab')), clock.now(), 'Asia/Kolkata');
  const edited = editDraftField(base, 'sharing', { state: 'RESOLVED', value: true, refs: [] });
  const corrupted = structuredClone(edited);
  corrupted.edits[0].value.refs = [ref(base.effectiveDraft.query)];
  corrupted.effectiveDraft.sharing.refs = [ref(base.effectiveDraft.query)];
  assert.throws(() => validateDraftSession(corrupted), error => error.code === 'CORRUPT_PROVENANCE');
  const registered = registerTrustedLocationSelection(base, { selectionId: 'home', lat: 28, lng: 77, displayText: 'Home', source: 'USER_SELECTED_SAVED_PLACE', confirmedByUser: 'selection', confirmedAt: clock.now().toISOString() });
  assert.throws(() => editDraftField(registered, 'pickup', { kind: 'USER_SELECTION', selectionId: 'unregistered' }), error => error.code === 'CORRUPT_PROVENANCE');
  assert.throws(() => editDraftField(registered, 'drop', { state: 'AMBIGUOUS', alternatives: [{ kind: 'USER_SELECTION', selectionId: 'home' }, { kind: 'USER_SELECTION', selectionId: 'unregistered' }], reasonCode: 'CHOOSE_LOCATION', refs: [] }), error => error.code === 'CORRUPT_PROVENANCE');
});

test('history failures preserve their specific safe error categories', () => {
  const base = createDraftSession(result(draft('ride', 1, 'cab')), clock.now(), 'Asia/Kolkata');
  const invalid = structuredClone(base); invalid.snapshots[0].anchorDate = 'invalid';
  assert.throws(() => validateDraftSession(invalid), error => error.code === 'INVALID_SNAPSHOT');
  const duplicate = structuredClone(base); duplicate.snapshots.push(structuredClone(duplicate.snapshots[0]));
  assert.throws(() => validateDraftSession(duplicate), error => error.code === 'STALE_QUERY');
  const registry = structuredClone(base); registry.trustedSelectionRegistry.push({ selectionId: 'invalid' });
  assert.throws(() => validateDraftSession(registry), error => error.code === 'CORRUPT_PROVENANCE');
  const immediate = draft('now', 1, 'cab now'); immediate.timing.mode = 'IMMEDIATE'; immediate.timing.refs = [ref(immediate.query)];
  const now = createDraftSession(result(immediate), clock.now(), 'Asia/Kolkata');
  assert.throws(() => editDraftField(now, 'timing.time', { state: 'UNSPECIFIED' }), error => error.code === 'INVALID_EDIT');
  assert.throws(() => editDraftField(base, 'pickup', { kind: 'QUERY_CANDIDATE', candidateId: 'unoffered' }), error => error.code === 'CORRUPT_PROVENANCE');
});

test('schema-valid unspecified timing retains the current query provenance rather than copying an older expression', () => {
  const first = draft('first', 1, 'cab'); first.timing.refs = [ref(first.query)];
  const second = draft('second', 1, 'SUV'); second.timing.refs = [ref(second.query)];
  const merged = mergeParsedRevision(createDraftSession(result(first), clock.now(), 'Asia/Kolkata'), result(second), clock.now(), 'Asia/Kolkata');
  assert.deepEqual(merged.effectiveDraft.timing, second.timing);
});

test('the first unsupported follow-up is retained when no previous unsupported clause exists', () => {
  const base = createDraftSession(result(draft('first', 1, 'cab')), clock.now(), 'Asia/Kolkata');
  const second = draft('second', 1, 'rent for eight hours');
  second.unsupportedRequests = [{ kind: 'RENTAL', candidateIds: [], reasonCode: 'UNSUPPORTED', refs: [ref(second.query)] }];
  assert.deepEqual(mergeParsedRevision(base, result(second), clock.now(), 'Asia/Kolkata').effectiveDraft.unsupportedRequests, second.unsupportedRequests);
});

test('duplicate query rejection precedes replay of an incompatible timing-component edit', () => {
  const original = draft('same', 1, 'cab');
  let edited = editDraftField(createDraftSession(result(original), clock.now(), 'Asia/Kolkata'), 'timing.date', { state: 'RESOLVED', value: { kind: 'RELATIVE', anchor: 'TOMORROW' }, refs: [] }, clock.now());
  const duplicate = draft('same', 1, 'cab now'); duplicate.timing.mode = 'IMMEDIATE'; duplicate.timing.refs = [ref(duplicate.query)];
  assert.throws(() => mergeParsedRevision(edited, result(duplicate), clock.now(), 'Asia/Kolkata'), error => error.code === 'STALE_QUERY');
  edited = mergeParsedRevision(edited, result(draft('later', 1, 'SUV')), clock.now(), 'Asia/Kolkata');
  assert.throws(() => mergeParsedRevision(edited, result(duplicate), clock.now(), 'Asia/Kolkata'), error => error.code === 'STALE_QUERY');
});

test('fresh explicit location and time edits each invalidate their own dependencies', () => {
  const base = createDraftSession(result(draft('ride', 1, 'cab')), clock.now(), 'Asia/Kolkata');
  const registered = registerTrustedLocationSelection(base, { selectionId: 'home', lat: 28, lng: 77, displayText: 'Home', source: 'USER_SELECTED_SAVED_PLACE', confirmedByUser: 'selection', confirmedAt: clock.now().toISOString() });
  for (const field of ['pickup', 'drop', 'locationSearch']) {
    assert.deepEqual(editDraftField(registered, field, { kind: 'USER_SELECTION', selectionId: 'home' }).invalidations, { fare: true, route: true, locationConfirmation: true }, field);
  }
  const scheduled = { mode: 'SCHEDULED', refs: [], date: { state: 'RESOLVED', value: { kind: 'RELATIVE', anchor: 'TOMORROW' }, refs: [] }, time: { state: 'UNSPECIFIED' } };
  assert.deepEqual(editDraftField(base, 'timing', scheduled, clock.now()).invalidations, { fare: true, route: true, locationConfirmation: false });
  assert.deepEqual(editDraftField(base, 'timing.date', scheduled.date, clock.now()).invalidations, { fare: true, route: true, locationConfirmation: false });
  assert.throws(() => editDraftField(base, 'timing', scheduled, new Date('invalid')), error => error.code === 'INVALID_EDIT');
});

test('a non-booking follow-up preserves its own classifier result and ambiguous timing retains its incomplete components', () => {
  const old = emptyDraft({ id: 'location', revision: 1, text: 'Airport' }); old.queryType = 'LOCATION_SEARCH';
  const unrelated = emptyDraft({ id: 'unrelated', revision: 1, text: 'weather' });
  const merged = mergeParsedRevision(createDraftSession(result(old), clock.now(), 'Asia/Kolkata'), result(unrelated), clock.now(), 'Asia/Kolkata');
  assert.equal(merged.effectiveDraft.queryType, 'UNCLEAR_OR_UNRELATED');
  assert.equal(merged.effectiveDraft.complexity, 'NOT_APPLICABLE');
  const first = scheduled('ride', 1);
  const uncertain = draft('ride', 2, 'today or tomorrow'); uncertain.timing.mode = 'AMBIGUOUS'; uncertain.timing.refs = [ref(uncertain.query)];
  assert.deepEqual(mergeParsedRevision(createDraftSession(result(first), clock.now(), 'Asia/Kolkata'), result(uncertain), clock.now(), 'Asia/Kolkata').effectiveDraft.timing, uncertain.timing);
});
