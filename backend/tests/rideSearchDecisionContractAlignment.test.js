import test from 'node:test';
import assert from 'node:assert/strict';
import { createRideSearchParser } from '../services/search/parser.ts';
import { createJevSearchProvider, SearchQuestionContractError, validateDecisionRequest } from '../services/search/provider.ts';
import { categorical } from '../services/search/questions.ts';
import { emptyDraft, SEARCH_LIMITS } from '../services/search/contracts.ts';
import { generateLocationCandidates } from '../services/search/locations/candidates.ts';
import { validateDraftProvenance } from '../services/search/provenance.ts';
import { locationField } from '../services/search/extractor.ts';
import { fallbackEligibility } from '../services/search/complex/eligibility.ts';
import { createLocationReview } from '../services/search/locations/review.ts';
import { formResolution } from '../services/search/locations/formResolution.ts';
import { createTestClock } from './helpers/testClock.js';
import { decisionFake, bookingRouting, expressionChoices, inputFor } from './helpers/rideSearchFake.js';
import { validateRequest, buildWireRequest, createExperimentalAdapter } from '../benchmarks/search/decisionComparison/adapters.js';
import { alignedTasks, alignedLabels, requiredFieldProjection } from '../benchmarks/search/decisionComparison/alignedContract.js';

const clock = () => createTestClock('2026-10-04T12:00:00+05:30');
const fixtures = [
  ['hh-v1-seed-007', 'suv chahiye par sedan nahi', { vehicle_class: 'suv', vehicle_strength: 'REQUIRED', exclude_sedan: 'EXCLUDED' }],
  ['hh-v1-seed-040', 'shared cab nahi chahiye', { sharing: 'NO' }],
  ['hh-v1-added-004', 'एसयूवी नहीं चाहिए, सेडान मिले तो ठीक है', {
    vehicle_class: 'sedan', vehicle_strength: 'PREFERRED', exclude_suv: 'EXCLUDED', exclude_suv_premium: 'EXCLUDED', unsupported_service: 'CONDITIONAL_PREFERENCE' }],
  ['hh-v1-added-007', 'चार घंटे के लिए गाड़ी किराये पर चाहिए', { unsupported_service: 'RENTAL' }],
];

for (const [id, text, answers] of fixtures) test(`zero-location regression: ${id}`, async () => {
  const input = inputFor(text); input.query.id = id;
  const fake = decisionFake([bookingRouting, request => ({ ...expressionChoices(request), pickup_mentioned: 0, drop_mentioned: 0, ...answers })]);
  const provider = { decide(request) { validateDecisionRequest(request); validateRequest(request); return fake.decide(request); } };
  const result = await createRideSearchParser(provider, clock(), generateLocationCandidates).parse(input);
  assert.equal(result.draft.candidates.length, 0);
  assert.equal(fake.requests.length, 2);
  assert.equal('pickup_candidate' in fake.requests[1].questions, false);
  assert.equal('drop_candidate' in fake.requests[1].questions, false);
  assert.ok(fake.requests[1].questions.pickup_presence && fake.requests[1].questions.drop_presence);
  for (const role of ['pickup', 'drop']) {
    assert.equal(result.draft[role].state, 'UNSPECIFIED');
    if (!result.fallbackRequired) assert.ok(result.issues.some(issue => issue.code === 'FIELD_REQUIRED' && issue.field === role));
  }
  assert.equal(result.issues.some(issue => issue.code === 'JEV_PROVIDER_ERROR'
    || issue.code === 'JEV_SCHEMA_ERROR' && issue.field === 'questions'), false);
  assert.deepEqual(validateDraftProvenance(result.draft), []);
  if (result.fallbackRequired) {
    assert.throws(() => createLocationReview(result, clock().now(), 'Asia/Kolkata'), /INVALID_PARSE_RESULT/u);
  } else {
    const form = formResolution(createLocationReview(result, clock().now(), 'Asia/Kolkata'), clock());
    assert.equal(form.submissionAllowed, false);
    assert.equal(form.state, 'NEEDS_USER_RESOLUTION');
  }
  if (id === 'hh-v1-added-004' || id === 'hh-v1-added-007') {
    assert.equal(result.fallbackRequired, false);
    assert.deepEqual(fallbackEligibility(result), []);
    assert.ok(result.draft.unsupportedRequests.some(value => value.kind === (id === 'hh-v1-added-004' ? 'CONDITIONAL_PREFERENCE' : 'RENTAL')));
  }
});

