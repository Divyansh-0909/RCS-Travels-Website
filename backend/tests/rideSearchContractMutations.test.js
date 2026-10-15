import assert from 'node:assert/strict';
import test from 'node:test';
import { VEHICLE_CLASS_NAMES } from '../constants/vehicles.js';
import { bookingDraftSchema, emptyDraft, parseInputSchema, vehicleClassSchema } from '../services/search/contracts.ts';
import { validateDraftProvenance, validateParseInputProvenance } from '../services/search/provenance.ts';

const query = { id: 'current', revision: 3, text: 'A😀B' };
const span = { kind: 'QUERY_SPAN', queryId: query.id, revision: query.revision, start: 0, end: 1 };
const stated = (value, refs = [span]) => ({ state: 'RESOLVED', value, refs });
const unsettled = { state: 'UNSPECIFIED' };
const userRef = (field, revision = 2) => ({ kind: 'USER_FIELD', field, revision });

function candidate(start = 0, end = 1, candidateId = 'place-a', source = query) {
  return { candidateId, queryId: source.id, queryRevision: source.revision, exactText: source.text.slice(start, end),
    start, end, method: 'DIRECTIONAL_CLAUSE', generatorVersion: 'fixture-v1' };
}

function input(candidates = [], source = query) {
  return { query: source, candidates, timeZone: 'Asia/Kolkata' };
}

function clock(notation, hour, minute = unsettled, period = unsettled) {
  return { kind: 'CLOCK', notation, hour, minute, period, precision: 'EXACT' };
}

function timed(value) {
  const draft = emptyDraft(query);
  draft.timing.time = stated(value);
  return draft;
}

test('all five S1 candidate methods retain primary and additional detection evidence', () => {
  const methods = ['WHOLE_LOCATION_QUERY', 'DIRECTIONAL_CLAUSE', 'LABELLED_FIELD', 'OVERLAPPING_ALTERNATIVE', 'LUNA_SOURCE_SPAN'];
  for (const method of methods) {
    const value = { ...candidate(), method, alsoDetectedBy: methods, normalizedText: 'a' };
    assert.deepEqual(parseInputSchema.parse(input([value])).candidates, [value]);
  }
  for (const candidateId of ['NONE_OR_UNCLEAR', 'NONE', 'UNCLEAR']) {
    assert.equal(parseInputSchema.safeParse(input([candidate(0, 1, candidateId)])).success, false, candidateId);
  }
  assert.equal(parseInputSchema.safeParse(input([{ ...candidate(), alsoDetectedBy: [''] }])).success, false);
});

test('the pure contract matches the existing wire vehicle classes and preserves exclusion states', () => {
  assert.deepEqual(vehicleClassSchema.options, VEHICLE_CLASS_NAMES);
  const draft = emptyDraft(query);
  for (const excluded of [[], ['sedan'], ['sedan', 'suv']]) {
    draft.vehicleClass = { state: 'EXCLUDED', excluded, refs: [span] };
    assert.equal(bookingDraftSchema.safeParse(draft).success, excluded.length > 0);
  }
  draft.vehicleClass = { state: 'EXPLICIT_ANY', excluded: [], refs: [span] };
  assert.equal(bookingDraftSchema.safeParse(draft).success, true);
  draft.vehicleClass = { state: 'AMBIGUOUS', alternatives: ['suv'], reasonCode: 'CONFLICT', refs: [span] };
  assert.equal(bookingDraftSchema.safeParse(draft).success, true);
});

test('weekday qualifiers and every unsupported kind survive the shared draft contract', () => {
  const draft = emptyDraft(query);
  for (const weekday of ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']) {
    for (const qualifier of ['BARE', 'THIS', 'NEXT']) {
      draft.timing.date = stated({ kind: 'WEEKDAY', weekday, qualifier });
      assert.equal(bookingDraftSchema.safeParse(draft).success, true, `${qualifier} ${weekday}`);
    }
  }
  draft.unsupportedRequests = ['PASSENGER_COUNT', 'STOP', 'RETURN_JOURNEY', 'RENTAL', 'AC_PREFERENCE', 'CONDITIONAL_PREFERENCE', 'OTHER']
    .map(kind => ({ kind, refs: [span], candidateIds: [], reasonCode: 'UNSUPPORTED' }));
  assert.deepEqual(bookingDraftSchema.parse(draft).unsupportedRequests, draft.unsupportedRequests);
});

