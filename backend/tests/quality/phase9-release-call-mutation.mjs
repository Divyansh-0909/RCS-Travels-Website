import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, unlink, rmdir } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Default Stryker does not generate omission of this bare awaited function call.
// Seed that specific fault in a disposable copy; never modify the workspace service.
const serviceURL = new URL('../../services/rideSettlement.js', import.meta.url)
const testURL = new URL('../criticalRideTransactions.test.js', import.meta.url)
const outputURL = new URL('../../../output/phase9-financial-lifecycle-2026-10-09/', import.meta.url)
const original = await readFile(serviceURL, 'utf8')
const omitted = original.replace('await releaseScheduledDeposits(tx, booking.id)', '/* seeded missing deposit release */')
assert.notEqual(original, omitted)
const sandbox = await mkdtemp(path.join(tmpdir(), 'rcs-phase9-release-'))
const serviceCopy = path.join(sandbox, 'settlement.mjs')
const testCopy = path.join(sandbox, 'critical.mjs')
const imports = (source, base, substitute = null) => source.replace(/from (['"])(\.\.?\/[^'"]+)\1/g,
  (_, _quote, relative) => `from ${JSON.stringify(substitute && relative === '../services/rideSettlement.js'
    ? pathToFileURL(substitute).href : new URL(relative, base).href)}`)
try {
  await writeFile(serviceCopy, imports(omitted, serviceURL))
  const tests = await readFile(testURL, 'utf8')
  assert.equal(tests.includes('import.meta'), false, 'copied tests must have no unresolved relative URL evaluation')
  await writeFile(testCopy, imports(tests, testURL, serviceCopy))
  let log = ''
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', '--test', '--test-reporter=tap', testCopy], {
      cwd: fileURLToPath(new URL('../../', import.meta.url)), windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout.on('data', chunk => { log += chunk })
    child.stderr.on('data', chunk => { log += chunk })
    child.once('error', reject); child.once('close', resolve)
  })
  await writeFile(new URL('seeded-release-mutation.log', outputURL), log)
  assert.notEqual(exitCode, 0)
  assert.equal(/ERR_MODULE_NOT_FOUND|SyntaxError/.test(log), false)
  const failures = [...log.matchAll(/^not ok \d+ - (.+)$/gm)].map(match => match[1])
  assert.ok(failures.some(name => name.includes('scheduled completion')))
  const sha = source => createHash('sha256').update(source).digest('hex')
  await writeFile(new URL('seeded-release-mutation.json', outputURL), JSON.stringify({
    file: 'services/rideSettlement.js', originalSourceHash: sha(original), variantSourceHash: sha(omitted),
    mutation: 'omit awaited releaseScheduledDeposits at terminal completion', status: 'Killed', exitCode,
    failures, ignored: 0, timeout: false, workspaceSourceModified: false,
  }, null, 2))
  console.log('Seeded terminal release omission: KILLED by existing scheduled completion regressions')
} finally {
  assert.equal(path.dirname(sandbox), tmpdir())
  assert.ok(path.basename(sandbox).startsWith('rcs-phase9-release-'))
  await unlink(testCopy).catch(error => { if (error.code !== 'ENOENT') throw error })
  await unlink(serviceCopy).catch(error => { if (error.code !== 'ENOENT') throw error })
  await rmdir(sandbox)
}
