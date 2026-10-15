import assert from 'node:assert/strict'
import test from 'node:test'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
const execute = promisify(execFile)
test('Phase 8.1 rejects an actual changed dataset or inadequate split before exposing records for inference', async () => {
  for (const mode of ['hash', 'adequacy']) {
    const result = await execute(process.execPath, ['--experimental-test-module-mocks',
      fileURLToPath(new URL('./helpers/phase81IdentityProbe.mjs', import.meta.url)), mode],
    { windowsHide: true })
    assert.equal(result.stdout.trim(), 'IDENTITY_GUARD_VERIFIED')
  }
})
