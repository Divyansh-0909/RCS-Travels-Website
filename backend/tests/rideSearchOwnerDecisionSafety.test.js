import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { emptyDraft } from '../services/search/contracts.ts';
import { resolved, queryRef } from '../services/search/fields.ts';
import { resolveTemporal } from '../services/search/temporal.ts';
import { preserveOwnerConflicts } from '../services/search/complex/ownerConflicts.ts';
import { validateLunaEvidence } from '../services/search/complex/evidence.ts';
import { collectObservations } from '../services/search/observations.ts';
import { buildOwnerPolicyReview } from '../benchmarks/search/ownerPolicyReview.js';
import { familyDecisionExceptions, buildFamilyOwnerReview } from '../benchmarks/search/familyOwnerReview.js';
import { verifyFamilyDefinition } from '../benchmarks/search/familyDefinitionProof.js';
import { createTestClock } from './helpers/testClock.js';
import { inputFor, candidateFor, bookingRouting, decisionFake, expressionChoices } from './helpers/rideSearchFake.js';
import { createRideSearchParser } from '../services/search/parser.ts';
import { formResolution } from '../services/search/locations/formResolution.ts';
import { createLocationReview } from '../services/search/locations/review.ts';
import { generateLocationCandidates } from '../services/search/locations/candidates.ts';

const clock = createTestClock('2026-10-04T12:00:00+05:30');

test('approximate clock suffixes remain time expressions instead of being swallowed into destination candidates', async () => {
  for (const suffix of ['around 7', 'about 7', 'tomorrow around 7 PM', 'tomorrow about 7 PM']) {
    const input = inputFor(`from Campus to Airport ${suffix}`);
    assert.deepEqual(generateLocationCandidates(input.query, 'BOOKING_REQUEST').candidates.map(c => c.exactText), ['Campus', 'Airport']);
  }
  for (const name of ['Museum around 7 exhibit', 'Park about 7 sculptures', 'Tomorrow Gallery']) {
    const query = inputFor(`from Campus to ${name}`).query;
    assert.deepEqual(generateLocationCandidates(query, 'BOOKING_REQUEST').candidates.map(c => c.exactText), ['Campus', name]);
  }
  const input = inputFor('prefer suv tomorrow from Demo Junction to Demo Park around 7');
  const provider = decisionFake([bookingRouting, request => ({ ...expressionChoices(request), vehicle_class: 'suv', vehicle_strength: 'PREFERRED',
    timing_mode: 'SCHEDULED', pickup_presence: 'PRESENT', drop_presence: 'PRESENT', role_consistency: 'CONSISTENT',
    pickup_candidate: Object.keys(request.questions.pickup_candidate.choices)[0],
    drop_candidate: Object.keys(request.questions.drop_candidate.choices)[1] })]);
  const result = await createRideSearchParser(provider, clock, generateLocationCandidates).parse(input);
  assert.equal(result.fallbackRequired, false); assert.equal(result.draft.timing.time.state, 'RESOLVED');
  assert.equal(result.draft.timing.time.value.period.value, 'PM');
  assert.equal(result.draft.timing.time.value.precision, 'APPROXIMATE');
  assert.ok(result.issues.some(i => i.code === 'EXACT_TIME_CONFIRMATION_REQUIRED'));
  assert.ok(!result.issues.some(i => i.code === 'TIME_REQUIRED'));
});
const refs = draft => [queryRef(draft.query, 0, draft.query.text.length)];

test('Luna cannot select a competing explicit pickup time or flatten conditional destinations', () => {
  const time = emptyDraft(inputFor('tomorrow at 6 PM and at 8 PM').query);
  const obs = collectObservations(time.query, []);
  time.timing.time = resolved(obs.times[0].value, [obs.times[0].ref]);
  assert.equal(preserveOwnerConflicts(time, obs)[0].code, 'TIME_SELECTION_REQUIRED');
  assert.equal(time.timing.time.state, 'AMBIGUOUS'); assert.deepEqual(time.timing.time.alternatives.map(t => t.hour), [6, 8]);
  const many = emptyDraft(inputFor('at 1 PM and at 2 PM and at 3 PM and at 4 PM and at 5 PM').query);
  assert.equal(preserveOwnerConflicts(many, collectObservations(many.query, []))[0].category, 'INVALID');
  const text = 'from college to airport, but if my flight changes take me to Pari Chowk';
  const route = emptyDraft(inputFor(text).query);
  route.candidates = [candidateFor(inputFor(text), 'airport', 'airport')];
  assert.equal(preserveOwnerConflicts(route, collectObservations(route.query, []))[0].code, 'DESTINATION_SELECTION_REQUIRED');
  assert.equal(route.drop.state, 'AMBIGUOUS'); assert.equal(route.drop.alternatives.length, 2);
  assert.deepEqual(route.drop.refs.map(ref => text.slice(ref.start, ref.end)), ['airport', 'Pari Chowk']);
  const again = structuredClone(route); preserveOwnerConflicts(again, collectObservations(again.query, []));
  assert.deepEqual(again.candidates, route.candidates);
  const full = emptyDraft(inputFor(text).query); full.candidates = Array.from({ length: 24 }, (_, i) => ({ ...route.candidates[0], candidateId: `old-${i}`, start: 0, end: 1, exactText: 'f' }));
  assert.equal(preserveOwnerConflicts(full, collectObservations(full.query, []))[0].category, 'INVALID');
  const returnTrip = emptyDraft(inputFor('at 6 PM return in the evening').query);
  assert.deepEqual(preserveOwnerConflicts(returnTrip, collectObservations(returnTrip.query, [])), []);
});

