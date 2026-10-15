import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { browserReceiptHash } from '../../backend/tests/helpers/phase9BrowserReceipt.js';
const output = 'output/phase9-cross-application-2026-10-11', runs = process.argv.slice(2), receipts = [];
assert.equal(runs.length, 3);
for (const run of runs) {
  assert.match(run, /^customer-\d+-[a-f0-9-]+$/);
  const receipt = JSON.parse(await readFile(join(output, run, 'receipt.json'))), { integrity, ...body } = receipt;
  assert.equal(browserReceiptHash(body), integrity); assert.equal(receipt.status, 'PASS'); receipts.push(receipt);
}
const [first, unknown, repeat] = receipts;
assert.deepEqual(first.sources, repeat.sources); assert.deepEqual(first.actions, repeat.actions);
assert.equal(first.unknownOrder, false); assert.equal(repeat.unknownOrder, false); assert.equal(unknown.unknownOrder, true);
for (const row of [first, repeat]) {
  assert.equal(row.booking.status, 'confirmed'); assert.equal(row.booking.scheduledAdvancePaidAmount, 2800);
  assert.equal(row.financials.payments.filter(p => p.status === 'captured').length, 1);
  assert.equal(row.provider.orders.length, 1);
}
assert.equal(unknown.booking.status, 'payment_pending'); assert.equal(unknown.booking.scheduledAdvancePaidAmount, 0);
assert.equal(unknown.provider.orders.length, 0);
assert.equal(unknown.financials.payments[0].failureCode, 'ORDER_OUTCOME_UNKNOWN');
for (const row of receipts) {
  assert.equal(row.financials.wallets.filter(p => p.bookingId === row.booking.id).length, 0);
  for (const field of ['liabilities', 'compensation', 'finality', 'strikes', 'blocks', 'appeals', 'executions', 'payouts']) assert.equal(row.financials[field], 0);
}
await writeFile(join(output, 'customer-safety-comparison.json'), JSON.stringify({ status: 'PASS', runs,
  receiptIntegrities: receipts.map(row => row.integrity), sourceIdentities: Object.keys(first.sources).length,
  primaryRepeatSources: 'IDENTICAL', primaryRepeatActions: 'IDENTICAL', primaryRepeatAdvancePaise: 2800,
  unknownOutcome: 'UNPAID; no second provider order; no booking ledger entries or consequences',
  boundary: 'Mobile UI recipe repeat with generated IDs and real elapsed time; not exact saved-input UI event replay.' }, null, 2));
console.log('Customer safety independent repeat and unknown-outcome audit PASS');
