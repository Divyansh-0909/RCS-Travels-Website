import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bookingDraftSchema,
  emptyDraft,
  parseInputSchema,
} from '../services/search/contracts.ts';
import { validateDraftProvenance, validateParseInputProvenance } from '../services/search/provenance.ts';

const query = { id: 'query-1', revision: 2, text: 'Pickup 😀 airport' };
const queryRef = { kind: 'QUERY_SPAN', queryId: query.id, revision: query.revision, start: 0, end: 6 };

function candidate(overrides = {}) {
  return {
    candidateId: 'candidate-1', queryId: query.id, queryRevision: query.revision,
    exactText: 'Pickup', start: 0, end: 6, method: 'DIRECTIONAL_CLAUSE', generatorVersion: 'test-v1', ...overrides,
  };
}

test('emptyDraft retains every unmentioned value as unspecified', () => {
  const draft = emptyDraft(query);
  assert.equal(draft.queryType, 'UNCLEAR_OR_UNRELATED');
  assert.equal(draft.complexity, 'NOT_APPLICABLE');
  assert.equal(draft.pickup.state, 'UNSPECIFIED');
  assert.equal(draft.timing.mode, 'UNSPECIFIED');
  assert.equal(bookingDraftSchema.safeParse(draft).success, true);
});

test('input candidates require matching query identity, exact text, UTF-16 boundaries, and unique IDs', () => {
  const valid = parseInputSchema.safeParse({ query, timeZone: 'Asia/Kolkata', candidates: [candidate()] });
  assert.equal(valid.success, true);
  assert.equal(parseInputSchema.safeParse({ query, timeZone: 'Asia/Kolkata', candidates: [candidate({ queryRevision: 3 })] }).success, false);
  assert.equal(parseInputSchema.safeParse({ query, timeZone: 'Asia/Kolkata', candidates: [candidate({ exactText: 'wrong' })] }).success, false);
  assert.equal(parseInputSchema.safeParse({ query, timeZone: 'Asia/Kolkata', candidates: [candidate({ start: 8, end: 9, exactText: '\ud83d' })] }).success, false);
  assert.equal(parseInputSchema.safeParse({ query, timeZone: 'Asia/Kolkata', candidates: [candidate(), candidate()] }).success, false);
});

test('input limits accept their cap and reject the next value', () => {
  const cappedQuery = { id: 'cap', revision: 0, text: 'x'.repeat(2_000) };
  const cappedCandidates = Array.from({ length: 24 }, (_, index) => ({
    candidateId: `candidate-${index}`, queryId: 'cap', queryRevision: 0,
    exactText: 'x', start: 0, end: 1, method: 'WHOLE_LOCATION_QUERY', generatorVersion: 'test-v1',
  }));
  assert.equal(parseInputSchema.safeParse({ query: cappedQuery, timeZone: 'Asia/Kolkata', candidates: cappedCandidates }).success, true);
  assert.equal(parseInputSchema.safeParse({ query: { ...cappedQuery, text: `${cappedQuery.text}x` }, timeZone: 'Asia/Kolkata' }).success, false);
  assert.equal(parseInputSchema.safeParse({ query: cappedQuery, timeZone: 'Asia/Kolkata', candidates: [...cappedCandidates, { ...cappedCandidates[0], candidateId: 'candidate-25' }] }).success, false);
});

