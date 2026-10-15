import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { browserReceiptHash } from '../../backend/tests/helpers/phase9BrowserReceipt.js';

const output = 'output/phase9-cross-application-2026-10-11', runs = process.argv.slice(2);
assert.equal(runs.length, 2); assert.notEqual(runs[0], runs[1]);
const selected = [];
for (const run of runs) {
  assert.match(run, /^device-\d+-[a-f0-9-]+$/);
  const receiptBytes = await readFile(join(output, run, 'receipt.json'));
  const receipt = JSON.parse(receiptBytes), { integrity, ...body } = receipt;
  assert.equal(browserReceiptHash(body), integrity); assert.equal(receipt.status, 'PASS');
  const audit = JSON.parse(await readFile(join(output, run, 'financial-audit.json')));
  assert.equal(audit.status, 'PASS');
  assert.equal(audit.receiptSha256, createHash('sha256').update(receiptBytes).digest('hex'));
  const restoration = JSON.parse(await readFile(join(output, run, 'permission-restoration.json')));
  assert.deepEqual(restoration.restored, receipt.originalPermissions);
  for (const granted of Object.values(restoration.restored)) assert.equal(granted, false);
  assert.equal(receipt.finalPermissions.ACCESS_FINE_LOCATION, true);
  assert.equal(receipt.finalPermissions.ACCESS_BACKGROUND_LOCATION, false);
  assert.ok(receipt.observations.some(row => row.value?.unavailable));
  assert.ok(receipt.observations.some(row => row.value?.fix?.coords.accuracy === 201));
  assert.ok(receipt.observations.some(row => row.value?.fix?.coords.latitude === 28.6315));
  selected.push({ receipt, audit, integrity });
}
const [a, b] = selected;
assert.deepEqual(a.receipt.sources, b.receipt.sources);
assert.deepEqual(a.receipt.stagedSources, b.receipt.stagedSources);
assert.equal(a.receipt.build.apkSha256, b.receipt.build.apkSha256);
assert.deepEqual(a.receipt.actions, b.receipt.actions);
const invariant = audit => Object.fromEntries(['advancePaise', 'finalCashPaise', 'farePaise', 'commissionPaise',
  'reservationReturnedToOriginalOwner', 'authorityAndConsequences', 'databaseCalls', 'providerCalls'].map(key => [key, audit[key]]));
assert.deepEqual(invariant(a.audit), invariant(b.audit));
await writeFile(join(output, 'native-device-repeat-comparison.json'), JSON.stringify({ schema: 'phase9-native-device-repeat-v1',
  status: 'PASS', runs, receiptIntegrities: selected.map(row => row.integrity), sources: 'IDENTICAL',
  sourceIdentities: Object.keys(a.receipt.sources).length, stagedSources: 'IDENTICAL',
  apkSha256: a.receipt.build.apkSha256, actions: a.receipt.actions, invariants: invariant(a.audit),
  permissions: 'Real foreground grant in each run; original denied permissions restored after each run',
  boundary: 'Independent fresh-process recipe repeat and saved financial observation audits. Generated IDs, real clocks and polling requests are not exact saved-input UI replay.' }, null, 2));
console.log('Native device independent repeat comparison PASS');
