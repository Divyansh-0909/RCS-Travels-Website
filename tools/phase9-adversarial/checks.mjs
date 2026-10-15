import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const output = join(repository, 'output/phase9c-adversarial-2026-10-11');
const temporary = join(output, 'empty-env');
await mkdir(temporary, { recursive: true });
const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'USERPROFILE', 'TEMP', 'TMP', 'LOCALAPPDATA', 'APPDATA', 'ComSpec']
  .filter(key => process.env[key]).map(key => [key, process.env[key]]));
Object.assign(env, { NODE_ENV: 'test', DOTENV_CONFIG_PATH: join(repository, 'backend/tests/helpers/phase9-empty.env'),
  DATABASE_URL: 'postgresql://denied:denied@127.0.0.1:1/phase9_forbidden', DIRECT_URL: 'postgresql://denied:denied@127.0.0.1:1/phase9_forbidden',
  TEST_DATABASE_URL: 'postgresql://denied:denied@127.0.0.1:1/phase9_unit_test',
  EXPO_NO_DOTENV: '1', EXPO_OFFLINE: '1', EXPO_NO_TELEMETRY: '1', CI: '1', PHASE9_ISOLATED: '1', PHASE9_EMPTY_ENV_DIR: temporary,
  VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_cGhhc2U5LmNsZXJrLmFjY291bnRzLmRldiQ=', VITE_API_BASE_URL: '/fixture-backend', PHASE9_BROWSER_API: 'http://127.0.0.1:1' });
const npm = join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const checks = {
  'backend-tests': [npm, '--prefix', 'backend', 'test', '--', '--test-concurrency=2'],
  'backend-typecheck': [npm, '--prefix', 'backend', 'run', 'typecheck'],
  'frontend-tests': [npm, '--prefix', 'frontend', 'test'],
  'frontend-build': [npm, '--prefix', 'frontend', 'run', 'build', '--', '--config', 'tests/e2e/vite.config.mjs', '--outDir', '../output/phase9c-adversarial-2026-10-11/frontend-build'],
  'captain-tests': ['--test', 'driver-app/tests/rateLimit.test.mjs', 'driver-app/tests/offerAcknowledgement.test.mjs', 'driver-app/tests/activeRideAddress.test.mjs', 'driver-app/tests/driverAppealAction.test.mjs', 'driver-app/tests/driverCancellationView.test.mjs'],
  'captain-lint': [npm, '--prefix', 'driver-app', 'run', 'lint'],
  'phase9-db': ['backend/tests/run-phase9.js'],
  'phase9-paired-replay': ['backend/tests/run-phase9.js', '--replay'],
  'phase9-saved-replay': ['backend/tests/run-phase9.js', '--receipts=output/phase9-final-integration-2026-10-09/replay/20261012023617230-7498b52c-22f1-4e87-b8c0-2fb6f73b62ba'],
};
const selected = process.argv[2];
if (!Object.hasOwn(checks, selected)) throw new Error('Select a defined Phase9 check');
if (selected.startsWith('phase9-') && process.platform === 'win32') {
  // Verified local Docker Desktop Linux engine; no remote daemon or credentials.
  env.DOCKER_HOST = 'npipe:////./pipe/dockerDesktopLinuxEngine';
}
if (selected.startsWith('phase9-')) delete env.PHASE9_ISOLATED;
const label = process.argv.find(arg => arg.startsWith('--label='))?.slice(8);
if (label !== undefined && !/^[a-z-]+$/.test(label)) throw new Error('Invalid check report label');
const report = selected + (label ? '-' + label : '');
const startedAt = new Date().toISOString();
const logFile = join(output, report + '.log');
const log = createWriteStream(logFile);
const exitCode = await new Promise((done, fail) => {
  const child = spawn(process.execPath, checks[selected], { cwd: repository, env, windowsHide: true });
  child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false });
  child.once('error', fail); child.once('close', done);
});
await new Promise(done => log.end(done));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
await writeFile(join(output, report + '-execution.json'), JSON.stringify({ selected, command: [process.execPath, ...checks[selected]],
  startedAt, finishedAt: new Date().toISOString(), exitCode, log: resolve(logFile), logSha256: sha256(await readFile(logFile)),
  runnerSha256: sha256(await readFile(fileURLToPath(import.meta.url))), environment: 'allowlisted, empty dotenv, denied runtime database URLs' }, null, 2));
console.log(selected + ' exit ' + exitCode);
process.exitCode = exitCode ?? 1;
