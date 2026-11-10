import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, readdir, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { setImmediate as nextTick } from 'node:timers/promises';
import { runV6Execution } from '../benchmarks/search/decisionComparison/executor.js';
import { buildAmendment, loadExecution, authorizeExecution, BASE_DIR, ENVELOPE } from '../benchmarks/search/decisionComparison/executorRegistration.js';
import { fakeEnvelope } from '../benchmarks/search/decisionComparison/readiness.js';
import { identityHash } from '../benchmarks/search/decisionComparison/adapters.js';
import { decisionFake, expressionChoices } from './helpers/rideSearchFake.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const amendment = await buildAmendment(root);
const bundle = await loadExecution(root, amendment);
const directory = () => mkdtemp(join(tmpdir(), 'rcs-search-v6-executor-'));
function virtualClock() {
  let now = 0;
  return { nowMs: () => now, advance: ms => { now += ms; }, async sleep(ms) { now += ms; } };
}
function originalRequest(body, provider) {
  assert.notEqual(provider, 'decisions');
  return { state: body.state, questions: Object.fromEntries(Object.entries(body.questions).map(([name, question]) => [name, {
    kind: question.type, instructions: question.instructions, ...(question.type === 'choice' ? { choices: question.criteria } : {}),
  }])) };
}
function fakeTransports(clock, handler, booking = false) {
  const log = [], activity = { current: 0, maximum: 0 };
  const transports = Object.fromEntries(ENVELOPE.providers.map(provider => [provider, { kind: 'SYNTHETIC', async send(body, signal) {
    log.push({ provider, at: clock.nowMs(), body }); activity.current += 1;
    activity.maximum = Math.max(activity.maximum, activity.current);
    try {
      await nextTick();
      const request = originalRequest(body, provider), selections = {};
      if (request.questions.booking_complexity) Object.assign(selections, { query_type: booking ? 'BOOKING_REQUEST' : 'LOCATION_SEARCH', booking_complexity: booking ? 'SIMPLE' : 'NOT_APPLICABLE' });
      else if (!request.questions.complexity) {
        const fixture = await decisionFake([value => expressionChoices(value)]).decide(request);
        Object.assign(selections, Object.fromEntries(Object.entries(fixture.choices).map(([name, value]) => [name, value.choice])));
      }
      for (const [name, question] of Object.entries(request.questions)) if (question.kind === 'choice'
        && selections[name] !== undefined && !Object.hasOwn(question.choices, selections[name])) {
        selections[name] = Object.keys(question.choices)[0];
      }
      const raw = fakeEnvelope(provider, request, selections);
      clock.advance(7);
      return handler ? await handler({ provider, body, request, raw, index: log.length, signal }) : { status: 200, body: raw };
    } finally { activity.current -= 1; }
  } }]));
  return { transports, log, activity };
}
async function execute(options = {}) {
  const clock = options.clock ?? virtualClock(), dir = options.directory ?? await directory();
  const fake = fakeTransports(clock, options.handler, options.booking);
  const result = await runV6Execution({ root, amendment, synthetic: true, directory: dir, clock,
    transports: fake.transports, hooks: options.hooks, signal: options.signal });
  return { result, dir, clock, ...fake };
}

