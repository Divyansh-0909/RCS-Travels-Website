import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { browserReceiptHash } from '../../backend/tests/helpers/phase9BrowserReceipt.js';
const output = 'output/phase9-cross-application-2026-10-11', runs = process.argv.slice(2), receipts = [];
assert.equal(runs.length, 2); assert.notEqual(runs[0], runs[1]);
for (const run of runs) {
  assert.match(run, /^offers-\d+-[a-f0-9-]+$/);
  const receipt = JSON.parse(await readFile(join(output, run, 'receipt.json'))), { integrity, ...body } = receipt;
  assert.equal(browserReceiptHash(body), integrity); assert.equal(receipt.status, 'PASS');
  assert.equal(receipt.actions.length, 4); assert.equal(receipt.booking.status, 'cancelled');
  assert.equal(receipt.booking.scheduledAdvanceDisposition, 'refunded');
  const holds = receipt.financials.wallets.filter(row => row.type === 'deposit_hold');
  const returns = receipt.financials.wallets.filter(row => row.type === 'deposit_refund');
  assert.equal(holds.length, 1); assert.equal(returns.length, 1);
  assert.equal(holds[0].driverId, returns[0].driverId); assert.equal(holds[0].amount, -100); assert.equal(returns[0].amount, 100);
  for (const driver of receipt.financials.drivers) assert.equal(driver.walletBalance, 1000);
  for (const field of ['liabilities', 'compensation', 'finality', 'strikes', 'blocks', 'appeals', 'executions', 'payouts']) assert.equal(receipt.financials[field], 0);
  receipts.push(receipt);
}
assert.deepEqual(receipts[0].sources, receipts[1].sources);
assert.deepEqual(receipts[0].native.stagedSources, receipts[1].native.stagedSources);
assert.deepEqual(receipts[0].actions, receipts[1].actions);
await writeFile(join(output, 'native-offers-repeat-comparison.json'), JSON.stringify({ status: 'PASS', runs,
  receiptIntegrities: receipts.map(row => row.integrity), sources: 'IDENTICAL', stagedSources: 'IDENTICAL',
  sourceIdentities: Object.keys(receipts[0].sources).length, actions: receipts[0].actions,
  originalOwnerReservationReturn: 'PASS', authorityAndConsequences: 0,
  boundary: 'Physical rejection and partner acceptance repeat; competing protected HTTP inputs remain separately identified. This is not exact saved-input UI replay.' }, null, 2));
console.log('Native offers independent repeat comparison PASS');
