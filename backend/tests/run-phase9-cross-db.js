import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { startPostgisTestEnvironment } from './helpers/postgisEnvironment.js'
import { PHASE9_FORBIDDEN_DATABASE, PHASE9_EMPTY_ENV } from './helpers/phase9Isolation.js'

const suites = {
  historical: ['tests/integration/phase6bLifecyclePostgres.test.js'],
  cross: ['tests/integration/phase9CrossApplication.test.js', 'tests/integration/phase9ReviewHttp.test.js',
    'tests/integration/phase9AppealHttp.test.js'],
  admin: ['tests/e2e/phase9AdminAppeal.mjs'],
  sessions: ['tests/integration/phase9SessionRevocation.test.js'],
  sessionNative: ['tests/e2e/sessionRevocationNative.mjs'],
}
const selected = process.argv[2]
if (!Object.hasOwn(suites, selected)) throw new Error('Select historical or cross database verification')
const environment = await startPostgisTestEnvironment()
const output = resolve(selected.startsWith('session') ? 'output/session-revocation-2026-10-12' : 'output/phase9-cross-application-2026-10-11')
await mkdir(resolve(output, 'empty-env'), { recursive: true })
try {
  const inherited = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'USERPROFILE', 'TEMP', 'TMP',
    'LOCALAPPDATA', 'APPDATA', 'ComSpec'].filter(key => process.env[key]).map(key => [key, process.env[key]]))
  const code = await new Promise((done, fail) => {
    const child = spawn(process.execPath, ['--import', './tests/helpers/phase9Isolation.js', '--import', 'tsx',
      ...(selected === 'admin' || selected === 'sessionNative' ? [] : ['--test', '--test-concurrency=1']), ...suites[selected]], {
      cwd: fileURLToPath(new URL('../', import.meta.url)), windowsHide: true, stdio: 'inherit',
      env: { ...inherited, NODE_ENV: 'test', PHASE9_ISOLATED: '1',
        TEST_DATABASE_URL: environment.connectionString, DATABASE_URL: PHASE9_FORBIDDEN_DATABASE,
        DIRECT_URL: PHASE9_FORBIDDEN_DATABASE, DOTENV_CONFIG_PATH: PHASE9_EMPTY_ENV,
        PHASE9_UI_OUTPUT: output, PHASE9_EMPTY_ENV_DIR: resolve(output, 'empty-env'),
        JAVA_HOME: 'C:/Program Files/Java/jdk-17.0.2', ANDROID_HOME: 'C:/Android', ANDROID_SDK_ROOT: 'C:/Android',
        MAESTRO_CLI_NO_ANALYTICS: '1', MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED: 'true',
        CLERK_SECRET_KEY: 'sk_test_phase9_synthetic_only', FARE_QUOTE_SECRET: 'phase9-quote-synthetic-only',
        OPENAI_API_KEY: 'phase9-denied-synthetic-constructor-key',
        RAZORPAY_KEY_ID: 'rzp_test_verification', RAZORPAY_KEY_SECRET: 'verification-payment-secret',
        RAZORPAY_WEBHOOK_SECRET: 'verification-webhook-secret' },
    })
    child.once('error', fail)
    child.once('close', done)
  })
  process.exitCode = code ?? 1
} finally { await environment.stop() }
