import test from 'node:test';
import assert from 'node:assert/strict';
import { Temporal } from '@js-temporal/polyfill';
import { calendarDate } from '../services/search/calendarPolicy.ts';
import { convertToBookingZone, sourceTimeZone, draftSourceTimeZone } from '../services/search/timezonePolicy.ts';
import { emptyDraft } from '../services/search/contracts.ts';
import { resolved, ambiguous } from '../services/search/fields.ts';
import { collectObservations } from '../services/search/observations.ts';
import { resolveTemporal } from '../services/search/temporal.ts';
import { statedVehicleExclusions } from '../services/search/vehiclePolicy.ts';
import { createTestClock } from './helpers/testClock.js';
import { buildFamilyOwnerReview, familyDecisionExceptions } from '../benchmarks/search/familyOwnerReview.js';
import { buildOwnerPolicyReview } from '../benchmarks/search/ownerPolicyReview.js';
import { formResolution } from '../services/search/locations/formResolution.ts';
import { createLocationReview, applyTrustedLocation, editLocationReview } from '../services/search/locations/review.ts';
import { inputFor, candidateFor, decisionFake, bookingRouting, expressionChoices } from './helpers/rideSearchFake.js';
import { createRideSearchParser } from '../services/search/parser.ts';

const clock = createTestClock('2026-10-04T12:00:00+05:30');
const today = date => Temporal.PlainDate.from(date);
const weekday = qualifier => ({ kind: 'WEEKDAY', weekday: 'FRIDAY', qualifier });
const component = value => ({ state: 'RESOLVED', value, refs: [] });
const absolute = (day, month, year) => ({ kind: 'ABSOLUTE', day: component(day), month: component(month), year: year === undefined ? { state: 'UNSPECIFIED' } : component(year) });

test('Monday-Sunday calendar rules preserve this week, next week, bare nearest and same-day ambiguity', () => {
  const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
  const thisWeek = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'];
  const nextWeek = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'];
  for (const [index, day] of days.entries()) {
    assert.equal(calendarDate({ kind: 'WEEKDAY', weekday: day, qualifier: 'THIS' }, today('2026-10-04')), thisWeek[index]);
    assert.equal(calendarDate({ kind: 'WEEKDAY', weekday: day, qualifier: 'NEXT' }, today('2026-10-04')), nextWeek[index]);
  }
  for (const [date, qualifier, time, expected] of [
    ['2026-10-04', 'THIS', undefined, '2026-10-02'], ['2026-10-04', 'NEXT', undefined, '2026-10-09'],
    ['2026-10-05', 'THIS', undefined, '2026-10-09'], ['2026-10-05', 'NEXT', undefined, '2026-10-16'],
    ['2026-10-02', 'BARE', undefined, undefined], ['2026-10-02', 'BARE', '18:00', '2026-10-02'],
    ['2026-10-02', 'BARE', '11:00', '2026-10-09'], ['2026-10-03', 'BARE', '18:00', '2026-10-09'],
  ]) assert.equal(calendarDate(weekday(qualifier), today(date), time, '12:00:00'), expected);
  assert.equal(calendarDate(weekday('BARE'), today('2026-10-02'), '18:00'), undefined);
});

test('omitted years find next valid occurrence without forcing booking eligibility; reject impossible dates', () => {
  assert.equal(calendarDate(absolute(5, 12), today('2026-10-04')), '2026-12-05');
  assert.equal(calendarDate(absolute(5, 12), today('2026-12-06')), '2027-12-05');
  assert.equal(calendarDate(absolute(29, 2), today('2096-03-01')), '2104-02-29');
  assert.throws(() => calendarDate(absolute(31, 4), today('2026-10-04')));
  assert.throws(() => calendarDate(absolute(29, 2, 2026), today('2026-10-04')));
  const missing = absolute(5, 12); missing.day = { state: 'UNSPECIFIED' };
  assert.equal(calendarDate(missing, today('2026-10-04')), undefined);
  missing.day = component(5); missing.year = { state: 'AMBIGUOUS', alternatives: [2026, 2027], refs: [], reasonCode: 'CONFLICT' };
  assert.equal(calendarDate(missing, today('2026-10-04')), undefined);
});