test('input rejects reserved candidate IDs, duplicate trusted selections, and aggregate candidate text', () => {
  assert.equal(parseInputSchema.safeParse({ query, timeZone: 'Asia/Kolkata', candidates: [candidate({ candidateId: 'NONE' })] }).success, false);
  assert.equal(parseInputSchema.safeParse({ query, timeZone: 'Asia/Kolkata', trustedLocationSelections: [{ selectionId: 'saved-1', displayText: 'Home' }, { selectionId: 'saved-1', displayText: 'Home again' }] }).success, false);
  const longQuery = { id: 'long-query', revision: 1, text: 'x'.repeat(2_000) };
  const longCandidates = Array.from({ length: 5 }, (_, index) => ({
    candidateId: `long-${index}`, queryId: longQuery.id, queryRevision: longQuery.revision,
    exactText: longQuery.text, start: 0, end: longQuery.text.length, method: 'OVERLAPPING_ALTERNATIVE', generatorVersion: 'test-v1',
  }));
  assert.equal(parseInputSchema.safeParse({ query: longQuery, timeZone: 'Asia/Kolkata', candidates: longCandidates }).success, false);
});

test('field states preserve false and require evidence and bounded distinct alternatives', () => {
  const draft = emptyDraft(query);
  draft.sharing = { state: 'RESOLVED', value: false, refs: [queryRef] };
  assert.equal(bookingDraftSchema.safeParse(draft).success, true);
  draft.sharing = { state: 'RESOLVED', value: false, refs: [] };
  assert.equal(bookingDraftSchema.safeParse(draft).success, false);
  draft.sharing = { state: 'AMBIGUOUS', alternatives: [true, true], reasonCode: 'CONFLICT', refs: [queryRef] };
  assert.equal(bookingDraftSchema.safeParse(draft).success, false);
});

test('classification and vehicle preference invariants reject contradictory mutations', () => {
  const draft = emptyDraft(query);
  draft.queryType = 'LOCATION_SEARCH';
  draft.complexity = 'SIMPLE';
  assert.equal(bookingDraftSchema.safeParse(draft).success, false);
  draft.queryType = 'BOOKING_REQUEST';
  draft.complexity = 'NOT_APPLICABLE';
  assert.equal(bookingDraftSchema.safeParse(draft).success, false);
  draft.complexity = 'SIMPLE';
  draft.vehicleClass = { state: 'RESOLVED', value: 'suv', strength: 'REQUIRED', excluded: ['suv'], refs: [queryRef] };
  assert.equal(bookingDraftSchema.safeParse(draft).success, false);
  draft.vehicleClass = { state: 'EXCLUDED', excluded: ['sedan', 'sedan'], refs: [queryRef] };
  assert.equal(bookingDraftSchema.safeParse(draft).success, false);
});

test('temporal clocks enforce notation and period rules without defaulting period', () => {
  const draft = emptyDraft(query);
  draft.queryType = 'BOOKING_REQUEST';
  draft.complexity = 'SIMPLE';
  draft.timing = {
    mode: 'SCHEDULED', refs: [queryRef], date: { state: 'UNSPECIFIED' },
    time: { state: 'RESOLVED', value: { kind: 'CLOCK', hour: 18, minute: { state: 'RESOLVED', value: 0, refs: [queryRef] }, notation: 'H24', period: { state: 'UNSPECIFIED' }, precision: 'EXACT' }, refs: [queryRef] },
  };
  assert.equal(bookingDraftSchema.safeParse(draft).success, true);
  draft.timing.time = { state: 'RESOLVED', value: { kind: 'CLOCK', hour: 18, minute: { state: 'RESOLVED', value: 0, refs: [queryRef] }, notation: 'H12', period: { state: 'RESOLVED', value: 'PM', refs: [queryRef] }, precision: 'EXACT' }, refs: [queryRef] };
  assert.equal(bookingDraftSchema.safeParse(draft).success, false);
  draft.timing.time = { state: 'RESOLVED', value: { kind: 'CLOCK', hour: 12, minute: { state: 'RESOLVED', value: 0, refs: [queryRef] }, notation: 'H24', period: { state: 'RESOLVED', value: 'PM', refs: [queryRef] }, precision: 'EXACT' }, refs: [queryRef] };
  assert.equal(bookingDraftSchema.safeParse(draft).success, false);
  draft.timing.time = { state: 'RESOLVED', value: { kind: 'CLOCK', hour: 24, minute: { state: 'RESOLVED', value: 0, refs: [queryRef] }, notation: 'H24', period: { state: 'UNSPECIFIED' }, precision: 'EXACT' }, refs: [queryRef] };
  assert.equal(bookingDraftSchema.safeParse(draft).success, false);
  draft.timing = { ...draft.timing, refs: [] };
  assert.equal(bookingDraftSchema.safeParse(draft).success, false);
});