test('full synthetic activation uses all 24 cases, exact manifest identities, both adapters, serialization and fixed denominators', async t => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('EXTERNAL_REQUEST_FORBIDDEN'); });
  const run = await execute();
  assert.equal(run.result.status, 'COMPLETE'); assert.equal(run.result.dispatchedCalls, 144);
  assert.equal(run.result.reservedCalls, 144); assert.equal(run.activity.maximum, 1);
  assert.equal(run.result.measurementKind, 'SYNTHETIC_EXECUTOR_TEST_NOT_PROVIDER_ACCURACY');
  for (let index = 1; index < run.log.length; index += 1) assert.ok(run.log[index].at - run.log[index - 1].at >= 1000);
  for (const sent of run.log) for (const key of ['expected', 'labels', 'truth', 'pipelineExpected']) {
    assert.equal(Object.hasOwn(JSON.parse(sent.body.state), key), false);
  }
  for (const provider of ENVELOPE.providers) {
    const cases = run.result.cases.filter(row => row.provider === provider);
    assert.deepEqual(cases.map(row => row.caseId), bundle.inputs.map(row => row.caseId));
    const metrics = run.result.providers[provider];
    assert.equal(metrics.level1.eligible, 463); assert.equal(metrics.level1.observedCases, 24);
    assert.equal(metrics.level2.fields.cases, 17); assert.equal(metrics.level2.fields.endpoints.pickup.positiveTotal, 13);
    assert.equal(metrics.level2.fields.endpoints.drop.positiveTotal, 12);
    assert.equal(metrics.level2.fields.missingFieldSetsCorrect, 0); // No booking extraction in this fixture.
    assert.deepEqual(metrics.requests, { common: 24, routing: 24, extraction: 24 });
    assert.equal(metrics.economics.all.knownInputTokens, 7200);
    assert.ok(Math.abs(metrics.economics.all.knownTariffSubtotalUsd - 7200 * (provider === 'jev' ? 0.042 : 0.24) / 1e6) < 1e-12);
    assert.equal(metrics.economics.level1.attempts, 24); assert.equal(metrics.economics.parser.attempts, 48);
  }
  assert.deepEqual(run.log.slice(0, 72).map(row => row.provider), Array(72).fill('jev'));
  const files = await readdir(join(run.dir, 'requests'));
  assert.equal(files.filter(name => name.endsWith('-intent.json')).length, 144);
  assert.equal(files.filter(name => name.endsWith('-response.json')).length, 144);
  const saved = JSON.parse(await readFile(join(run.dir, 'requests/0001-response.json'), 'utf8'));
  assert.ok(saved.observation.raw && saved.observation.normalized);
  assert.equal(saved.observation.requestIdentity, bundle.requestIndex.get(`jev:${bundle.inputs[0].caseId}:common`).requestIdentity);
  await assert.rejects(runV6Execution({ root, amendment, synthetic: true, directory: run.dir, clock: run.clock, transports: run.transports }), /ACTIVATION_ALREADY_CLAIMED/u);
  assert.equal(run.log.length, 144);
  t.diagnostic(`SYNTHETIC_FULL_RUN_EVIDENCE ${JSON.stringify({ directory: run.dir, amendmentHash: amendment.amendmentHash })}`);
});

test('live execution refuses missing or unbound authorization before claim or send', async () => {
  const clock = virtualClock(), fake = fakeTransports(clock);
  await assert.rejects(runV6Execution({ root, amendment, transports: fake.transports, clock }), /SEPARATE_LIVE_AUTHORIZATION_REQUIRED/u);
  assert.throws(() => authorizeExecution(amendment, { liveAuthorized: true, amendmentHash: 'wrong' }), /SEPARATE_LIVE_AUTHORIZATION_REQUIRED/u);
  assert.equal(fake.log.length, 0);
});

test('unavailable, modified registration and frozen artifacts are refused; source drift is caught without changing workspace files', async () => {
  const clone = await directory();
  const files = [...amendment.sourceManifest.map(row => row.file), ...['pilot-registration-v6.json', 'pilot-inputs-v6.json',
    'pilot-labels-v6.json', 'pipeline-labels-v6.json', 'request-manifest-v6.json'].map(name => `${BASE_DIR}/${name}`)];
  for (const file of files) { await mkdir(dirname(join(clone, file)), { recursive: true }); await writeFile(join(clone, file), await readFile(join(root, file))); }
  await assert.rejects(loadExecution(await directory(), amendment), /REGISTRATION_ARTIFACT_UNAVAILABLE/u);
  const path = join(clone, BASE_DIR, 'pilot-labels-v6.json'), original = await readFile(path);
  await writeFile(path, '[]'); await assert.rejects(loadExecution(clone, amendment), /ARTIFACT_DRIFT/u); await writeFile(path, original);
  const planPath = join(clone, BASE_DIR, 'pilot-registration-v6.json'), planBytes = await readFile(planPath);
  await writeFile(planPath, '{}'); await assert.rejects(loadExecution(clone, amendment), /REGISTRATION_DRIFT/u); await writeFile(planPath, planBytes);
  const source = amendment.sourceManifest[0].file;
  await writeFile(join(clone, source), 'drift'); await assert.rejects(loadExecution(clone, amendment), /SOURCE_DRIFT/u);
});