test('recognized zones convert calendar midnight correctly and DST folds/gaps require form selection', () => {
  const query = inputFor('tomorrow at 6 PM from UTC Tower to Campus').query;
  const draft = emptyDraft(query); draft.candidates = [candidateFor({ query }, 'UTC Tower', 'utc-landmark')];
  assert.ok(['Asia/Kolkata', 'Asia/Calcutta'].includes(draftSourceTimeZone(draft, 'Asia/Kolkata')));
  for (const modify of [c => { c.queryId = 'foreign' }, c => { c.queryRevision++ }, c => { c.exactText = 'invented' }]) {
    const invalid = structuredClone(draft); modify(invalid.candidates[0]);
    assert.equal(draftSourceTimeZone(invalid, 'Asia/Kolkata'), 'UTC');
  }
  assert.equal(sourceTimeZone('6 PM UTC from UTC Tower', 'Asia/Kolkata', [{ start: 14, end: 23 }]), 'UTC');
  assert.equal(sourceTimeZone('tomorrow 6 PM London time', 'Asia/Kolkata'), 'Europe/London');
  for (const text of ['6 PM CST', '6 PM Europe/London UTC', '6 PM Mars/Nowhere']) assert.equal(sourceTimeZone(text, 'Asia/Kolkata'), undefined);
  assert.equal(sourceTimeZone('6 PM', 'CST'), undefined);
  assert.equal(sourceTimeZone('6 PM', 'Mars/Nowhere'), undefined);
  assert.ok(['Asia/Kolkata', 'Asia/Calcutta'].includes(sourceTimeZone('6 PM IST', 'UTC')));
  assert.equal(sourceTimeZone('6 PM GMT', 'Asia/Kolkata'), 'UTC');
  for (const [time, target] of [['20:00', '00:30'], ['23:00', '03:30']]) {
    const value = convertToBookingZone('2026-10-05', time, 'Europe/London');
    assert.equal(value.localDate, '2026-10-06'); assert.equal(value.localTime, target);
    assert.equal(value.sourceDate, '2026-10-05'); assert.equal(value.sourceTime, time);
  }
  assert.throws(() => convertToBookingZone('2026-03-29', '01:30', 'Europe/London'));
  assert.throws(() => convertToBookingZone('2026-10-25', '01:30', 'Europe/London'));
});

test('bare H12 defaults to PM while precision and explicit morning/tonight remain separate', () => {
  for (const [text, period, precision] of [['at 7', 'PM', 'EXACT'], ['around 7', 'PM', 'APPROXIMATE'],
    ['7 AM', 'AM', 'EXACT'], ['7 in the morning', 'AM', 'EXACT'], ['7 tonight', 'PM', 'EXACT']]) {
    const times = collectObservations(inputFor(text).query, []).times;
    assert.equal(times.length, 1, text); assert.equal(times[0].value.period.value, period);
    assert.equal(times[0].value.precision, precision);
  }
});

test('SUV family exclusion and subtype exclusions use source wording, not positive vehicle presence', () => {
  for (const [text, values] of [['not SUV', ['suv', 'suv_premium']], ['except XL', ['suv', 'suv_premium']],
    ['not premium SUV', ['suv_premium']], ['not regular SUV', ['suv']], ['SUV only', []], ['SUV only but no SUV', ['suv', 'suv_premium']]]) {
    const draft = emptyDraft(inputFor(text).query);
    assert.deepEqual(statedVehicleExclusions(draft, collectObservations(draft.query, []).vehicles), values);
  }
});

test('owner-approved family overlay preserves original 178 labels, all spans, split and audit history', () => {
  const old = buildOwnerPolicyReview(); const next = buildFamilyOwnerReview(old);
  assert.equal(next.summary.originalDeterministicUnchanged, true); assert.equal(next.summary.familyApproved, 121);
  assert.equal(next.summary.coreHumanApproved, 320); assert.equal(next.summary.coreReviewRemaining, 0);
  assert.equal(next.summary.validation.templateFamilyLeakage, 0); assert.equal(next.summary.readyToFreeze, true);
  assert.equal(next.summary.frozen, false); assert.equal(next.summary.heldOutExecuted, false);
  assert.deepEqual(next.records.filter(r => r.cohort === 'EXPLORATORY'), old.records.filter(r => r.cohort === 'EXPLORATORY'));
  assert.equal(next.records.find(r => r.familyId === 'weekday-next').truth.expected.resolvedDate.value, '2026-10-09');
  const e = next.records.find(r => r.familyId === 'conditional-alternative').truth.expected;
  assert.equal(e.dropSpans.value.length, 2); assert.deepEqual(e.ambiguities.value, ['DESTINATION_SELECTION_REQUIRED']);
  const expected = family => next.records.filter(r => r.familyId === family).map(r => r.truth.expected);
  for (const value of expected('time-approximate')) {
    assert.equal(value.time.value.value.period, 'PM'); assert.equal(value.time.value.value.precision, 'APPROXIMATE');
    assert.deepEqual(value.ambiguities.value, ['EXACT_TIME_CONFIRMATION_REQUIRED']);
  }
  for (const value of expected('conditional-ac')) {
    assert.equal(value.complexity.value, 'SIMPLE'); assert.equal(value.fallbackExpected.value, 'NOT_REQUIRED');
    assert.equal(value.capabilityDisposition.value, 'ADVISORY_NO_AC_ENFORCEMENT');
  }
  for (const family of ['stop-via', 'stop-friend']) {
    for (const value of expected(family)) assert.equal(value.capabilityDisposition.value, 'PLANNED_PRODUCT_FEATURE');
  }
  for (const value of expected('rental-duration')) assert.equal(value.rentalDurationHours.value, 8);
  for (const value of expected('noisy-route')) {
    assert.equal(value.fallbackExpected.value, 'CONDITIONAL');
    assert.equal(value.runtimeFallbackCondition.value, 'CANDIDATE_OR_ROLE_FAILURE_ONLY');
  }
  for (const value of expected('vehicle-self-conflict')) assert.deepEqual(value.vehicle.value.excluded, ['suv', 'suv_premium']);
  for (const value of expected('conflicting-times')) {
    assert.equal(value.time.value.state, 'AMBIGUOUS');
    assert.deepEqual(value.time.value.alternatives.map(t => [t.hour, t.period, t.precision]), [[6, 'PM', 'EXACT'], [8, 'PM', 'EXACT']]);
  }
  for (const value of expected('changed-mind')) assert.equal(value.supersededDropSpans.value.length, 1);
  assert.ok(next.changes.every(change => change.fieldsChanged.length && change.reason.includes('never derived')));
  const bad = structuredClone(old); const row = bad.records.find(r => r.familyId === 'role-drop-before-from');
  [row.truth.expected.pickupSpans, row.truth.expected.dropSpans] = [row.truth.expected.dropSpans, row.truth.expected.pickupSpans];
  assert.ok(familyDecisionExceptions(row).length); assert.equal(buildFamilyOwnerReview(bad).summary.readyToFreeze, false);
});

