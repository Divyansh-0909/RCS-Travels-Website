import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { json, PACKAGE, digest } from '../benchmarks/search/s5Continuation/artifacts.js';
import { verifyRegistration } from '../benchmarks/search/s5Continuation/registration.js';
import { compatibleJev, exactReplay } from '../benchmarks/search/s5Continuation/compatibility.js';
import { requireCurrentLunaParent } from '../benchmarks/search/s5Continuation/lunaPreparation.js';
import { createBudget, runSyntheticBatch, auditSyntheticReceipts } from '../benchmarks/search/s5Continuation/ledger.js';
import { reserveUsd } from '../benchmarks/search/s5Continuation/bounds.js';
import { createLunaInterpreter } from '../services/search/complex/luna.ts';
import { emptyDraft } from '../services/search/contracts.ts';

const registration = await json(PACKAGE + 'registration.json');
const reconciliation = await json(PACKAGE + 'reconciliation.json');
const terminal = await json('output/search-v1-v6-retry-2026-11-03/comparison-live-results-v6-complete.json');
const catalog = terminal.observations.filter(row => row.provider === 'jev' && row.stage !== 'common');
const first = registration.requests.find(row => row.caseId === registration.firstJevBatch[0] && row.stage === 'routing');
const booking = registration.requests.find(row => row.caseId === first.caseId && row.stage === 'booking');
const luna = registration.requests.find(row => row.provider === 'luna');
const rehash = value => { const body = structuredClone(value); delete body.registrationHash; return { ...body, registrationHash: digest(body) }; };
const clock = () => { let now = 0; return { now: () => now, async sleep(ms) { now += ms; } }; };
const success = stage => ({ status: 200, model: stage.provider === 'jev' ? 'jev-1.14.0' : 'gpt-6-luna',
  usage: { inputTokens: 100, outputTokens: 5 }, nextStage: stage.stage === 'routing' ? 'booking' : null });
async function run(stages, responder = success, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'rcs-s5-current-'));
  const calls = [];
  const transport = { kind: 'SYNTHETIC', async send(stage) { calls.push(stage); return responder(stage); } };
  const result = await runSyntheticBatch(registration, stages, transport, { directory, clock: clock(), verify: async () => {}, ...options });
  return { result, calls, directory, transport };
}

test('source-bound registration and complete dependency identities verify without inference', async () => {
  const result = await verifyRegistration(registration);
  assert.equal(result.inferenceCalls, 0); assert.equal(result.liveAuthorized, false);
  assert.ok(registration.sourceManifest.some(row => row.file.endsWith('complex/evidence.ts')));
  assert.ok(registration.sourceManifest.some(row => row.file.endsWith('negation.ts')));
});

test('changed source hashes and changed request/artifact registration fail closed', async () => {
  const changed = structuredClone(registration); changed.sourceManifest[0].sha256 = '0'.repeat(64);
  await assert.rejects(verifyRegistration(rehash(changed)), /SOURCE_DRIFT/);
  const request = structuredClone(registration); request.requests[0].request.state += ' ';
  await assert.rejects(verifyRegistration(rehash(request)), /REQUEST_DRIFT/);
});

test('development allowlist excludes unknown or sealed cases without reading their labels', async () => {
  const changed = structuredClone(registration); changed.developmentOrder[0] = 'SEALED_CASE';
  await assert.rejects(verifyRegistration(rehash(changed)), /DEVELOPMENT_SCOPE_DRIFT/);
  for (const path of ['docs/search/benchmark-v1/frozen-v1/dataset.json',
    'docs/search/hindi-hinglish-unseen-challenge-v2/dataset.json', 'docs/search/s6-development/verifier-input.json']) {
    await assert.rejects(json(path), /SEALED_INPUT_ACCESS_REFUSED/);
  }
});

