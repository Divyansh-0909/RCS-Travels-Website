import test from 'node:test';
import assert from 'node:assert/strict';
import { Temporal } from '@js-temporal/polyfill';
import { calendarDate } from '../services/search/calendarPolicy.ts';
import { emptyDraft, SEARCH_LIMITS } from '../services/search/contracts.ts';
import { collectObservations } from '../services/search/observations.ts';
import { preserveOwnerConflicts } from '../services/search/complex/ownerConflicts.ts';
import { generateLocationCandidates } from '../services/search/locations/candidates.ts';
import { extractionRequest } from '../services/search/questions.ts';
import { excludedMention, exclusionOnlyPreference } from '../services/search/vehiclePolicy.ts';
import { buildFamilyOwnerReview } from '../benchmarks/search/familyOwnerReview.js';
import { freezeApprovedSearch } from '../benchmarks/search/freeze.js';
import { createTestClock } from './helpers/testClock.js';
import { issue } from '../services/search/fields.ts';
import { explicitTemporalSuffixBoundary } from '../services/search/locations/temporalSuffix.ts';
import { createRideSearchParser } from '../services/search/parser.ts';
import { decisionFake, bookingRouting, inputFor, expressionChoices } from './helpers/rideSearchFake.js';

const clock = createTestClock('2026-10-05T10:00:00.000Z');
test('a later bare weekday needs no same-day clock; incomplete and impossible calendar dates stay distinct', () => {
  const today = Temporal.PlainDate.from('2026-10-05');
  assert.equal(calendarDate({ kind: 'WEEKDAY', weekday: 'TUESDAY', qualifier: 'BARE' }, today), '2026-10-06');
  const date = { kind: 'ABSOLUTE', day: { state: 'RESOLVED', value: 31, refs: [] },
    month: { state: 'RESOLVED', value: 2, refs: [] }, year: { state: 'UNSPECIFIED' } };
  for (const field of ['day', 'month']) assert.equal(calendarDate({ ...date, [field]: { state: 'UNSPECIFIED' } }, today), undefined);
  assert.throws(() => calendarDate(date, today), error => error instanceof RangeError && error.message === 'INVALID_CALENDAR_DATE');
});

test('more than four conflicting times fails safely and reports the affected field', () => {
  const draft = emptyDraft({ id: 'many-times', revision: 1, text: 'at 1PM and at 2PM and at 3PM and at 4PM and at 5PM' });
  assert.deepEqual(preserveOwnerConflicts(draft, collectObservations(draft.query, [])),
    [issue('LUNA_UNSUPPORTED_FACT', 'timing.time', 'INVALID')]);
});

test('variable whitespace in conflicting pickup clocks preserves every source reference', () => {
  for (const text of ['at 6PM  and  8PM', 'at 6PM and  at 8PM', 'at 6PM and at  8PM']) {
    const draft = emptyDraft({ id: 'clock-spaces', revision: 1, text });
    const observations = collectObservations(draft.query, []);
    assert.deepEqual(preserveOwnerConflicts(draft, observations)[0].refs, observations.times.map(time => time.ref));
    assert.equal(draft.timing.time.state, 'AMBIGUOUS');
  }
});

function conditionalWithCandidates(count) {
  const text = `from X to Airport, but if my flight changes take me to Library ${' landmark'.repeat(count)}`;
  const draft = emptyDraft({ id: 'capacity', revision: 1, text });
  const matches = [...text.matchAll(/landmark/g)];
  draft.candidates = matches.map((match, i) => ({ candidateId: `landmark-${i}`, queryId: 'capacity', queryRevision: 1,
    exactText: 'landmark', start: match.index, end: match.index + 8, method: 'LABELLED_FIELD', generatorVersion: 'fixture' }));
  return draft;
}
test('conditional endpoint reuse matches both offsets, preserves full capacity, and rejects overflow', () => {
  const boundary = conditionalWithCandidates(SEARCH_LIMITS.candidates - 2);
  const result = preserveOwnerConflicts(boundary, collectObservations(boundary.query, []));
  assert.equal(boundary.candidates.length, SEARCH_LIMITS.candidates);
  assert.equal(result[0].code, 'DESTINATION_SELECTION_REQUIRED');
  assert.equal(boundary.drop.refs[0].start, boundary.query.text.indexOf('Airport'));
  assert.equal(boundary.drop.refs[0].end, boundary.query.text.indexOf('Airport') + 7);
  const overflow = conditionalWithCandidates(SEARCH_LIMITS.candidates);
  assert.deepEqual(preserveOwnerConflicts(overflow, collectObservations(overflow.query, [])), [issue('LUNA_UNSUPPORTED_FACT', 'drop', 'INVALID')]);
});

