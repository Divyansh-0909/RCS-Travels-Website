import assert from 'node:assert/strict'
import { mock } from 'node:test'
const url = new URL('../../benchmarks/responsibility/datasetV2.js', import.meta.url)
const original = await import(url.href)
const mode = process.argv[2]
const replacement = mode === 'hash'
  ? { buildFrozenResponsibilityBenchmarkDatasetV2: () => [] }
  : { splitResponsibilityBenchmarkV2: () => ({ adequate: false, development: [], heldOut: [] }) }
mock.module(url, { namedExports: { ...original, ...replacement } })
const { phase81Dataset } = await import('../../benchmarks/responsibility/phase81.js')
assert.throws(() => phase81Dataset('development'), mode === 'hash' ? /V2_FROZEN_HASH_MISMATCH/ : /V2_HELD_OUT_INADEQUATE/)
console.log('IDENTITY_GUARD_VERIFIED')
