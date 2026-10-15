import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { sealUiReproduction, validateUiReproduction } from '../../tools/phase9-cross/ui-reproduction.mjs';

const observation = { initial: { clock: '2026-10-11T12:00:00.000Z', booking: { fare: 1000 } },
  sources: { 'synthetic.js': 'source-hash' }, actions: [], events: ['held', 'cancelled'], error: 'Controlled failure' };
test('failed physical UI recipe emits fixed isolated invocation and a bounded backend event order', () => {
  const artifact = sealUiReproduction('native-race', observation);
  const payload = validateUiReproduction(JSON.parse(JSON.stringify(artifact)));
  assert.deepEqual(payload.backend.order, ['capture', 'offer', 'customer_cancel', 'accept']);
  assert.deepEqual(payload.backend.initial, { at: observation.initial.clock, fare: 1000 });
  assert.deepEqual(payload.invocation, ['node', 'backend/tests/run-phase9-cross.js', '--adversarial-native', '--keep-awake']);
  assert.deepEqual(payload.events, observation.events);
  assert.match(payload.backend.boundary, /monotonic controlled fixture times/);
  assert.match(payload.sourcePolicy, /do not claim identical old UI bytecode or OS scheduling/);
});
test('customer failure captures labelled request mutations without inventing exact UI replay', () => {
  const payload = validateUiReproduction(sealUiReproduction('customer-safety', { ...observation, events: undefined, controlled: ['expired-token'] }));
  assert.equal(payload.backend, null); assert.deepEqual(payload.events, ['expired-token']);
  assert.equal(payload.fixture, 'traditional-form-v1');
  assert.deepEqual(payload.invocation, ['node', 'backend/tests/run-phase9-cross.js', '--adversarial-browser', '--keep-awake']);
});
test('a failure before fixture setup retains its diagnosis without fabricating backend inputs', () => {
  for (const initial of [undefined, { clock: 'invalid' }, { clock: observation.initial.clock },
    { clock: observation.initial.clock, booking: null }, { clock: observation.initial.clock, booking: {} }]) {
    const payload = validateUiReproduction(sealUiReproduction('native-race', { ...observation, initial }));
    assert.equal(payload.backend, null); assert.equal(payload.outcome, observation.error);
  }
});
test('untrusted recipes, source/outcome tampering and malformed schema cannot launch commands', () => {
  assert.throws(() => sealUiReproduction('arbitrary-command', observation), /Unsupported/);
  for (const change of [value => { value.recipe = '__proto__' }, value => { value.schema = 'unknown' },
    value => { value.outcome = 'changed' }, value => { value.invocation.push('arbitrary') }]) {
    const value = sealUiReproduction('native-race', observation); change(value);
    assert.throws(() => validateUiReproduction(value), /Invalid/);
  }
});
test('a recomputed digest cannot authorize a command outside the fixed recipe invocation', () => {
  const { integrity: _original, ...payload } = sealUiReproduction('native-race', observation);
  payload.invocation.push('untrusted-provider-command');
  const integrity = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  assert.throws(() => validateUiReproduction({ ...payload, integrity }), /Invalid UI reproduction invocation/);
});

test('even a recomputed hash cannot authorize an unknown schema or recipe', () => {
  for (const change of [value => { value.schema = 'unknown' }, value => { value.recipe = '__proto__' }]) {
    const { integrity: _original, ...payload } = sealUiReproduction('native-race', observation);
    change(payload);
    const integrity = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    assert.throws(() => validateUiReproduction({ ...payload, integrity }), /Invalid UI reproduction identity/);
  }
});
test('native appeal has its own fixture/launcher and records provider events without a false backend replay claim', () => {
  const payload = validateUiReproduction(sealUiReproduction('captain-appeal', observation));
  assert.equal(payload.fixture, 'driver-incident-replacement-v1'); assert.equal(payload.backend, null);
  assert.deepEqual(payload.invocation, ['node', 'backend/tests/run-phase9-cross.js', '--adversarial-appeal', '--keep-awake']);
});

test('additional adversarial recipes launch fixed isolated regressions and retain runtime identity without inventing event replay', () => {
  for (const mode of ['competing', 'replacement', 'terminal', 'permissions', 'recovery']) {
    const runtime = { package: 'com.rcstravels.driver.phase9', build: 'synthetic-build' };
    const payload = validateUiReproduction(sealUiReproduction('native-' + mode, { ...observation, runtime }));
    assert.equal(payload.backend, null); assert.deepEqual(payload.runtime, runtime); assert.equal(payload.fixture, 'scheduled-1000-v1');
    assert.equal(payload.invocation[2], '--adversarial-' + mode);
  }
  const admin = validateUiReproduction(sealUiReproduction('admin-supersession', observation));
  assert.equal(admin.invocation[2], '--adversarial-supersession'); assert.equal(admin.fixture, 'driver-incident-replacement-v1');
});