test('stated but unavailable endpoints retain the existing fallback; absent endpoints alone do not escalate', async () => {
  const input = inputFor('from campus to airport');
  const fake = decisionFake([bookingRouting, { pickup_presence: 'PRESENT', drop_presence: 'PRESENT', role_consistency: 'CONSISTENT' }]);
  const result = await createRideSearchParser(fake, clock(), () => ({ candidates: [], issues: [] })).parse(input);
  assert.ok(fallbackEligibility(result).includes('LOCATION_CANDIDATE_MISSING'));
  assert.equal(result.draft.pickup.state, 'UNSPECIFIED');
  assert.equal(fake.requests.length, 2);
  const absent = decisionFake([bookingRouting, { sharing: 'NO' }]);
  const partial = await createRideSearchParser(absent, clock(), generateLocationCandidates).parse(inputFor('shared cab nahi chahiye'));
  assert.equal(partial.fallbackRequired, false);
});

test('one actual candidate retains candidate membership and exact source provenance', async () => {
  const input = inputFor('from campus');
  const generated = generateLocationCandidates(input.query, 'BOOKING_REQUEST');
  assert.equal(generated.candidates.length, 1);
  const fake = decisionFake([bookingRouting, { pickup_candidate: generated.candidates[0].candidateId,
    pickup_presence: 'PRESENT', role_consistency: 'CONSISTENT' }]);
  const result = await createRideSearchParser(fake, clock(), generateLocationCandidates).parse(input);
  assert.equal(result.draft.pickup.value.candidateId, generated.candidates[0].candidateId);
  assert.equal(Object.keys(fake.requests[1].questions.pickup_candidate.choices).length, 2);
  assert.deepEqual(validateDraftProvenance(result.draft), []);
});

test('local question failures are attributed to questions and cannot reach SDK or HTTP transport', async () => {
  assert.throws(() => categorical('impossible selection', ['NONE']), SearchQuestionContractError);
  assert.throws(() => categorical('duplicate singleton', ['NONE', 'NONE']), SearchQuestionContractError);
  let calls = 0;
  const singleton = { state: 'data', questions: { pickup: { kind: 'choice', instructions: 'Select.', choices: { NONE: 'Absent' } } } };
  const provider = createJevSearchProvider({ client: { systemOne: async () => { calls += 1; } } });
  await assert.rejects(provider.decide(singleton), SearchQuestionContractError);
  const adapter = createExperimentalAdapter('clef', { transport: { send() { calls += 1; } } });
  await assert.rejects(adapter.decide(singleton), SearchQuestionContractError);
  assert.equal(calls, 0);
  assert.throws(() => locationField({ choices: { pickup_candidate: { choice: 'invented' } } }, 'pickup_candidate', []),
    error => error.code === 'JEV_INVALID_RESPONSE');
  const local = await createRideSearchParser(decisionFake([new SearchQuestionContractError()]), clock()).parse(inputFor('SUV'));
  assert.ok(local.issues.some(issue => issue.code === 'JEV_SCHEMA_ERROR' && issue.field === 'questions'));
  assert.equal(local.issues.some(issue => issue.code === 'JEV_PROVIDER_ERROR'), false);
  const remote = await createRideSearchParser(decisionFake([new Error('network failure')]), clock()).parse(inputFor('SUV'));
  assert.ok(remote.issues.some(issue => issue.code === 'JEV_PROVIDER_ERROR' && issue.field === 'provider'));
  assert.throws(() => validateDecisionRequest({ ...singleton, state: 'x'.repeat(SEARCH_LIMITS.providerContext + 1) }), SearchQuestionContractError);
});

