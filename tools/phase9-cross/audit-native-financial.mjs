import assert from 'node:assert/strict';
import { readFile, writeFile, realpath } from 'node:fs/promises';
import { resolve, join, relative, isAbsolute, basename } from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { browserReceiptHash } from '../../backend/tests/helpers/phase9BrowserReceipt.js';

const root = await realpath('output/phase9-cross-application-2026-10-11');
const folder = await realpath(process.argv[2]);
const child = relative(root, folder);
assert.ok(child && !child.startsWith('..') && !isAbsolute(child));
assert.match(basename(folder), /^device-\d+-[a-f0-9-]+$/);
const receiptBytes = await readFile(join(folder, 'receipt.json')), receipt = JSON.parse(receiptBytes);
const { integrity, ...body } = receipt;
assert.equal(browserReceiptHash(body), integrity); assert.equal(receipt.status, 'PASS');
assert.equal(receipt.run, basename(folder));
const traceBytes = await readFile(join(folder, 'trace-0.zip'));
const { unzipSync } = createRequire(new URL('../../frontend/package.json', import.meta.url))('fflate');
const resources = Object.entries(unzipSync(new Uint8Array(traceBytes))).filter(([name]) => name.startsWith('resources/'));
const observations = [];
for (const [, bytes] of resources) {
  try { const value = JSON.parse(Buffer.from(bytes).toString('utf8')); if (value.financials && value.ridePayment) observations.push(value); } catch { /* Non-JSON image/source resources. */ }
}
const paid = observations.filter(row => row.status === 'completed' && row.ridePayment.state === 'paid' && row.ridePayment.method === 'cash');
assert.ok(paid.length, 'Saved real booking response must confirm cash after refresh');
const booking = paid[0], bookingId = booking.bookingId;
assert.ok(receipt.requests.some(row => row.path === '/api/driver/rides/' + bookingId + '/status' && row.response?.status === 'completed'));
assert.equal(booking.financials.finalFare, 100000); assert.equal(booking.financials.advancePaid, 10000);
assert.equal(booking.financials.finalPaid, 90000); assert.equal(booking.ridePayment.paidAmount, 90000);
assert.equal(booking.financials.advancePaid + booking.financials.finalPaid, booking.financials.finalFare);
const ledger = receipt.financials.wallets.filter(row => row.bookingId === bookingId);
const one = type => { const rows = ledger.filter(row => row.type === type); assert.equal(rows.length, 1); return rows[0]; };
const hold = one('deposit_hold'), release = one('deposit_refund'), collection = one('ride_collection'), commission = one('commission');
assert.equal(hold.amount, -100); assert.equal(release.amount, 100); assert.equal(collection.amount, 100); assert.equal(commission.amount, -100);
for (const row of [release, collection, commission]) assert.equal(row.driverId, hold.driverId);
assert.equal(ledger.reduce((total, row) => total + row.amount, 0), 0);
assert.equal(receipt.financials.drivers.find(row => row.id === hold.driverId).walletBalance, 1000);
assert.equal(-commission.amount * 100, booking.financials.finalFare * 0.1);
for (const field of ['liabilities', 'compensation', 'finality', 'strikes', 'blocks', 'appeals', 'executions', 'payouts']) assert.equal(receipt.financials[field], 0);
assert.equal(receipt.financials.payments.filter(row => row.bookingId === bookingId && row.status === 'captured').length, 1);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
await writeFile(join(folder, 'financial-audit.json'), JSON.stringify({ status: 'PASS', bookingId, receiptSha256: sha(receiptBytes), traceSha256: sha(traceBytes),
  advancePaise: 10000, finalCashPaise: 90000, farePaise: 100000, commissionPaise: 10000, reservationReturnedToOriginalOwner: true,
  authorityAndConsequences: 0, databaseCalls: 0, providerCalls: 0,
  boundary: 'Saved authoritative API observations plus independent saved database ledger; this is an offline audit, not event replay.' }, null, 2));
console.log('Native saved financial audit PASS');
