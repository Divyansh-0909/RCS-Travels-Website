import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDraft } from '../services/search/contracts.ts';
import { createDraftSession, editDraftField, mergeParsedRevision } from '../services/search/locations/session.ts';
import { applyTrustedLocation, createLocationReview, editLocationReview, preparePlaceSelection } from '../services/search/locations/review.ts';

const now = new Date('2026-10-02T10:00:00Z');
const parsed = (draft) => ({ draft, route: 'SIMPLE_INCOMPLETE', issues: [], fallbackRequired: false, fallbackReasons: [], providerMetadata: { attemptedRequests: 0, completedRequests: 0, batches: [], decisions: [], diagnostics: {} } });
const ref = (query) => ({ kind: 'QUERY_SPAN', queryId: query.id, revision: query.revision, start: 0, end: query.text.length });
function draft(id, revision, text = 'cab') {
  const value = emptyDraft({ id, revision, text });
  value.queryType = 'BOOKING_REQUEST'; value.complexity = 'SIMPLE';
  return value;
}
const unspecifiedTiming = (query) => ({ mode: 'UNSPECIFIED', refs: [ref(query)], date: { state: 'UNSPECIFIED' }, time: { state: 'UNSPECIFIED' } });
const saved = { selectionId: 'saved', lat: 28, lng: 77, displayText: 'Saved', confirmedAt: now.toISOString(), confirmedByUser: 'selection', source: 'USER_SELECTED_SAVED_PLACE' };

test('accepted session input distinguishes the UNSPECIFIED timing-ref mutants', () => {
  const first = draft('first', 1); first.timing = unspecifiedTiming(first.query);
  const second = draft('second', 1); second.timing = unspecifiedTiming(second.query);
  const merged = mergeParsedRevision(createDraftSession(parsed(first), now, 'Asia/Kolkata'), parsed(second), now, 'Asia/Kolkata');
  assert.deepEqual(merged.effectiveDraft.timing.refs, [ref(second.query)]);
  // Mutants 581/583 enter line 77 and overwrite these refs with ref(first.query).
});

test('first unsupported request is retained by the current some-based deduplicator', () => {
  const first = draft('first', 1);
  const second = draft('second', 1);
  second.unsupportedRequests = [{ kind: 'RENTAL', candidateIds: [], reasonCode: 'UNSUPPORTED', refs: [ref(second.query)] }];
  const merged = mergeParsedRevision(createDraftSession(parsed(first), now, 'Asia/Kolkata'), parsed(second), now, 'Asia/Kolkata');
  assert.equal(merged.effectiveDraft.unsupportedRequests.length, 1);
  // Mutant 619 evaluates [].every(...) as true, so its negation filters this request out.
});

test('early duplicate detection precedes replay of a timing component edit', () => {
  const original = draft('same', 1);
  const edited = editDraftField(createDraftSession(parsed(original), now, 'Asia/Kolkata'), 'timing.date',
    { state: 'RESOLVED', value: { kind: 'RELATIVE', anchor: 'TOMORROW' }, refs: [] }, now);
  const duplicateImmediate = draft('same', 1);
  duplicateImmediate.timing = { mode: 'IMMEDIATE', refs: [ref(duplicateImmediate.query)], date: { state: 'UNSPECIFIED' }, time: { state: 'UNSPECIFIED' } };
  assert.throws(() => mergeParsedRevision(edited, parsed(duplicateImmediate), now, 'Asia/Kolkata'), error => error.code === 'STALE_QUERY');
  assert.throws(() => editDraftField(createDraftSession(parsed(duplicateImmediate), now, 'Asia/Kolkata'), 'timing.date',
    { state: 'RESOLVED', value: { kind: 'RELATIVE', anchor: 'TOMORROW' }, refs: [] }, now), error => error.code === 'INVALID_EDIT');
  const later = draft('later', 1);
  const twoSnapshots = mergeParsedRevision(edited, parsed(later), now, 'Asia/Kolkata');
  assert.throws(() => mergeParsedRevision(twoSnapshots, parsed(duplicateImmediate), now, 'Asia/Kolkata'), error => error.code === 'STALE_QUERY');
  // 786/788/790 bypass the first rejection; 787 does so once `later` makes
  // every(...) false. All then replay the timing edit before validateHistory.
});

test('location-search correction is guarded independently of endpoint edit stamps', () => {
  const source = emptyDraft({ id: 'location', revision: 1, text: 'Airport' });
  source.queryType = 'LOCATION_SEARCH'; source.complexity = 'NOT_APPLICABLE';
  const candidate = { candidateId: 'airport', queryId: 'location', queryRevision: 1, exactText: 'Airport', start: 0, end: 7, method: 'WHOLE_LOCATION_QUERY', generatorVersion: 'test' };
  source.candidates = [candidate];
  source.locationSearch = { state: 'RESOLVED', value: { kind: 'QUERY_CANDIDATE', candidateId: candidate.candidateId }, refs: [ref(source.query)] };
  const pending = { query: source.query, candidate, target: 'drop', formRevision: 0, ref: { kind: 'QUERY_CANDIDATE', candidateId: candidate.candidateId }, sessionToken: 'token', matches: [{ placeId: 'place', displayText: 'Airport' }], issues: [], status: 'USER_SELECTION_REQUIRED' };
  let review = createLocationReview(parsed(source), now, 'Asia/Kolkata');
  review = applyTrustedLocation(review, 'pickup', saved);
  review = editLocationReview(review, 'locationSearch', { kind: 'USER_SELECTION', selectionId: saved.selectionId });
  assert.equal(review.endpointEdits.drop, undefined);
  assert.deepEqual(review.session.effectiveDraft.query, pending.query);
  assert.equal(review.session.effectiveDraft.locationSearch.value.kind, 'USER_SELECTION');
  assert.throws(() => preparePlaceSelection(review, pending), /STALE_GROUNDING_RESULT/);
  // Each one still evaluates the unchanged candidate-ID clause, which rejects
  // a USER_SELECTION because it has no candidateId.
});
