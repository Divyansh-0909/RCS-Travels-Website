// Test-only. Never imports db/prisma.js, dotenv, or falls back to runtime URLs.
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const backendDirectory = fileURLToPath(new URL('../../', import.meta.url))
const OWNED_DATABASE = /^rcs_verify_[a-f0-9]{32}$/
const MIGRATION_TIMEOUT_MS = 180_000

export function testDatabaseUrl(value = process.env.TEST_DATABASE_URL) {
  if (!value) throw new Error('Set TEST_DATABASE_URL explicitly to a dedicated local PostgreSQL test database')
  let url
  try { url = new URL(value) } catch { throw new Error('Invalid TEST_DATABASE_URL') }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
      !/^\/[a-z0-9_]*test[a-z0-9_]*$/i.test(url.pathname) || url.search || url.hash) {
    throw new Error('TEST_DATABASE_URL must use loopback, a database name containing test, and no query/fragment overrides')
  }
  return url
}

function migrate(url) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      'node_modules/prisma/build/index.js', 'migrate', 'deploy', '--config', 'tests/prisma.config.js',
    ], {
      cwd: backendDirectory,
      env: { ...process.env, TEST_MIGRATION_DATABASE_URL: url },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, MIGRATION_TIMEOUT_MS)
    child.stdout.on('data', chunk => { output += chunk })
    child.stderr.on('data', chunk => { output += chunk })
    child.on('error', () => reject(new Error('Could not start isolated Prisma migrations')))
    child.on('close', code => {
      clearTimeout(timer)
      if (code === 0) return resolve()
      if (timedOut) return reject(new Error('Isolated migrations timed out after 180 seconds; no runtime database was used.'))
      // CLI/provider output can include a connection URL. Only expose a Prisma code.
      const errorCode = output.match(/\bP\d{4}\b/)?.[0] ?? 'unknown'
      const migration = output.match(/Migration name:\s*([a-zA-Z0-9_]+)/)?.[1] ?? 'unknown'
      const databaseCode = output.match(/Database error code:\s*([a-zA-Z0-9]+)/)?.[1] ?? 'unknown'
      reject(new Error(`Isolated migrations failed (${errorCode}, migration ${migration}, database code ${databaseCode}). Check migration prerequisites including PostGIS; no runtime database was used.`))
    })
  })
}

/** Fresh database per harness; committed races are isolated by database, not a fake outer rollback.
 * `migrations:false` is only for harness self-tests using their own probe table.
 * Product/fixture tests must use the default migration-backed database.
 */
export async function createTestDatabase({ url = process.env.TEST_DATABASE_URL, migrations = true } = {}) {
  const adminUrl = testDatabaseUrl(url)
  const name = `rcs_verify_${randomUUID().replaceAll('-', '')}`
  const target = new URL(adminUrl)
  target.pathname = `/${name}`
  const admin = new pg.Client({ connectionString: adminUrl.toString(), connectionTimeoutMillis: 5_000 })
  const clients = new Set()
  let created = false
  let closed = false
  const close = async () => {
    if (closed) return
    closed = true
    try {
      const results = await Promise.allSettled([...clients].map(client => client.$disconnect()))
      if (created) {
        if (!OWNED_DATABASE.test(name)) throw new Error('Refusing cleanup of a non-owned database')
        await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`)
      }
      const failure = results.find(result => result.status === 'rejected')
      if (failure) throw failure.reason
    } finally { await admin.end() }
  }
  const connect = () => {
    if (closed) throw new Error('Test database is closed')
    const client = new PrismaClient({ adapter: new PrismaPg({
      connectionString: target.toString(), max: 4, connectionTimeoutMillis: 5_000,
      statement_timeout: 10_000, idle_in_transaction_session_timeout: 15_000,
    }) })
    clients.add(client)
    return client
  }
  try {
    await admin.connect()
    await admin.query(`CREATE DATABASE "${name}" TEMPLATE template0`)
    created = true
    if (migrations) await migrate(target.toString())
    return { name, client: connect(), connect, close }
  } catch (error) {
    try { await close() } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Test database setup and cleanup failed')
    }
    throw error
  }
}

/** Single-client fixture tests may roll back; multi-client races must commit. */
export async function withRollback(client, work) {
  const rollback = new Error('intentional test rollback')
  let result
  try {
    await client.$transaction(async tx => {
      result = await work(tx)
      throw rollback
    }, { timeout: 10_000, maxWait: 5_000 })
  } catch (error) { if (error !== rollback) throw error }
  return result
}

/** Workers explicitly rendezvous immediately before the operation being raced.
 * Timeouts are failure bounds, not sleeps used to order database operations.
 */
export async function raceTransactions(database, workers, { timeoutMs = 10_000, isolationLevel = 'ReadCommitted' } = {}) {
  if (workers.length < 2) throw new Error('A race requires at least two workers')
  let arrived = 0
  let release, abort
  const gate = new Promise((resolve, reject) => { release = resolve; abort = reject })
  // A failure before any worker awaits the gate must not be an unhandled rejection.
  gate.catch(() => {})
  const timer = setTimeout(() => abort(new Error('Race rendezvous timed out')), timeoutMs)
  try {
    return await Promise.allSettled(workers.map((work, index) => {
      const client = database.connect()
      let waited = false
      return client.$transaction(async tx => {
        const result = await work(tx, async () => {
        if (waited) throw new Error('Each race worker must rendezvous exactly once')
        waited = true
        if (++arrived === workers.length) release()
        await gate
        }, index)
        if (!waited) throw new Error('Each race worker must rendezvous exactly once')
        return result
      }, { isolationLevel, timeout: timeoutMs + 2_000, maxWait: timeoutMs })
        .catch(error => { abort(error); throw error })
        .finally(() => client.$disconnect())
    }))
  } finally { clearTimeout(timer) }
}

/** Inject failures at an explicit call boundary, without delays or global patches. */
export function failFirst(count, work, makeError = () => Object.assign(new Error('Injected retryable failure'), { code: 'P2034' })) {
  if (!Number.isSafeInteger(count) || count < 0) throw new TypeError('Failure count must be a nonnegative integer')
  let calls = 0
  return (...args) => {
    if (calls++ < count) throw makeError()
    return work(...args)
  }
}