test('provenance rejects unknown references and carries semantic trusted form values with new refs', () => {
  const draft = emptyDraft(query);
  draft.candidates = [candidate()];
  draft.pickup = { state: 'RESOLVED', value: { kind: 'QUERY_CANDIDATE', candidateId: 'missing' }, refs: [queryRef] };
  assert.deepEqual(validateDraftProvenance(draft), [{ code: 'UNKNOWN_CANDIDATE', field: 'pickup' }]);

  const oldQuery = { ...query, revision: 1 };
  const oldRef = { ...queryRef, revision: 1 };
  const trusted = emptyDraft(oldQuery);
  trusted.pickup = { state: 'RESOLVED', value: { kind: 'USER_SELECTION', selectionId: 'saved-1' }, refs: [oldRef] };
  trusted.sharing = { state: 'RESOLVED', value: false, refs: [oldRef] };
  trusted.timing = {
    mode: 'SCHEDULED', refs: [oldRef], date: { state: 'RESOLVED', value: { kind: 'RELATIVE', anchor: 'TOMORROW' }, refs: [oldRef] },
    time: { state: 'RESOLVED', value: { kind: 'CLOCK', hour: 6, minute: { state: 'RESOLVED', value: 0, refs: [oldRef] }, notation: 'H12', period: { state: 'UNSPECIFIED' }, precision: 'EXACT' }, refs: [oldRef] },
  };
  const carried = emptyDraft(query);
  carried.pickup = { state: 'RESOLVED', value: { kind: 'USER_SELECTION', selectionId: 'saved-1' }, refs: [{ kind: 'USER_FIELD', field: 'pickup', revision: 1 }] };
  carried.sharing = { state: 'RESOLVED', value: false, refs: [{ kind: 'USER_FIELD', field: 'sharing', revision: 1 }] };
  carried.timing = {
    mode: 'SCHEDULED', refs: [{ kind: 'USER_FIELD', field: 'timing', revision: 1 }],
    date: { state: 'RESOLVED', value: { kind: 'RELATIVE', anchor: 'TOMORROW' }, refs: [{ kind: 'USER_FIELD', field: 'timing', revision: 1 }] },
    time: { state: 'RESOLVED', value: { kind: 'CLOCK', hour: 6, minute: { state: 'RESOLVED', value: 0, refs: [{ kind: 'USER_FIELD', field: 'timing', revision: 1 }] }, notation: 'H12', period: { state: 'UNSPECIFIED' }, precision: 'EXACT' }, refs: [{ kind: 'USER_FIELD', field: 'timing', revision: 1 }] },
  };
  const selections = [{ selectionId: 'saved-1', displayText: 'Home' }, { selectionId: 'saved-2', displayText: 'Work' }];
  assert.deepEqual(validateDraftProvenance(carried, selections, trusted), []);
  carried.pickup = { state: 'RESOLVED', value: { kind: 'USER_SELECTION', selectionId: 'saved-2' }, refs: [{ kind: 'USER_FIELD', field: 'pickup', revision: 1 }] };
  assert.deepEqual(validateDraftProvenance(carried, selections, trusted), [{ code: 'UNTRUSTED_USER_FIELD', field: 'pickup' }]);
});

