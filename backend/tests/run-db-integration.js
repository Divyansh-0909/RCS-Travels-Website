import { spawn } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { startPostgisTestEnvironment } from './helpers/postgisEnvironment.js'

const backendDirectory = fileURLToPath(new URL('../', import.meta.url))
const integrationDirectory = fileURLToPath(new URL('./integration/', import.meta.url))

async function runIntegrationTests(connectionString) {
  const files = (await readdir(integrationDirectory))
    // Phase 9 has its own sanitized child/network fence: npm run test:phase9.
    .filter(file => file.endsWith('.test.js') && !file.startsWith('phase9'))
    .sort()
    .map(file => `tests/integration/${file}`)
  if (files.length === 0) throw new Error('No DB integration tests were found')
  const requestedFile = process.argv[2]
  const selectedFiles = requestedFile ? files.filter(file => file === `tests/integration/${requestedFile}`) : files
  if (selectedFiles.length === 0) throw new Error('Requested DB integration test was not found')
  return new Promise((resolve, reject) => {
    const environment = { ...process.env, TEST_DATABASE_URL: connectionString }
    delete environment.DATABASE_URL
    delete environment.DIRECT_URL
    const child = spawn(process.execPath, [
      '--import', 'tsx', '--test', '--test-concurrency=1', ...selectedFiles,
    ], {
      cwd: backendDirectory,
      env: environment,
      stdio: 'inherit',
      windowsHide: true,
    })
    child.once('error', reject)
    child.once('close', (code, signal) => {
      if (code === 0) return resolve()
      reject(new Error(`DB integration tests failed (${signal ?? `exit ${code}`})`))
    })
  })
}

const environment = await startPostgisTestEnvironment()
try {
  console.log(`Disposable PostgreSQL ${environment.postgresVersion}; PostGIS ${environment.postgisVersion}`)
  await runIntegrationTests(environment.connectionString)
} finally {
  await environment.stop()
}