test('clock hour boundaries are inclusive only within the declared notation', () => {
  const cases = [['H12', 0, false], ['H12', 1, true], ['H12', 12, true], ['H12', 13, false],
    ['H12', 23, false], ['H24', -1, false], ['H24', 0, true], ['H24', 23, true], ['H24', 24, false]];
  for (const [notation, hour, expected] of cases) {
    assert.equal(bookingDraftSchema.safeParse(timed(clock(notation, hour))).success, expected, `${notation} ${hour}`);
  }
  for (const hour of [1.5, Infinity, NaN]) assert.equal(bookingDraftSchema.safeParse(timed(clock('H12', hour))).success, false);
  for (const minute of [-1, 0, 59, 60]) {
    assert.equal(bookingDraftSchema.safeParse(timed(clock('H24', 23, stated(minute)))).success, minute === 0 || minute === 59);
  }
  const ambiguousPeriod = { state: 'AMBIGUOUS', alternatives: ['AM', 'PM'], reasonCode: 'PERIOD_UNCLEAR', refs: [span] };
  assert.equal(bookingDraftSchema.safeParse(timed(clock('H12', 1, unsettled, ambiguousPeriod))).success, true);
  assert.equal(bookingDraftSchema.safeParse(timed(clock('H24', 1, unsettled, ambiguousPeriod))).success, false);
});

test('stated timing mode needs its own evidence even when clock and date are valid', () => {
  const draft = timed(clock('H12', 6));
  for (const mode of ['IMMEDIATE', 'SCHEDULED', 'AMBIGUOUS']) {
    draft.timing.mode = mode;
    assert.equal(bookingDraftSchema.safeParse(draft).success, false, mode);
    draft.timing.refs = [span];
    assert.equal(bookingDraftSchema.safeParse(draft).success, true, mode);
    draft.timing.refs = [];
  }
  draft.timing.mode = 'UNSPECIFIED';
  assert.equal(bookingDraftSchema.safeParse(draft).success, true);
});

test('absolute date components and ambiguous alternatives remain bounded without calendar guesses', () => {
  const draft = emptyDraft(query);
  const absolute = { kind: 'ABSOLUTE', day: unsettled, month: unsettled, year: unsettled };
  for (const [field, valid, invalid] of [['day', [1, 31], [0, 32]], ['month', [1, 12], [0, 13]], ['year', [1, 9999], [0, 10000]]]) {
    for (const value of valid) {
      draft.timing.date = stated({ ...absolute, [field]: stated(value) });
      assert.equal(bookingDraftSchema.safeParse(draft).success, true);
    }
    for (const value of invalid) {
      draft.timing.date = stated({ ...absolute, [field]: stated(value) });
      assert.equal(bookingDraftSchema.safeParse(draft).success, false);
    }
  }
  draft.timing.date = unsettled;
  for (const alternatives of [[], [1], [1, 2, 3, 4], [1, 2, 3, 4, 5], [1, 1]]) {
    draft.passengers = { state: 'AMBIGUOUS', alternatives, refs: [span], reasonCode: 'COUNT_CONFLICT' };
    assert.equal(bookingDraftSchema.safeParse(draft).success, alternatives.length === 1 || alternatives.length === 4);
  }
});

