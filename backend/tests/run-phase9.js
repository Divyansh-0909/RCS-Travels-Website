import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve as resolvePath } from 'node:path'
import { startPostgisTestEnvironment } from './helpers/postgisEnvironment.js'
import { PHASE9_FORBIDDEN_DATABASE } from './helpers/phase9Isolation.js'

const backend = fileURLToPath(new URL('../', import.meta.url))
const replayOnly = process.argv.includes('--replay')
const caseFilter = process.argv.find(value => value.startsWith('--case='))?.slice(7)
const receipts = process.argv.find(value => value.startsWith('--receipts='))?.slice(11)
const files = receipts ? ['tests/integration/phase9SavedReplay.test.js'] : replayOnly ? ['tests/integration/phase9Replay.test.js'] : ['tests/integration/phase9Lifecycle.test.js',
  'tests/integration/phase9FinancialLifecycle.test.js', 'tests/integration/phase9ObservedLifecycle.test.js']
const environment = await startPostgisTestEnvironment()
try {
  const inherited = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'USERPROFILE', 'TEMP', 'TMP',
    'LOCALAPPDATA', 'APPDATA', 'ComSpec', 'NODE_V8_COVERAGE'].filter(key => process.env[key]).map(key => [key, process.env[key]]))
  console.log(`Phase 9 isolated PostgreSQL ${environment.postgresVersion}; PostGIS ${environment.postgisVersion}; pgvector ${environment.vectorVersion}; image recipe ${environment.imageRecipeHash}`)
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', './tests/helpers/phase9Isolation.js', '--import', 'tsx',
      '--test', '--test-reporter=tap', '--test-concurrency=1',
      ...(caseFilter ? [`--test-name-pattern=${caseFilter}`] : []), ...files], {
      cwd: backend, windowsHide: true, stdio: 'inherit', env: {
        ...inherited, NODE_ENV: 'test', PHASE9_ISOLATED: '1',
        TEST_DATABASE_URL: environment.connectionString,
        DATABASE_URL: PHASE9_FORBIDDEN_DATABASE, DIRECT_URL: PHASE9_FORBIDDEN_DATABASE,
        DOTENV_CONFIG_PATH: fileURLToPath(new URL('./helpers/phase9-empty.env', import.meta.url)),
        ...(receipts ? { PHASE9_REPLAY_RECEIPTS: resolvePath(receipts) } : {}),
      },
    })
    child.once('error', reject)
    child.once('close', code => code === 0 ? resolve() : reject(new Error(`Phase 9 tests failed (exit ${code})`)))
  })
} finally { await environment.stop() }
