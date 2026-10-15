import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { criticalFiles } from './scope.mjs';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const output = join(repository, 'output/phase9c-adversarial-2026-10-11');
const current = process.argv.includes('--current');
const label = process.argv.find(arg => arg.startsWith('--label='))?.slice(8);
assert.ok(label === undefined || /^[a-z-]+$/.test(label));
const suffix = label ?? (current ? 'current' : null);
const raw = join(output, suffix ? 'coverage-raw-' + suffix : 'coverage-raw');
const curated = join(output, suffix ? 'coverage-' + suffix + '-report-copy' : 'coverage-report-copy');
assert.notEqual(raw, curated);
await mkdir(curated, { recursive: true });
const included = new Set(criticalFiles.map(file => resolve(repository, file).toLowerCase()));
const matches = url => { try { return included.has(resolve(fileURLToPath(url)).toLowerCase()); } catch { return false; } };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const files = [];
for (const name of (await readdir(raw)).filter(name => /^coverage-.*\.json$/.test(name))) {
  const bytes = await readFile(join(raw, name)), original = JSON.parse(bytes);
  const result = original.result.filter(script => matches(script.url));
  const maps = Object.fromEntries(Object.entries(original['source-map-cache'] ?? {}).filter(([url]) => matches(url)));
  await writeFile(join(curated, name), JSON.stringify({ ...original, result,
    ...(original['source-map-cache'] ? { 'source-map-cache': maps } : {}) }));
  files.push({ name, originalSha256: hash(bytes), scopedCountersSha256: hash(JSON.stringify(result)),
    scopedMapsSha256: hash(JSON.stringify(maps)), keptScripts: result.length });
}
await writeFile(join(output, suffix ? 'coverage-' + suffix + '-curation-manifest.json' : 'coverage-curation-manifest.json'), JSON.stringify({ originalFilesChanged: false, scope: criticalFiles, files }, null, 2));
const tools = join(tmpdir(), 'rcs-phase1-quality-tools/node_modules');
const report = join(output, suffix ? 'coverage-' + suffix : 'coverage-final');
const measured = spawnSync(process.execPath, [join(tools, 'c8/bin/c8.js'), 'report', '--all', '--src=.',
  '--extension=.js', '--extension=.ts', '--extension=.mjs', '--exclude=**/node_modules/**',
  '--temp-directory=' + curated, '--report-dir=' + report, '--reporter=json', '--reporter=json-summary',
  ...criticalFiles.map(file => '--include=' + file)], { cwd: repository, windowsHide: true, stdio: 'inherit' });
assert.equal(measured.status, 0);
const structural = spawnSync(process.execPath, ['backend/tests/quality/measure.cjs', '--coverage',
  join(report, 'coverage-final.json'), '--output', join(output, suffix ? 'quality-' + suffix + '.json' : 'quality-measure.json')], {
  cwd: repository, windowsHide: true, stdio: 'inherit',
  env: { ...process.env, RCS_QUALITY_SCOPED_FILES: criticalFiles.join(',') },
});
assert.equal(structural.status, 0);
console.log(JSON.parse(await readFile(join(report, 'coverage-summary.json'), 'utf8')).total);
