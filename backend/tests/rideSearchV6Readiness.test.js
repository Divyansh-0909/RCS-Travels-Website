import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pipelineLabel, requiredFieldsGold, scoreLevelOne, scorePipelineCase, wireMeaning,
  fakeEnvelope, createStopLedger, MAX_INPUT_RESERVATION } from '../benchmarks/search/decisionComparison/readiness.js';
import { PROVIDERS, createExperimentalAdapter, buildWireRequest } from '../benchmarks/search/decisionComparison/adapters.js';
import { createRideSearchParser } from '../services/search/parser.ts';
import { emptyDraft } from '../services/search/contracts.ts';
import { locationField } from '../services/search/extractor.ts';
import { generateLocationCandidates } from '../services/search/locations/candidates.ts';
import { createTestClock } from './helpers/testClock.js';
import { requiredFieldProjection } from '../benchmarks/search/decisionComparison/alignedContract.js';
import { decisionFake, bookingRouting, expressionChoices, inputFor, candidateFor } from './helpers/rideSearchFake.js';

const root = new URL('../../', import.meta.url);
const load = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const inputs = await load('output/search-v1-owner-simple-policy-2026-11-02/proposal-v6-inputs.json');
const labels = await load('output/search-v1-owner-simple-policy-2026-11-02/proposal-v6-labels.json');
const historic = await load('output/search-v1-b1-comparison-2026-11-02/pilot-labels-v4.json');
const pipeline = labels.map(row => pipelineLabel(historic.find(value => value.caseId === row.caseId), row));

test('v6 field scoring uses owner SIMPLE decisions instead of historical COMPLEX-only fallback labels', () => {
  for (const id of ['hh-v1-added-004', 'hh-v1-added-007', 'hh-v1-added-033']) {
    const before = historic.find(row => row.caseId === id).pipelineExpected;
    const after = pipeline.find(row => row.caseId === id);
    assert.equal(before.complexity, 'COMPLEX');
    assert.equal(after.expected.complexity, 'SIMPLE');
    assert.equal(after.fieldEligible, true);
    assert.match(after.fallbackScoring, /DESCRIPTIVE_ELIGIBILITY/u);
    assert.equal(before.fallbackExpectation, 'REQUIRED_COMPLEX_SEMANTICS');
  }
});

test('independent required-field gold preserves parent timing, scheduled children, ANY and ambiguity distinctions', () => {
  const expected = { queryType: 'BOOKING_REQUEST', vehicle: { state: 'EXPLICIT_ANY' }, timingMode: 'UNSPECIFIED', date: 'UNSPECIFIED', time: 'UNSPECIFIED' };
  const roles = { pickup: { allowed: ['NONE'] }, drop: { allowed: ['AMBIGUOUS'] } };
  assert.deepEqual(requiredFieldsGold(expected, roles), ['pickup', 'timing', 'vehicleClass']);
  expected.timingMode = 'IMMEDIATE';
  assert.deepEqual(requiredFieldsGold(expected, roles), ['pickup', 'vehicleClass']);
  expected.timingMode = 'SCHEDULED'; expected.time = { state: 'RESOLVED', value: 'DAYPART' };
  assert.deepEqual(requiredFieldsGold(expected, roles), ['pickup', 'timing.date', 'vehicleClass']);
  expected.queryType = 'LOCATION_SEARCH'; assert.equal(requiredFieldsGold(expected, roles), null);
});

test('empty predictions earn no v6 categorical or parser successes; denominators remain registered', () => {
  const scored = scoreLevelOne(labels, inputs, pipeline);
  assert.equal(scored.registeredCases, 24); assert.equal(scored.eligible, 463);
  assert.equal(scored.correct, 0); assert.equal(scored.exactCases, 0); assert.equal(scored.observedCases, 0);
  const parser = scorePipelineCase(null, pipeline.find(row => row.fieldEligible));
  assert.equal(parser.observed, false); assert.equal(parser.missingFieldSetCorrect, false);
  assert.equal(parser.guardAcceptedBookingPartial, false); assert.equal(parser.provenanceViolations, null);
  assert.equal(parser.roles.pickup.correct, false); assert.equal(parser.sharingCorrect, false);
});

test('production requirement projection agrees with independently derived annotation gold on every booking case', () => {
  for (const label of pipeline.filter(row => row.expected.queryType === 'BOOKING_REQUEST')) {
    const expected = label.expected, draft = emptyDraft(inputs.find(row => row.caseId === label.caseId).input.query);
    draft.queryType = expected.queryType;
    for (const role of ['pickup', 'drop']) {
      const state = label.roleLabels[role].allowed[0];
      // Annotation-state diagnostic only; this is never a valid/submittable draft.
      draft[role] = state === 'NONE' ? { state: 'UNSPECIFIED' }
        : state === 'AMBIGUOUS' ? { state: 'AMBIGUOUS' } : { state: 'RESOLVED', value: { kind: 'QUERY_CANDIDATE' } };
    }
    draft.vehicleClass = expected.vehicle;
    draft.timing.mode = expected.timingMode;
    for (const field of ['date', 'time']) draft.timing[field] = { state: expected[field] === 'UNSPECIFIED'
      || expected[field] === undefined ? 'UNSPECIFIED' : expected[field]?.state ?? 'RESOLVED' };
    assert.deepEqual(requiredFieldProjection(draft).missingFields, label.requiredFields, label.caseId);
  }
});