for (const [status, category] of [[429, 'RATE_LIMIT'], [401, 'AUTH_OR_ACCESS'], [403, 'AUTH_OR_ACCESS'], [402, 'PAYMENT_REQUIRED'], [413, 'RESOURCE_LIMIT'], [500, 'PROVIDER_ERROR']]) {
  test(`HTTP ${status} stops the entire activation, strips error bodies and never starts Clef`, async () => {
    const run = await execute({ handler: () => ({ status, body: { secret: 'SENSITIVE_ERROR_SENTINEL' }, retryAfter: '6' }) });
    assert.equal(run.result.status, 'STOPPED'); assert.equal(run.result.stopReason, category);
    assert.equal(run.log.length, 1); assert.equal(run.result.providers.clef.level1.observedCases, 0);
    assert.equal(run.result.providers.clef.level1.eligible, 463); assert.equal(run.result.providers.clef.level2.fields.cases, 17);
    assert.equal(run.result.observations[0].error.retryAfter, '6'); assert.equal(run.result.observations[0].raw, null);
    assert.equal(run.result.providers.jev.economics.all.completeTariffUsd, null);
    assert.equal(JSON.stringify(run.result).includes('SENSITIVE_ERROR_SENTINEL'), false);
    assert.equal((await readdir(join(run.dir, 'requests'))).length, 2);
  });
}

for (const [kind, reason] of [['MALFORMED', 'INVALID_OUTPUT'], ['USAGE', 'MISSING_OUTPUT_OR_USAGE'], ['TOKENS', 'OBSERVED_TARIFF_LIMIT'],
  ['MODEL', 'MODEL_VERSION_CHANGED'], ['ALIAS', 'MODEL_VERSION_CHANGED']]) {
  test(`${kind} response is persisted and stops before another provider request`, async () => {
    const run = await execute({ handler: ({ raw }) => {
      if (kind === 'MALFORMED') delete raw.answers.query_type;
      if (kind === 'USAGE') delete raw.usage;
      if (kind === 'TOKENS') raw.usage.input_tokens = 24577;
      if (kind === 'MODEL') raw.model = 'jev-1.99.0';
      if (kind === 'ALIAS') raw.model = 'jev-latest';
      return { status: 200, body: raw };
    } });
    assert.equal(run.result.stopReason, reason); assert.equal(run.log.length, 1);
    assert.ok(run.result.observations[0].raw); // Original successful HTTP response, including malformed prediction.
    if (['MODEL', 'ALIAS'].includes(kind)) assert.equal(run.result.providers.jev.level1.observedCases, 0);
  });
}

test('parser-stage remote failure persists actual parser result and stops the whole activation', async () => {
  const run = await execute({ booking: true, handler: ({ index, raw }) => index === 3 ? { status: 429, body: null } : { status: 200, body: raw } });
  assert.equal(run.log.length, 3); assert.equal(run.result.stopReason, 'RATE_LIMIT');
  assert.equal(run.result.observations[2].stage, 'booking');
  assert.equal(run.result.cases.length, 1); assert.ok(run.result.cases[0].parserResult);
  assert.ok(Math.abs(run.result.providers.jev.economics.level1.completeTariffUsd - 0.0000042) < 1e-12);
  assert.equal(run.result.providers.jev.economics.parser.completeTariffUsd, null);
});

test('budget and resource exhaustion refuse the next send before a durable request intent', async () => {
  for (const kind of ['BUDGET', 'RESOURCE']) {
    const run = await execute({ hooks: { beforeReserve({ ledger, provider }) {
      if (kind === 'BUDGET') ledger.state.providers[provider].knownUsd = ENVELOPE.maxUsd[provider];
      else ledger.reserve(provider, 24576, 0);
    } } });
    assert.equal(run.log.length, 0);
    assert.equal(run.result.stopReason, kind === 'BUDGET' ? 'REQUEST_OR_TARIFF_LIMIT' : 'LOCAL_CONTEXT_BUDGET');
    assert.equal((await readdir(join(run.dir, 'requests'))).length, 0);
  }
});

test('crash after durable intent leaves unknown usage and refuses restart without sending twice', async () => {
  const run = await execute({ hooks: { afterIntent() { throw new Error('PRIVATE_CRASH_MESSAGE'); } } });
  assert.equal(run.log.length, 0); assert.equal(run.result.status, 'STOPPED'); assert.equal(run.result.unresolvedIntent.id, '0001');
  assert.equal(run.result.providers.jev.economics.all.completeTariffUsd, null);
  assert.equal(JSON.stringify(run.result).includes('PRIVATE_CRASH_MESSAGE'), false);
  await access(join(run.dir, 'activation-claim.json'));
  assert.deepEqual(await readdir(join(run.dir, 'requests')), ['0001-intent.json']);
  await assert.rejects(runV6Execution({ root, amendment, synthetic: true, directory: run.dir, clock: run.clock, transports: run.transports }), /ACTIVATION_ALREADY_CLAIMED/u);
  assert.equal(run.log.length, 0);
});

