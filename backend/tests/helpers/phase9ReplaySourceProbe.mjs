import assert from 'node:assert/strict'
import { mock } from 'node:test'
import * as native from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const manifestPath = 'output/responsibility-v5-freeze-2026-10-08/freeze-manifest.json'
const defaultRoot = fileURLToPath(new URL('../../../', import.meta.url))
const actualRoot = process.env.RCS_PHASE9_REPOSITORY_ROOT ?? defaultRoot
let expectedRoot = actualRoot, corruption = null
mock.module('node:fs/promises', { namedExports: { ...native, readFile: async (path, ...args) => {
  const name = resolve(path instanceof URL ? fileURLToPath(path) : path)
  if (name.endsWith('freeze-manifest.json')) {
    assert.equal(name, resolve(expectedRoot, manifestPath), 'default replay root follows the repository layout')
    const original = await native.readFile(resolve(actualRoot, manifestPath), ...args)
    if (corruption !== 'manifest') return original
    const changed = JSON.parse(original); changed.status = 'CHANGED'
    return JSON.stringify(changed)
  }
  const bytes = await native.readFile(path, ...args)
  return corruption === 'source' && name.endsWith('responsibilityJevV5.js')
    ? Buffer.concat([Buffer.from(bytes), Buffer.from('\n// virtual integrity failure')]) : bytes
} } })
const { replaySourceHashes, sealPhase9Scenario } = await import('./phase9ReplayContract.js')
await sealPhase9Scenario({ id: 'source-probe', initial: { at: '2026-10-09T06:00:00Z', fare: 1000 },
  events: [{ sequence: 1, type: 'capture', at: '2026-10-09T06:00:00Z' }] })
delete process.env.RCS_PHASE9_REPOSITORY_ROOT
expectedRoot = defaultRoot
assert.ok(Object.keys(await replaySourceHashes()).length > 22)
corruption = 'manifest'
await assert.rejects(replaySourceHashes(), /FROZEN_V5_CONFIG_MISMATCH/)
corruption = 'source'
await assert.rejects(replaySourceHashes(), /FROZEN_V5_SOURCE_MISMATCH/)
// Only virtual reads changed; no source or frozen artifact was written.
