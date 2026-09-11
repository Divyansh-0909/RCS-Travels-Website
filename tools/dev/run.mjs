import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawn } from 'node:child_process'
import process from 'node:process'

const root = resolve(import.meta.dirname, '../..')
const backendDir = resolve(root, 'backend')
const frontendDir = resolve(root, 'frontend')
const driverDir = resolve(root, 'driver-app')
const backendEnvPath = resolve(backendDir, '.env')
const frontendEnvPath = resolve(frontendDir, '.env')
const driverEnvPath = resolve(driverDir, '.env')
const driverLocalEnvPath = resolve(driverDir, '.env.local')
const emptyEnvPath = resolve(import.meta.dirname, 'empty.env')
const isWindows = process.platform === 'win32'

function readEnv(file) {
  if (!existsSync(file)) throw new Error(`Missing ${file}. Copy the corresponding .env.example, then add the development values described in DEVELOPMENT.md.`)
  const values = {}
  for (const rawLine of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!match) continue
    let value = match[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    values[match[1]] = value
  }
  return values
}

function readOptionalEnv(file) {
  return existsSync(file) ? readEnv(file) : {}
}

function requireValue(values, name, file) {
  const value = values[name]
  if (!value) throw new Error(`${name} must be set in ${file}. Refusing to use a non-development fallback.`)
  return value
}

function testClerkKey(value, prefix, name) {
  if (!value.startsWith(prefix)) throw new Error(`${name} must be a Clerk test-mode key (${prefix}…).`)
}

function databaseIdentity(raw) {
  let parsed
  try { parsed = new URL(raw) } catch { throw new Error('Development database URLs must be valid PostgreSQL URLs.') }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('Development database URLs must use the postgres or postgresql scheme.')
  }
  const hostname = parsed.hostname.toLowerCase()
  const database = parsed.pathname.replace(/^\//, '')
  const directSupabase = hostname.match(/^db\.([^.]+)\.supabase\.co$/)?.[1]
  const poolerSupabase = hostname.endsWith('.pooler.supabase.com')
    ? decodeURIComponent(parsed.username).match(/^postgres\.([^.]+)$/)?.[1]
    : null
  const canonicalHost = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname)
    ? 'loopback'
    : hostname
  return directSupabase || poolerSupabase
    ? `supabase:${directSupabase || poolerSupabase}:${database}`
    : `${canonicalHost}:${parsed.port || '5432'}:${database}`
}

function assertDifferentDatabase(developmentUrl, ordinaryUrls) {
  const development = databaseIdentity(developmentUrl)
  for (const ordinaryUrl of ordinaryUrls.filter(Boolean)) {
    if (development === databaseIdentity(ordinaryUrl)) {
      throw new Error('Development and ordinary connection values resolve to the same database. Use an isolated development database.')
    }
  }
}

const isolatedKeys = [
  'ADMIN_PHONE', 'FARE_QUOTE_SECRET', 'FIREBASE_SERVICE_ACCOUNT_BASE64',
  'GCS_BUCKET', 'GOOGLE_APPLICATION_CREDENTIALS', 'GOOGLE_CLOUD_PROJECT', 'GOOGLE_MAPS_API_KEY',
  'INTERNAL_JOBS_AUDIENCE', 'INTERNAL_JOBS_SECRET', 'INTERNAL_JOBS_SERVICE_ACCOUNT',
  'OPENAI_API_KEY', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET',
  'TASKS_LOCATION', 'TASKS_QUEUE', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_APP_SECRET',
  'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_VERIFY_TOKEN',
  'WHATSAPP_TEMPLATE_ADMIN_UNASSIGNED_RIDE', 'WHATSAPP_TEMPLATE_CUSTOMER_SCHEDULED_REMINDER',
  'WHATSAPP_TEMPLATE_DRIVER_ASSIGNED', 'WHATSAPP_TEMPLATE_DRIVER_CANCELLED_RIDE',
  'WHATSAPP_TEMPLATE_DRIVER_SCHEDULED_REMINDER', 'WHATSAPP_TEMPLATE_NO_DRIVER_FOUND',
  'WHATSAPP_TEMPLATE_POOL_JOINED', 'WHATSAPP_TEMPLATE_RIDE_COMPLETED',
  'WHATSAPP_TEMPLATE_SCHEDULED_PAYMENT_CONFIRMED',
]

