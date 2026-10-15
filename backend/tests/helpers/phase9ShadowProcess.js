import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { assertPhase9Environment } from './phase9Isolation.js'

/** Dedicated child processes use only a harness-owned database and an offline V5 transport. */
export async function runPhase9ShadowProcess(database, clock, mode) {
  assertPhase9Environment(process.env)
  assert.match(database.name, /^rcs_verify_[a-f0-9]{32}$/)
  assert.ok(['claim_then_crash', 'resume'].includes(mode))
  const allowed = ['PATH', 'SystemRoot', 'WINDIR', 'USERPROFILE', 'TEMP', 'TMP', 'LOCALAPPDATA', 'APPDATA',
    'ComSpec', 'TEST_DATABASE_URL', 'DATABASE_URL', 'DIRECT_URL', 'PHASE9_ISOLATED', 'DOTENV_CONFIG_PATH']
  const env = Object.fromEntries(allowed.filter(key => process.env[key]).map(key => [key, process.env[key]]))
  const child = spawn(process.execPath, ['--import', './tests/helpers/phase9Isolation.js', '--import', 'tsx',
    fileURLToPath(new URL('./phase9ShadowProcessProbe.mjs', import.meta.url))], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)), windowsHide: true,
    stdio: ['ignore', 'pipe', 'ignore'], env: { ...env, PHASE9_WORKER_DB_NAME: database.name,
      PHASE9_WORKER_TIME: clock.now().toISOString(), PHASE9_WORKER_MODE: mode },
  })
  return new Promise((resolve, reject) => {
    let output = '', crashed = false
    const timer = setTimeout(() => { child.kill(); reject(new Error('Isolated shadow child exceeded its 30-second deadline')) }, 30_000)
    child.stdout.on('data', bytes => {
      output += bytes.toString()
      if (mode === 'claim_then_crash' && !crashed && output.includes('PHASE9_LEASE_COMMITTED')) {
        crashed = true
        child.kill()
      }
    })
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('close', code => {
      clearTimeout(timer)
      if (crashed) return resolve({ crashed: true, exitCode: code })
      const payload = output.match(/PHASE9_WORKER_RESULT (.+)/)?.[1]
      if (code !== 0 || !payload) return reject(new Error(`Isolated shadow child failed (exit ${code})`))
      resolve(JSON.parse(payload))
    })
  })
}
