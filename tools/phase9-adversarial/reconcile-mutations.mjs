import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { criticalFiles } from './scope.mjs';
const output = 'output/phase9c-adversarial-2026-10-11/';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const identity = (file, mutant) => JSON.stringify([file, mutant.location, mutant.mutatorName, mutant.replacement]);
const selected = ['notices-closure', 'gateway-recovered', 'sources-verified', 'reproduction-closure', 'customer-verified', 'captain-closure'];
const reviews = new Map();
const gateway = JSON.parse(await readFile(output + 'reviewed-gateway-equivalences.json'));
for (const review of gateway.results) reviews.set(identity(review.file, review), review);
const reproduction = JSON.parse(await readFile(output + 'reviewed-reproduction-equivalence.json'));
reviews.set(identity(reproduction.file, reproduction.mutant), reproduction);
const mutants = new Map(), sources = {}, artifacts = [];
for (const label of selected) {
    const name = 'mutation-' + label;
    const bytes = await readFile(output + name + '.json');
    const report = JSON.parse(bytes), execution = JSON.parse(await readFile(output + name + '-execution.json'));
    assert.equal(execution.exitCode, 0);
    assert.equal(hash(await readFile(output + name + '.log')), execution.logSha256);
    for (const [file, entry] of Object.entries(report.files)) {
        assert.ok(criticalFiles.includes(file));
        const current = await readFile(file);
        assert.equal(entry.source, current.toString('utf8'));
        assert.equal(execution.sources[file], hash(current));
        sources[file] = hash(current);
        for (const mutant of entry.mutants) {
            const key = identity(file, mutant);
            assert.ok(!mutants.has(key), 'Duplicate selected full-report identity');
            let review = null;
            if (mutant.status === 'Survived') {
                review = reviews.get(key); assert.ok(review, 'Unreviewed survivor ' + key);
                assert.equal(review.sourceSha256, hash(current));
                assert.equal(review.status, 'REVIEWED_EQUIVALENT'); assert.ok(review.reason);
            } else assert.equal(mutant.status, 'Killed');
            mutants.set(key, { file, ...mutant, report: name + '.json', derivedStatus: review ? 'REVIEWED_EQUIVALENT' : 'Killed', review });
        }
    }
    artifacts.push({ report: name + '.json', sha256: hash(bytes), execution: name + '-execution.json' });
}
assert.deepEqual(Object.keys(sources).sort(), [...criticalFiles].sort());
for (const key of reviews.keys()) assert.equal(mutants.get(key)?.derivedStatus, 'REVIEWED_EQUIVALENT');
const counts = {};
for (const mutant of mutants.values()) counts[mutant.derivedStatus] = (counts[mutant.derivedStatus] ?? 0) + 1;
await writeFile(output + 'mutation-closure.json', JSON.stringify({ schema: 'phase9c-adversarial-mutation-closure-v1',
    status: 'PASS', generatedAt: new Date().toISOString(), totalUnique: mutants.size, counts,
    meaningfulSurvivors: 0, timeouts: 0, ignored: 0, errors: 0, sources, artifacts, mutants: [...mutants.values()],
    boundary: 'Six complete current-source reports. Raw reports retain their survivor status; four executable equivalence reviews are derived separately. Interrupted, failed scaffolding and earlier assertion reports do not contribute additional counts.' }, null, 2));
console.log(JSON.stringify({ totalUnique: mutants.size, counts, status: 'PASS' }));
