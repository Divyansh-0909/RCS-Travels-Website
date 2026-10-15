import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { criticalFiles, unitFiles } from './scope.mjs';

const root = resolve(import.meta.dirname, '../..');
const output = join(root, 'output/session-revocation-2026-10-12');
const mode = process.argv[2] ?? 'unit';
const quality = join(tmpdir(), 'rcs-phase1-quality-tools/node_modules');
const commands = {
  unit: { cwd: join(root, 'backend'), args: ['--import', 'tsx', '--test', ...unitFiles] },
  full: { cwd: join(root, 'backend'), args: ['--import', 'tsx', '--test', '--test-concurrency=4', 'tests/*.test.js'] },
  db: { cwd: root, args: ['backend/tests/run-phase9-cross-db.js', 'sessions'] },
  cross: { cwd: root, args: ['backend/tests/run-phase9-cross-db.js', 'cross'] },
  coverage: { cwd: root, args: [join(quality, 'c8/bin/c8.js'), '--all', '--src=.', '--extension=.js', '--extension=.mjs',
    '--reporter=json', '--reporter=json-summary', '--reporter=text', '--report-dir=' + join(output, 'coverage'),
    '--temp-directory=' + join(output, 'coverage-raw'), ...criticalFiles.map(file => '--include=' + file),
    process.execPath, '--import', './backend/node_modules/tsx/dist/loader.mjs', '--test', ...unitFiles.map(file => 'backend/' + file)] },
};
if (!Object.hasOwn(commands, mode)) throw new Error('Unknown session verification mode');
await mkdir(output, { recursive: true });
const run = mode + '-' + Date.now() + '-' + randomUUID();
const sourceFiles = [...criticalFiles, ...unitFiles.map(file => 'backend/' + file),
  'backend/index.js', 'backend/routes/fare.js', 'backend/tests/helpers/phase9BrowserAuth.js',
  'backend/tests/helpers/phase9BrowserHarness.js', 'backend/tests/helpers/liveSessionFake.js',
  'backend/tests/integration/phase9SessionRevocation.test.js', 'backend/tests/separatedDevelopmentAudit.test.js',
  'backend/tests/integration/phase5DeferredPostgisValidation.test.js', 'backend/tests/integration/phase7ShadowAdjudicationPostgres.test.js'];
const sources = async () => Object.fromEntries(await Promise.all(sourceFiles.map(async file => [file,
  createHash('sha256').update(await readFile(join(root, file))).digest('hex')])));
const before = await sources(), started = new Date().toISOString();
const { cwd, args } = commands[mode];
let log = '';
const child = spawn(process.execPath, args, { cwd, windowsHide: true, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
child.stdout.on('data', bytes => { log += bytes; }); child.stderr.on('data', bytes => { log += bytes; });
const code = await new Promise((done, fail) => { child.once('error', fail); child.once('close', done); });
log = log.replace(/(?:sk|pk)_(?:test|live)_[A-Za-z0-9_-]+/g, '[key-redacted]')
  .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[jwt-redacted]');
await writeFile(join(output, run + '.log'), log, { flag: 'wx' });
const after = await sources();
const record = { run, mode, started, finished: new Date().toISOString(), code, sources: before,
  sourcesUnchanged: JSON.stringify(before) === JSON.stringify(after), summary: log.split('\n').filter(line => /tests |pass |fail |skipped |duration_ms/.test(line)).slice(-8) };
await writeFile(join(output, run + '.json'), JSON.stringify(record, null, 2), { flag: 'wx' });
console.log(JSON.stringify(record));
process.exitCode = code || (record.sourcesUnchanged ? 0 : 1);