test('candidate UTF-16 validation accepts whole pairs and rejects only pair splits', () => {
  for (const [start, end] of [[0, 1], [1, 3], [3, 4], [0, 4]]) {
    assert.equal(parseInputSchema.safeParse(input([candidate(start, end)])).success, true, `${start}:${end}`);
  }
  for (const [start, end] of [[2, 3], [1, 2], [0, 2]]) {
    assert.equal(parseInputSchema.safeParse(input([candidate(start, end)])).success, false, `${start}:${end}`);
  }
  for (const text of ['A\udc00B', 'A\ud800B', '\udc00B', 'A\ud800']) {
    const source = { ...query, text };
    for (const [start, end] of [[0, 1], [1, 2], [0, text.length]]) {
      assert.equal(parseInputSchema.safeParse(input([candidate(start, end, 'lone-unit', source)], source)).success, true);
    }
  }
});

test('candidate bounds cannot be disguised by JavaScript slice clamping', () => {
  for (const [start, end] of [[0, 5], [4, 5], [1, 1], [3, 1]]) {
    const value = { ...candidate(start, end), exactText: query.text.slice(start, end) || 'A' };
    assert.equal(parseInputSchema.safeParse(input([value])).success, false, `${start}:${end}`);
  }
});

test('aggregate candidate text accepts cap minus one and the cap in both input and draft', () => {
  const source = { ...query, text: 'x'.repeat(2000) };
  for (const [lengths, expected] of [[[2000, 2000, 2000, 1999], true], [[2000, 2000, 2000, 2000], true], [[2000, 2000, 2000, 2000, 1], false]]) {
    const candidates = lengths.map((end, index) => candidate(0, end, `overlap-${index}`, source));
    const parsed = parseInputSchema.safeParse(input(candidates, source));
    assert.equal(parsed.success, expected);
    if (!expected) assert.equal(parsed.error.issues.some(issue => issue.code === 'too_big'), true);
    const draft = emptyDraft(source);
    draft.candidates = candidates;
    assert.equal(bookingDraftSchema.safeParse(draft).success, expected);
    assert.equal(validateDraftProvenance(draft).length === 0, expected);
  }
});

test('source span provenance checks nonempty bounds and complete UTF-16 pairs independently', () => {
  for (const [start, end] of [[0, 1], [1, 3], [3, 4], [0, 4]]) {
    const draft = emptyDraft(query);
    draft.passengers = stated(1, [{ ...span, start, end }]);
    assert.deepEqual(validateDraftProvenance(draft), []);
  }
  const invalidRefs = [{ ...span, queryId: 'other' }, { ...span, revision: 2 }, { ...span, start: 1, end: 1 },
    { ...span, start: 0, end: 5 }, { ...span, start: 2, end: 3 }, { ...span, start: 1, end: 2 }];
  for (const ref of invalidRefs) {
    const draft = emptyDraft(query);
    draft.passengers = stated(1, [ref]);
    assert.deepEqual(validateDraftProvenance(draft), [{ code: 'INVALID_QUERY_SPAN', field: 'passengers' }]);
  }
  for (const text of ['A\udc00B', 'A\ud800B']) {
    const draft = emptyDraft({ ...query, text });
    draft.passengers = stated(1, [{ ...span, start: 1, end: 2 }]);
    assert.deepEqual(validateDraftProvenance(draft), []);
  }
});

test('USER_FIELD requires both exact owner and revision even when two flags have identical values', () => {
  const trusted = emptyDraft({ ...query, revision: 2 });
  trusted.sharing = stated(false);
  trusted.needsCarrier = stated(false);
  const output = emptyDraft(query);
  output.sharing = stated(false, [userRef('sharing')]);
  assert.deepEqual(validateDraftProvenance(output, [], trusted), []);
  for (const ref of [userRef('needsCarrier'), userRef('sharing', 1), userRef('sharing', 3)]) {
    output.sharing.refs = [ref];
    assert.deepEqual(validateDraftProvenance(output, [], trusted), [{ code: 'UNTRUSTED_USER_FIELD', field: 'sharing' }]);
  }
  output.sharing.refs = [userRef('sharing')];
  assert.deepEqual(validateDraftProvenance(output), [{ code: 'UNTRUSTED_USER_FIELD', field: 'sharing' }]);
});