test('all 24 complete synthetic label vectors round-trip under every adapter without gold entering request state', async () => {
  for (const provider of Object.keys(PROVIDERS)) {
    const observations = new Map();
    for (const row of inputs) {
      const truth = labels.find(value => value.caseId === row.caseId);
      const choices = Object.fromEntries(Object.entries(truth.labels).filter(([, value]) => value !== null).map(([name, value]) => [name, value.allowed[0]]));
      const originalState = row.tasks.request.state;
      assert.deepEqual(wireMeaning(provider, row.tasks.request), row.tasks.request);
      assert.equal('missing_pickup' in row.tasks.request.questions, false);
      assert.equal(Object.keys(row.tasks.request.questions).length, 20);
      const adapter = createExperimentalAdapter(provider, { transport: { async send(body) {
        assert.deepEqual(body, buildWireRequest(provider, row.tasks.request));
        return { status: 200, body: fakeEnvelope(provider, row.tasks.request, choices) };
      } } });
      const observation = await adapter.execute(row.tasks.request);
      assert.equal(observation.error, null); assert.equal(observation.retries, 0);
      assert.equal(row.tasks.request.state, originalState);
      observations.set(row.caseId, observation);
    }
    const score = scoreLevelOne(labels, inputs, pipeline, observations);
    assert.equal(score.correct, 463); assert.equal(score.exactCases, 24);
  }
});

test('categorically correct OTHER is not positive endpoint extraction', () => {
  const truth = [{ caseId: 'missing-span', labels: { pickup: { allowed: ['OTHER_OR_UNAVAILABLE'] } } }];
  const input = [{ caseId: 'missing-span', language: 'TEST', tasks: { candidates: [] } }];
  const gold = [{ caseId: 'missing-span', expected: { pickupSpans: [{ start: 0, end: 6, exactText: 'campus' }] } }];
  const observed = new Map([['missing-span', { normalized: { choices: { pickup: { choice: 'OTHER_OR_UNAVAILABLE' } } } }]]);
  const score = scoreLevelOne(truth, input, gold, observed);
  assert.equal(score.correct, 1); assert.deepEqual(score.positiveEndpoints.pickup, { correct: 0, total: 1 });
});

for (const provider of Object.keys(PROVIDERS)) test(`${provider}: all four historical zero-candidate fixtures round-trip without local contract failure`, async () => {
  const selected = {
    'hh-v1-seed-007': { vehicle_class: 'suv', vehicle_strength: 'REQUIRED', exclude_sedan: 'EXCLUDED' },
    'hh-v1-seed-040': { sharing: 'NO' },
    'hh-v1-added-004': { vehicle_class: 'sedan', vehicle_strength: 'PREFERRED', exclude_suv: 'EXCLUDED', exclude_suv_premium: 'EXCLUDED', unsupported_service: 'CONDITIONAL_PREFERENCE' },
    'hh-v1-added-007': { unsupported_service: 'RENTAL' },
  };
  for (const [caseId, answers] of Object.entries(selected)) {
    const row = inputs.find(value => value.caseId === caseId);
    const fake = decisionFake([bookingRouting, request => ({ ...expressionChoices(request), ...answers })]);
    const injected = { async decide(request) {
      const fixture = await fake.decide(request);
      const selections = Object.fromEntries(Object.entries(fixture.choices).map(([name, value]) => [name, value.choice]));
      const adapter = createExperimentalAdapter(provider, { transport: { async send() {
        return { status: 200, body: fakeEnvelope(provider, request, selections) };
      } } });
      return adapter.decide(request);
    } };
    const result = await createRideSearchParser(injected, createTestClock(row.input.context.clock), generateLocationCandidates)
      .parse({ query: row.input.query, candidates: [], timeZone: row.input.context.timeZone });
    const score = scorePipelineCase(result, pipeline.find(value => value.caseId === caseId));
    assert.equal(fake.requests.length, 2); assert.equal(score.localContractFailure, false);
    assert.equal(result.draft.pickup.state, 'UNSPECIFIED'); assert.equal(result.draft.drop.state, 'UNSPECIFIED');
    assert.equal('pickup_candidate' in fake.requests[1].questions, false);
    assert.equal('drop_candidate' in fake.requests[1].questions, false);
    assert.equal(score.provenanceViolations, 0);
    assert.equal(result.issues.some(issue => issue.code === 'JEV_PROVIDER_ERROR'), false);
    assert.equal(result.fallbackRequired, false);
    if (caseId === 'hh-v1-added-004' || caseId === 'hh-v1-added-007') {
      const kind = caseId === 'hh-v1-added-004' ? 'CONDITIONAL_PREFERENCE' : 'RENTAL';
      assert.ok(result.draft.unsupportedRequests.some(value => value.kind === kind));
      assert.ok(result.issues.some(value => value.category === 'UNSUPPORTED' && value.field === kind));
      assert.deepEqual(score.fallbackReasons, []);
    }
  }
});

