import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, open, unlink } from 'node:fs/promises'
import { join } from 'node:path'

const required = ['domain', 'datasetHash', 'caseId', 'inputHash', 'provider', 'model', 'configHash', 'runNumber']
export function benchmarkCacheKey(identity) {
  if (required.some(key => !Object.hasOwn(identity, key))) throw new Error('BENCHMARK_CACHE_IDENTITY_INCOMPLETE')
  if (!['search', 'responsibility'].includes(identity.domain) || !Number.isInteger(identity.runNumber) || identity.runNumber < 1) {
    throw new Error('BENCHMARK_CACHE_IDENTITY_INVALID')
  }
  return createHash('sha256').update(JSON.stringify(required.map(key => [key, identity[key]]))).digest('hex')
}

async function readCached(file, key) {
  try {
    const stored = JSON.parse(await readFile(file, 'utf8'))
    if (stored.key !== key) throw new Error('BENCHMARK_CACHE_CORRUPT')
    return stored
  } catch (error) { if (error.code !== 'ENOENT') throw error; return null }
}

export async function cachedInference(root, identity, infer) {
  const key = benchmarkCacheKey(identity)
  const folder = join(root, identity.domain)
  await mkdir(folder, { recursive: true })
  const file = join(folder, `${key}.json`)
  const prior = await readCached(file, key)
  if (prior) return { cached: true, value: prior.value }
  const lock = await open(`${file}.lock`, 'wx')
  try {
    // Check again after acquiring the lock: a prior process might have completed between read and claim.
    const completed = await readCached(file, key)
    if (completed) return { cached: true, value: completed.value }
    const value = await infer()
    await writeFile(file, JSON.stringify({ key, identity, value }), { flag: 'wx' })
    return { cached: false, value }
  } finally { await lock.close(); await unlink(`${file}.lock`) }
}
