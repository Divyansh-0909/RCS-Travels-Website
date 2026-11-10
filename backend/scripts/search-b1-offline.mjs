import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { measureB1 } from '../benchmarks/search/b1Measurement.js';
import { summarize } from '../../output/hindi-temporal-v2-2026-10-08/diagnostic-metrics.mjs';

const root = new URL('../../', import.meta.url);
const out = new URL('output/search-v1-b1-comparison-2026-11-01/', root);
const load = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const revision = process.argv.includes('--revision=v2') ? '-v2' : '';
const save = (name, value) => writeFile(new URL(name === 'baseline.json' ? name : name.replace(/\.json$/u, `${revision}.json`), out), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const sourceFiles = async (folder) => {
  const entries = await readdir(new URL(folder, root), { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? sourceFiles(`${folder}/${entry.name}`)
    : [`${folder}/${entry.name}`]))).flat();
};
const sourceManifest = async () => Promise.all((await sourceFiles('backend/services/search')).sort()
  .map(async file => ({ file, sha256: digest(await readFile(new URL(file, root))) })));
const rows = await load('output/hindi-temporal-v2-2026-10-08/evaluation/rows.json');
const saved = await load('output/hindi-temporal-casefold-2026-10-09/development-report-final.json');
if (!isDeepStrictEqual(summarize(rows), saved.after)) throw new Error('SAVED_BASELINE_METRICS_CHANGED');
await mkdir(out, { recursive: true });
if (process.argv.includes('--baseline')) {
  const frozen = await load('output/responsibility-v5-freeze-2026-10-08/freeze-manifest.json');
  const protectedFiles = ['docs/search/benchmark-v1/frozen-v1/dataset.json',
    'docs/search/hindi-hinglish-robustness-v1/dataset.json', 'docs/search/hindi-hinglish-unseen-challenge-v2/dataset.json',
    'docs/search/s6-development/verifier-input.json', 'docs/search/s6-development/verifier-package.json',
    'docs/benchmarks/search-v1-hinglish-resumption-audit-2026-11-01.md',
    'output/responsibility-v5-freeze-2026-10-08/freeze-manifest.json', ...frozen.sourceManifest.map(source => source.file)];
  for (const folder of ['output/hindi-temporal-casefold-2026-10-09', 'output/hindi-temporal-v2-2026-10-08',
    'output/search-provider-continuation-2026-10-08', 'output/provider-resume-2026-10-07',
    'output/search-s5-authorized-development/live-cache']) {
    protectedFiles.push(...(await sourceFiles(folder)).filter(file => file.endsWith('.json')));
  }
  const baseline = { version: 'search-b1-baseline-v1', recordedAt: new Date().toISOString(),
    gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: fileURLToPath(root), encoding: 'utf8' }).trim(),
    gitStatus: execFileSync('git', ['status', '--porcelain=v1'], { cwd: fileURLToPath(root), encoding: 'utf8' }).split('\n').filter(Boolean),
    stagedIdentity: digest(execFileSync('git', ['diff', '--cached', '--raw'], { cwd: fileURLToPath(root) })),
    sourceManifest: await sourceManifest(), protectedFiles: await Promise.all([...new Set(protectedFiles)].sort()
      .map(async file => ({ file, sha256: digest(await readFile(new URL(file, root))) }))),
    savedMetrics: { schemaStageValid: saved.after.schemaStageValid, fields: saved.after.fields, targeted: saved.after.targeted },
    deterministic: measureB1(rows) };
  await save('baseline.json', baseline);
  console.log(JSON.stringify({ baselineReproduced: true, protectedFiles: baseline.protectedFiles.length, metrics: baseline.deterministic.metrics }));
} else {
  const baseline = await load('output/search-v1-b1-comparison-2026-11-01/baseline.json');
  const after = measureB1(rows);
  await save('b1-offline-results.json', { version: revision ? 'search-b1-offline-v2' : 'search-b1-offline-v1', recordedAt: new Date().toISOString(),
    sourceManifest: await sourceManifest(), baselineSavedModelMetricsUnchanged: true,
    before: baseline.deterministic.metrics, after, freshInference: 0,
    limitations: ['Gold query types isolate deterministic coverage; runtime routing still requires a provider.',
      'Changed candidate IDs/questions invalidate old Jev request identities. No changed-input raw response replay.',
      'Negation observation and role guard coverage are not final model extraction accuracy.'] });
  console.log(JSON.stringify({ before: baseline.deterministic.metrics, after: after.metrics, invalidSpanCases: after.invalidSpanCases }));
}