test('correct endpoint provenance is stricter than a guard-accepted partial and checks original source', () => {
  const input = inputFor('campus to airport'), draft = emptyDraft(input.query);
  draft.queryType = 'BOOKING_REQUEST'; draft.complexity = 'SIMPLE';
  draft.candidates = [candidateFor(input, 'campus', 'origin'), candidateFor(input, 'airport', 'destination')];
  draft.pickup = locationField({ choices: { field: { choice: 'destination' } } }, 'field', draft.candidates);
  draft.drop = locationField({ choices: { field: { choice: 'origin' } } }, 'field', draft.candidates);
  const result = { draft, issues: [], fallbackReasons: [], fallbackRequired: false, providerMetadata: { completedRequests: 2 } };
  const label = { expected: { queryType: 'BOOKING_REQUEST', complexity: 'SIMPLE', pickupSpans: [draft.candidates[0]], dropSpans: [draft.candidates[1]],
    vehicle: { state: 'UNSPECIFIED' }, flags: { sharing: { state: 'UNSPECIFIED' } }, timingMode: 'UNSPECIFIED' },
  fieldEligible: true, roleLabels: { pickup: { allowed: ['origin'] }, drop: { allowed: ['destination'] } }, requiredFields: ['timing', 'vehicleClass'] };
  const score = scorePipelineCase(result, label);
  assert.equal(score.guardAcceptedBookingPartial, true); assert.equal(score.roles.pickup.positiveCorrect, false);
  draft.candidates[0].exactText = 'invented';
  assert.ok(scorePipelineCase(result, label).provenanceViolations > 0);
});

test('HTTP failures and malformed/unknown-usage responses halt the activation without retries', async () => {
  const request = inputs[0].tasks.request;
  for (const kind of ['429', '401', '403', '500', 'MALFORMED', 'UNKNOWN_USAGE']) {
    let sends = 0;
    const ledger = createStopLedger(); ledger.reserve('jev', 100, 0);
    const adapter = createExperimentalAdapter('jev', { transport: { async send() {
      sends += 1; const body = fakeEnvelope('jev', request);
      if (kind === 'MALFORMED') delete body.answers.query_type;
      if (kind === 'UNKNOWN_USAGE') delete body.usage;
      return { status: /^\d/u.test(kind) ? Number(kind) : 200, body, retryAfter: '6' };
    } } });
    ledger.settle(await adapter.execute(request));
    assert.equal(sends, 1); assert.equal(ledger.state.stopped, true);
    assert.throws(() => ledger.reserve('clef', 100, 1000), /ACTIVATION_STOPPED/u);
  }
});

test('resource, spending, request, concurrency and throttle limits are enforced before another send', () => {
  const ledger = createStopLedger();
  assert.throws(() => ledger.reserve('decisions', 100, 0), /PROVIDER_NOT_ENABLED/u);
  ledger.reserve('jev', 100, 0);
  assert.throws(() => ledger.reserve('clef', 100, 1000), /CONCURRENCY_LIMIT/u);
  const request = inputs[0].tasks.request;
  const success = { provider: 'jev', raw: fakeEnvelope('jev', request), normalized: { metadata: { model: 'jev-1.14.0', usage: { inputTokens: 100 } } }, error: null };
  ledger.settle(success);
  assert.throws(() => ledger.reserve('jev', 100, 999), /THROTTLE_REQUIRED/u);
  for (let call = 1; call < 72; call += 1) { ledger.reserve('jev', 100, call * 1000); ledger.settle(success); }
  assert.throws(() => ledger.reserve('jev', 100, 72000), /REQUEST_OR_TARIFF_LIMIT/u);
  const budget = createStopLedger(); budget.state.providers.jev.knownUsd = 0.10;
  assert.throws(() => budget.reserve('jev', 100, 0), /REQUEST_OR_TARIFF_LIMIT/u);
  assert.equal(budget.state.providers.jev.calls, 0);
  const resource = createStopLedger();
  assert.throws(() => resource.reserve('jev', MAX_INPUT_RESERVATION, 0), /LOCAL_CONTEXT_BUDGET/u);
  assert.equal(resource.state.providers.jev.calls, 0);
});

test('observed token excess and unversioned Jev alias stop before subsequent requests', () => {
  for (const mismatch of ['TOKENS', 'MODEL']) {
    const request = inputs[0].tasks.request, ledger = createStopLedger(); ledger.reserve('jev', 100, 0);
    const raw = fakeEnvelope('jev', request);
    if (mismatch === 'TOKENS') raw.usage.input_tokens = MAX_INPUT_RESERVATION + 1;
    ledger.settle({ provider: 'jev', raw, error: null, normalized: { metadata: {
      model: mismatch === 'MODEL' ? 'jev-latest' : 'jev-1.14.0', usage: { inputTokens: raw.usage.input_tokens } } } });
    assert.equal(ledger.state.stopped, true);
    assert.equal(ledger.state.reason, mismatch === 'MODEL' ? 'MODEL_VERSION_CHANGED' : 'OBSERVED_TARIFF_LIMIT');
  }
});
