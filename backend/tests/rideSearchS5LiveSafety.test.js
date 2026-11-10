import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { run, amendment, clock, authorization, transport, directory, jevResponse, lunaResponse } from './helpers/searchS5ExecutorFake.js';
import { runS5Phase } from '../benchmarks/search/s5Executor/executor.js';
import { authorize } from '../benchmarks/search/s5Executor/registration.js';
import { createBudget, measureUsage } from '../benchmarks/search/s5Executor/accounting.js';

for (const phase of ['A', 'B']) for (const status of [429, 401, 403, 402, 413, 500]) test(`${phase}: HTTP ${status} stops with zero retries and no arbitrary error body`, async () => {
  const attempt = await run(phase, { handler: () => ({ status, retryAfter: '6', body: { error: { message: 'DO_NOT_RETAIN_PROVIDER_ERROR_TEXT' } } }) });
  assert.equal(attempt.transport.calls.length, 1); assert.equal(attempt.result.status, 'STOPPED');
  assert.equal(attempt.result.stopReason, `HTTP_${status}`); assert.equal(attempt.result.budget.unknownTariffRequests, 1);
  const path = join(attempt.evidenceRoot, 'output/search-v1-s5-live-executor-2026-11-03/activations', phase, attempt.authorization.activationId, 'requests');
  const text = (await Promise.all((await readdir(path)).map(file => readFile(join(path, file), 'utf8')))).join('');
  assert.equal(text.includes('DO_NOT_RETAIN_PROVIDER_ERROR_TEXT'), false); assert.ok(text.includes('retryAfter'));
});

for (const fault of ['model', 'missingUsage', 'cacheMismatch', 'tokenExcess', 'tier', 'incomplete', 'invalidSpan', 'inventedPlace', 'inventedSelection', 'wrongQuery', 'refusal']) test(`A: ${fault} stops and preserves observed usage without Places`, async () => {
  const attempt = await run('A', { handler: request => {
    const response = lunaResponse(request, output => {
      if (fault === 'invalidSpan') output.locations[0].start = -1;
      if (fault === 'inventedPlace') { output.locations[0].start = 0; output.locations[0].end = 4; output.locations[0].exactText = 'Mars'; }
      if (fault === 'inventedSelection') output.draft.pickup = { state: 'RESOLVED', value: { kind: 'USER_SELECTION', selectionId: 'model-confirmed' }, refs: [] };
      if (fault === 'wrongQuery') output.draft.query.revision++;
    });
    if (fault === 'model') response.body.model = 'gpt-other';
    if (fault === 'missingUsage') delete response.body.usage;
    if (fault === 'cacheMismatch') response.body.usage.input_tokens_details.cache_write_tokens = 99999;
    if (fault === 'tokenExcess') { response.body.usage.input_tokens = 65537; response.body.usage.total_tokens = 65837; }
    if (fault === 'tier') response.body.service_tier = 'priority';
    if (fault === 'incomplete') response.body.status = 'incomplete';
    if (fault === 'refusal') response.body.output[0].content = [{ type: 'refusal', refusal: 'synthetic' }];
    return response;
  } });
  assert.equal(attempt.result.status, 'STOPPED'); assert.equal(attempt.transport.calls.length, 1);
  assert.equal(attempt.result.PlacesCalls, 0); assert.equal(attempt.result.submittedBookings, 0);
});

for (const fault of ['model', 'malformedChoice', 'missingUsage', 'usageMismatch']) test(`B: ${fault} stops the current activation with explicit attribution`, async () => {
  const attempt = await run('B', { handler: async request => {
    const response = await jevResponse(request);
    if (fault === 'model') response.body.model = 'jev-1.13.0';
    if (fault === 'malformedChoice') response.body.answers.query_type.choice = 'INVENTED';
    if (fault === 'missingUsage') delete response.body.usage;
    if (fault === 'usageMismatch') response.body.usage.total_tokens = 123456;
    return response;
  } });
  assert.equal(attempt.result.status, 'STOPPED'); assert.equal(attempt.transport.calls.length, 1);
  assert.equal(attempt.result.cases[0].providerFailure, attempt.result.stopReason);
});

test('reservations, usage discrepancies and per-phase request ceilings stop before excess sends', () => {
  const budget = createBudget('A'); budget.reserve('luna', 56611);
  assert.throws(() => budget.reserve('luna', 56611), /CONCURRENCY_VIOLATION/);
  budget.observe({ known: true, inputTokens: 100, outputTokens: 10, tariffUsd: 0.001, category: null });
  assert.throws(() => budget.reserve('luna', 56611), /BUDGET_OR_REQUEST_LIMIT/);
  const exhausted = createBudget('B'); exhausted.state.knownTariffUsd = 0.0199;
  assert.throws(() => exhausted.reserve('routing', 1000), /BUDGET_OR_REQUEST_LIMIT/);
  const oversized = createBudget('A'); assert.throws(() => oversized.reserve('luna', 65536), /REQUEST_PAYLOAD_LIMIT/);
  assert.equal(measureUsage('luna', { model: 'gpt-6-luna', usage: { input_tokens: 100, output_tokens: 1 } }).category, 'UNKNOWN_OR_INVALID_CACHE_USAGE');
});

