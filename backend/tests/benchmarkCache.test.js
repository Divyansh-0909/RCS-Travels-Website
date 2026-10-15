import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import fsPromises from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import { mkdtemp, readFile, writeFile, rm, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { benchmarkCacheKey, cachedInference } from '../benchmarks/common/cache.js'
const identity = { domain: 'search', datasetHash: 'dataset', inputHash: 'input', caseId: 'case', provider: 'provider', model: 'model', configHash: 'config', runNumber: 1 }
test('cache identities distinguish domains, datasets, inputs, configs, cases, models and repetitions', () => {
  const key = benchmarkCacheKey(identity)
  for (const field of ['domain', 'datasetHash', 'inputHash', 'caseId', 'provider', 'model', 'configHash', 'runNumber']) {
    const value = field === 'runNumber' ? 2 : field === 'domain' ? 'responsibility' : 'changed'
    assert.notEqual(benchmarkCacheKey({ ...identity, [field]: value }), key)
  }
  assert.throws(() => benchmarkCacheKey({}), /IDENTITY_INCOMPLETE/)
  for (const field of Object.keys(identity)) {
    const missing = { ...identity }; delete missing[field]
    assert.throws(() => benchmarkCacheKey(missing), /IDENTITY_INCOMPLETE/)
  }
  for (const change of [{ domain: 'other' }, { runNumber: 0 }, { runNumber: 1.5 }]) assert.throws(() => benchmarkCacheKey({ ...identity, ...change }), /IDENTITY_INVALID/)
})
test('cached inference avoids duplicate spending, isolates concurrent claims, preserves errors and rejects corrupt results', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rcs-eval-cache-'))
  let calls = 0
  try {
    const infer = async () => { calls += 1; return { result: 'safe' } }
    assert.equal((await cachedInference(root, identity, infer)).cached, false)
    assert.equal((await cachedInference(root, identity, infer)).cached, true)
    assert.equal(calls, 1)
    const actualRead = fsPromises.readFile
    let missed = false
    mock.method(fsPromises, 'readFile', async (...args) => {
      if (!missed) { missed = true; throw Object.assign(new Error('simulated prior read miss'), { code: 'ENOENT' }) }
      return actualRead(...args)
    })
    syncBuiltinESMExports()
    try {
      assert.equal((await cachedInference(root, identity, infer)).cached, true)
      assert.equal(calls, 1)
    } finally { mock.restoreAll(); syncBuiltinESMExports() }
    const path = join(root, 'search', `${benchmarkCacheKey(identity)}.json`)
    const stored = JSON.parse(await readFile(path, 'utf8'))
    assert.deepEqual(stored.identity, identity)
    await writeFile(`${path}.lock`, 'abandoned post-persistence worker')
    assert.equal((await cachedInference(root, identity, infer)).cached, true)
    await unlink(`${path}.lock`)
    await writeFile(path, JSON.stringify({ key: 'wrong', value: {} }))
    await assert.rejects(cachedInference(root, identity, infer), /CACHE_CORRUPT/)
    await writeFile(path, 'invalid json')
    await assert.rejects(cachedInference(root, identity, infer), SyntaxError)
    const failed = { ...identity, caseId: 'failed' }
    await assert.rejects(cachedInference(root, failed, async () => { throw new Error('safe failure') }), /safe failure/)
    assert.equal((await cachedInference(root, failed, infer)).cached, false)
    let release
    const concurrent = { ...identity, caseId: 'concurrent' }
    const started = cachedInference(root, concurrent, () => new Promise(resolve => { release = resolve }))
    while (!release) await new Promise(resolve => setImmediate(resolve))
    await assert.rejects(cachedInference(root, concurrent, infer), error => error.code === 'EEXIST')
    release({ result: 'safe' }); await started
    const late = { ...identity, caseId: 'late-writer' }
    const latePath = join(root, 'search', `${benchmarkCacheKey(late)}.json`)
    await assert.rejects(cachedInference(root, late, async () => {
      await writeFile(latePath, JSON.stringify({ key: benchmarkCacheKey(late), value: 'prior-authoritative-result' }))
      return 'conflicting-result'
    }), error => error.code === 'EEXIST')
    assert.equal(JSON.parse(await readFile(latePath, 'utf8')).value, 'prior-authoritative-result')
  } finally { await rm(root, { recursive: true, force: true }) }
})
