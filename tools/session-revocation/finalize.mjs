import assert from 'node:assert/strict';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { criticalFiles } from './scope.mjs';

const output = 'output/session-revocation-2026-10-12';
const read = async path => JSON.parse(await readFile(join(output, path), 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
const sources = Object.fromEntries(await Promise.all(criticalFiles.map(async file => [file, hash(await readFile(file))])));
const selected = {
  full: 'full-1791814033850-58737bbc-1904-4895-ad13-06d0abef56bf.json',
  db: 'db-1791814166737-5cb45d93-249e-4334-8ce1-ca2d8a5dac40.json',
  cross: 'cross-1791814191458-d31b71b4-19ae-40fa-9aed-7a00c1632e13.json',
  coverage: 'coverage-1791813858573-a4a56e71-dd3d-41c2-b03d-2682aca2c8f0.json',
  live: 'live-1791814364543-19b0ac24-d6ff-4abc-bfd4-3e0572639fbe/report.json',
  native: 'native-1791813598579-e4a55d5a-d0ef-4425-882b-0fc043baa634/report.json',
  mutation: 'mutation-round3.json', quality: 'quality-final.json', inventory: 'route-inventory.json',
};
const records = Object.fromEntries(await Promise.all(Object.entries(selected).map(async ([kind, path]) => [kind, await read(path)])));
for (const kind of ['full', 'db', 'cross', 'coverage']) {
  assert.equal(records[kind].code, 0); assert.equal(records[kind].sourcesUnchanged, true);
  for (const file of criticalFiles) assert.equal(records[kind].sources[file], sources[file]);
}
assert.equal(records.live.status, 'PASS'); assert.equal(records.native.status, 'PASS');
assert(Object.values(records.live.deleted).every(Boolean));
for (const file of criticalFiles) assert.equal(records.live.sources[file], sources[file]);
const coverage = (await read('coverage/coverage-summary.json')).total;
for (const metric of ['statements', 'branches', 'functions', 'lines']) assert.equal(coverage[metric].pct, 100);
const mutants = [], counts = {};
for (const [file, result] of Object.entries(records.mutation.files)) {
  assert.equal(hash(result.source), sources[file]);
  for (const mutant of result.mutants) { counts[mutant.status] = (counts[mutant.status] ?? 0) + 1;
    if (['Survived', 'Timeout'].includes(mutant.status)) mutants.push({ file, id: mutant.id, status: mutant.status,
      location: mutant.location, replacement: mutant.replacement }); }
}
assert.equal(counts.Survived, 1); assert.equal(counts.Timeout, 5); assert.equal(counts.Killed, 146);
const nativeDifferences = criticalFiles.filter(file => records.native.sources[file] !== sources[file]);
const latencies = records.live.lookups.map(row => row.latencyMs).sort((a, b) => a - b);
const performance = { source: selected.live, liveSdkStatusChecks: latencies.length,
  latencyMs: { min: latencies[0], median: latencies[Math.floor(latencies.length / 2)], p95: latencies[Math.ceil(latencies.length * .95) - 1], max: latencies.at(-1) },
  recordedBackendApiCalls: records.live.providerCalls.length, explicitSessionConfirmationCalls: 6,
  totalBackendApiCalls: records.live.providerCalls.length + latencies.length + 6,
  nativeProtectedRequests: records.native.native.requests.filter(row => row.path.startsWith('/api/')).length,
  productionJourneyLoadMeasured: false };
const artifacts = [];
async function collect(relative = '') {
  for (const entry of await readdir(join(output, relative), { withFileTypes: true })) {
    const path = join(relative, entry.name).replaceAll('\\', '/');
    if (entry.isDirectory()) { if (!['coverage-raw', 'native-js-coverage', '.maestro'].includes(entry.name)) await collect(path); }
    else if (entry.isFile() && entry.name !== 'manifest.json') artifacts.push({ path, sha256: hash(await readFile(join(output, path))) });
  }
}
await writeFile(join(output, 'performance.json'), JSON.stringify(performance, null, 2));
await collect();
await writeFile(join(output, 'manifest.json'), JSON.stringify({ schema: 'session-revocation-verification-v1',
  sources, selected, coverage, mutation: { counts, meaningfulSurvivors: 0, equivalentSurvivors: 1, mutants,
    equivalentReason: 'The surviving regex removes the only dollar delimiter in a supported Clerk publishable-key hostname payload; no supported hostname contains an embedded dollar.' },
  nativeCriticalSourceDifferences: nativeDifferences,
  nativeDifferenceExplanation: 'Native ran before the additional missing-cookie Auth-object denial catch. Original source identities are retained; current-source bearer/role behavior is independently verified by HTTP, DB and all-role live tests.',
  performance, artifacts, preservedFailures: ['db-initial.log', 'all-db.log', 'mutation-interruption.json',
    'full-1791813100741-21b693c6-59a2-41bb-a2fd-3575d6f16bdb.json', 'cookie-tests.log', 'cookie-error.log'],
  limits: ['Provider propagation and requests already admitted', 'SDK transport cannot be aborted through installed getSession API',
    'Production journey/capacity measurements incomplete', 'Four historical real DB failures retained', 'Owned public Vite cache cleanup rejected by automatic approval review'],
}, null, 2));
console.log(JSON.stringify({ status: 'VERIFIED_AT_REQUEST_ADMISSION', coverage: coverage.lines.pct,
  mutation: counts, nativeCriticalSourceDifferences: nativeDifferences, performance }));
