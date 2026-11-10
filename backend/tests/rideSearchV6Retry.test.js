import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { waitUntilDeadline, runV6Execution } from '../benchmarks/search/decisionComparison/executorRetry.js';
import { buildAmendment, loadExecution } from '../benchmarks/search/decisionComparison/executorRetryRegistration.js';
import { fakeEnvelope } from '../benchmarks/search/decisionComparison/readiness.js';
const root = fileURLToPath(new URL('../../', import.meta.url));
const amendment = await buildAmendment(root);

test('fractional and repeated early wakes finish at the deadline without an early send', async () => {
  let now = 500.25, calls = 0;
  const clock = { nowMs: () => now, async sleep(ms) { calls += 1; now += calls < 3 ? ms - 0.8 : ms; } };
  const result = await waitUntilDeadline(clock, 1000, null);
  assert.ok(now >= 1000); assert.ok(result.sleeps.every(Number.isInteger)); assert.equal(calls, 3);
});
test('a stalled or backwards clock stops after bounded waits', async () => {
  let calls = 0;
  await assert.rejects(waitUntilDeadline({ nowMs: () => 0, async sleep() { calls += 1; } }, 1000), /THROTTLE_CLOCK_FAILURE/u);
  assert.equal(calls, 8);
  let now = 3;
  await assert.rejects(waitUntilDeadline({ nowMs: () => now, async sleep() { now -= 1; } }, 1000), /THROTTLE_CLOCK_FAILURE/u);
});
test('interruption while waiting does not send or continue waiting', async () => {
  let now = 0; const controller = new AbortController();
  await assert.rejects(waitUntilDeadline({ nowMs: () => now, async sleep(ms) { now += ms; controller.abort(); } }, 1000, controller.signal), /INTERRUPTED/u);
});
test('retry amendment binds actual completed prefix and carries its requests and cost', async () => {
  const bundle = await loadExecution(root, amendment);
  assert.equal(bundle.inheritedTerminal.dispatchedCalls, 6);
  assert.equal(amendment.carryForward.remainingMaxRequests, 138);
  assert.equal(amendment.carryForward.remainingJevMaxRequests, 66);
  assert.equal(amendment.completedPrefix.length, 2);
  assert.equal(bundle.inputs.length, 24); assert.equal(bundle.plan.eligibleCategoricalLabels, 463);
});
function transports(clock, log, fail = false) {
  return Object.fromEntries(['jev', 'clef'].map(provider => [provider, { kind: 'SYNTHETIC', async send(body) {
    log.push({ provider, start: clock.nowMs() });
    if (fail) return { status: 429, body: null };
    const request = { state: body.state, questions: Object.fromEntries(Object.entries(body.questions).map(([name, q]) => [name, {
      kind: q.type, instructions: q.instructions, ...(q.type === 'choice' ? { choices: q.criteria } : {}),
    }])) };
    const choices = request.questions.booking_complexity ? { query_type: 'LOCATION_SEARCH', booking_complexity: 'NOT_APPLICABLE' } : {};
    clock.advance(2);
    return { status: 200, body: fakeEnvelope(provider, request, choices) };
  } }]));
}
function clockForTest() {
  let now = 0;
  return { nowMs: () => now, advance: ms => { now += ms; }, async sleep(ms) { now += Math.max(0.1, ms - 0.7); } };
}
test('full synthetic continuation skips completed cases and stays within aggregate 144-request envelope', async t => {
  t.mock.method(globalThis, 'fetch', () => { throw Error('EXTERNAL_REQUEST_FORBIDDEN'); });
  const clock = clockForTest(), log = [], directory = await mkdtemp(join(tmpdir(), 'rcs-v6-retry-'));
  const transport = transports(clock, log);
  const result = await runV6Execution({ root, amendment, synthetic: true, directory, clock, transports: transport });
  assert.equal(result.status, 'COMPLETE'); assert.equal(result.dispatchedCalls, 138); assert.equal(result.aggregateDispatchedCalls, 144);
  assert.equal(log.filter(row => row.provider === 'jev').length, 66); assert.equal(log.filter(row => row.provider === 'clef').length, 72);
  assert.equal(result.cases.length, 48); assert.equal(result.observations.length, 144);
  assert.equal(result.providers.jev.level1.eligible, 463); assert.equal(result.providers.clef.level1.eligible, 463);
  for (let index = 1; index < log.length; index += 1) assert.ok(log[index].start - log[index - 1].start >= 1000);
  await assert.rejects(runV6Execution({ root, amendment, synthetic: true, directory, clock, transports: transport }), /ACTIVATION_ALREADY_CLAIMED/u);
  assert.equal(log.length, 138);
});
test('a provider error halts the continuation without Clef or duplicated completed requests', async () => {
  const clock = clockForTest(), log = [], directory = await mkdtemp(join(tmpdir(), 'rcs-v6-retry-stop-'));
  const result = await runV6Execution({ root, amendment, synthetic: true, directory, clock, transports: transports(clock, log, true) });
  assert.equal(result.stopReason, 'RATE_LIMIT'); assert.equal(log.length, 1); assert.equal(result.aggregateDispatchedCalls, 7);
  assert.equal(result.cases[0].caseId, 'core-standalone-002'); assert.equal(result.cases[1].caseId, 'core-complete-simple-001');
});