test('multi-space temporal suffixes are stripped without swallowing the endpoint', () => {
  for (const suffix of ['  tomorrow', ' tomorrow in  the evening', ' tomorrow in the  evening', '  at 7 PM', ' tomorrow at 7 PM UTC   ']) {
    const query = { id: 'suffix', revision: 1, text: `from Campus to Airport${suffix}` };
    assert.deepEqual(generateLocationCandidates(query, 'BOOKING_REQUEST').candidates.map(candidate => candidate.exactText), ['Campus', 'Airport']);
  }
});

test('provider question vocabulary preserves timing choices and date-expression meaning', () => {
  const input = { query: { id: 'questions', revision: 1, text: 'tomorrow at 7' }, timeZone: 'Asia/Kolkata', candidates: [] };
  const request = extractionRequest(input, clock.now().toISOString(), collectObservations(input.query, []));
  assert.deepEqual(request.questions.timing_mode.choices, { IMMEDIATE: 'IMMEDIATE', SCHEDULED: 'SCHEDULED', UNSPECIFIED: 'UNSPECIFIED', AMBIGUOUS: 'AMBIGUOUS' });
  assert.match(request.questions.date_expression.instructions, /pickup date components/);
});

test('explicit do-not exclusion and all-class conflict retain their exact issue semantics', () => {
  const query = { id: 'excluded', revision: 1, text: 'do not SUV' };
  const candidate = collectObservations(query, []).vehicles[0];
  assert.equal(excludedMention({ query }, candidate), true);
  const issues = []; const classes = ['hatchback', 'sedan', 'suv', 'suv_premium'];
  const value = exclusionOnlyPreference(classes, false, [candidate.ref], issues);
  assert.deepEqual(issues, [issue('VEHICLE_CONFLICT', 'vehicleClass', 'AMBIGUOUS', [candidate.ref], classes)]);
  assert.equal(value.reasonCode, 'VEHICLE_CONFLICT');
});

test('unresolved approval exceptions expose a safe explicit error code', () => {
  const review = buildFamilyOwnerReview(); review.exceptions.push({ caseId: 'unresolved' });
  assert.throws(() => freezeApprovedSearch(review, clock.now().toISOString()), /SEARCH_APPROVAL_INVALID/);
});

test('labelled destination and trailing exclusion stay separate from geography and temporal evidence', () => {
  for (const text of ['pickup: Jaypee main gate; destination: Pine Avenue; hatchback tomorrow 6 PM, no sedan',
    'Book a hatchback from Pari Chowk to Sunrise Metro tomorrow at 5 PM, no sedan']) {
    const query = { id: 'separate-clauses', revision: 1, text };
    const result = generateLocationCandidates(query, 'BOOKING_REQUEST');
    const expected = text.startsWith('pickup') ? ['Jaypee main gate', 'Pine Avenue'] : ['Pari Chowk', 'Sunrise Metro'];
    assert.deepEqual(result.candidates.map(candidate => candidate.exactText), expected);
    const observations = collectObservations(query, result.candidates);
    assert.equal(observations.dates.length, 1); assert.equal(observations.times.length, 1);
    assert.equal(excludedMention({ query }, observations.vehicles.find(vehicle => vehicle.value === 'sedan')), true);
  }
  const query = { id: 'landmark', revision: 1, text: 'from Campus to No Sedan Gallery' };
  assert.deepEqual(generateLocationCandidates(query, 'BOOKING_REQUEST').candidates.map(candidate => candidate.exactText), ['Campus', 'No Sedan Gallery']);
});