test('reuse requires full wire request, timeout/retry policy and reported model, not query identity alone', () => {
  const saved = catalog[0], options = { timeout: 10000, retry: { maxRetries: 0 } };
  assert.equal(compatibleJev(saved, saved.request, options), true);
  assert.equal(compatibleJev(saved, { ...saved.request, state: saved.request.state + ' ' }, options), false);
  assert.equal(compatibleJev(saved, saved.request, { ...options, timeout: 60000 }), false);
  assert.equal(compatibleJev({ ...saved, raw: { ...saved.raw, model: 'jev-1.13.0' } }, saved.request, options), false);
});

test('all reusable Jev cases retain exact source outcomes and zero invented provenance', async () => {
  assert.equal(reconciliation.summary.currentExactJevCases, 8);
  assert.equal(reconciliation.summary.currentExactJevRequests, 14);
  for (const row of reconciliation.cases.filter(item => item.replay.exactRequestReuse)) {
    assert.equal(row.replay.semanticOutcomeMatchesOriginal, true);
    assert.deepEqual(row.replay.provenance, []);
    assert.ok(row.replay.served.every(item => item.actualReportedModel === 'jev-1.14.0'));
  }
  const inputs = await json('output/search-s5-authorized-development/development-inputs.json');
  const fresh = await exactReplay(inputs.find(row => row.caseId === first.caseId), catalog);
  assert.equal(fresh.exactRequestReuse, false); assert.equal(fresh.parserResult, null); assert.equal(fresh.currentFallback, null);
});

test('original fifty retain exact order with stage-specific dispositions rather than invented new eligibility', () => {
  assert.equal(reconciliation.original50.length, 50);
  assert.deepEqual(reconciliation.original50.map(row => row.caseId), registration.historical50Order);
  assert.equal(reconciliation.original50.filter(row => row.current.currentLunaEligible === null).length, 47);
  assert.deepEqual(reconciliation.original50.filter(row => row.current.currentLunaEligible === false).map(row => row.caseId),
    ['core-date-only-001', 'core-vehicle-preferences-002']);
});

test('Luna parent fence rejects changed source, original candidates, clock and query revisions', () => {
  requireCurrentLunaParent(luna.parent, luna.input, registration.sourceIdentity);
  assert.throws(() => requireCurrentLunaParent(luna.parent, luna.input, 'old-source'), /STALE_OR_INELIGIBLE/);
  for (const mutate of [input => { input.query.revision++; }, input => { input.now = '2026-11-03T00:00:00Z'; },
    input => { input.candidates.push({ candidateId: 'invented' }); }, input => { input.trustedFields.push({ field: 'pickup', value: {} }); }]) {
    const input = structuredClone(luna.input); mutate(input);
    assert.throws(() => requireCurrentLunaParent(luna.parent, input, registration.sourceIdentity), /STALE_OR_INELIGIBLE/);
  }
  const legacy = reconciliation.original50[0].hypotheticalOldLunaInput;
  assert.throws(() => requireCurrentLunaParent(luna.parent, legacy, registration.sourceIdentity), /STALE_OR_INELIGIBLE/);
});

test('actual Luna adapter still rejects fabricated source spans and model-created selection authority', async () => {
  const draft = emptyDraft(luna.input.query); delete draft.candidates;
  draft.queryType = 'BOOKING_REQUEST'; draft.complexity = 'COMPLEX';
  draft.pickup = { state: 'RESOLVED', value: { kind: 'USER_SELECTION', selectionId: 'model-invented' }, refs: [] };
  const interpreter = createLunaInterpreter({ transport: { async parse() { return { model: 'gpt-6-luna',
    usage: { input_tokens: 1, output_tokens: 1 }, output_parsed: { draft, locations: [] } }; } } });
  await assert.rejects(interpreter.interpret(luna.input), error => error.code === 'LUNA_SCHEMA_ERROR');
});

test('proposed reservations include generative Luna output and default cache writes', () => {
  assert.equal(reserveUsd('jev'), 0.001032192);
  assert.equal(reserveUsd('luna'), 0.01024);
  const limited = createBudget({ maxRequests: { jev: 1, luna: 1, total: 1 }, maxUsd: { jev: 0.001, luna: 1, total: 1 } });
  assert.throws(() => limited.reserve('jev'), /BUDGET_OR_REQUEST_LIMIT/); assert.equal(limited.snapshot().counts.total, 0);
  const budget = createBudget(); budget.reserve('jev');
  assert.throws(() => budget.reserve('luna'), /CONCURRENCY_STOP/);
});

