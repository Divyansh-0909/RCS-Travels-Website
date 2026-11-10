import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ROOT = new URL('../../../../', import.meta.url);
export const OUTPUT = 'output/search-v1-s5-current-source-2026-11-03/';
export const REVISION = 'v2/';
export const PACKAGE = OUTPUT + REVISION;
export const digest = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
export const canonical = value => JSON.parse(JSON.stringify(value));
export const git = (...args) => execFileSync('git', args, { cwd: fileURLToPath(ROOT), stdio: ['ignore', 'pipe', 'ignore'] });
export async function bytes(file) { return readFile(new URL(file, ROOT)); }
export async function json(file) {
  // Frozen combined datasets and independent challenge material may be hashed
  // for preservation, but must never be opened as evaluation/tuning inputs.
  if (/frozen-v1\/dataset|unseen-challenge|s6-development\/verifier|held.?out/i.test(file)) throw new Error('SEALED_INPUT_ACCESS_REFUSED');
  return JSON.parse(await readFile(new URL(file, ROOT), 'utf8'));
}
export async function save(name, value) {
  const target = new URL(OUTPUT + name, ROOT);
  await mkdir(new URL('.', target), { recursive: true });
  await writeFile(target, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
}
export async function listFiles(path) {
  const entries = await readdir(new URL(path, ROOT), { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? listFiles(`${path}/${entry.name}`)
    : entry.isFile() ? `${path}/${entry.name}` : []))).flat();
}
export async function baseline() {
  const previous = await json('output/search-v1-post-v6-hindi-binding-2026-11-03/baseline.json');
  const paths = new Set(previous.files.map(row => row.file));
  for (const folder of ['output/search-v1-post-v6-hindi-binding-2026-11-03', 'output/search-provider-continuation-2026-10-08',
    'output/provider-resume-2026-10-07', 'output/provider-light-2026-10-07', 'output/hindi-temporal-casefold-2026-10-09']) {
    for (const file of await listFiles(folder)) paths.add(file);
  }
  paths.add('docs/benchmarks/search-v1-post-v6-hindi-binding-closure-2026-11-03.md');
  const files = await Promise.all([...paths].sort().map(async file => ({ file, sha256: digest(await bytes(file)) })));
  await save('baseline.json', { recordedAt: new Date().toISOString(), files,
    head: git('rev-parse', 'HEAD').toString().trim(), stagedIdentity: digest(git('diff', '--cached', '--raw')) });
  return files.length;
}
export async function preservation() {
  const prior = await json(OUTPUT + 'baseline.json');
  const checked = await Promise.all(prior.files.map(async row => ({ ...row, current: digest(await bytes(row.file)) })));
  const result = { checked: checked.length, changed: checked.filter(row => row.sha256 !== row.current),
    headUnchanged: prior.head === git('rev-parse', 'HEAD').toString().trim(),
    stagedIdentityUnchanged: prior.stagedIdentity === digest(git('diff', '--cached', '--raw')) };
  await save('preservation.json', result);
  if (result.changed.length || !result.headUnchanged || !result.stagedIdentityUnchanged) throw new Error('PRESERVATION_FAILED');
  return result;
}
