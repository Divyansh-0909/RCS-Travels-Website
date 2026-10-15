import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { mutationGroups } from './scope.mjs';

const group = process.argv[2];
const focused = process.argv.includes('--focused');
const reportLabel = process.argv.find(value => value.startsWith('--label='))?.slice(8);
const baseline = process.argv.find(value => value.startsWith('--baseline='))?.slice(11) ?? 'initial';
if (!/^[a-z-]+$/.test(baseline)) throw new Error('Invalid mutation baseline label');
if (reportLabel && !/^[a-z-]+$/.test(reportLabel)) throw new Error('Invalid mutation report label');
if (!Object.hasOwn(mutationGroups, group)) throw new Error('Select a critical mutation group');
const output = 'output/phase9c-adversarial-2026-10-11';
const suffix = reportLabel ?? (focused ? 'focused' : 'initial');
const logPath = join(output, 'mutation-' + group + '-' + suffix + '.log'), log = createWriteStream(logPath);
const startedAt = new Date().toISOString();
const before = Object.fromEntries(await Promise.all(mutationGroups[group].files.map(async file =>
  [file, createHash('sha256').update(await readFile(file)).digest('hex')])));
const code = await new Promise((done, fail) => {
  const child = spawn(process.execPath, [join(tmpdir(), 'rcs-phase1-quality-tools/node_modules/@stryker-mutator/core/bin/stryker.js'),
    'run', 'tools/phase9-adversarial/stryker' + (focused ? '-focus' : '') + '.config.mjs'], { windowsHide: true,
    env: { ...process.env, PHASE9_MUTATION_GROUP: group, PHASE9_MUTATION_REPORT_LABEL: suffix, PHASE9_MUTATION_BASELINE: baseline } });
  child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false });
  child.once('error', fail); child.once('close', done);
});
await new Promise(done => log.end(done));
await writeFile(join(output, 'mutation-' + group + '-' + suffix + '-execution.json'), JSON.stringify({ group, startedAt,
  finishedAt: new Date().toISOString(), exitCode: code, sources: before,
  logSha256: createHash('sha256').update(await readFile(logPath)).digest('hex') }, null, 2));
console.log(group + ' mutation exit ' + code);
process.exitCode = code ?? 1;
