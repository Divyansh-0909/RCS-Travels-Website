import assert from 'node:assert/strict';
import { readFile, writeFile, realpath } from 'node:fs/promises';
import { join, sep, dirname } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { validateUiReproduction } from '../../../tools/phase9-cross/ui-reproduction.mjs';
import { sealPhase9Scenario } from '../helpers/phase9ReplayContract.js';
import { executePhase9Scenario } from '../helpers/phase9ReplayExecutor.js';

const file = await realpath(process.env.PHASE9_UI_REPRODUCTION);
const owned = await realpath(process.env.PHASE9_UI_OUTPUT);
if (!file.startsWith(owned + sep) || !file.endsWith(sep + 'reproduction.json')) throw new Error('Expected owned UI reproduction');
const payload = validateUiReproduction(JSON.parse(await readFile(file, 'utf8')));
assert.equal(payload.recipe, 'native-race');
assert.equal(payload.backend.initial.fare, 1000);
const at = milliseconds => new Date(Date.parse(payload.backend.initial.at) + milliseconds).toISOString();
const scenario = await sealPhase9Scenario({ id: 'captured-ui-cancellation-before-native-acceptance',
  initial: payload.backend.initial,
  events: [
    { type: 'capture', at: at(0), expected: 200 },
    { type: 'offer', at: at(61 * 60000) },
    { type: 'customer_cancel', at: at(62 * 60000) },
    { type: 'refund', at: at(62 * 60000) },
    { type: 'accept', at: at(62 * 60000 + 1), expected: 'booking_taken' },
  ].map((event, index) => ({ ...event, sequence: index + 1 })),
});
const report = await executePhase9Scenario(scenario);
const prefix = 'backend-' + Date.now() + '-' + randomUUID();
const input = prefix + '-input.json', result = prefix + '-result.json';
const inputBytes = JSON.stringify(scenario, null, 2), resultBytes = JSON.stringify(report, null, 2);
await writeFile(join(dirname(file), input), inputBytes, { flag: 'wx' });
await writeFile(join(dirname(file), result), resultBytes, { flag: 'wx' });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
await writeFile(join(dirname(file), prefix + '-index.json'), JSON.stringify({ schema: 'phase9c-backend-reproduction-report-v1',
  artifactIntegrity: JSON.parse(await readFile(file, 'utf8')).integrity,
  input, result, inputSha256: hash(inputBytes), resultSha256: hash(resultBytes),
  recipeSourceSha256: hash(await readFile(new URL(import.meta.url))),
}, null, 2), { flag: 'wx' });
console.log('Captured UI backend event ordering reproduced in a fresh disposable database; OS/UI timing excluded.');