test('ambiguous negative vehicle evidence cannot lose either frozen SUV exclusion', () => {
  const draft = emptyDraft(inputFor('SUV only but no SUV').query);
  draft.vehicleClass = { state: 'AMBIGUOUS', alternatives: ['suv'], excluded: null, reasonCode: 'CONFLICT', refs: refs(draft) };
  assert.ok(validateLunaEvidence(draft).some(i => i.category === 'INVALID'));
  draft.vehicleClass.excluded = ['suv', 'suv_premium'];
  assert.equal(validateLunaEvidence(draft).some(i => i.field === 'vehicleClass' && i.category === 'INVALID'), false);
});

test('DST gaps/folds remain unresolved with original components and no scheduling invention', () => {
  for (const date of ['2026-03-29', '2026-10-25']) {
    const draft = emptyDraft(inputFor(`${date} at 01:30 Europe/London`).query); const r = refs(draft);
    const [year, month, day] = date.split('-').map(Number);
    draft.timing = { mode: 'SCHEDULED', refs: r, date: resolved({ kind: 'ABSOLUTE', day: resolved(day, r), month: resolved(month, r), year: resolved(year, r) }, r),
      time: resolved({ kind: 'CLOCK', hour: 1, minute: resolved(30, r), notation: 'H24', period: { state: 'UNSPECIFIED' }, precision: 'EXACT' }, r) };
    const result = resolveTemporal(draft, clock.now(), 'Asia/Kolkata');
    assert.equal(result.sourceDate, date); assert.equal(result.scheduledAt, undefined);
    assert.equal(result.issues[0].code, 'TIMEZONE_LOCAL_TIME_SELECTION_REQUIRED');
  }
});

test('all family variants must match approved grammar and direction; corruption does not inherit owner approval', () => {
  const previous = buildOwnerPolicyReview();
  const approved = previous.records.find(r => r.id === previous.approval[0].caseId);
  approved.truth.expected.queryType.value = 'CORRUPTED';
  assert.throws(() => buildFamilyOwnerReview(previous), /ORIGINAL_OWNER_APPROVAL_CHANGED/);
  previous.approval[0].approvedLabelHash = createHash('sha256').update(JSON.stringify(approved.truth.expected)).digest('hex');
  assert.throws(() => buildFamilyOwnerReview(previous), /ORIGINAL_OWNER_APPROVAL_CHANGED/);
  const missing = buildOwnerPolicyReview(); missing.approval.pop();
  assert.throws(() => buildFamilyOwnerReview(missing), /ORIGINAL_OWNER_APPROVAL_CHANGED/);
  const records = buildOwnerPolicyReview().records;
  const base = records.find(r => r.familyId === 'time-approximate');
  const invalid = modify => { const r = structuredClone(base); modify(r); return familyDecisionExceptions(r); };
  assert.ok(invalid(r => { r.truth.expected.queryType.value = 'LOCATION_SEARCH' }).includes('FAMILY_QUERY_TYPE_MISMATCH'));
  assert.ok(invalid(r => { r.truth.expected.pickupSpans.value[0].exactText = 'invented' }).includes('FAMILY_SPAN_MISMATCH'));
  assert.ok(invalid(r => { r.modelInput.query = 'cab tomorrow' }).length);
  assert.deepEqual(verifyFamilyDefinition({ ...base, familyId: 'unapproved' }), ['OWNER_FAMILY_NOT_DEFINED']);
  const repeat = structuredClone(records.find(r => r.familyId === 'role-repeated-place'));
  repeat.modelInput.query = repeat.modelInput.query.replace(/pickup is .+$/, 'pickup is airport');
  assert.ok(familyDecisionExceptions(repeat).length);
  repeat.truth.expected.pickupSpans.value[1].exactText = 'airport';
  assert.ok(familyDecisionExceptions(repeat).includes('INCONSISTENT_REPEATED_PICKUP'));
  const ac = structuredClone(records.find(r => r.familyId === 'conditional-ac')); ac.modelInput.query += ' but if delayed change destination';
  assert.ok(familyDecisionExceptions(ac).includes('CONDITIONAL_AC_NOT_STRAIGHTFORWARD'));
  ac.modelInput.query = 'AC car unless unavailable';
  assert.ok(familyDecisionExceptions(ac).includes('CONDITIONAL_AC_NOT_STRAIGHTFORWARD'));
  const overlap = structuredClone(records.find(r => r.familyId === 'overlap-location')); overlap.truth.expected.pickupSpans.value[0].exactText = 'hostel gate';
  assert.ok(familyDecisionExceptions(overlap).includes('LANDMARK_TRUNCATION'));
});

test('soft AC/passenger advisories are displayed separately while rental/stops and branching conditions block submission', async () => {
  for (const [text, advisory] of [['sedan cab now AC car if available', true], ['sedan cab now AC car if available unless delayed', false], ['sedan cab now rental for 8 hours', false], ['sedan cab now for 3 people', true]]) {
    const provider = decisionFake([bookingRouting, request => ({ ...expressionChoices(request), vehicle_class: 'sedan', vehicle_strength: 'REQUIRED', timing_mode: 'IMMEDIATE',
      unsupported_service: 'NONE' })]);
    const result = await createRideSearchParser(provider, clock).parse(inputFor(text));
    const review = createLocationReview(result, clock.now(), 'Asia/Kolkata');
    const state = formResolution(review, clock);
    assert.equal(state.submissionAllowed, false);
    if (advisory) assert.ok(state.advisories.length);
    else assert.ok(state.resolutionRequirements.some(r => ['RENTAL', 'AC_PREFERENCE', 'CONDITIONAL_PREFERENCE'].includes(r.field)));
  }
});