test('authorization expiry and malformed timezone are rejected before a request', async () => {
  const value = await amendment(), executionClock = clock(), auth = authorization(value, 'A', executionClock);
  auth.expiresAt = new Date(executionClock.wallMs()).toISOString();
  assert.throws(() => authorize(value, auth, 'A', executionClock.wallMs(), true), /AUTHORIZATION_EXPIRED/);
  auth.expiresAt = '2026-11-03T14:00:00';
  assert.throws(() => authorize(value, auth, 'A', executionClock.wallMs(), true), /AUTHORIZATION_EXPIRED/);
});

test('expiry after a response retains the charge and stops before adoption or another provider', async () => {
  const executionClock = clock();
  const attempt = await run('A', { clock: executionClock, handler: request => { const response = lunaResponse(request); executionClock.advance(3600001); return response; } });
  assert.equal(attempt.result.status, 'STOPPED'); assert.equal(attempt.transport.calls.length, 1);
  assert.ok(attempt.result.budget.knownTariffUsd > 0); assert.equal(attempt.result.cases.length, 0);
});

test('an interrupted durable intent cannot be resumed under the same or a different activation ID', async () => {
  const executionClock = clock(), root = await directory();
  const attempt = await run('B', { evidenceRoot: root, clock: executionClock, hooks: { afterIntent() { const error = new Error('INTERRUPTED'); error.category = 'INTERRUPTED'; throw error; } } });
  assert.equal(attempt.result.status, 'STOPPED'); assert.equal(attempt.transport.calls.length, 0);
  await assert.rejects(run('B', { evidenceRoot: root, clock: executionClock }), /GLOBAL_PREDECESSOR_UNRESOLVED/);
});

test('a completed global network identity cannot be sent again under a fresh authorization', async () => {
  const executionClock = clock(), root = await directory();
  const first = await run('A', { evidenceRoot: root, clock: executionClock }); assert.equal(first.result.status, 'COMPLETE');
  const network = transport('A', undefined, executionClock);
  await assert.rejects(run('A', { evidenceRoot: root, clock: executionClock, transport: network }), /GLOBAL_STAGE_ALREADY_CLAIMED/);
  assert.equal(network.calls.length, 0);
});

for (const failingWrite of ['stage-claim', 'intent', 'response', 'case', 'terminal', 'global-terminal', 'commit']) test(`failed ${failingWrite} persistence prevents a committed success and all following sends`, async () => {
  const attempt = await run('B', { hooks: { beforeWrite(kind) { if (kind === failingWrite) throw new Error('SYNTHETIC_DISK_FAILURE'); } } });
  assert.equal(attempt.result.status, 'STOPPED');
  assert.ok(attempt.transport.calls.length <= (['terminal', 'global-terminal', 'commit'].includes(failingWrite) ? 10 : 2));
  const next = transport('B', undefined, attempt.clock);
  await assert.rejects(run('B', { evidenceRoot: attempt.evidenceRoot, clock: attempt.clock, transport: next }), /GLOBAL_PREDECESSOR_UNRESOLVED/);
  assert.equal(next.calls.length, 0);
});

test('the real Phase A timeout boundary aborts a stalled fake HTTP request without retry', async () => {
  const attempt = await run('A', { handler: () => new Promise(() => {}) });
  assert.equal(attempt.result.status, 'STOPPED'); assert.match(attempt.result.stopReason, /TIMEOUT/);
  assert.equal(attempt.transport.calls.length, 1); assert.equal(attempt.result.publishedTariffTotalUsd, null);
});

test('global execution claims prevent Phase B from overlapping an in-flight Phase A', async () => {
  const executionClock = clock(), root = await directory();
  let entered, release;
  const started = new Promise(resolve => { entered = resolve; }), gate = new Promise(resolve => { release = resolve; });
  const running = run('A', { evidenceRoot: root, clock: executionClock, handler: async request => { entered(); await gate; return lunaResponse(request); } });
  await started;
  await assert.rejects(run('B', { evidenceRoot: root, clock: executionClock }), /GLOBAL_PREDECESSOR_UNRESOLVED/);
  release(); assert.equal((await running).result.status, 'COMPLETE');
});

test('partial known charges remain a subtotal when a later Jev request fails', async () => {
  const attempt = await run('B', { handler: (request, number) => number === 1 ? jevResponse(request)
    : { status: 429, retryAfter: '6', body: { error: 'synthetic' } } });
  assert.equal(attempt.transport.calls.length, 2); assert.ok(attempt.result.budget.knownTariffUsd > 0);
  assert.equal(attempt.result.budget.unknownTariffRequests, 1); assert.equal(attempt.result.publishedTariffTotalUsd, null);
});

test('source-fence failure before the physical HTTP request produces zero dispatches', async () => {
  let count = 0;
  const attempt = await run('B', { hooks: { fence() { if (++count === 4) { const error = new Error('SOURCE_DRIFT'); error.category = 'SOURCE_DRIFT'; throw error; } } } });
  assert.equal(attempt.result.status, 'STOPPED'); assert.equal(attempt.transport.calls.length, 0);
});

test('live mode refuses synthetic receipts and evidence-root overrides before any provider request', async () => {
  const value = await amendment(), executionClock = clock(), network = transport('A', undefined, executionClock);
  const auth = authorization(value, 'A', executionClock);
  await assert.rejects(runS5Phase({ amendment: value, authorization: auth, phase: 'A', transport: { ...network, kind: 'LIVE' },
    evidenceRoot: await directory(), clock: executionClock }), /LIVE_PATH_OR_HOOK_OVERRIDE_REFUSED/);
  assert.equal(network.calls.length, 0);
});
