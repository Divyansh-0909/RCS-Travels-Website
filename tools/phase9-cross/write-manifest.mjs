import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { criticalFiles, criticalTests } from './scope.mjs';
import { browserReceiptHash } from '../../backend/tests/helpers/phase9BrowserReceipt.js';

const root = 'output/phase9-cross-application-2026-10-11';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const read = async file => JSON.parse(await readFile(join(root, file)));
const nativeRuns = process.argv.slice(2).filter(value => !value.startsWith('--'));
const customerRuns = process.argv.slice(2).filter(value => value.startsWith('--customer-run=')).map(value => value.slice(15));
const offerRuns = process.argv.slice(2).filter(value => value.startsWith('--offers-run=')).map(value => value.slice(13));
assert.equal(nativeRuns.length, 2);
for (const run of nativeRuns) assert.match(run, /^device-\d+-[a-f0-9-]+$/);
for (const run of customerRuns) assert.match(run, /^customer-\d+-[a-f0-9-]+$/);
for (const run of offerRuns) assert.match(run, /^offers-\d+-[a-f0-9-]+$/);
const crossRuns = ['20261011073026212-66504875-6c57-45eb-ba85-ccb5a8ead84d', '20261011074009640-6fe47590-1d53-4335-90a2-aac1f53acbb0'];
const receipts = [];
for (const run of [...crossRuns, ...nativeRuns, ...customerRuns, ...offerRuns]) {
  const receipt = await read(run + '/receipt.json'), { integrity, ...body } = receipt;
  assert.equal(browserReceiptHash(body), integrity); assert.equal(receipt.status, 'PASS');
  receipts.push({ run, schema: receipt.schema, integrity, sourceIdentities: Object.keys(receipt.sources).length,
    sourceSha256: hash(JSON.stringify(receipt.sources)), sourceBoundary: !crossRuns.includes(run)
      ? 'Selected executor and application sources checked unchanged across execution.'
      : 'Earlier complete cross-application pair; later captain/helper changes are separately tested by native completion.' });
}
const mutation = await read('mutation-closure.json'); assert.equal(mutation.status, 'PASS');
const coverage = await read('coverage-final/coverage-summary.json');
for (const metric of ['statements', 'branches', 'functions', 'lines']) assert.equal(coverage.total[metric].pct, 100);
const freezeFile = 'output/responsibility-v5-freeze-2026-10-08/freeze-manifest.json';
const freeze = JSON.parse(await readFile(freezeFile)), { freezeHash, ...body } = freeze;
assert.equal(freezeHash, 'e484afc4c7fa724ea29af6edd962c48b814dc73a10e4f4a5e33833ad26afbe75');
assert.equal(hash(JSON.stringify(body)), freezeHash);
for (const source of freeze.sourceManifest) assert.equal(hash(await readFile(source.file)), source.sha256);
const checkNames = ['backend-tests-accepted-current', 'backend-typecheck-accepted-current', 'frontend-tests', 'frontend-build',
  'captain-tests-closure', 'captain-lint-closure', 'scoped-lint-final'];
