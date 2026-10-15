import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { startPostgisTestEnvironment } from './helpers/postgisEnvironment.js';
import { PHASE9_FORBIDDEN_DATABASE, PHASE9_EMPTY_ENV } from './helpers/phase9Isolation.js';

const backend = fileURLToPath(new URL('../', import.meta.url));
const replay = process.argv.find(value => value.startsWith('--replay='))?.slice(9);
const environment = await startPostgisTestEnvironment();
const emptyDir = await mkdtemp(join(tmpdir(), 'rcs-phase9-ui-'));
try {
  const inherited = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'USERPROFILE', 'TEMP', 'TMP',
    'LOCALAPPDATA', 'APPDATA', 'ComSpec'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
  const output = resolve(backend, '../output/phase9-ui-2026-10-10');
  await new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, ['--import', './tests/helpers/phase9Isolation.js', '--import', 'tsx', 'tests/e2e/phase9Browser.mjs'], {
      cwd: backend, windowsHide: true, stdio: 'inherit', env: { ...inherited,
        NODE_ENV: 'test', PHASE9_ISOLATED: '1', TEST_DATABASE_URL: environment.connectionString,
        DATABASE_URL: PHASE9_FORBIDDEN_DATABASE, DIRECT_URL: PHASE9_FORBIDDEN_DATABASE,
        DOTENV_CONFIG_PATH: PHASE9_EMPTY_ENV, PHASE9_EMPTY_ENV_DIR: emptyDir, PHASE9_UI_OUTPUT: output,
        CLERK_SECRET_KEY: 'sk_test_phase9_synthetic_only', FARE_QUOTE_SECRET: 'phase9-quote-synthetic-only',
        OPENAI_API_KEY: 'phase9-denied-synthetic-constructor-key',
        RAZORPAY_KEY_ID: 'rzp_test_verification', RAZORPAY_KEY_SECRET: 'verification-payment-secret',
        RAZORPAY_WEBHOOK_SECRET: 'verification-webhook-secret',
        ...(replay ? { PHASE9_UI_REPLAY: resolve(replay) } : {}),
      },
    });
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolveRun() : reject(new Error(`Phase 9 UI failed (exit ${code})`)));
  });
} finally {
  // The path is returned directly by mkdtemp under the OS temporary directory.
  if (!resolve(emptyDir).startsWith(resolve(tmpdir()) + '\\')) throw new Error('Unexpected temporary directory');
  await rm(emptyDir, { recursive: true, force: true });
  await environment.stop();
}
