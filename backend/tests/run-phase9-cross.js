import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PHASE9_FORBIDDEN_DATABASE, PHASE9_EMPTY_ENV } from './helpers/phase9Isolation.js';

const backend = fileURLToPath(new URL('../', import.meta.url));
const reproduction = process.argv.find(value => value.startsWith('--reproduce-backend='))?.slice(20);
const captureFailure = process.argv.includes('--capture-ui-failure');
if (captureFailure && (!process.argv.includes('--adversarial-native') || reproduction
  || process.argv.some(value => value.startsWith('--adversarial-') && value !== '--adversarial-native'))) {
  throw new Error('Controlled UI failure capture requires the isolated native race recipe only.');
}
if (process.argv.some(value => value === '--replay' || value.startsWith('--replay='))) {
  throw new Error('Exact saved-input cross-application UI replay is not implemented. Run the fresh-database recipe without --replay.');
}
const { startPostgisTestEnvironment } = await import('./helpers/postgisEnvironment.js');
const environment = await startPostgisTestEnvironment();
const emptyDir = await mkdtemp(join(tmpdir(), 'rcs-phase9-ui-'));
try {
  const inherited = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'USERPROFILE', 'TEMP', 'TMP',
    'LOCALAPPDATA', 'APPDATA', 'ComSpec'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
  const raceKind = ['competing', 'replacement'].find(kind => process.argv.includes('--adversarial-' + kind));
  const adversarial = reproduction || raceKind || process.argv.some(arg => ['--adversarial-native', '--adversarial-browser', '--adversarial-appeal', '--adversarial-supersession', '--adversarial-permissions', '--adversarial-terminal', '--adversarial-recovery'].includes(arg));
  const output = resolve(backend, adversarial ? '../output/phase9c-adversarial-2026-10-11' : '../output/phase9-cross-application-2026-10-11');
  await new Promise((resolveRun, reject) => {
    const entry = reproduction ? ['tests/e2e/phase9UiBackendReproduction.mjs']
      : raceKind ? ['tests/e2e/phase9NativeCompetition.mjs']
      : process.argv.includes('--adversarial-permissions') ? ['tests/e2e/phase9NativePermissions.mjs']
      : process.argv.includes('--adversarial-terminal') ? ['tests/e2e/phase9NativeTerminal.mjs']
      : process.argv.includes('--adversarial-recovery') ? ['tests/e2e/phase9NativeOfferRecovery.mjs']
      : process.argv.includes('--adversarial-supersession') ? ['tests/e2e/phase9AdminSupersession.mjs']
      : process.argv.includes('--adversarial-appeal') ? ['tests/e2e/phase9NativeAppeal.mjs']
      : process.argv.includes('--adversarial-native') ? ['tests/e2e/phase9AdversarialNative.mjs']
      : process.argv.includes('--adversarial-browser') ? ['tests/e2e/phase9AdversarialBrowser.mjs']
      : process.argv.includes('--database-only')
      ? ['--test', '--test-concurrency=1', 'tests/integration/phase9CrossApplication.test.js']
      : process.argv.includes('--customer-safety-only') ? ['tests/e2e/phase9CustomerSafety.mjs']
      : process.argv.includes('--offers-only') ? ['tests/e2e/phase9NativeOffers.mjs']
      : [process.argv.includes('--device-only') ? 'tests/e2e/phase9NativeDevice.mjs' : 'tests/e2e/phase9CrossApplication.mjs'];
    const child = spawn(process.execPath, ['--import', './tests/helpers/phase9Isolation.js', '--import', 'tsx', ...entry,
      ...(captureFailure ? ['--capture-ui-failure'] : [])], {
      cwd: backend, windowsHide: true, stdio: 'inherit', env: { ...inherited,
        NODE_ENV: 'test', PHASE9_CROSS_MODE: process.argv.includes('--browser-only') ? 'browser' : 'combined',
        ...(reproduction ? { PHASE9_UI_REPRODUCTION: resolve(reproduction) } : {}),
        ...(raceKind ? { PHASE9_RACE_KIND: raceKind } : {}),
        PHASE9_KEEP_AWAKE: process.argv.includes('--keep-awake') ? '1' : '0',
        PHASE9_CUSTOMER_UNKNOWN_ORDER: process.argv.includes('--unknown-order') ? '1' : '0',
        JAVA_HOME: 'C:/Program Files/Java/jdk-17.0.2', ANDROID_HOME: 'C:/Android', ANDROID_SDK_ROOT: 'C:/Android',
        MAESTRO_CLI_NO_ANALYTICS: '1', MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED: 'true', PHASE9_ISOLATED: '1', TEST_DATABASE_URL: environment.connectionString,
        DATABASE_URL: PHASE9_FORBIDDEN_DATABASE, DIRECT_URL: PHASE9_FORBIDDEN_DATABASE,
        DOTENV_CONFIG_PATH: PHASE9_EMPTY_ENV, PHASE9_EMPTY_ENV_DIR: emptyDir, PHASE9_UI_OUTPUT: output,
        CLERK_SECRET_KEY: 'sk_test_phase9_synthetic_only', FARE_QUOTE_SECRET: 'phase9-quote-synthetic-only',
        OPENAI_API_KEY: 'phase9-denied-synthetic-constructor-key',
        RAZORPAY_KEY_ID: 'rzp_test_verification', RAZORPAY_KEY_SECRET: 'verification-payment-secret',
        RAZORPAY_WEBHOOK_SECRET: 'verification-webhook-secret',
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
