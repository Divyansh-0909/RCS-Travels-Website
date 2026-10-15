import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const [label, mode] = process.argv.slice(2);
if (!/^[a-z][a-z0-9-]{2,70}$/.test(label ?? '') || !['native', 'browser', 'appeal', 'competing', 'replacement', 'supersession', 'permissions', 'terminal', 'recovery'].includes(mode)) throw new Error('Expected owned label and supported adversarial mode');
const root = 'output/phase9c-adversarial-2026-10-11';
await mkdir(root, { recursive: true });
const file = join(root, label + '.log');
const stream = createWriteStream(file, { flags: 'wx' });
const startedAt = new Date().toISOString();
const args = ['backend/tests/run-phase9-cross.js', '--adversarial-' + mode, '--keep-awake'];
await writeFile(join(root, label + '-started.json'), JSON.stringify({ status: 'STARTED', label, mode, startedAt, args,
  log: file, boundary: 'A final execution record is required to claim completion; this durable start record alone is not a pass.' }, null, 2), { flag: 'wx' });
const child = spawn(process.execPath, args, { windowsHide: true });
child.stdout.pipe(stream, { end: false }); child.stderr.pipe(stream, { end: false });
const code = await new Promise((done, fail) => { child.once('error', fail); child.once('close', done); });
await new Promise(done => stream.end(done));
await writeFile(join(root, label + '-execution.json'), JSON.stringify({ startedAt, finishedAt: new Date().toISOString(),
  args, exitCode: code, log: file, logSha256: createHash('sha256').update(await readFile(file)).digest('hex') }, null, 2));
console.log(JSON.stringify({ label, exitCode: code, log: file }));
process.exitCode = code;