test('comma-delimited supported class exclusions preserve clauses and do not strip similarly named landmarks', () => {
  for (const exclusion of ['no hatchback', 'not sedan', 'except SUV', 'without regular SUV', "don't SUV",
    'do  not premium  SUV', 'no an SUV', 'no a sedan', 'no a   sedan', 'no   sedan', 'not suv_premium', 'no XL']) {
    const query = { id: 'tail-exclusion', revision: 1, text: `from Campus to Airport,  ${exclusion}` };
    const generated = generateLocationCandidates(query, 'BOOKING_REQUEST');
    assert.deepEqual(generated.candidates.map(candidate => candidate.exactText), ['Campus', 'Airport']);
    const observed = collectObservations(query, generated.candidates);
    assert.equal(observed.vehicles.length, 1);
    assert.equal(excludedMention({ query }, observed.vehicles[0]), true);
  }
  for (const name of ['Airport, no sedanology museum', 'Airport, nostalgia gallery', 'Airport without signs']) {
    const query = { id: 'named-landmark', revision: 1, text: `from Campus to ${name}` };
    assert.deepEqual(generateLocationCandidates(query, 'BOOKING_REQUEST').candidates.map(candidate => candidate.exactText), ['Campus', name]);
  }
});

test('zero-length endpoint after an exclusion never becomes a place and resource errors carry no usable candidates', () => {
  const query = { id: 'empty-endpoint', revision: 1, text: 'from Campus to , no sedan' };
  assert.deepEqual(generateLocationCandidates(query, 'BOOKING_REQUEST').candidates.map(candidate => candidate.exactText), ['Campus']);
  const lengthy = { ...query, text: `from ${'x'.repeat(501)} to Campus` };
  assert.deepEqual(generateLocationCandidates(lengthy, 'BOOKING_REQUEST'), { candidates: [], issues: [issue('LIMIT_EXCEEDED', 'candidates', 'INVALID')] });
  assert.deepEqual(generateLocationCandidates({ ...query, text: 'x'.repeat(SEARCH_LIMITS.queryLength + 1) }, 'LOCATION_SEARCH'),
    { candidates: [], issues: [issue('LIMIT_EXCEEDED', 'query', 'INVALID')] });
});

test('plain relative-day clocks and dayparts stay outside the endpoint without requiring at or in-the wording', () => {
  for (const suffix of ['tomorrow 7', 'tomorrow evening', 'today morning']) {
    const query = { id: 'plain-clock', revision: 1, text: `from Campus to Airport ${suffix}` };
    assert.deepEqual(generateLocationCandidates(query, 'BOOKING_REQUEST').candidates.map(candidate => candidate.exactText), ['Campus', 'Airport']);
  }
});

test('a zoned reverse-direction phrase retains leading-space offsets when stripping its time suffix', () => {
  const query = { id: 'reverse-zone', revision: 1, text: '  Airport tomorrow at 7 PM UTC jaana hai Campus se' };
  const result = generateLocationCandidates(query, 'BOOKING_REQUEST');
  assert.deepEqual(result.candidates.map(candidate => candidate.exactText), ['Airport', 'Campus']);
  assert.equal(result.candidates[0].start, 2);
  assert.equal(result.candidates[0].end, 9);
});

test('calendar and linked-clock suffix boundaries preserve landmark text and reject non-temporal tails', () => {
  for (const text of ['Airport', 'Airport evening', 'Airport at 6 PM exhibit', 'Airport at 6 PM',
    'Airport 5 December at 7 PM', 'Museum on 5 December at 7 PM exhibit',
    'Garden on Museum 5 December at 7 PM', 'Airport at 6 PM and on 5 December at 8 PM',
    'Airport at 6 PM via Garden', 'Airport at 6 PM before 8 PM',
    'Airport at 6 PM and at 8 PM before at 9 PM', 'Airport at 6 PM before and at 8 PM',
    'Airport at 6 PM and then at 8 PM'])
    assert.equal(explicitTemporalSuffixBoundary(text), undefined);
  for (const suffix of ['on 5 October 2026 at 11 PM', 'on 5 December at 7 PM',
    'on   5 December at 7 PM', 'on tomorrow at 7 PM', 'on Friday at 7 PM',
    'tomorrow at 6 PM and at 8 PM', 'at 6 PM or at 8 PM', 'at 1 PM and at 2 PM or at 3 PM and at 4 PM',
    'at 6 PM  and  at 8 PM   ', 'at 6 PM and at 8 PM',
    'day after tomorrow at 6 PM and at 8 PM']) {
    const text = `Airport ${suffix}`;
    assert.equal(text.slice(0, explicitTemporalSuffixBoundary(text)).trim(), 'Airport');
    const query = inputFor(`from Campus to ${text}`).query;
    assert.deepEqual(generateLocationCandidates(query, 'BOOKING_REQUEST').candidates.map(candidate => candidate.exactText), ['Campus', 'Airport']);
  }
  const landmark = 'Evening Gallery at 6 PM and at 8 PM';
  assert.equal(landmark.slice(0, explicitTemporalSuffixBoundary(landmark)).trim(), 'Evening Gallery');
  const namedDate = 'Museum 5 December Gate at 6 PM and at 8 PM';
  assert.equal(namedDate.slice(0, explicitTemporalSuffixBoundary(namedDate)).trim(), 'Museum 5 December Gate');
});

