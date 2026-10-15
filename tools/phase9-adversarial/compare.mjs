import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { browserReceiptHash } from '../../backend/tests/helpers/phase9BrowserReceipt.js';
const [label, first, repeat] = process.argv.slice(2);
assert.match(label, /^[a-z-]+$/);
assert.notEqual(first, repeat);
const output = 'output/phase9c-adversarial-2026-10-11';
const receipts = [];
for (const run of [first, repeat]) {
    assert.match(run, /^[a-z]+-\d+-[a-f0-9-]+$/);
    const receipt = JSON.parse(await readFile(join(output, run, 'receipt.json'), 'utf8'));
    const { integrity, ...body } = receipt;
    assert.equal(integrity, browserReceiptHash(body));
    assert.equal(receipt.status, 'PASS');
    assert.equal(receipt.frozenV5, 'e484afc4c7fa724ea29af6edd962c48b814dc73a10e4f4a5e33833ad26afbe75');
    for (const field of ['liabilities', 'strikes', 'blocks', 'executions', 'payouts']) assert.equal(receipt.financials[field], 0);
    receipts.push(receipt);
}
const [a, b] = receipts;
assert.equal(a.schema, b.schema);
const sourceDifferences = [...new Set([...Object.keys(a.sources), ...Object.keys(b.sources)])].filter(file => a.sources[file] !== b.sources[file]);
// Diagnostic capture may have been added between trials; preserve every actual
// source difference instead of rewriting the historical receipt's identities.
const actions = row => row.actions.map(({ actor, action, status, httpStatus }) => ({ actor, action, status, httpStatus }));
assert.deepEqual(actions(a), actions(b));
const native = row => row.native ?? null;
if (native(a) || native(b)) {
    assert.ok(native(a) && native(b));
    const apk = row => row.native.build?.apkSha256 ?? row.native.apkSha256;
    assert.equal(apk(a), apk(b));
    assert.ok(apk(a));
    assert.deepEqual(a.native.stagedSources, b.native.stagedSources);
}
await writeFile(join(output, label + '-comparison.json'), JSON.stringify({ status: 'PASS', runs: [first, repeat],
    receiptIntegrities: receipts.map(row => row.integrity), sourceIdentities: receipts.map(row => Object.keys(row.sources).length),
    sourceDifferences: sourceDifferences.map(file => ({ file, primary: a.sources[file] ?? null, repeat: b.sources[file] ?? null })),
    actions: actions(a), nativeStagedSources: native(a) ? 'IDENTICAL' : 'NOT_APPLICABLE',
    boundary: 'Independent fresh-process recipe repeat. Exact source differences are retained; generated identities, elapsed time and OS scheduling are not exact UI replay. Financial ownership assertions execute inside each selected recipe.' }, null, 2));
console.log(label + ' independent comparison PASS; source differences ' + sourceDifferences.length);