test('required-field projection preserves hierarchy, concrete vehicle selection and non-booking applicability', () => {
  const draft = emptyDraft(inputFor('any car').query); draft.queryType = 'BOOKING_REQUEST'; draft.complexity = 'SIMPLE';
  draft.vehicleClass = { state: 'EXPLICIT_ANY', excluded: [], refs: [] };
  assert.deepEqual(requiredFieldProjection(draft).missingFields, ['drop', 'pickup', 'timing', 'vehicleClass']);
  draft.timing.mode = 'IMMEDIATE';
  assert.deepEqual(requiredFieldProjection(draft).missingFields, ['drop', 'pickup', 'vehicleClass']);
  draft.timing.mode = 'SCHEDULED';
  assert.deepEqual(requiredFieldProjection(draft).missingFields, ['drop', 'pickup', 'timing.date', 'timing.time', 'vehicleClass']);
  draft.timing.time = { state: 'AMBIGUOUS', alternatives: [], refs: [], reasonCode: 'TIME_SELECTION_REQUIRED' };
  assert.equal(requiredFieldProjection(draft).missingFields.includes('timing.time'), false);
  assert.equal(requiredFieldProjection(draft).submissionAllowed, false);
  draft.queryType = 'LOCATION_SEARCH'; draft.complexity = 'NOT_APPLICABLE';
  assert.equal(requiredFieldProjection(draft).applicable, false);
  assert.deepEqual(requiredFieldProjection(draft).missingFields, []);
});

test('v5 has equivalent provider wire semantics, explicit unsupported tasks and no direct model missing-field answers', () => {
  const input = { query: inputFor('कैंपस से स्टेशन जाना है').query, context: { clock: clock().now().toISOString(), timeZone: 'Asia/Kolkata' } };
  const tasks = alignedTasks(input);
  assert.equal(Object.keys(tasks.request.questions).length, 20);
  assert.equal(Object.keys(tasks.request.questions).some(name => name.startsWith('missing_')), false);
  assert.equal(tasks.derivedTasks.missingFields.status, 'DETERMINISTIC_POLICY_ONLY');
  assert.ok(tasks.unsupportedTasks.includes('BOOKING_CONFIRMATION'));
  for (const provider of ['jev', 'decisions', 'clefFlash', 'clef']) {
    const wire = buildWireRequest(provider, tasks.request);
    assert.equal(provider === 'decisions' ? wire.input : wire.state, tasks.request.state);
  }
  assert.doesNotMatch(tasks.request.state, /"(?:expected|truth|labels|caseId)"/u);
  const expected = { queryType: 'BOOKING_REQUEST', complexity: 'COMPLEX', pickupSpans: [], dropSpans: [],
    vehicle: { state: 'UNSPECIFIED' }, timingMode: 'UNSPECIFIED', flags: {}, missingFields: [], unsupportedRequests: ['RENTAL'] };
  assert.equal(alignedLabels(expected, tasks.candidates, ['complexity']).complexity, null);
  assert.equal(alignedLabels(expected, tasks.candidates, ['complexity']).missing_pickup, undefined);
  assert.deepEqual(alignedLabels({ ...expected, ambiguities: ['EXACT_TIME_REQUIRED'] }, []).ambiguity.allowed, ['NO']);
  assert.deepEqual(alignedLabels({ ...expected, ambiguities: ['TIME_SELECTION_REQUIRED'], time: { state: 'AMBIGUOUS' } }, []).ambiguity.allowed, ['YES']);
  assert.equal(alignedLabels({ ...expected, ambiguities: ['UNREVIEWED_DIAGNOSTIC'] }, []).ambiguity, null);
});
