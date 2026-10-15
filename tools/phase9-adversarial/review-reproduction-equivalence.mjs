import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const file = 'tools/phase9-cross/ui-reproduction.mjs';
const output = 'output/phase9c-adversarial-2026-10-11/';
const source = await readFile(file, 'utf8');
const report = JSON.parse(await readFile(output + 'mutation-reproduction-closure.json', 'utf8'));
assert.equal(report.files[file].source, source);
const mutants = report.files[file].mutants.filter(m => m.status === 'Survived');
assert.equal(mutants.length, 1);
const mutant = mutants[0];
assert.equal(mutant.mutatorName, 'OptionalChaining');
assert.equal(mutant.replacement, 'observation.initial.booking');
assert.equal(mutant.location.start.line, 10);
const variant = source.replace('observation.initial?.booking?.fare', 'observation.initial.booking?.fare');
assert.notEqual(variant, source);
const modules = await Promise.all([source, variant].map(value => import('data:text/javascript;base64,' + Buffer.from(value).toString('base64'))));
let observations = 0;
for (const recipe of ['native-race', 'customer-safety', 'captain-appeal', 'native-competing', 'native-replacement', 'native-terminal', 'native-permissions', 'native-recovery', 'admin-supersession']) {
    for (const initial of [undefined, null, {}, { clock: 'invalid' }, ...['2026-10-11T12:00:00.000Z', null, '', 0].flatMap(clock =>
        [undefined, null, {}, { fare: 1000 }, { fare: 0 }, { fare: null }, { fare: '1000' }].map(booking => ({ clock, booking })))]) {
        const observation = JSON.parse(JSON.stringify({ initial, actions: [], sources: {}, error: 'Synthetic failure' }));
        assert.deepEqual(modules[1].sealUiReproduction(recipe, observation), modules[0].sealUiReproduction(recipe, observation));
        observations++;
    }
}
await writeFile(output + 'reviewed-reproduction-equivalence.json', JSON.stringify({ file, sourceSha256: createHash('sha256').update(source).digest('hex'),
    mutant, status: 'REVIEWED_EQUIVALENT', observations,
    reason: 'For JSON observations, a finite Date.parse(initial.clock) implies a non-null initial object. Missing/null initial makes the first operand false, so the second access is never evaluated. Removing that second initial optional access preserves the public result.',
    boundary: 'Fixture observations are JSON records; arbitrary proxy/accessor objects are outside the saved-artifact contract.' }, null, 2));
console.log('Reproduction equivalent PASS: ' + observations + ' observations');
