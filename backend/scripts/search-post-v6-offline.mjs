import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const root = new URL('../../', import.meta.url);
export const directory = 'output/search-v1-post-v6-hindi-binding-2026-11-03/';
export const load = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
export const hash = value => createHash('sha256').update(value).digest('hex');
export async function save(name, value) {
  await mkdir(new URL(directory, root), { recursive: true });
  await writeFile(new URL(directory + name, root), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
}
async function files(path) {
  const entries = await readdir(new URL(path, root), { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(`${path}/${entry.name}`)
    : entry.isFile() ? `${path}/${entry.name}` : []))).flat();
}
const git = (...args) => execFileSync('git', args, { cwd: fileURLToPath(root) });
async function baseline() {
  const previous = await load('output/search-v1-v6-retry-2026-11-03/baseline.json');
  const all = new Set(previous.protectedFiles.map(row => row.file));
  const outputDirectories = (await readdir(new URL('output/', root), { withFileTypes: true }))
    .filter(entry => entry.isDirectory() && /^search-v1-/i.test(entry.name));
  for (const entry of outputDirectories) {
    if (`output/${entry.name}/` !== directory) for (const file of await files(`output/${entry.name}`)) all.add(file);
  }
  for (const path of ['docs/search', 'docs/benchmarks', 'backend/services/search']) for (const file of await files(path)) all.add(file);
  const mutable = ['backend/services/search/negation.ts', 'backend/services/search/observations.ts'];
  const snapshots = [];
  for (const file of [...all].sort()) {
    const bytes = await readFile(new URL(file, root));
    snapshots.push({ file, sha256: hash(bytes), authorizedSourceEdit: mutable.includes(file) });
    if (mutable.includes(file)) {
      await mkdir(new URL(directory + 'before/', root), { recursive: true });
      const target = new URL(directory + 'before/' + file.split('/').at(-1), root);
      try { await writeFile(target, bytes, { flag: 'wx' }); }
      catch (error) { if (error.code !== 'EEXIST' || hash(await readFile(target)) !== hash(bytes)) throw error; }
    }
  }
  await save('baseline.json', { recordedAt: new Date().toISOString(), head: git('rev-parse', 'HEAD').toString().trim(),
    stagedIdentity: hash(git('diff', '--cached', '--raw')), files: snapshots });
  console.log(JSON.stringify({ snapshottedFiles: snapshots.length, mutable }));
}
async function preservation() {
  const before = await load(directory + 'baseline.json'), changes = [];
  const testPlan = await load(directory + 'regression-expectation-update.json');
  for (const row of before.files) {
    const current = hash(await readFile(new URL(row.file, root)));
    if (current !== row.sha256) changes.push({ ...row, current, authorizedSourceEdit: row.authorizedSourceEdit
      || testPlan.files.some(test => test.file === row.file && test.sha256 === row.sha256) });
  }
  const result = { recordedAt: new Date().toISOString(), checked: before.files.length,
    protectedFilesUnchanged: before.files.length - changes.length,
    authorizedSourceChanges: changes.filter(row => row.authorizedSourceEdit),
    unexpectedChanges: changes.filter(row => !row.authorizedSourceEdit),
    headUnchanged: before.head === git('rev-parse', 'HEAD').toString().trim(),
    stagedIdentityUnchanged: before.stagedIdentity === hash(git('diff', '--cached', '--raw')) };
  await save('preservation.json', result);
  console.log(JSON.stringify(result));
  if (result.unexpectedChanges.length || !result.headUnchanged || !result.stagedIdentityUnchanged) process.exitCode = 1;
}
async function archiveRegressionTests() {
  const paths = ['backend/tests/rideSearchDecisionContractAlignment.test.js', 'backend/tests/rideSearchV6Readiness.test.js'];
  const archived = [];
  for (const file of paths) {
    const bytes = await readFile(new URL(file, root));
    await writeFile(new URL(directory + 'before/' + file.split('/').at(-1), root), bytes, { flag: 'wx' });
    archived.push({ file, sha256: hash(bytes) });
  }
  await save('regression-expectation-update.json', { files: archived,
    reason: 'Replace assertions of known Hindi binding failures with source preservation, unresolved form and unsupported-submission assertions. Preserve historical v6 registrations and results unchanged.' });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === '--baseline') await baseline();
  else if (process.argv[2] === '--preservation') await preservation();
  else if (process.argv[2] === '--archive-regression-tests') await archiveRegressionTests();
  else throw new Error('OFFLINE_ONLY: use --baseline or --preservation');
}
