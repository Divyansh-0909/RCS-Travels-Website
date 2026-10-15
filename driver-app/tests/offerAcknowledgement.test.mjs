import test from 'node:test';
import assert from 'node:assert/strict';
import { refreshOfferAcknowledgement } from '../src/lib/offerAcknowledgement.ts';

test('success and HTTP failure refresh actual offer and driver state without changing the response', async () => {
  for (const result of [{ bookingId: 'synthetic' }, { error: 'Acknowledgement lost', status: 503 }]) {
    const calls = [];
    assert.equal(await refreshOfferAcknowledgement(async () => { calls.push('answer'); return result; },
      async () => { calls.push('offers'); }, async () => { calls.push('profile'); }), result);
    assert.deepEqual(calls, ['answer', 'offers', 'profile']);
  }
});
test('a transport exception still reconciles both surfaces and preserves the original failure', async () => {
  const calls = [];
  const failure = new Error('Synthetic lost response');
  await assert.rejects(refreshOfferAcknowledgement(async () => { throw failure; },
    async () => { calls.push('offers'); }, async () => { calls.push('profile'); }), error => error === failure);
  assert.deepEqual(calls, ['offers', 'profile']);
});
test('refresh failures cannot turn an ambiguous response into success or erase its error', async () => {
  const result = { error: 'Synthetic ambiguous response' };
  assert.equal(await refreshOfferAcknowledgement(async () => result, async () => { throw new Error('Offline'); },
    async () => { throw new Error('Offline'); }), result);
});
