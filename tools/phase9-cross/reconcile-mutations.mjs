import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { criticalFiles } from './scope.mjs';

const output = 'output/phase9-cross-application-2026-10-11';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const identity = (file, mutant) => JSON.stringify([file, mutant.location.start.line, mutant.location.start.column,
  mutant.location.end.line, mutant.location.end.column, mutant.mutatorName, mutant.replacement]);
const groups = {
  backend: ['initial', 'focused'], providers: ['initial', 'focused', 'closure', 'final', 'catch-closure'],
  maps: ['verified'], frontend: ['initial', 'focused'], captain: ['closure'], gps: ['initial', 'focused'],
  navigation: ['initial', 'focused'], device: ['initial', 'focused', 'closure', 'final'], startup: ['closure'],
};
const mutants = new Map(), artifacts = [], sources = {}, summaries = {};
for (const [group, labels] of Object.entries(groups)) {
  const baseline = new Set();
  for (const [index, label] of labels.entries()) {
    const name = 'mutation-' + group + '-' + label, bytes = await readFile(join(output, name + '.json'));
    const legacyExecution = label === 'initial' && ['backend', 'frontend', 'gps'].includes(group);
    const executionName = 'mutation-' + group + (legacyExecution ? '' : '-' + label) + '-execution.json';
    const report = JSON.parse(bytes), executionBytes = await readFile(join(output, executionName));
    const execution = JSON.parse(executionBytes);
    assert.equal(execution.exitCode, 0, name + ' execution');
    assert.equal(sha(await readFile(join(output, name + '.log'))), execution.logSha256, name + ' log');
    const counts = {};
    for (const [file, entry] of Object.entries(report.files)) {
      assert.ok(criticalFiles.includes(file));
      const current = await readFile(file);
      assert.equal(entry.source, current.toString('utf8'), name + ' source');
      assert.equal(execution.sources[file], sha(current), name + ' executed source');
      sources[file] = sha(current);
      for (const mutant of entry.mutants) {
        const key = identity(file, mutant);
        if (index === 0) { assert.ok(!baseline.has(key), 'Duplicate baseline identity'); baseline.add(key); }
        else assert.ok(baseline.has(key), name + ' has an identity absent from its full baseline');
        counts[mutant.status] = (counts[mutant.status] ?? 0) + 1;
        const previous = mutants.get(key);
        mutants.set(key, { file, location: mutant.location, mutatorName: mutant.mutatorName, replacement: mutant.replacement,
          status: mutant.status, history: [...(previous?.history ?? []), { report: name + '.json', id: mutant.id, status: mutant.status }] });
      }
    }
    artifacts.push({ report: name + '.json', sha256: sha(bytes), execution: executionName,
      executionSha256: sha(executionBytes), rawCounts: counts });
  }
  summaries[group] = baseline.size;
}
assert.deepEqual(Object.keys(sources).sort(), [...criticalFiles].sort());
const reviews = new Map();
for (const name of ['utf8', 'staging', 'device', 'gateway']) {
  const file = 'reviewed-' + name + '-equivalences.json', bytes = await readFile(join(output, file));
  for (const review of JSON.parse(bytes).results) {
    const key = identity(review.file, review);
    assert.ok(!reviews.has(key)); assert.equal(review.sourceSha256, sources[review.file]);
    assert.equal(review.status, 'REVIEWED_EQUIVALENT'); assert.ok(review.reason && review.witness);
    reviews.set(key, review);
  }
  artifacts.push({ review: file, sha256: sha(bytes) });
}
const counts = {};
for (const [key, mutant] of mutants) {
  if (mutant.status === 'Survived') {
    assert.ok(reviews.has(key), 'Unreviewed survivor: ' + key);
    mutant.review = reviews.get(key); mutant.derivedStatus = 'REVIEWED_EQUIVALENT';
  } else { assert.equal(mutant.status, 'Killed', 'Unresolved mutation: ' + key); mutant.derivedStatus = 'Killed'; }
  counts[mutant.derivedStatus] = (counts[mutant.derivedStatus] ?? 0) + 1;
}
for (const key of reviews.keys()) assert.equal(mutants.get(key)?.derivedStatus, 'REVIEWED_EQUIVALENT');
await writeFile(join(output, 'mutation-closure.json'), JSON.stringify({ schema: 'phase9-cross-mutation-closure-v1',
  generatedAt: new Date().toISOString(), status: 'PASS', totalUnique: mutants.size, counts, groupUniqueCounts: summaries,
  meaningfulSurvivors: 0, timeouts: 0, ignored: 0, errors: 0, sources, artifacts,
  excludedHistoricalReports: [{ report: 'mutation-maps-initial.json', reason: 'Superseded source; raw report retained.' }],
  boundary: 'Latest executed status by exact file/location/mutator/replacement; raw histories retain earlier failures and timeouts.',
  mutants: [...mutants.values()] }, null, 2));
console.log(JSON.stringify({ totalUnique: mutants.size, counts, status: 'PASS' }));
