import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { browserReceiptHash, loadBrowserReplay, browserFinalInvariants } from './helpers/phase9BrowserReceipt.js';

test('saved UI replay rejects foreign paths, corrupted receipts and changed source identities', async t => {
  const root = await mkdtemp(join(tmpdir(), 'rcs-browser-receipt-'));
  const previous = process.env.PHASE9_UI_REPLAY;
  t.after(async () => {
    if (previous === undefined) delete process.env.PHASE9_UI_REPLAY;
    else process.env.PHASE9_UI_REPLAY = previous;
    assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep));
    await rm(root, { recursive: true, force: true });
  });
  const sources = { file: 'a-bound-hash' };
  assert.equal(browserReceiptHash(sources), createHash('sha256').update(JSON.stringify(sources)).digest('hex'));
  delete process.env.PHASE9_UI_REPLAY;
  assert.equal(await loadBrowserReplay(sources, root), null);
  process.env.PHASE9_UI_REPLAY = `${root}-outside/receipt.json`;
  await assert.rejects(loadBrowserReplay(sources, root), /owned evidence receipt/);
  const path = join(root, 'receipt.json');
  process.env.PHASE9_UI_REPLAY = path;
  const body = { schema: 'rcs-phase9-ui-v1', status: 'PASS', sources, actions: [], invariants: {} };
  const receipt = { ...body, integrity: browserReceiptHash(body) };
  await writeFile(path, JSON.stringify(receipt));
  assert.deepEqual(await loadBrowserReplay(sources, root), receipt);
  await assert.rejects(loadBrowserReplay({ file: 'changed-hash' }, root), /source\/configuration mismatch/);
  for (const changed of [{ schema: 'unknown' }, { status: 'FAIL' }]) {
    const invalidBody = { ...body, ...changed };
    await writeFile(path, JSON.stringify({ ...invalidBody, integrity: browserReceiptHash(invalidBody) }));
    await assert.rejects(loadBrowserReplay(sources, root), /receipt integrity mismatch/);
  }
  await writeFile(path, JSON.stringify({ ...receipt, integrity: 'invalid' }));
  await assert.rejects(loadBrowserReplay(sources, root), /receipt integrity mismatch/);
});

test('UI replay compares recorded ownership, finance and absent consequence authority', async () => {
  const calls = [];
  const db = { driver: { findUniqueOrThrow: async query => { calls.push(query); return { walletBalance: 1000, vehicleCapacity: 4 }; } } };
  for (const key of ['responsibilityFinalDecision', 'responsibilityLiability', 'responsibilityCompensation', 'reliabilityStrike', 'reliabilityBlock', 'driverPayout']) db[key] = { count: async () => 0 };
  const harness = { db, actors: { captain: { id: 'c' }, replacement: { id: 'r' } }, lifecycle: {
    booking: async () => ({ status: 'cancelled', scheduledAdvancePaidAmount: 10000, scheduledAdvanceDisposition: 'refunded', cancellationCharge: 0, driverId: null }),
    provider: { snapshot: () => ({ payments: [{ amount: 10000, status: 'captured' }], refunds: [{ amount: 10000, status: 'processed' }] }) },
  } };
  assert.deepEqual(await browserFinalInvariants(harness), {
    booking: { status: 'cancelled', advancePaid: 10000, advanceDisposition: 'refunded', cancellationCharge: 0, driverAssigned: false },
    parties: { captain: { balance: 1000, capacity: 4 }, replacement: { balance: 1000, capacity: 4 } },
    provider: { payments: [{ amount: 10000, status: 'captured' }], refunds: [{ amount: 10000, status: 'processed' }] },
    finalDecisions: 0, liabilities: 0, compensations: 0, strikes: 0, blocks: 0, payouts: 0,
  });
  assert.deepEqual(calls, [{ where: { id: 'c' } }, { where: { id: 'r' } }]);
  harness.lifecycle.booking = async () => ({ status: 'assigned', driverId: 'c' });
  assert.equal((await browserFinalInvariants(harness)).booking.driverAssigned, true);
});
