import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { run, amendment, clock, authorization, jevResponse, lunaResponse, directory } from './helpers/searchS5ExecutorFake.js';
import { authorize, verifyAmendment, authorizationTemplate, currentPhaseA, networkIdentity } from '../benchmarks/search/s5Executor/registration.js';
import { createSearchInterpretationService } from '../services/search/complex/service.ts';
import { reusableProvider, parseInput, caseClock } from '../benchmarks/search/s5Continuation/compatibility.js';
import { placesFake } from './helpers/rideSearchS3Fake.js';
import { collectObservations } from '../services/search/observations.ts';
import { resolved } from '../services/search/fields.ts';
import { digest, canonical } from '../benchmarks/search/s5Continuation/artifacts.js';

test('Phase A executes the real OpenAI SDK/adapter and production adoption guards with deferred grounding', async () => {
  const attempt = await run('A'), { result } = attempt;
  assert.equal(result.status, 'COMPLETE'); assert.equal(result.receiptCommitted, true);
  assert.equal(attempt.transport.calls.length, 1); assert.equal(result.LunaCalls, 1); assert.equal(result.JevCalls, 0);
  assert.equal(result.PlacesCalls, 0); assert.equal(result.DetailsCalls, 0);
  assert.equal(result.cases[0].formResolution.submissionAllowed, false);
  assert.equal(result.cases[0].draft.timing.time.state, 'AMBIGUOUS');
  assert.equal(result.cases[0].draft.timing.time.alternatives.length, 2);
  assert.deepEqual(result.cases[0].review.selected, {});
  assert.equal(result.observations[0].raw.usage.input_tokens, 1000);
  assert.ok(Math.abs(result.budget.knownTariffUsd - 0.000246) < 1e-12);
  const registered = attempt.amendment.requests.find(row => row.provider === 'luna');
  assert.deepEqual(attempt.transport.calls[0].body, registered.wireRequest);
  assert.equal(result.observations[0].globalIdentity, networkIdentity('luna', registered.wireRequest));
});

test('deferred adoption independently matches the actual composition service interpretation snapshot', async () => {
  const attempt = await run('A'), bundle = await verifyAmendment(attempt.amendment), current = await currentPhaseA(bundle);
  const provider = reusableProvider(current.row, bundle.catalog).provider;
  const normalized = attempt.result.observations[0].normalized;
  const places = placesFake();
  const actual = await createSearchInterpretationService(provider, places, { async interpret() { return normalized; } }, caseClock(current.row))
    .parse(parseInput(current.row), { activeField: current.row.modelInput.context.activeField, formRevision: 0 });
  assert.deepEqual(canonical(actual.interpretationSnapshot), canonical(attempt.result.cases[0].interpretationSnapshot));
  assert.deepEqual(canonical(actual.review.session.effectiveDraft), canonical(attempt.result.cases[0].draft));
  assert.equal(actual.formResolution.submissionAllowed, false); assert.ok(places.calls.length > 0);
  assert.equal(attempt.result.cases[0].grounding.executed, false);
});

test('model-selected conflicting schedule cannot become an effective confirmed time', async () => {
  const attempt = await run('A', { handler: request => lunaResponse(request, (output, input) => {
    const observed = collectObservations(input.query, input.candidates);
    output.draft.timing.time = resolved(observed.times[0].value, [observed.times[0].ref]);
  }) });
  assert.equal(attempt.result.status, 'COMPLETE');
  assert.equal(attempt.result.cases[0].draft.timing.time.state, 'AMBIGUOUS');
  assert.ok(attempt.result.cases[0].formResolution.resolutionRequirements.some(row => /TIME|timing/.test(row.code + row.field)));
});

test('Phase B executes exactly five cases in order with at most one parser-selected extraction each', async () => {
  const attempt = await run('B');
  assert.equal(attempt.result.status, 'COMPLETE'); assert.equal(attempt.result.receiptCommitted, true);
  assert.deepEqual(attempt.result.cases.map(row => row.caseId), attempt.amendment.phases.B.cases);
  assert.equal(attempt.result.JevCalls, 10); assert.equal(attempt.result.LunaCalls, 0);
  assert.equal(attempt.result.budget.routing, 5); assert.equal(attempt.result.budget.extraction, 5);
  assert.ok(attempt.result.cases.every(row => !row.formResolution?.submissionAllowed && row.automaticLunaCalls === 0));
  assert.deepEqual(attempt.result.observations.map(row => row.stage), ['routing', 'location', 'routing', 'location', 'routing', 'location', 'routing', 'booking', 'routing', 'booking']);
  const starts = attempt.transport.calls.map(row => row.at);
  assert.ok(starts.slice(1).every((value, index) => value - starts[index] >= 1000));
});