test('Jev SIMPLE and a chosen last clock cannot hide conflicting times inside a geographic candidate', async () => {
  const provider = decisionFake([bookingRouting, request => ({ ...expressionChoices(request), timing_mode: 'SCHEDULED',
    pickup_presence: 'PRESENT', drop_presence: 'PRESENT', role_consistency: 'CONSISTENT',
    pickup_candidate: JSON.parse(request.state).candidates.find(candidate => candidate.exactText === 'Campus').candidateId,
    drop_candidate: JSON.parse(request.state).candidates.find(candidate => candidate.exactText === 'Airport').candidateId,
    time_expression: Object.keys(request.questions.time_expression.choices).filter(id => id.startsWith('span:')).at(-1) })]);
  const parsed = await createRideSearchParser(provider, clock, generateLocationCandidates).parse(inputFor('from Campus to Airport tomorrow at 6 PM and at 8 PM'));
  assert.equal(parsed.fallbackRequired, true);
  assert.equal(parsed.draft.timing.date.value.anchor, 'TOMORROW');
  assert.equal(parsed.draft.timing.time.state, 'AMBIGUOUS');
  assert.deepEqual(parsed.draft.timing.time.alternatives.map(time => time.hour), [6, 8]);
  assert.equal(JSON.stringify(parsed.draft).includes('candidate-temporal-view'), false);
});

test('numbered location markers do not hide a following date or competing clocks', async () => {
  for (const marker of ['Gate', 'Sector', 'Block', 'Terminal', 'Platform']) {
    const destination = `Airport near ${marker} 3`;
    const query = inputFor(`from Campus to ${destination} tomorrow at 6 PM and at 8 PM`).query;
    const generated = generateLocationCandidates(query, 'BOOKING_REQUEST');
    assert.ok(generated.candidates.some(candidate => candidate.exactText === destination));
    const observations = collectObservations(query, generated.candidates);
    assert.equal(observations.dates[0].value.anchor, 'TOMORROW');
    assert.deepEqual(observations.times.map(time => time.value.hour), [6, 8]);
  }
  const destination = 'Noida Sector 62';
  const query = inputFor(`from Campus to ${destination} tomorrow at 6 PM and at 8 PM`).query;
  const provider = decisionFake([bookingRouting, request => ({ ...expressionChoices(request), timing_mode: 'SCHEDULED',
    pickup_presence: 'PRESENT', drop_presence: 'PRESENT', role_consistency: 'CONSISTENT',
    pickup_candidate: JSON.parse(request.state).candidates.find(candidate => candidate.exactText === 'Campus').candidateId,
    drop_candidate: JSON.parse(request.state).candidates.find(candidate => candidate.exactText === destination).candidateId,
    time_expression: Object.keys(request.questions.time_expression.choices).filter(id => id.startsWith('span:')).at(-1) })]);
  const parsed = await createRideSearchParser(provider, clock, generateLocationCandidates).parse({ ...inputFor(query.text), query });
  assert.equal(parsed.fallbackRequired, true);
  assert.equal(parsed.draft.timing.time.state, 'AMBIGUOUS');
  assert.deepEqual(parsed.draft.timing.time.alternatives.map(time => time.hour), [6, 8]);
  assert.equal(explicitTemporalSuffixBoundary('Airport at 3 PM tomorrow at 6 PM and at 8 PM'), undefined);
  assert.equal(explicitTemporalSuffixBoundary('Airport near Stargate 3 tomorrow at 6 PM and at 8 PM'), undefined);
  for (const name of ['Airport Gate 3 PM', 'Airport Gate at 3', 'Airport Gate entrance 3'])
    assert.equal(explicitTemporalSuffixBoundary(`${name} tomorrow at 6 PM and at 8 PM`), undefined);
  const spacedMarker = 'Airport Gate   3 tomorrow at 6 PM and at 8 PM';
  assert.equal(spacedMarker.slice(0, explicitTemporalSuffixBoundary(spacedMarker)).trim(), 'Airport Gate   3');
  assert.equal(explicitTemporalSuffixBoundary('Garden tomorrow 7 and at 8 PM'), 7);
});
