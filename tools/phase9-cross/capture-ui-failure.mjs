import { readFile, writeFile, realpath } from 'node:fs/promises';
import { resolve, sep, dirname, join } from 'node:path';
import { sealUiReproduction } from './ui-reproduction.mjs';

const file = await realpath(process.argv[2]);
const owned = await realpath('output/phase9c-adversarial-2026-10-11');
if (!file.startsWith(owned + sep) || !file.endsWith(sep + 'failure.json')) throw new Error('Expected an owned UI failure receipt');
const observation = JSON.parse(await readFile(file, 'utf8'));
const recipe = observation.run.startsWith('race-') ? 'native-race' : 'customer-safety';
await writeFile(join(dirname(file), 'reproduction.json'), JSON.stringify(sealUiReproduction(recipe, observation), null, 2));
console.log(JSON.stringify({ reproduction: resolve(dirname(file), 'reproduction.json'), exactUiReplay: false }));