function developmentEnvironment() {
  const backendFile = readEnv(backendEnvPath)
  const frontendFile = readEnv(frontendEnvPath)
  const driverFile = { ...readEnv(driverEnvPath), ...readOptionalEnv(driverLocalEnvPath) }
  const databaseUrl = requireValue(backendFile, 'DEVELOPMENT_DATABASE_URL', 'backend/.env')
  const directUrl = backendFile.DEVELOPMENT_DIRECT_URL || databaseUrl
  assertDifferentDatabase(databaseUrl, [backendFile.DATABASE_URL, backendFile.DIRECT_URL])
  assertDifferentDatabase(directUrl, [backendFile.DATABASE_URL, backendFile.DIRECT_URL])
  if (databaseIdentity(databaseUrl) !== databaseIdentity(directUrl)) {
    throw new Error('DEVELOPMENT_DATABASE_URL and DEVELOPMENT_DIRECT_URL resolve to different databases.')
  }
  // Dedicated override names are useful when a machine also carries production
  // config, but the ordinary names are fine when (and only when) they are test
  // keys. Keeping this fallback means an existing safe Clerk setup needs no
  // duplicated secrets just to use the guarded development runner.
  const secretKey = backendFile.DEVELOPMENT_CLERK_SECRET_KEY ||
    requireValue(backendFile, 'CLERK_SECRET_KEY', 'backend/.env')
  const backendPublishableKey = backendFile.DEVELOPMENT_CLERK_PUBLISHABLE_KEY ||
    requireValue(backendFile, 'CLERK_PUBLISHABLE_KEY', 'backend/.env')
  const frontendPublishableKey = frontendFile.VITE_DEVELOPMENT_CLERK_PUBLISHABLE_KEY ||
    requireValue(frontendFile, 'VITE_CLERK_PUBLISHABLE_KEY', 'frontend/.env')
  // The guarded runner can safely inject the already-validated backend test
  // instance. A dedicated driver override is accepted only when explicitly set.
  const driverPublishableKey = driverFile.EXPO_PUBLIC_DEVELOPMENT_CLERK_PUBLISHABLE_KEY ||
    backendPublishableKey

  testClerkKey(secretKey, 'sk_test_', 'DEVELOPMENT_CLERK_SECRET_KEY')
  testClerkKey(backendPublishableKey, 'pk_test_', 'DEVELOPMENT_CLERK_PUBLISHABLE_KEY')
  testClerkKey(frontendPublishableKey, 'pk_test_', 'VITE_DEVELOPMENT_CLERK_PUBLISHABLE_KEY')
  testClerkKey(driverPublishableKey, 'pk_test_', 'EXPO_PUBLIC_DEVELOPMENT_CLERK_PUBLISHABLE_KEY')
  if (backendPublishableKey !== frontendPublishableKey || backendPublishableKey !== driverPublishableKey) {
    throw new Error('Development Clerk publishable keys do not match across backend, frontend, and the driver override.')
  }

  // Maps intentionally uses the production project in development. Dedicated
  // overrides remain supported, but the ordinary keys are the expected setup.
  const mapsKey = backendFile.DEVELOPMENT_GOOGLE_MAPS_API_KEY ||
    requireValue(backendFile, 'GOOGLE_MAPS_API_KEY', 'backend/.env')
  const frontendMapsKey = frontendFile.VITE_DEVELOPMENT_GOOGLE_MAPS_API_KEY ||
    requireValue(frontendFile, 'VITE_GOOGLE_MAPS_API_KEY', 'frontend/.env')
  const razorpayKeyId = backendFile.DEVELOPMENT_RAZORPAY_KEY_ID || ''
  if (razorpayKeyId && !razorpayKeyId.startsWith('rzp_test_')) {
    throw new Error('DEVELOPMENT_RAZORPAY_KEY_ID must be a Razorpay test-mode key.')
  }

  // Do not let dotenv/config reload backend/.env inside the child: that file may
  // also carry production integrations. Only explicit DEVELOPMENT_* mappings
  // below cross into the local backend.
  const backendEnv = { ...process.env }
  for (const key of [...Object.keys(backendFile), ...isolatedKeys]) delete backendEnv[key]
  Object.assign(backendEnv, {
    DOTENV_CONFIG_PATH: emptyEnvPath,
    DOTENV_CONFIG_QUIET: 'true',
    NODE_ENV: 'development',
    PORT: '5000',
    APP_ORIGIN: 'http://localhost:1574',
    CORS_ORIGINS: [
      'http://localhost:1574', 'http://127.0.0.1:1574',
      'http://localhost:5173', 'http://127.0.0.1:5173',
      'http://localhost:8082', 'http://127.0.0.1:8082',
    ].join(','),
    DATABASE_URL: databaseUrl,
    DIRECT_URL: directUrl,
    CLERK_SECRET_KEY: secretKey,
    CLERK_PUBLISHABLE_KEY: backendPublishableKey,
    GOOGLE_MAPS_API_KEY: mapsKey,
    FCM_ALWAYS_ACCEPT: '1',
    JOBS_MODE: 'interval',
    OPENAI_API_KEY: backendFile.DEVELOPMENT_OPENAI_API_KEY || 'development-disabled',
    RAZORPAY_KEY_ID: razorpayKeyId,
    RAZORPAY_KEY_SECRET: backendFile.DEVELOPMENT_RAZORPAY_KEY_SECRET || '',
    RAZORPAY_WEBHOOK_SECRET: backendFile.DEVELOPMENT_RAZORPAY_WEBHOOK_SECRET || '',
  })

  return {
    backendEnv,
    frontendEnv: {
      ...process.env,
      VITE_API_BASE_URL: 'http://localhost:5000',
      VITE_CLERK_PUBLISHABLE_KEY: frontendPublishableKey,
      VITE_GOOGLE_MAPS_API_KEY: frontendMapsKey,
    },
    driverEnv: {
      ...process.env,
      NODE_ENV: 'development',
      BABEL_ENV: 'development',
      EXPO_NO_DOTENV: '1',
      EXPO_PUBLIC_API_BASE_URL: 'http://localhost:5000',
      EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: driverPublishableKey,
      GOOGLE_MAPS_ANDROID_API_KEY: driverFile.GOOGLE_MAPS_ANDROID_API_KEY || '',
      EXPO_PUBLIC_GOOGLE_MAPS_MAP_ID: driverFile.EXPO_PUBLIC_GOOGLE_MAPS_MAP_ID || '',
    },
  }
}

