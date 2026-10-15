import assert from 'node:assert/strict';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { phase9UiSourceHashes } from '../../backend/tests/helpers/phase9UiSources.js';
import { browserReceiptHash } from '../../backend/tests/helpers/phase9BrowserReceipt.js';
import { criticalFiles } from './scope.mjs';

const root = 'output/phase9c-adversarial-2026-10-11';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const read = async name => JSON.parse(await readFile(join(root, name), 'utf8'));
const state = await read('continuation-state.json');
assert.ok(['FINAL_REVIEW', 'COMPLETE'].includes(state.status));
const cleanup = await read('phone-cleanup-final.json');
assert.equal(cleanup.awakeAfter, '0'); assert.equal(cleanup.testAppStopped, true);
assert.deepEqual(cleanup.reverseMappingsAfter, []);
for (const granted of Object.values(cleanup.permissionsAfter)) assert.equal(granted, false);
const extras = [
  'backend/tests/run-phase9-cross.js', 'backend/tests/phase9CrossReplayCli.test.js',
  'backend/tests/e2e/phase9AdversarialNative.mjs', 'backend/tests/e2e/phase9AdversarialBrowser.mjs',
  'backend/tests/e2e/phase9NativeCompetition.mjs', 'backend/tests/e2e/phase9NativeTerminal.mjs',
  'backend/tests/e2e/phase9NativeAppeal.mjs', 'backend/tests/e2e/phase9AdminSupersession.mjs',
  'backend/tests/e2e/phase9NativePermissions.mjs', 'backend/tests/e2e/phase9NativeOfferRecovery.mjs',
  'backend/tests/e2e/phase9NativeSession.mjs', 'backend/tests/e2e/phase9UiBackendReproduction.mjs',
  'tools/phase9-cross/ui-reproduction.mjs', 'tools/phase9-cross/reproduce-ui-failure.mjs',
  'tools/phase9-cross/run-adversarial-queue.mjs', 'tools/phase9-cross/run-reproduction-proof.mjs',
  'tools/phase9-cross/run-adversarial-recorded.mjs', 'tools/phase9-cross/cleanup-adversarial-device.mjs',
  'tools/phase9-adversarial/build-execution-manifest.mjs',
  'tools/phase9-cross/run-live-clerk-revocation.mjs', 'backend/tests/e2e/phase9LiveClerkReadOnly.mjs',
  'tools/phase9-adversarial/verify-reproduction-retention.mjs', 'tools/phase9-adversarial/verify-orchestration.mjs',
];
const sources = await phase9UiSourceHashes([...extras, ...criticalFiles]);
const quality = await read('quality-closure-bound.json'), mutation = await read('mutation-closure.json');
for (const report of [quality, mutation]) {
  assert.equal(report.status, 'PASS');
  for (const [file, expected] of Object.entries(report.sources)) assert.equal(sha(await readFile(file)), expected, file);
}
const freeze = await read('frozen-v5-current.json');
assert.equal(freeze.hash, 'e484afc4c7fa724ea29af6edd962c48b814dc73a10e4f4a5e33833ad26afbe75');
const proofName = state.accepted.reproductionProof;
assert.match(proofName, /^[a-z0-9-]+-proof\.json$/);
const proof = await read(proofName); assert.equal(proof.status, 'PASS');
const groups = ['customerSession', 'adminSupersession', 'nativeAppeal', 'nativeTerminal',
  'nativeCompeting', 'nativeReplacement', 'nativePermissions', 'nativeRecovery', 'nativeCancellationRace'];
const receipts = [];
for (const group of groups) {
  const runs = state.accepted[group]; assert.equal(runs.length, 2, group); assert.notEqual(runs[0], runs[1]);
  for (const run of runs) {
    assert.match(run, /^[a-z]+-\d+-[a-f0-9-]+$/);
    const path = join(root, run, 'receipt.json'), bytes = await readFile(path);
    const { integrity, ...receipt } = JSON.parse(bytes);
    assert.equal(receipt.status, 'PASS'); assert.equal(integrity, browserReceiptHash(receipt));
    assert.equal(receipt.frozenV5, freeze.hash);
    const sourceDifferences = Object.entries(receipt.sources).filter(([file, expected]) => sources[file] !== expected)
      .map(([file, expected]) => ({ file, executed: expected, current: sources[file] ?? null }));
    receipts.push({ group, run, path, sha256: sha(bytes), integrity, actionGroups: receipt.actions.length,
      sourceIdentities: Object.keys(receipt.sources).length, sourceDifferences,
      nativeApkSha256: receipt.native?.build?.apkSha256 ?? null,
      nativeStagedSources: receipt.native?.stagedSources ?? null });
  }
}
const selected = ['backend-tests-accepted-latest-execution.json', 'frontend-tests-closure-execution.json',
  'frontend-build-closure-execution.json', 'captain-tests-final-execution.json', 'captain-lint-closure-execution.json',
  'backend-typecheck-accepted-latest-execution.json', 'phase9-db-accepted-execution.json',
  'phase9-paired-replay-closure-execution.json', 'phase9-saved-replay-accepted-execution.json'];
