import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// Turn a traversal deadlock into a failed permanent-test run before the mutation framework's deadline.
const child = spawnSync(process.execPath, ['--import', './tests/helpers/phase9UnitIsolation.js', '--import', 'tsx',
  fileURLToPath(new URL('../phase9ReplaySafety.test.js', import.meta.url))], {
  cwd: fileURLToPath(new URL('../../', import.meta.url)), env: process.env,
  windowsHide: true, timeout: 30_000, encoding: 'utf8',
})
process.stdout.write(child.stdout ?? '')
assert.equal(child.status, 0, `bounded replay integrity suite: ${child.error?.code ?? child.stderr}`)