test('interruption during throttle preserves the previous response and sends no next request', async () => {
  const clock = virtualClock(), controller = new AbortController(), advance = clock.sleep;
  clock.sleep = async ms => { await advance(ms); controller.abort(); };
  const run = await execute({ clock, signal: controller.signal });
  assert.equal(run.result.stopReason, 'INTERRUPTED'); assert.equal(run.log.length, 1);
  assert.ok(run.result.observations[0].normalized);
  await access(join(run.dir, 'requests/0001-response.json')); await access(join(run.dir, 'terminal.json'));
});

test('real adapter 10000ms timeout aborts a nonresponding synthetic send with zero retries', async t => {
  const realTimer = globalThis.setTimeout;
  let observedTimer = false;
  t.mock.method(globalThis, 'setTimeout', (callback, ms, ...args) => {
    if (ms === 10000) { observedTimer = true; return realTimer(callback, 1, ...args); }
    return realTimer(callback, ms, ...args);
  });
  const run = await execute({ handler: () => new Promise(() => {}) });
  assert.equal(observedTimer, true); assert.equal(run.result.stopReason, 'TIMEOUT'); assert.equal(run.log.length, 1);
  assert.equal(run.result.retries, 0);
});

test('amendment envelope/configuration changes and stale owner receipts cannot authorize execution', async () => {
  const changed = structuredClone(amendment); changed.envelope.providers.push('clefFlash');
  const { amendmentHash: ignored, ...content } = changed; void ignored;
  changed.amendmentHash = identityHash(content);
  await assert.rejects(loadExecution(root, changed), /EXECUTION_AMENDMENT_DRIFT/u);
  assert.throws(() => authorizeExecution(amendment, { liveAuthorized: true, planHash: bundle.plan.planHash,
    amendmentHash: amendment.amendmentHash, ownerReply: 'synthetic approval, never saved', receiptReference: 'SYNTHETIC_TEST_ONLY',
    envelope: ENVELOPE, issuedAt: '1970-01-01T00:00:00Z', expiresAt: '1970-01-01T00:00:01Z' }, 2000), /AUTHORIZATION_EXPIRED/u);
});

test('parser schema-default amendment preserves common requests and the original preview manifest', () => {
  assert.equal(amendment.parserRequestManifest.length, 144);
  for (const row of amendment.parserRequestManifest) {
    const original = bundle.requests.find(value => value.provider === row.provider && value.caseId === row.caseId && value.stage === row.stage);
    assert.equal(original.requestIdentity, row.originalPreviewRequestIdentity);
    assert.notEqual(row.requestIdentity, original.requestIdentity);
  }
  for (const input of bundle.inputs) {
    const row = bundle.requestIndex.get(`jev:${input.caseId}:common`);
    assert.equal(row.requestIdentity, bundle.requests.find(value => value.provider === 'jev' && value.caseId === input.caseId && value.stage === 'common').requestIdentity);
  }
});

test('two simultaneous activations have one durable winner and no duplicate send', async () => {
  const dir = await directory(), clock = virtualClock();
  const fake = fakeTransports(clock, () => ({ status: 429, body: null }));
  const args = { root, amendment, synthetic: true, directory: dir, clock, transports: fake.transports };
  const results = await Promise.allSettled([runV6Execution(args), runV6Execution(args)]);
  assert.equal(results.filter(row => row.status === 'fulfilled').length, 1);
  assert.match(results.find(row => row.status === 'rejected').reason.message, /ACTIVATION_ALREADY_CLAIMED/u);
  assert.equal(fake.log.length, 1);
});

test('transport failures retain only category and halt before Clef', async () => {
  const run = await execute({ handler() { throw new Error('PRIVATE_TRANSPORT_FAILURE'); } });
  assert.equal(run.result.stopReason, 'TRANSPORT_ERROR'); assert.equal(run.log.length, 1);
  assert.equal(JSON.stringify(run.result).includes('PRIVATE_TRANSPORT_FAILURE'), false);
});

