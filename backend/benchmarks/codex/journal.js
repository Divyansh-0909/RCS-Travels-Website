import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { digest } from './config.js'

export function evaluationIdentity({ domain, datasetHash, caseId, input, configHash, schemaHash, observation = 1 }) {
  if (!['responsibility-development', 'search-development', 'search-robustness'].includes(domain)) throw new Error('BENCHMARK_SPLIT_FORBIDDEN')
  if (!Number.isInteger(observation) || observation < 1 || observation > 5) throw new Error('OBSERVATION_FORBIDDEN')
  return { domain, datasetHash, caseId, inputHash: digest(input), configHash, schemaHash,
    backendId: 'luna-codex', model: 'gpt-6-luna', executionSurface: 'codex-exec-chatgpt', observation }
}
export function validateJournalEntry(entry, identity) {
  if (digest(entry.identity) !== digest(identity) || entry.key !== digest(identity)
    || entry.receiptHash !== digest(entry.result)) throw new Error('CODEX_CACHE_IDENTITY_MISMATCH')
  if (!entry.result.success || entry.result.error !== null || !entry.result.output) throw new Error('CODEX_CACHE_INVALID')
  for (const field of ['backendId', 'model', 'executionSurface', 'inputHash', 'configHash', 'schemaHash']) {
    if (entry.result[field] !== identity[field]) throw new Error('CODEX_CACHE_IDENTITY_MISMATCH')
  }
  return entry.result
}
export function createEvaluationJournal(directory, { save = writeFile } = {}) {
  return {
    async evaluateOnce(identity, infer) {
      await mkdir(directory, { recursive: true })
      const key = digest(identity), cache = join(directory, `${key}.json`), claim = join(directory, `${key}.claim`)
      try { return { result: validateJournalEntry(JSON.parse(await readFile(cache, 'utf8')), identity), cacheHit: true } }
      catch (error) { if (error.code !== 'ENOENT') throw error }
      try { await save(claim, JSON.stringify({ identity, key, at: new Date().toISOString() }), { flag: 'wx' }) }
      catch (error) {
        if (error.code === 'EEXIST') throw new Error('CODEX_CASE_ALREADY_CLAIMED_NEEDS_RECONCILIATION')
        throw error
      }
      const result = await infer()
      const entry = { identity, key, result, receiptHash: digest(result) }
      if (result.success) await save(cache, JSON.stringify(entry, null, 2) + '\n', { flag: 'wx' })
      else await save(join(directory, `${key}.failure.json`), JSON.stringify(entry, null, 2) + '\n', { flag: 'wx' })
      return { result, cacheHit: false }
    },
    async pending(order) {
      const names = await readdir(directory).catch(error => { if (error.code === 'ENOENT') return []; throw error })
      return order.filter(identity => !names.includes(`${digest(identity)}.json`))
    },
  }
}
