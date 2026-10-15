import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const execFileAsync = promisify(execFile)

test('payout webhook keeps its injected transaction database through provider-state handling', async () => {
  const probe = fileURLToPath(new URL('./helpers/payoutWebhookDbProbe.mjs', import.meta.url))
  const { stdout } = await execFileAsync(process.execPath, [
    '--experimental-test-module-mocks', probe,
  ])
  assert.deepEqual(JSON.parse(stdout), {
    result: { processed: true, payoutId: 'local-payout', status: 'processing' },
    eventResult: 'terminal_or_duplicate_state',
  })
})