test('invalid token counters and refusals are terminal normalization failures', async () => {
  for (const kind of ['INVALID_USAGE', 'REFUSAL']) {
    const run = await execute({ handler({ raw }) {
      if (kind === 'INVALID_USAGE') raw.usage.input_tokens = -1;
      else raw.answers.query_type = { type: 'refusal' };
      return { status: 200, body: raw };
    } });
    assert.equal(run.result.stopReason, kind); assert.equal(run.log.length, 1);
  }
});

test('full synthetic booking path uses actual extraction, guards, unsupported features and fixed field denominators', async () => {
  const run = await execute({ booking: true });
  assert.equal(run.result.status, 'COMPLETE', JSON.stringify({ reason: run.result.stopReason, cases: run.result.cases.length,
    lastCase: run.result.cases.at(-1)?.caseId, lastObservation: run.result.observations.at(-1)?.stage }));
  assert.ok(run.result.dispatchedCalls <= 144);
  for (const provider of ENVELOPE.providers) {
    const metrics = run.result.providers[provider];
    assert.equal(metrics.level2.observed, 24); assert.equal(metrics.level2.fields.cases, 17);
    assert.ok(metrics.requests.extraction > 0);
    assert.equal(metrics.level2.fields.negativeExclusionCohort.total, 6);
    assert.equal(metrics.level2.fields.negativeSharingCohort.total, 3);
    assert.equal(metrics.level2.submittedBookings, 0); assert.equal(metrics.level2.fallbackExecuted, 0);
  }
});

test('hard process exit after fsynced intent leaves a durable claim and cannot be resumed', async () => {
  const dir = await directory();
  const runner = pathToFileURL(join(root, 'backend/benchmarks/search/decisionComparison/executor.js')).href;
  const registration = pathToFileURL(join(root, 'backend/benchmarks/search/decisionComparison/executorRegistration.js')).href;
  const source = `import {runV6Execution} from ${JSON.stringify(runner)};
    import {buildAmendment} from ${JSON.stringify(registration)};
    const root=${JSON.stringify(root)}, amendment=await buildAmendment(root);
    const transport={kind:'SYNTHETIC',async send(){throw Error('SEND_MUST_NOT_OCCUR');}};
    await runV6Execution({root,amendment,synthetic:true,directory:${JSON.stringify(dir)},
      transports:{jev:transport,clef:transport},clock:{nowMs:()=>0,async sleep(){}},hooks:{afterIntent(){process.exit(73);}}});`;
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', source], {
      cwd: join(root, 'backend'), windowsHide: true, stdio: ['ignore', 'ignore', 'ignore'],
    });
    child.once('error', reject); child.once('exit', resolve);
  });
  assert.equal(code, 73);
  assert.deepEqual(await readdir(join(dir, 'requests')), ['0001-intent.json']);
  await assert.rejects(access(join(dir, 'terminal.json')), { code: 'ENOENT' });
  const clock = virtualClock(), fake = fakeTransports(clock);
  await assert.rejects(runV6Execution({ root, amendment, synthetic: true, directory: dir, clock, transports: fake.transports }), /ACTIVATION_ALREADY_CLAIMED/u);
  assert.equal(fake.log.length, 0);
});

test('response evidence collision stops safely without overwriting prior evidence', async () => {
  const dir = await directory();
  const run = await execute({ directory: dir, hooks: { async afterIntent() {
    await writeFile(join(dir, 'requests/0001-response.json'), 'preserved-evidence', { flag: 'wx' });
  } } });
  assert.equal(run.result.status, 'STOPPED'); assert.equal(run.log.length, 1);
  assert.equal(await readFile(join(dir, 'requests/0001-response.json'), 'utf8'), 'preserved-evidence');
  assert.ok(run.result.observations[0].raw); await access(join(dir, 'terminal.json'));
});

test('wall-clock changes cannot shorten monotonic request-start intervals', async () => {
  const clock = virtualClock(); let wallReads = 0;
  clock.wallMs = () => { wallReads += 1; return Date.now() + wallReads * 86400000; };
  const run = await execute({ clock, handler: ({ index, raw }) => index === 2 ? { status: 429, body: null } : { status: 200, body: raw } });
  assert.equal(run.log.length, 2); assert.ok(run.log[1].at - run.log[0].at >= 1000);
  assert.equal(wallReads, 1); assert.equal(run.result.stopReason, 'RATE_LIMIT');
});
