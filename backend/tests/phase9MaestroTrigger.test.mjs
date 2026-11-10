import test from 'node:test';
import assert from 'node:assert/strict';
import { createMaestroTrigger } from './helpers/phase9MaestroTrigger.mjs';

test('Maestro fixture rendezvous rejects other routes/methods and seeds once after readiness', async () => {
  let calls = 0;
  const trigger = await createMaestroTrigger(async () => { calls++; });
  try {
    assert.equal(calls, 0);
    assert.equal((await fetch(trigger.url)).status, 405);
    assert.equal((await fetch(new URL('/other', trigger.url), { method: 'POST' })).status, 404);
    assert.equal(calls, 0);
    const responses = await Promise.all([fetch(trigger.url, { method: 'POST' }), fetch(trigger.url, { method: 'POST' })]);
    assert.deepEqual(responses.map(r => r.status), [200, 200]);
    assert.equal(calls, 1);
    assert.deepEqual(trigger.events.map(e => e.event), ['maestro-ready', 'offer-created']);
  } finally { await trigger.close(); }
});

test('fixture setup failure fails the flow without silently repeating its mutation', async () => {
  let calls = 0;
  const trigger = await createMaestroTrigger(async () => { calls++; throw Error('Synthetic'); });
  try {
    for (let n = 0; n < 2; n++) assert.equal((await fetch(trigger.url, { method: 'POST' })).status, 500);
    assert.equal(calls, 1);
    assert.deepEqual(trigger.events.map(e => e.event), ['maestro-ready']);
  } finally { await trigger.close(); }
});