test('synthetic branch execution is sequential and duplicate stages never dispatch twice', async () => {
  const result = await run([first, booking, booking]);
  assert.equal(result.calls.length, 2); assert.equal(result.result.reason, 'DUPLICATE_STAGE_STOP');
  const audit = await auditSyntheticReceipts(result.directory);
  assert.equal(audit.completed.length, 2); assert.deepEqual(audit.unresolved, []);
});

test('extraction cannot execute before a current routing receipt selects its branch', async () => {
  const result = await run([booking]); assert.equal(result.calls.length, 0);
  assert.equal(result.result.reason, 'UNPROVEN_PARSER_BRANCH_STOP');
});

for (const status of [429, 401, 403, 402, 500]) test(`HTTP ${status} stops the activation with no retry or later provider`, async () => {
  const result = await run([first, luna], () => ({ status, retryAfter: '6', body: 'ARBITRARY_BODY_MUST_NOT_BE_RETAINED' }));
  assert.equal(result.calls.length, 1); assert.equal(result.result.reason, `HTTP_${status}_STOP`);
  const text = (await Promise.all((await readdir(result.directory)).map(file => readFile(join(result.directory, file), 'utf8')))).join('');
  assert.equal(text.includes('ARBITRARY_BODY_MUST_NOT_BE_RETAINED'), false);
});

for (const fault of ['malformed', 'refusal', 'modelDrift', 'unknownUsage', 'tokenExcess']) test(`${fault} stops subsequent sends`, async () => {
  const result = await run([first, luna], stage => {
    const response = success(stage);
    if (fault === 'modelDrift') response.model = 'jev-future';
    else if (fault === 'unknownUsage') response.usage = null;
    else if (fault === 'tokenExcess') response.usage.inputTokens = 24577;
    else response[fault] = true;
    return response;
  });
  assert.equal(result.calls.length, 1); assert.equal(result.result.status, 'STOPPED');
});

test('interrupted request retains unresolved durable intent and claimed activation cannot restart', async () => {
  const result = await run([first, booking], () => { throw new Error('SIMULATED_CRASH'); });
  const audit = await auditSyntheticReceipts(result.directory);
  assert.equal(audit.unresolved.length, 1); assert.equal(audit.requiresSeparateAmendmentAfterInterruption, true);
  await assert.rejects(runSyntheticBatch(registration, [first], result.transport,
    { directory: result.directory, clock: clock(), verify: async () => {} }), error => error.code === 'EEXIST');
  assert.equal(result.calls.length, 1);
});

test('timeouts retain intent, stop without retry and do not dispatch a later provider', async () => {
  const result = await run([first, luna], () => new Promise(() => {}), { syntheticTimeoutMs: 5 });
  assert.equal(result.result.reason, 'TIMEOUT_STOP'); assert.equal(result.calls.length, 1);
});

test('source drift before send consumes no request budget and sends nothing', async () => {
  let checks = 0;
  const result = await run([first], success, { verify: async () => { if (++checks > 1) throw new Error('SOURCE_DRIFT'); } });
  assert.equal(result.calls.length, 0); assert.equal(result.result.reason, 'SOURCE_DRIFT');
});

test('minimum start gaps use bounded rechecking even when the clock wakes early', async () => {
  let now = 0; const starts = [];
  const virtual = { now: () => now, async sleep(ms) { now += Math.max(1, ms - 0.25); } };
  const result = await run([first, booking], stage => { starts.push(now); return success(stage); }, { clock: virtual });
  assert.equal(result.result.status, 'COMPLETE'); assert.ok(starts[1] - starts[0] >= 1000);
});

test('live transports remain inaccessible through the offline preparation package', async () => {
  await assert.rejects(runSyntheticBatch(registration, [first], { kind: 'LIVE', send() { throw new Error('MUST_NOT_SEND'); } }, {}),
    /LIVE_EXECUTION_NOT_IMPLEMENTED_OR_AUTHORIZED/);
});