function runNpm(args, options = {}) {
  // npm is a .cmd shim on Windows, and Node 24 rejects spawning that shim
  // directly with EINVAL. Invoke that fixed command through cmd.exe there.
  const command = isWindows ? (process.env.ComSpec || 'cmd.exe') : 'npm'
  const commandArgs = isWindows ? ['/d', '/s', '/c', `npm ${args.join(' ')}`] : args
  return spawn(command, commandArgs, {
    stdio: 'inherit',
    windowsHide: true,
    ...options,
  })
}

function runOne(env, script) {
  const child = runNpm(['run', script], { cwd: backendDir, env })
  child.on('error', error => fail(`Could not start npm: ${error.message}`))
  child.on('exit', code => process.exitCode = code ?? 1)
}

function runAndWait(env, script) {
  return new Promise((resolvePromise, reject) => {
    const child = runNpm(['run', script], { cwd: backendDir, env })
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`${script} exited with ${code ?? signal}`))
    })
  })
}

function stopTree(child, signal) {
  if (child.killed || !child.pid) return
  if (isWindows) {
    spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true })
  } else child.kill(signal)
}

function fail(message) {
  console.error(`\nDevelopment environment check failed: ${message}`)
  process.exitCode = 1
}

function startServers(specs) {
  const children = specs.map(({ args, cwd, env }) => runNpm(args, { cwd, env }))
  let stopping = false
  const stop = (signal) => {
    if (stopping) return
    stopping = true
    for (const child of children) stopTree(child, signal)
  }
  process.on('SIGINT', () => stop('SIGINT'))
  process.on('SIGTERM', () => stop('SIGTERM'))
  for (const child of children) {
    child.on('error', error => {
      fail(`Could not start npm: ${error.message}`)
      stop('SIGTERM')
    })
    child.on('exit', (code, signal) => {
      if (!stopping) {
        fail(`A development server exited unexpectedly (${code ?? signal}).`)
        stop('SIGTERM')
      }
    })
  }
}

const action = process.argv[2] ?? 'start'
let environments
try {
  environments = developmentEnvironment()
  console.log('Development configuration is structurally valid (isolated database and test-mode keys).')
} catch (error) {
  fail(error.message)
  process.exit()
}

if (action === 'check') {
  // Validation above is the check; no service is started.
} else if (action === 'db:deploy') {
  runOne(environments.backendEnv, 'db:deploy')
} else if (action === 'db:seed') {
  try {
    await runAndWait(environments.backendEnv, 'db:seed')
    await runAndWait(environments.backendEnv, 'db:seed:captain')
  } catch (error) {
    fail(`Could not seed development fixtures: ${error.message}`)
  }
} else if (action === 'db:seed:captain') {
  runOne(environments.backendEnv, 'db:seed:captain')
} else if (action === 'start') {
  startServers([
    { args: ['run', 'dev'], cwd: backendDir, env: environments.backendEnv },
    { args: ['run', 'dev'], cwd: frontendDir, env: environments.frontendEnv },
  ])
} else if (action === 'driver' || action === 'driver:web' || action === 'all') {
  if (action !== 'driver:web' && !environments.driverEnv.GOOGLE_MAPS_ANDROID_API_KEY) {
    console.warn('Note: no local Android Maps key is configured. An installed development APK must already have the production Maps key baked in through its EAS development environment; see DEVELOPMENT.md.')
  }
  const specs = [{ args: ['run', 'dev'], cwd: backendDir, env: environments.backendEnv }]
  if (action === 'all') {
    specs.push({ args: ['run', 'dev'], cwd: frontendDir, env: environments.frontendEnv })
  }
  specs.push({
    args: ['run', action === 'driver:web' ? 'web' : 'start', '--', '--port', '8082', ...(action === 'driver:web' ? [] : ['--lan'])],
    cwd: driverDir,
    env: environments.driverEnv,
  })
  startServers(specs)
} else {
  fail(`Unknown command "${action}".`)
}
