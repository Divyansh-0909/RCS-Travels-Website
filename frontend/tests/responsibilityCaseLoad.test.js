import test from 'node:test';
import assert from 'node:assert/strict';
import { createCaseLoadController } from '../src/lib/responsibilityCaseLoad.js';

const fixture = load => {
  const patches = [];
  const controller = createCaseLoadController(load, value => patches.push(value));
  return { ...controller, patches };
};
const pending = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

test('empty selection clears evidence without a request', async () => {
  const view = fixture(() => assert.fail('No request for an empty selection'));
  await view.open('');
  assert.deepEqual(view.patches, [{ context: null, error: '', loading: false }]);
});

test('matching response publishes unchanged evidence and ends loading', async () => {
  const response = { case: { id: 'case-a' }, evidence: { missing: null } };
  const view = fixture(async (id, signal) => { assert.equal(id, 'case-a'); assert.equal(signal.aborted, false); return response; });
  await view.open('case-a');
  assert.deepEqual(view.patches, [{ context: null, error: '', loading: true }, { context: response }, { loading: false }]);
});

test('HTTP error displays the actual error without displaying evidence', async () => {
  const view = fixture(async () => ({ error: 'Admin access required', case: { id: 'case-a' } }));
  await view.open('case-a');
  assert.deepEqual(view.patches.slice(1), [{ error: 'Admin access required' }, { loading: false }]);
});

for (const response of [undefined, {}, { case: null }, { case: {} }, { case: { id: 'case-b' } }]) {
  test(`missing or foreign case identity fails closed: ${JSON.stringify(response)}`, async () => {
    const view = fixture(async () => response);
    await view.open('case-a');
    assert.deepEqual(view.patches.slice(1), [{ error: 'The returned case does not match this request. Refresh to try again.' }, { loading: false }]);
  });
}

test('transport rejection is recoverable', async () => {
  const view = fixture(async () => { throw new Error('network'); });
  await view.open('case-a');
  assert.deepEqual(view.patches.slice(1), [{ error: 'The case could not be loaded. Please try again.' }, { loading: false }]);
});

for (const outcome of ['success', 'failure']) {
  test(`superseded ${outcome} cannot overwrite a new case or its loading state`, async () => {
    const old = pending();
    let oldSignal;
    const view = fixture((id, signal) => {
      if (id === 'case-a') { oldSignal = signal; return old.promise; }
      return Promise.resolve({ case: { id } });
    });
    const stale = view.open('case-a');
    await view.open('case-b');
    assert.equal(oldSignal.aborted, true);
    const before = structuredClone(view.patches);
    if (outcome === 'success') old.resolve({ case: { id: 'case-a' } });
    else old.reject(new Error('old network failure'));
    await stale;
    assert.deepEqual(view.patches, before);
  });
}

test('unmount and repeated disposal prevent late publication', async () => {
  const work = pending();
  const view = fixture(() => work.promise);
  view.dispose();
  const request = view.open('case-a');
  view.dispose();
  view.dispose();
  work.resolve({ case: { id: 'case-a' } });
  await request;
  assert.deepEqual(view.patches, [{ context: null, error: '', loading: true }]);
});
