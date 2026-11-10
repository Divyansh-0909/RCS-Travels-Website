import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { identityHash } from '../benchmarks/search/decisionComparison/adapters.js';

const version = process.argv.find(arg => arg.startsWith('--revision='))?.slice('--revision='.length) ?? 'v1';
if (!['v1', 'v2', 'v3', 'v4'].includes(version)) throw new Error('UNKNOWN_REVISION');
const root = new URL('../../', import.meta.url), out = new URL(`output/search-v1-b1-comparison-2026-11-${['v3', 'v4'].includes(version) ? '02' : '01'}/`, root);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const load = async name => JSON.parse(await readFile(new URL(name, out), 'utf8'));
const revision = version === 'v1' ? '' : `-${version}`;
const baseline = JSON.parse(await readFile(new URL('output/search-v1-b1-comparison-2026-11-01/baseline.json', root), 'utf8'));
const plan = await load(`pilot-registration${revision}.json`);
const failures = [];
for (const source of baseline.protectedFiles) {
  if (hash(await readFile(new URL(source.file, root))) !== source.sha256) failures.push(source.file);
}
const currentSources = await Promise.all(baseline.sourceManifest.map(async source => ({ file: source.file,
  changed: hash(await readFile(new URL(source.file, root))) !== source.sha256 })));
const stalePlanSources = [];
for (const source of plan.sourceManifest) {
  if (hash(await readFile(new URL(source.file, root))) !== source.sha256) stalePlanSources.push(source.file);
}
const { planHash, ...planContent } = plan;
const git = (...args) => execFileSync('git', args, { cwd: fileURLToPath(root) });
const report = { checkedAt: new Date().toISOString(), protectedFiles: baseline.protectedFiles.length,
  protectedFilesChanged: failures, existingSearchSourcesChanged: currentSources.filter(row => row.changed).map(row => row.file),
  preregisteredSourcesChecked: plan.sourceManifest.length, stalePlanSources,
  registrationHashVerified: identityHash(planContent) === planHash,
  currentHead: git('rev-parse', 'HEAD').toString().trim(), headUnchanged: git('rev-parse', 'HEAD').toString().trim() === baseline.gitHead,
  stagedIdentityUnchanged: hash(git('diff', '--cached', '--raw')) === baseline.stagedIdentity,
  gitStatus: git('status', '--porcelain=v1').toString().split('\n').filter(Boolean),
  currentSourceHasHistoricalIdentity: false,
  historicalEvidenceMustNotBeReboundToB1: true, providerInferenceCalls: 0,
  note: 'Changed Search sources are intentional B1 additions; frozen manifests/cache bodies are preserved, not rewritten to assert current-source equivalence.' };
await writeFile(new URL(`preservation${revision}.json`, out), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ protectedFiles: report.protectedFiles, protectedChanges: failures.length,
  stalePlanSources: stalePlanSources.length, registrationHashVerified: report.registrationHashVerified,
  headUnchanged: report.headUnchanged, stagedIdentityUnchanged: report.stagedIdentityUnchanged,
  changedExistingSearchSources: report.existingSearchSourcesChanged }));
if (failures.length || stalePlanSources.length || !report.registrationHashVerified || !report.headUnchanged || !report.stagedIdentityUnchanged) process.exitCode = 1;