test('semantic trusted equality ignores ref replacement and object key order but preserves payload', () => {
  const trusted = emptyDraft({ ...query, revision: 2 });
  trusted.vehicleClass = { state: 'RESOLVED', value: 'suv', strength: 'PREFERRED', excluded: ['sedan'], refs: [span] };
  const output = emptyDraft(query);
  output.vehicleClass = { excluded: ['sedan'], strength: 'PREFERRED', value: 'suv', state: 'RESOLVED', refs: [userRef('vehicleClass')] };
  assert.deepEqual(validateDraftProvenance(output, [], trusted), []);
  for (const patch of [{ strength: 'REQUIRED' }, { value: 'hatchback' }, { excluded: [] }]) {
    const forged = structuredClone(output);
    Object.assign(forged.vehicleClass, patch);
    assert.deepEqual(validateDraftProvenance(forged, [], trusted), [{ code: 'UNTRUSTED_USER_FIELD', field: 'vehicleClass' }]);
  }
});

test('unsupported carry accepts a trusted subset plus new requests and rejects altered payload', () => {
  const trusted = emptyDraft({ ...query, revision: 2 });
  trusted.unsupportedRequests = ['STOP', 'RENTAL'].map(kind => ({ kind, refs: [span], candidateIds: [], reasonCode: 'UNSUPPORTED' }));
  const output = emptyDraft(query);
  output.candidates = [candidate(), candidate(3, 4, 'place-b')];
  const carried = { ...trusted.unsupportedRequests[1], refs: [userRef('unsupportedRequests')] };
  const observed = { kind: 'STOP', refs: [span], candidateIds: ['place-a'], reasonCode: 'UNSUPPORTED' };
  output.unsupportedRequests = [carried, observed];
  assert.deepEqual(validateDraftProvenance(output, [], trusted), []);
  for (const patch of [{ kind: 'OTHER' }, { reasonCode: 'INVENTED' }, { candidateIds: ['place-a'] }]) {
    output.unsupportedRequests = [{ ...carried, ...patch }, observed];
    assert.deepEqual(validateDraftProvenance(output, [], trusted), [{ code: 'UNTRUSTED_USER_FIELD', field: 'unsupportedRequests' }]);
  }
  output.unsupportedRequests = [{ ...observed, candidateIds: ['missing'] }];
  assert.deepEqual(validateDraftProvenance(output), [{ code: 'UNKNOWN_CANDIDATE', field: 'unsupportedRequests' }]);
});

test('each boolean flag and advisory count validates its own evidence and preserves false', () => {
  for (const [field, value] of [['sharing', false], ['isOutstation', false], ['preferSafeRoute', false], ['needsCarrier', false], ['passengers', 1]]) {
    const draft = emptyDraft(query);
    draft[field] = stated(value);
    assert.deepEqual(validateDraftProvenance(draft), []);
    draft[field].refs = [{ ...span, revision: 2 }];
    assert.deepEqual(validateDraftProvenance(draft), [{ code: 'INVALID_QUERY_SPAN', field }]);
  }
});

test('all location roles check candidate membership and every alternative selection', () => {
  const selections = [{ selectionId: 'saved', displayText: 'Home' }];
  for (const field of ['locationSearch', 'pickup', 'drop']) {
    const draft = emptyDraft(query);
    draft.candidates = [candidate()];
    draft[field] = stated({ kind: 'QUERY_CANDIDATE', candidateId: 'place-a' });
    assert.deepEqual(validateDraftProvenance(draft), []);
    draft[field].refs = [{ ...span, revision: 2 }];
    assert.deepEqual(validateDraftProvenance(draft), [{ code: 'INVALID_QUERY_SPAN', field }]);
    draft[field] = { state: 'AMBIGUOUS', alternatives: [{ kind: 'QUERY_CANDIDATE', candidateId: 'place-a' },
      { kind: 'USER_SELECTION', selectionId: 'saved' }], refs: [span], reasonCode: 'ROLE_UNCLEAR' };
    assert.deepEqual(validateDraftProvenance(draft, selections), []);
    draft[field].alternatives[1].selectionId = 'forged';
    assert.deepEqual(validateDraftProvenance(draft, selections), [{ code: 'UNTRUSTED_LOCATION_SELECTION', field }]);
    draft[field] = stated({ kind: 'QUERY_CANDIDATE', candidateId: 'missing' });
    assert.deepEqual(validateDraftProvenance(draft), [{ code: 'UNKNOWN_CANDIDATE', field }]);
  }
});