test('complex and unrelated routing do not send ineligible extraction or execute Luna', async () => {
  const attempt = await run('B', { handler: request => jevResponse(request, {
    query_type: 'BOOKING_REQUEST', booking_complexity: 'COMPLEX',
  }) });
  assert.equal(attempt.result.status, 'COMPLETE'); assert.equal(attempt.result.JevCalls, 5);
  assert.equal(attempt.result.budget.extraction, 0); assert.equal(attempt.result.LunaCalls, 0);
  assert.ok(attempt.result.cases.every(row => row.fallbackEligibility.includes('COMPLEX_QUERY')));
  const unrelated = await run('B', { handler: request => jevResponse(request, { query_type: 'UNCLEAR_OR_UNRELATED', booking_complexity: 'NOT_APPLICABLE' }) });
  assert.equal(unrelated.result.JevCalls, 5); assert.equal(unrelated.result.budget.extraction, 0);
});

test('ordinary source-role conflict is contained as a fallback result, not labelled a network failure', async () => {
  const attempt = await run('B', { handler: request => {
    const state = JSON.parse(request.state);
    return request.questions.drop_candidate ? jevResponse(request, { drop_candidate: state.candidates[0].candidateId }) : jevResponse(request);
  } });
  assert.equal(attempt.result.status, 'COMPLETE');
  const guarded = attempt.result.cases.find(row => row.caseId === 'core-complete-simple-029');
  assert.ok(guarded.fallbackEligibility.includes('ROLE_CONFLICT'));
  assert.equal(guarded.automaticLunaCalls, 0); assert.ok(attempt.result.observations.every(row => row.error === null));
});

test('source and request amendment drift are rejected before claims or network', async () => {
  const value = structuredClone(await amendment()); value.requests[0].request.state = 'tampered';
  const body = structuredClone(value); delete body.amendmentHash; value.amendmentHash = digest(body);
  await assert.rejects(verifyAmendment(value), /REQUEST_MANIFEST_DRIFT/);
});

test('phase-specific owner receipts and account verification cannot be inferred from templates or another phase', async () => {
  const value = await amendment(), executionClock = clock();
  assert.throws(() => authorize(value, authorizationTemplate(value, 'A'), 'A', executionClock.wallMs()), /SEPARATE_LIVE_AUTHORIZATION_REQUIRED/);
  const auth = authorization(value, 'A', executionClock);
  assert.throws(() => authorize(value, auth, 'B', executionClock.wallMs(), true), /SEPARATE_PHASE_AUTHORIZATION_REQUIRED/);
  auth.accountChecks.quotaVerified = false;
  assert.throws(() => authorize(value, auth, 'A', executionClock.wallMs(), true), /ACCOUNT_VERIFICATION_REQUIRED/);
});

test('each phase requires its own durable activation and neither phase activates the other', async () => {
  const root = await directory(), executionClock = clock();
  const first = await run('A', { evidenceRoot: root, clock: executionClock });
  assert.equal(first.result.JevCalls, 0);
  const second = await run('B', { evidenceRoot: root, clock: executionClock });
  assert.equal(second.result.LunaCalls, 0); assert.equal(second.result.status, 'COMPLETE');
  const executions = await readdir(join(root, 'output/search-v1-s5-global-stage-ledger/executions'));
  assert.equal(executions.filter(file => file.endsWith('-claim.json')).length, 2);
  const globalClaims = await readdir(join(root, 'output/search-v1-s5-global-stage-ledger/stages'));
  assert.equal(globalClaims.length, 11);
  const terminal = JSON.parse(await readFile(join(root, 'output/search-v1-s5-live-executor-2026-11-03/activations/B', second.authorization.activationId, 'terminal.json'), 'utf8'));
  assert.equal(terminal.receiptCommitRequired, true);
});