for (const name of checkNames) {
  const execution = await read(name + '-execution.json'); assert.equal(execution.exitCode, 0, name);
  assert.equal(hash(await readFile(join(root, name + '.log'))), execution.logSha256, name + ' log hash');
}
const selected = [...checkNames.flatMap(name => [name + '.log', name + '-execution.json']),
  'mutation-closure.json', 'quality-final.json', 'coverage-final/coverage-final.json', 'coverage-final/coverage-summary.json',
  'coverage-final-curation-manifest.json', 'critical-coverage-final-process.json', 'clones-closure/jscpd-report.json',
  'reviewed-utf8-equivalences.json', 'reviewed-staging-equivalences.json', 'reviewed-device-equivalences.json', 'reviewed-gateway-equivalences.json',
  'equivalence-witnesses-final.log', 'equivalence-witnesses-final-execution.json',
  'cross-independent-repeat-comparison.json', 'native-device-repeat-comparison.json', 'phone-cleanup-final.json',
  'maps-cloud-setup.json', 'maps-device-witness.json', 'combined-trial-5.log', 'combined-trial-5-process.json',
  'combined-independent-repeat.log', 'combined-independent-repeat-process.json',
  'cross-db-review-trial-2.log', 'cross-db-review-trial-2-process.json', 'admin-ui-trial-1.log', 'admin-ui-trial-1-process.json',
  'phase6b-current.log', 'phase6b-current-process.json', 'phase9-current-db.log', 'phase9-current-db-process.json',
  'phase9-current-paired-replay.log', 'phase9-current-paired-replay-process.json', 'phase9-current-saved-replay.log', 'phase9-current-saved-replay-process.json',
  'git-whitespace-accepted-current.log', 'git-whitespace-accepted-current-execution.json',
  'source-whitespace-current.json', 'visual-observations-current.json',
  ...(customerRuns.length ? ['customer-safety-comparison.json', 'customer-safety-trial-3.log', 'customer-safety-trial-3-process.json',
    'customer-safety-unknown-trial-2.log', 'customer-safety-unknown-trial-2-process.json', 'customer-safety-repeat-1.log', 'customer-safety-repeat-1-process.json'] : []),
  ...(offerRuns.length ? ['native-offers-repeat-comparison.json', 'offers-trial-3.log', 'offers-trial-3-process.json',
    'offers-repeat-3.log', 'offers-repeat-3-process.json'] : []),
  ...crossRuns.map(run => run + '/receipt.json'),
  ...nativeRuns.flatMap(run => [run + '/receipt.json', run + '/financial-audit.json', run + '/trace-0.zip', run + '/permission-restoration.json',
    run + '/customer-native-completion-cash-phone.png']),
  ...customerRuns.flatMap(run => [run + '/receipt.json', run + '/trace-0.zip', run + '/trace-1.zip']),
  ...offerRuns.map(run => run + '/receipt.json')];
const artifacts = await Promise.all(selected.map(async file => ({ file, sha256: hash(await readFile(join(root, file))) })));
const currentFiles = [...criticalFiles, ...criticalTests, 'tools/phase9-cross/reconcile-mutations.mjs',
  'tools/phase9-cross/write-manifest.mjs', 'tools/phase9-cross/audit-native-financial.mjs', 'tools/phase9-cross/checks.mjs',
  'tools/phase9-cross/compare-native.mjs', 'tools/phase9-cross/compare-customer.mjs', 'tools/phase9-cross/compare-offers.mjs',
  'backend/tests/run-phase9-cross.js', 'backend/tests/e2e/phase9CustomerSafety.mjs', 'backend/tests/e2e/phase9NativeOffers.mjs',
  'docs/benchmarks/phase9c-cross-application-checkpoint-2026-10-11.md', 'CONTEXT.md', 'ROADMAP.txt',
  'tools/phase9-cross/scope.mjs', 'tools/phase9-cross/report-quality.mjs', 'tools/phase9-cross/eslint.config.mjs'];
const sources = Object.fromEntries(await Promise.all(currentFiles.map(async file => [file, hash(await readFile(file))])));
await writeFile(join(root, 'execution-manifest.json'), JSON.stringify({ schema: 'phase9-cross-execution-v1', generatedAt: new Date().toISOString(),
  checkpoint: 'docs/benchmarks/phase9c-cross-application-checkpoint-2026-10-11.md', phase9C: 'PARTIAL', phase9D: 'NOT STARTED',
  frozenV5: { hash: freezeHash, identities: freeze.sourceManifest.length, status: 'UNCHANGED', heldOutCalls: 0, modelEvaluationCalls: 0 },
  receipts, criticalScope: criticalFiles, sources, coverage: coverage.total,
  mutation: { totalUnique: mutation.totalUnique, counts: mutation.counts, meaningfulSurvivors: 0, timeouts: 0, ignored: 0 },
  artifacts, safety: { productionShadow: 'OFF', autoAdjudication: 'OFF', productionConsequences: 'OFF', searchRollout: 'OFF',
    isolatedBackend: 'Owned disposable databases, synthetic actors, fake providers, protected authentication, denied runtime production URLs',
    device: 'Separate test package; real foreground permission and SDK tiles; positions synthetic; no owner GPS captured' },
  boundaries: ['UI recipe repeat is distinct from saved-input backend replay; exact saved-input UI replay is not implemented.',
    'Maps SDK rendering is verified; external navigation and native background location are not verified.',
    'Remaining adversarial/customer/native acceptance gaps are listed in the checkpoint; Phase 9C completion is not claimed.'] }, null, 2));
console.log('Phase 9C source-bound execution manifest written: ' + resolve(root));