test('carried timing cannot change its mode, clock precision, or ambiguous reason', () => {
  const trusted = timed(clock('H12', 6));
  trusted.query = { ...query, revision: 2 };
  const oldSpan = { ...span, revision: 2 };
  trusted.timing.refs = [oldSpan];
  trusted.timing.time.refs = [oldSpan];
  trusted.timing.mode = 'SCHEDULED';
  const output = structuredClone(trusted);
  output.query = { ...query, revision: 3 };
  output.timing.refs = [userRef('timing')];
  output.timing.time.refs = [userRef('timing')];
  assert.deepEqual(validateDraftProvenance(output, [], trusted), []);
  for (const mode of ['IMMEDIATE', 'AMBIGUOUS']) {
    const forged = structuredClone(output);
    forged.timing.mode = mode;
    const issues = validateDraftProvenance(forged, [], trusted);
    assert.equal(issues.every(issue => issue.code === 'UNTRUSTED_USER_FIELD' && issue.field === 'timing'), true);
    assert.equal(issues.length > 0, true);
  }
  const forged = structuredClone(output);
  forged.timing.time.value.precision = 'APPROXIMATE';
  assert.equal(validateDraftProvenance(forged, [], trusted).some(issue => issue.code === 'UNTRUSTED_USER_FIELD' && issue.field === 'timing'), true);
  trusted.sharing = { state: 'AMBIGUOUS', alternatives: [true, false], reasonCode: 'CONFLICT', refs: [oldSpan] };
  output.sharing = { ...trusted.sharing, refs: [userRef('sharing')], reasonCode: 'INVENTED' };
  assert.equal(validateDraftProvenance(output, [], trusted).some(issue => issue.code === 'UNTRUSTED_USER_FIELD' && issue.field === 'sharing'), true);
});

test('every nested absolute date and clock component traverses refs in resolved and ambiguous expressions', () => {
  const invalid = { ...span, revision: 2 };
  const date = { kind: 'ABSOLUTE', day: stated(3), month: stated(10), year: stated(2026) };
  const time = clock('H12', 6, stated(0), stated('PM'));
  for (const [role, expression, fields] of [['date', date, ['day', 'month', 'year']], ['time', time, ['minute', 'period']]]) {
    for (const state of ['RESOLVED', 'AMBIGUOUS']) {
      for (const field of fields) {
        const draft = emptyDraft(query);
        const value = structuredClone(expression);
        draft.timing[role] = state === 'RESOLVED' ? stated(value)
          : { state, alternatives: [value], reasonCode: 'CONFLICT', refs: [span] };
        assert.deepEqual(validateDraftProvenance(draft), []);
        value[field].refs = [invalid];
        assert.deepEqual(validateDraftProvenance(draft), [{ code: 'INVALID_QUERY_SPAN', field: 'timing' }]);
      }
    }
  }
});

test('authoritative snapshots accept current and past USER_FIELD refs only for the owning field', () => {
  for (const revision of [0, 2, 3]) {
    const formDraft = emptyDraft(query);
    formDraft.sharing = stated(false, [userRef('sharing', revision)]);
    const parsed = parseInputSchema.parse({ ...input(), query: { ...query, revision: 4 }, formDraft });
    assert.deepEqual(validateParseInputProvenance(parsed), []);
    formDraft.sharing.refs = [userRef('needsCarrier', revision)];
    assert.deepEqual(validateParseInputProvenance({ ...parsed, formDraft }), [{ code: 'UNTRUSTED_USER_FIELD', field: 'sharing' }]);
  }
});
