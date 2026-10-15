import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { verifyBaseline, hash } from './baseline.mjs';
const root = resolve(import.meta.dirname, '../..'), output = join(root, 'output/phase9d-1-continuation-2026-10-13');
const mode = process.argv[2], id = mode + '-' + Date.now() + '-' + randomUUID();
const quality = join(tmpdir(), 'rcs-phase1-quality-tools/node_modules');
const sourcesList = ['tools/phase9d/worker-core.mjs', 'tools/phase9d/worker.mjs', 'tools/phase9d/permissions.sql',
  'tools/phase9d/privacy.mjs', 'tools/phase9d/repository.mjs', 'tools/phase9d/db.mjs', 'tools/phase9d/continue.mjs',
  'backend/tests/phase9dReadiness.test.js', 'backend/tests/phase9dWorker.test.js', 'backend/tests/integration/phase9dReadiness.test.js'];
const commands = {
  unit: ['--test', '--test-reporter=tap', 'backend/tests/phase9dReadiness.test.js', 'backend/tests/phase9dWorker.test.js'],
  db: ['tools/phase9d/db.mjs'],
  lint: [join(quality, 'eslint/bin/eslint.js'), '--config', 'tools/phase9d/eslint.config.mjs', 'tools/phase9d',
    'backend/tests/phase9dReadiness.test.js', 'backend/tests/phase9dWorker.test.js', 'backend/tests/integration/phase9dReadiness.test.js'],
  typecheck: ['backend/node_modules/typescript/bin/tsc', '--project', 'backend/tsconfig.json', '--noEmit'],
  full: ['--import', 'tsx', '--test', '--test-reporter=tap', '--test-concurrency=1', 'tests/*.test.js'],
  capsule: ['tools/phase9d/capsule.mjs'],
  'legacy-auth': ['tools/phase9d/capsule-auth-witness.mjs'],
};
assert.ok(Object.hasOwn(commands, mode)); await mkdir(output, { recursive: true });
const baseline = await verifyBaseline();
const sources = async () => Object.fromEntries(await Promise.all(sourcesList.map(async file => [file, hash(await readFile(join(root, file)))])));
const before = await sources();
const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'USERPROFILE', 'TEMP', 'TMP', 'LOCALAPPDATA', 'APPDATA', 'ComSpec']
  .filter(key => process.env[key]).map(key => [key, process.env[key]]));
Object.assign(env, { NODE_ENV: 'test', DOTENV_CONFIG_PATH: join(root, 'backend/tests/helpers/phase9-empty.env'),
  DATABASE_URL: 'postgresql://denied:denied@localhost:1/phase9_forbidden', DIRECT_URL: 'postgresql://denied:denied@localhost:1/phase9_forbidden',
  PHASE9D_OUTPUT: output, NODE_V8_COVERAGE: join(output, 'coverage-raw'),
  DOCKER_HOST: 'npipe:////./pipe/dockerDesktopLinuxEngine' });
await mkdir(env.NODE_V8_COVERAGE, { recursive: true });
let log = ''; const started = new Date().toISOString();
const child = spawn(process.execPath, commands[mode], { cwd: mode === 'full' ? join(root,'backend') : root, windowsHide: true, env, stdio: ['ignore', 'pipe', 'pipe'] });
child.stdout.on('data', value => { log += value; }); child.stderr.on('data', value => { log += value; });
const code = await new Promise((done, fail) => { child.once('close', done); child.once('error', fail); });
log = log.replace(/postgres(?:ql)?:\/\/[^\s'"<>]+/g, '[database-url-redacted]');
await writeFile(join(output, id + '.log'), log, { flag: 'wx' });
const record = { id, mode, code, started, finished: new Date().toISOString(), sources: before,
  sourcesUnchanged: JSON.stringify(before) === JSON.stringify(await sources()), baseline, logSha256: hash(log),
  summary: log.split('\n').filter(line => /^# (tests|pass|fail|skipped)|error TS|Error:/.test(line)).slice(-12) };
await writeFile(join(output, id + '.json'), JSON.stringify(record, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ id, code, sourcesUnchanged: record.sourcesUnchanged, summary: record.summary }));
process.exitCode = code || (record.sourcesUnchanged ? 0 : 1);