test('form readiness requires grounded endpoints, valid timing, recomputed fare/route and explicit review; edits invalidate', async () => {
  const parser = createRideSearchParser(decisionFake([bookingRouting, request => ({ ...expressionChoices(request), timing_mode: 'IMMEDIATE', vehicle_class: 'sedan', vehicle_strength: 'REQUIRED' })]), clock);
  const parsed = await parser.parse(inputFor('sedan cab now'));
  let review = createLocationReview(parsed, clock.now(), 'Asia/Kolkata');
  assert.equal(formResolution(review, clock).submissionAllowed, false);
  const place = id => ({ selectionId: id, source: 'USER_SELECTED_SAVED_PLACE', lat: 28, lng: id === 'p' ? 77 : 78,
    displayText: id, confirmedByUser: 'selection', confirmedAt: clock.now().toISOString() });
  review = applyTrustedLocation(review, 'pickup', place('p')); review = applyTrustedLocation(review, 'drop', place('d'));
  review.derived = { fareQuote: 'quote', route: 'route', locationConfirmation: null, reviewConfirmation: null };
  assert.equal(formResolution(review, clock).state, 'READY_FOR_REVIEW');
  review.derived.locationConfirmation = 'selected'; review.derived.reviewConfirmation = 'explicit-form-review';
  assert.equal(formResolution(review, clock).submissionAllowed, true);
  assert.equal(formResolution(editLocationReview(review, 'vehicleClass', { state: 'RESOLVED', value: 'suv', strength: 'REQUIRED', excluded: [], refs: [] }), clock).submissionAllowed, false);
});

test('temporal conflicts and ambiguous zones remain form requirements and understood distant dates remain visible', () => {
  const query = inputFor('5 December at 7').query; const refs = [{ kind: 'QUERY_SPAN', queryId: query.id, revision: query.revision, start: 0, end: query.text.length }];
  const draft = emptyDraft(query); draft.timing = { mode: 'SCHEDULED', refs,
    date: resolved(absolute(5, 12), refs), time: resolved({ kind: 'CLOCK', hour: 7, notation: 'H12', minute: resolved(0, refs), period: { state: 'UNSPECIFIED' }, precision: 'EXACT' }, refs) };
  const result = resolveTemporal(draft, clock.now(), 'Asia/Kolkata');
  assert.equal(result.localDate, '2026-12-05'); assert.equal(result.localTime, '19:00');
  assert.deepEqual(result.issues.map(i => i.code), ['SCHEDULE_TOO_FAR']);
  draft.query.text += ' CST'; assert.equal(resolveTemporal(draft, clock.now(), 'Asia/Kolkata').issues[0].code, 'TIMEZONE_SELECTION_REQUIRED');
  draft.query = { ...query, text: '5 December at 7' }; draft.timing.time.value.period = ambiguous(['AM', 'PM'], 'CONFLICT', refs);
  assert.equal(resolveTemporal(draft, clock.now(), 'Asia/Kolkata').issues[0].code, 'TIME_SELECTION_REQUIRED');
});
