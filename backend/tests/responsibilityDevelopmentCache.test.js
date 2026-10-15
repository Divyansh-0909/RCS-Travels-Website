import test from 'node:test'
import assert from 'node:assert/strict'
import { benchmarkCacheKey } from '../benchmarks/common/cache.js'
import { nextDevelopmentCacheIdentity, reusableLunaDevelopmentEntry } from '../benchmarks/responsibility/developmentCache.js'
const identity = { domain: 'responsibility', datasetHash: 'dev-only', caseId: 'case1', inputHash: 'evidence1', provider: 'openai', model: 'gpt-6-luna', configHash: 'config1' }
const entry = (extra = {}, value = { error: null, normalized: {}, raw: { model: 'gpt-6-luna' } }) => {
  const id = { ...identity, runNumber: 1, ...extra }; return { identity: id, key: benchmarkCacheKey(id), value }
}
test('failed attempts remain audited and receive a new attempt key; successful inference reuses its exact identity', () => {
  assert.equal(nextDevelopmentCacheIdentity([], identity).identity.runNumber, 1)
  const failed = entry({}, { error: 'TIMEOUT', normalized: null })
  assert.equal(nextDevelopmentCacheIdentity([failed], identity).identity.runNumber, 2)
  assert.equal(failed.identity.runNumber, 1)
  const success = entry({ runNumber: 3 })
  assert.deepEqual(nextDevelopmentCacheIdentity([failed, success], identity), { identity: success.identity, cacheHit: true })
  for (const field of ['datasetHash', 'caseId', 'inputHash', 'provider', 'model', 'configHash']) {
    const changed = { ...identity, [field]: 'different' }
    assert.equal(nextDevelopmentCacheIdentity([success], changed).cacheHit, false)
  }
  assert.throws(() => nextDevelopmentCacheIdentity([{ ...success, key: 'forged' }], identity), /CORRUPT/)
})
test('Luna reuse excludes held-out/foreign/stale/error entries and validates the cache key', () => {
  const record = { id: 'case1', evidenceHash: 'evidence1' }
  const reusable = entry()
  assert.equal(reusableLunaDevelopmentEntry([reusable], record, 'config1', ['dev-only']), reusable)
  for (const extra of [{ domain: 'search' }, { datasetHash: 'held-out' }, { caseId: 'different' }, { inputHash: 'different' },
    { provider: 'typesafe-ai' }, { model: 'different' }, { configHash: 'different' }]) {
    assert.equal(reusableLunaDevelopmentEntry([entry(extra)], record, 'config1', ['dev-only']), undefined)
  }
  for (const value of [{ error: 'TIMEOUT', normalized: {} }, { error: null, normalized: null },
    { error: null }, { error: null, normalized: {}, raw: { model: 'different' } }, { error: null, normalized: {} }]) {
    assert.equal(reusableLunaDevelopmentEntry([entry({}, value)], record, 'config1', ['dev-only']), undefined)
    assert.equal(nextDevelopmentCacheIdentity([entry({}, value)], identity).cacheHit, value.error === null && value.normalized !== undefined && value.normalized !== null)
  }
  assert.throws(() => reusableLunaDevelopmentEntry([{ ...reusable, key: 'forged' }], record, 'config1', ['dev-only']), /CORRUPT/)
})