const executions = [];
for (const name of selected) {
  const record = await read(name); assert.equal(record.exitCode, 0, name);
  assert.equal(sha(await readFile(record.log)), record.logSha256, name + ' log');
  executions.push({ path: join(root, name), sha256: sha(await readFile(join(root, name))), ...record });
}
const artifacts = [];
const live = [];
for (const run of state.accepted.liveClerk) {
  assert.match(run, /^live-clerk-\d+-[a-f0-9-]+$/);
  const path = join(root, run, 'report.json'), bytes = await readFile(path), report = JSON.parse(bytes);
  assert.equal(report.status, 'PASS'); assert.equal(report.syntheticUserDeleted, true);
  assert.equal(report.webhookIsolation, 'NO_SVIX_APP_CONFIGURED'); assert.equal(report.expiredTokenStatus, 401);
  assert.deepEqual(report.isolated.before, report.isolated.after);
  live.push({ run, path, sha256: sha(bytes), runnerSha256: report.runnerSha256,
    cachedTokenStatusAfterRevoke: report.cachedTokenStatusAfterRevoke, tokenTimes: report.tokenTimes,
    sourceDifferences: report.runnerSha256 === sources['tools/phase9-cross/run-live-clerk-revocation.mjs'] ? [] : ['runner epoch differs; lexical lint correction'],
    sources: report.isolated.sources });
  for (const name of ['live-auth-owned-ride.png', 'live-auth-revoked-navigation.png']) {
    const path = join(root, run, name); artifacts.push({ path, sha256: sha(await readFile(path)) });
  }
}
const retained = await read('reproduction-retention-regression.json'); assert.equal(retained.status, 'PASS');
assert.equal(retained.newReports.length, 2);
for (const name of (await readdir(join(root, proof.failure.run))).filter(name => /^backend-.*-index\.json$/.test(name))) {
  const path = join(root, proof.failure.run, name), index = JSON.parse(await readFile(path));
  artifacts.push({ path, sha256: sha(await readFile(path)) });
  for (const field of ['input', 'result']) {
    assert.match(index[field], /^backend-\d+-[a-f0-9-]+-(?:input|result)\.json$/);
    const path = join(root, proof.failure.run, index[field]);
    assert.equal(sha(await readFile(path)), index[field + 'Sha256']); artifacts.push({ path, sha256: index[field + 'Sha256'] });
  }
}
for (const name of ['reproduction.json', 'failure.json']) {
  const path = join(root, proof.failure.run, name);
  artifacts.push({ path, sha256: sha(await readFile(path)) });
}
const reproduced = (await readdir(join(root, proof.failure.run))).filter(name => /^reproduction-execution-\d+\.json$/.test(name));
const completeReproductions = [];
for (const name of reproduced) {
  const candidate = JSON.parse(await readFile(join(root, proof.failure.run, name), 'utf8'));
  if (candidate.invocations.length === 2 && candidate.invocations.every(item => item.exitCode === 0)) completeReproductions.push(name);
}
assert.equal(completeReproductions.length, 1);
const reproductionPath = join(root, proof.failure.run, completeReproductions[0]);
const reproduction = JSON.parse(await readFile(reproductionPath, 'utf8'));
assert.equal(reproduction.invocations.length, 2);
for (const invocation of reproduction.invocations) assert.equal(invocation.exitCode, 0);
artifacts.push({ path: reproductionPath, sha256: sha(await readFile(reproductionPath)) });
const names = ['baseline-validation.json', 'baseline-artifact-validation.json', 'execution-exclusions.json',
  'quality-closure-bound.json', 'mutation-closure.json', 'coverage-closure-curation-manifest.json',
  'frozen-v5-current.json', proofName, 'phone-cleanup-final.json', 'git-diff-check-final.json',
  'scoped-lint-final.log', 'coverage-closure/coverage-summary.json', 'coverage-closure/coverage-final.json',
  'clones-closure/jscpd-report.json', 'reproduction-retention-regression.json', 'orchestration-lint.json',
  'orchestration-lint.log', 'clerk-instance-preflight.json', 'external-auth-boundary.json',
  'reproduction-closure-interruption.json', 'reproduction-source-observation.json', 'continuation-state.json'];
for (const name of names) artifacts.push({ path: join(root, name), sha256: sha(await readFile(join(root, name))) });
for (const name of (await readdir(root)).filter(n => n.endsWith('-comparison.json'))) {
  const report = await read(name); assert.equal(report.status, 'PASS');
  artifacts.push({ path: join(root, name), sha256: sha(await readFile(join(root, name))) });
}
for (const path of ['docs/benchmarks/phase9c-adversarial-acceptance-2026-10-11.md',
  'docs/benchmarks/phase9c-adversarial-checkpoint-2026-10-12.md']) artifacts.push({ path, sha256: sha(await readFile(path)) });
const manifest = { schema: 'phase9c-adversarial-execution-v1', generatedAt: new Date().toISOString(),
  phase9c: state.phase9c, sources, receipts, liveClerk: live, executions, artifacts, quality: { coverage: quality.coverage, maxima: quality.maxima,
    mutation: { total: mutation.totalUnique, counts: mutation.counts, meaningfulSurvivors: mutation.meaningfulSurvivors } },
  frozenV5: freeze, productionShadow: 'OFF', autoAdjudication: 'OFF', productionConsequences: 'OFF', searchRollout: 'OFF',
  boundary: 'Each receipt binds its executed source epoch. Differences from the final tree are explicit. Staged native identities and APK are separate from backend/browser sources. Coverage and mutation certify ten critical helpers; large historical components and orchestration are not included in those scoped numbers. Recipe repeats and controlled backend reproduction are not exact OS/UI event replay.' };
await writeFile(join(root, 'execution-manifest.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ phase9c: state.phase9c, receipts: receipts.length, sources: Object.keys(sources).length, executions: executions.length }));