test('provenance checks every source span without repairing invalid offsets', () => {
  const draft = emptyDraft(query);
  draft.timing = {
    mode: 'SCHEDULED', refs: [queryRef], date: { state: 'UNSPECIFIED' },
    time: { state: 'RESOLVED', value: { kind: 'CLOCK', hour: 6, minute: { state: 'RESOLVED', value: 0, refs: [{ ...queryRef, start: 8, end: 9 }] }, notation: 'H12', period: { state: 'UNSPECIFIED' }, precision: 'EXACT' }, refs: [queryRef] },
  };
  assert.deepEqual(validateDraftProvenance(draft), [{ code: 'INVALID_QUERY_SPAN', field: 'timing' }]);
});

test('provenance traverses nested date/time evidence and unsupported request ownership', () => {
  const draft = emptyDraft(query);
  draft.timing = {
    mode: 'SCHEDULED', refs: [queryRef],
    date: { state: 'RESOLVED', value: {
      kind: 'ABSOLUTE', day: { state: 'RESOLVED', value: 3, refs: [queryRef] },
      month: { state: 'RESOLVED', value: 10, refs: [queryRef] },
      year: { state: 'RESOLVED', value: 2026, refs: [{ ...queryRef, queryId: 'stale' }] },
    }, refs: [queryRef] },
    time: { state: 'RESOLVED', value: { kind: 'DAYPART', value: 'MORNING' }, refs: [queryRef] },
  };
  draft.unsupportedRequests = [{ kind: 'STOP', refs: [queryRef], candidateIds: ['missing'], reasonCode: 'NOT_SUPPORTED' }];
  assert.deepEqual(validateDraftProvenance(draft), [
    { code: 'INVALID_QUERY_SPAN', field: 'timing' },
    { code: 'UNKNOWN_CANDIDATE', field: 'unsupportedRequests' },
  ]);
});

test('provenance rejects invalid candidate input and untrusted location selections', () => {
  const draft = emptyDraft(query);
  draft.candidates = [candidate({ queryId: 'other-query' })];
  draft.pickup = { state: 'RESOLVED', value: { kind: 'USER_SELECTION', selectionId: 'not-trusted' }, refs: [queryRef] };
  assert.deepEqual(validateDraftProvenance(draft), [
    { code: 'INVALID_CANDIDATE_INPUT', field: 'candidates' },
    { code: 'UNTRUSTED_LOCATION_SELECTION', field: 'pickup' },
  ]);
});

test('provenance validates ambiguous nested values and draft-level schema failures', () => {
  const draft = emptyDraft(query);
  draft.candidates = [candidate()];
  draft.locationSearch = { state: 'AMBIGUOUS', alternatives: [{ kind: 'QUERY_CANDIDATE', candidateId: 'candidate-1' }], reasonCode: 'ROLE_UNCLEAR', refs: [queryRef] };
  draft.vehicleClass = { state: 'RESOLVED', value: 'suv', strength: 'REQUIRED', excluded: ['suv'], refs: [queryRef] };
  draft.timing = {
    mode: 'SCHEDULED', refs: [queryRef],
    date: { state: 'AMBIGUOUS', alternatives: [{ kind: 'RELATIVE', anchor: 'TOMORROW' }], reasonCode: 'DATE_UNCLEAR', refs: [queryRef] },
    time: { state: 'AMBIGUOUS', alternatives: [{ kind: 'DAYPART', value: 'NIGHT' }], reasonCode: 'TIME_UNCLEAR', refs: [queryRef] },
  };
  assert.deepEqual(validateDraftProvenance(draft), [{ code: 'INVALID_DRAFT', field: 'draft' }]);
});

test('input provenance validates a supplied form draft against its own context', () => {
  const formDraft = emptyDraft(query);
  formDraft.pickup = { state: 'RESOLVED', value: { kind: 'USER_SELECTION', selectionId: 'not-trusted' }, refs: [queryRef] };
  const input = parseInputSchema.parse({ query, timeZone: 'Asia/Kolkata', formDraft });
  assert.deepEqual(validateParseInputProvenance(input), [{ code: 'UNTRUSTED_LOCATION_SELECTION', field: 'pickup' }]);
  assert.deepEqual(validateParseInputProvenance(parseInputSchema.parse({ query, timeZone: 'Asia/Kolkata' })), []);
});

