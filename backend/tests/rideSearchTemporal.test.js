import test from 'node:test';
import assert from 'node:assert/strict';
import { createRideSearchParser } from '../services/search/parser.ts';
import { resolveTemporal } from '../services/search/temporal.ts';
import { collectObservations } from '../services/search/observations.ts';
import { emptyDraft } from '../services/search/contracts.ts';
import { resolved, unspecified } from '../services/search/fields.ts';
import { parseScheduleTime } from '../lib/scheduling.js';
import { createTestClock } from './helpers/testClock.js';
import { bookingRouting, decisionFake, expressionChoices, inputFor } from './helpers/rideSearchFake.js';
import { assertSearchResult } from './helpers/rideSearchAssertions.js';

async function parseAt(text, now, timeZone = 'Asia/Kolkata') {
  const clock = createTestClock(now);
  const provider = decisionFake([bookingRouting, request => ({ ...expressionChoices(request), timing_mode: 'SCHEDULED' })]);
  const input = { ...inputFor(text), timeZone };
  const result = await createRideSearchParser(provider, clock).parse(input);
  assertSearchResult(result, input);
  return result;
}

test('relative dates use controlled local midnight, month, year and leap boundaries', async () => {
  for (const [now, query, expected] of [
    ['2026-10-02T23:59:59+05:30', 'tomorrow', '2026-10-03'],
    ['2026-10-03T00:00:00+05:30', 'today', '2026-10-03'],
    ['2026-10-31T23:59:59+05:30', 'tomorrow', '2026-11-01'],
    ['2026-12-31T23:59:59+05:30', 'tomorrow', '2027-01-01'],
    ['2028-02-28T23:59:59+05:30', 'tomorrow', '2028-02-29'],
    ['2028-02-28T00:00:00+05:30', 'day after tomorrow', '2028-03-01'],
    ['2026-10-02T12:00:00+05:30', 'tonight', '2026-10-02'],
  ]) {
    const result = await parseAt(query, now);
    assert.equal(result.temporal.localDate, expected, query);
    assert.equal(result.temporal.scheduledAt, undefined);
    assert.equal(result.fallbackRequired, false);
  }
});

test('absolute date components preserve formats and reject impossible calendar days', async () => {
  for (const text of ['2026-10-03 at 6 PM', '3/10/2026 at 6 PM', '3 October 2026 at 6 PM', 'October 3, 2026 at 6 PM']) {
    const result = await parseAt(text, '2026-10-02T12:00:00+05:30');
    assert.equal(result.temporal.localDate, '2026-10-03', text);
    assert.equal(result.temporal.localTime, '18:00', text);
    assert.equal(result.temporal.scheduledAt, '2026-10-03T12:30:00.000Z', text);
  }
  const leap = await parseAt('29 February 2028 at 7 AM', '2028-02-28T12:00:00+05:30');
  assert.equal(leap.temporal.localDate, '2028-02-29');
  for (const date of ['2026-02-29', '2026-04-31']) {
    const result = await parseAt(`${date} at 6 PM`, '2026-02-27T12:00:00+05:30');
    assert.equal(result.temporal.scheduledAt, undefined);
    assert.ok(result.issues.some(value => value.code === 'TEMPORAL_CONFLICT'));
  }
});

test('owner rules resolve omitted years and Monday-Sunday weekday qualifiers independently of the booking window', async () => {
  for (const [text, date] of [['5 December', '2026-12-05'], ['Dec 5', '2026-12-05'], ['Friday', undefined], ['this Friday', '2026-10-02'], ['next Friday', '2026-10-09']]) {
    const result = await parseAt(text, '2026-10-02T12:00:00+05:30');
    assert.equal(result.fallbackRequired, false, text);
    assert.equal(result.temporal.localDate, date, text);
    assert.equal(result.issues.some(value => value.code === 'DATE_POLICY_CLARIFICATION_REQUIRED'), false);
  }
  const next = await parseAt('next Friday', '2026-10-02T12:00:00+05:30');
  assert.deepEqual(next.draft.timing.date.value, { kind: 'WEEKDAY', weekday: 'FRIDAY', qualifier: 'NEXT' });
  const zone = await parseAt('tomorrow at 6 PM', '2026-10-02T12:00:00+05:30', 'Europe/London');
  assert.equal(zone.temporal.localDate, '2026-10-03');
  assert.equal(zone.temporal.localTime, '22:30');
  assert.equal(zone.temporal.scheduledAt, '2026-10-03T17:00:00.000Z');
});

