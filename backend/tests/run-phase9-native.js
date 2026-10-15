import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { startPostgisTestEnvironment } from './helpers/postgisEnvironment.js';
import { PHASE9_FORBIDDEN_DATABASE, PHASE9_EMPTY_ENV } from './helpers/phase9Isolation.js';

const backend = fileURLToPath(new URL('../', import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 'rcs-phase9-native-'));
if (!resolve(temporary).startsWith(resolve(tmpdir()) + sep)) throw new Error('Unexpected native temporary directory');
const environment = await startPostgisTestEnvironment();
try {
  const inherited = Object.fromEntries(['PATH','SystemRoot','WINDIR','USERPROFILE','TEMP','TMP','LOCALAPPDATA','APPDATA','ComSpec']
    .filter(key => process.env[key]).map(key => [key,process.env[key]]));
  const childEnv = { ...inherited, NODE_ENV: 'test', PHASE9_ISOLATED: '1', TEST_DATABASE_URL: environment.connectionString,
    PHASE9_KEEP_AWAKE: process.argv.includes('--keep-awake') ? '1' : '0',
    DATABASE_URL: PHASE9_FORBIDDEN_DATABASE, DIRECT_URL: PHASE9_FORBIDDEN_DATABASE,
    DOTENV_CONFIG_PATH: PHASE9_EMPTY_ENV, PHASE9_EMPTY_ENV_DIR: temporary,
    CLERK_SECRET_KEY: 'sk_test_phase9_synthetic_only', OPENAI_API_KEY: 'phase9-denied-synthetic-constructor-key',
    FARE_QUOTE_SECRET: 'phase9-quote-synthetic-only', RAZORPAY_KEY_ID: 'rzp_test_verification',
    RAZORPAY_KEY_SECRET: 'verification-payment-secret', RAZORPAY_WEBHOOK_SECRET: 'verification-webhook-secret',
    JAVA_HOME: 'C:/Program Files/Java/jdk-17.0.2', ANDROID_HOME: 'C:/Android', ANDROID_SDK_ROOT: 'C:/Android',
    MAESTRO_CLI_NO_ANALYTICS: '1', MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED: 'true' };
  await new Promise((done, fail) => {
    const child = spawn(process.execPath, ['--import','./tests/helpers/phase9Isolation.js','--import','tsx','tests/e2e/phase9Native.mjs'],
      { cwd: backend, env: childEnv, windowsHide: true, stdio: 'inherit' });
    child.once('error', fail); child.once('close', code => code === 0 ? done() : fail(new Error(`Native phase9 exit ${code}`)));
  });
} finally {
  await rm(temporary, { recursive: true, force: true });
  await environment.stop();
}