test('authoritative form snapshots preserve historical user fields but reject future revisions', () => {
  const snapshotQuery = { ...query, revision: 3 };
  const formDraft = emptyDraft(snapshotQuery);
  formDraft.pickup = { state: 'RESOLVED', value: { kind: 'USER_SELECTION', selectionId: 'saved-1' }, refs: [{ kind: 'USER_FIELD', field: 'pickup', revision: 2 }] };
  const input = parseInputSchema.parse({
    query: { ...query, revision: 4 }, timeZone: 'Asia/Kolkata',
    trustedLocationSelections: [{ selectionId: 'saved-1', displayText: 'Home' }], formDraft,
  });
  assert.deepEqual(validateParseInputProvenance(input), []);
  formDraft.pickup = { state: 'RESOLVED', value: { kind: 'USER_SELECTION', selectionId: 'saved-1' }, refs: [{ kind: 'USER_FIELD', field: 'pickup', revision: 4 }] };
  assert.deepEqual(validateParseInputProvenance(parseInputSchema.parse({
    query: { ...query, revision: 4 }, timeZone: 'Asia/Kolkata',
    trustedLocationSelections: [{ selectionId: 'saved-1', displayText: 'Home' }], formDraft,
  })), [{ code: 'UNTRUSTED_USER_FIELD', field: 'pickup' }]);
});

test('authoritative snapshots still fail closed for stale and surrogate-split query spans', () => {
  const snapshotQuery = { id: 'snapshot-query', revision: 3, text: 'A😀B' };
  const formDraft = emptyDraft(snapshotQuery);
  formDraft.pickup = { state: 'RESOLVED', value: { kind: 'USER_SELECTION', selectionId: 'saved-1' }, refs: [{ kind: 'QUERY_SPAN', queryId: snapshotQuery.id, revision: 3, start: 2, end: 3 }] };
  formDraft.sharing = { state: 'RESOLVED', value: false, refs: [{ kind: 'QUERY_SPAN', queryId: snapshotQuery.id, revision: 2, start: 0, end: 1 }] };
  const input = parseInputSchema.parse({
    query: { ...query, revision: 4 }, timeZone: 'Asia/Kolkata',
    trustedLocationSelections: [{ selectionId: 'saved-1', displayText: 'Home' }], formDraft,
  });
  assert.deepEqual(validateParseInputProvenance(input), [
    { code: 'INVALID_QUERY_SPAN', field: 'pickup' },
    { code: 'INVALID_QUERY_SPAN', field: 'sharing' },
  ]);
});

test('strict output validation permits carried unsupported requests beside new query requests', () => {
  const trusted = emptyDraft({ ...query, revision: 1 });
  trusted.unsupportedRequests = [{ kind: 'STOP', refs: [{ ...queryRef, revision: 1 }], candidateIds: [], reasonCode: 'NOT_SUPPORTED' }];
  const output = emptyDraft(query);
  output.unsupportedRequests = [
    { kind: 'STOP', refs: [{ kind: 'USER_FIELD', field: 'unsupportedRequests', revision: 1 }], candidateIds: [], reasonCode: 'NOT_SUPPORTED' },
    { kind: 'RENTAL', refs: [queryRef], candidateIds: [], reasonCode: 'NOT_SUPPORTED' },
  ];
  assert.deepEqual(validateDraftProvenance(output, [], trusted), []);
  output.unsupportedRequests[0] = { kind: 'RETURN_JOURNEY', refs: [{ kind: 'USER_FIELD', field: 'unsupportedRequests', revision: 1 }], candidateIds: [], reasonCode: 'NOT_SUPPORTED' };
  assert.deepEqual(validateDraftProvenance(output, [], trusted), [{ code: 'UNTRUSTED_USER_FIELD', field: 'unsupportedRequests' }]);
});