test('scheduling reuses strictly-over-30-minutes and inclusive-168-hours backend bounds', async () => {
  for (const [text, expected, error] of [
    ['2026-10-02 at 12:29', undefined, 'SCHEDULE_TOO_SOON'],
    ['2026-10-02 at 12:30', undefined, 'SCHEDULE_TOO_SOON'],
    ['2026-10-02 at 12:31', '2026-10-02T07:01:00.000Z'],
    ['2026-10-09 at 12:00', '2026-10-09T06:30:00.000Z'],
    ['2026-10-09 at 12:01', undefined, 'SCHEDULE_TOO_FAR'],
  ]) {
    const result = await parseAt(text, '2026-10-02T12:00:00+05:30');
    assert.equal(result.temporal.scheduledAt, expected, text);
    if (error) assert.ok(result.issues.some(value => value.code === error));
  }
});

test('AM/PM midnight/noon, daypart, approximate and absent period do not invent time', async () => {
  for (const [text, expected] of [['12 AM', '00:00'], ['12 PM', '12:00'], ['0:00', '00:00'], ['23:59', '23:59'],
    ['6 in the morning', '06:00'], ['6 in the afternoon', '18:00'], ['6', '18:00']]) {
    const result = await parseAt(text, '2026-10-02T12:00:00+05:30');
    assert.equal(result.temporal.localTime, expected, text);
  }
  for (const text of ['morning', 'afternoon', 'night', 'around 7 PM']) {
    const result = await parseAt(text, '2026-10-02T12:00:00+05:30');
    assert.equal(result.temporal.localTime, undefined, text);
    assert.equal(result.temporal.scheduledAt, undefined);
    assert.equal(result.fallbackRequired, false);
  }
  for (const text of ['0 AM', '13 PM', '24:00', '6:60 PM']) {
    const result = await parseAt(text, '2026-10-02T12:00:00+05:30');
    assert.equal(result.fallbackRequired, true, text);
    assert.equal(result.temporal, undefined);
    assert.equal(result.draft.timing.mode, 'UNSPECIFIED');
  }
});

test('conflicting expressions cannot be reduced to whichever candidate the provider selected', async () => {
  for (const text of ['tomorrow or today at 6 PM', 'tomorrow at 6 PM or 7 PM']) {
    const result = await parseAt(text, '2026-10-02T12:00:00+05:30');
    assert.equal(result.fallbackRequired, true);
    assert.equal(result.temporal.scheduledAt, undefined);
    assert.ok(result.issues.some(value => value.code === 'EXTRACTION_BINDING_UNRESOLVED'));
  }
});

test('incomplete absolute/time components remain incomplete even in valid shared drafts', () => {
  const query = inputFor('5 December at 6').query;
  const refs = [{ kind: 'QUERY_SPAN', queryId: query.id, revision: query.revision, start: 0, end: query.text.length }];
  const draft = emptyDraft(query);
  draft.timing = { mode: 'SCHEDULED', refs, date: resolved({ kind: 'ABSOLUTE', day: unspecified(), month: resolved(12, refs), year: resolved(2026, refs) }, refs),
    time: resolved({ kind: 'CLOCK', hour: 6, minute: unspecified(), notation: 'H12', period: resolved('PM', refs), precision: 'EXACT' }, refs) };
  const result = resolveTemporal(draft, createTestClock('2026-10-02T12:00:00+05:30').now(), 'Asia/Calcutta');
  assert.deepEqual(result.issues.map(value => value.code), ['DATE_COMPONENT_REQUIRED', 'TIME_MINUTE_REQUIRED']);
  assert.equal(result.scheduledAt, undefined);
});

test('shared scheduling helper rejects invalid clock syntax and preserves legacy error semantics', () => {
  const now = createTestClock('2026-10-02T12:00:00+05:30').now();
  for (const time of ['noon', '24:00', '12:60', 'prefix12:00', '12:00suffix']) assert.equal(parseScheduleTime('2026-10-03', time, now), null);
  assert.deepEqual(parseScheduleTime('2026-10-02', '12:30', now), { error: 'too_soon' });
  assert.deepEqual(parseScheduleTime('2026-10-09', '12:01', now), { error: 'too_far' });
  assert.equal(parseScheduleTime('2026-10-03', '18:00', now).value, '2026-10-03T12:30:00.000Z');
  assert.deepEqual(parseScheduleTime('2026-10-03', '23:59', now), { value: '2026-10-03T18:29:00.000Z', label: '3 Oct 2026, 11:59 pm' });
  assert.equal(parseScheduleTime('2026-10-03', '6:00', now).value, '2026-10-03T00:30:00.000Z');
});

test('location spans containing dates, counts or vehicle words do not become booking facts', () => {
  const input = inputFor('SUV Gate 6 at 18:00 tomorrow for 3 people');
  const candidate = { start: 0, end: input.query.text.length };
  const observations = collectObservations(input.query, [candidate]);
  assert.deepEqual(observations.vehicles, []);
  assert.deepEqual(observations.dates, []);
  assert.deepEqual(observations.times, []);
  assert.deepEqual(observations.passengers, []);
});
