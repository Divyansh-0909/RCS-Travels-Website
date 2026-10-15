import { benchmarkCacheKey } from '../common/cache.js'

const fields = ['domain', 'datasetHash', 'caseId', 'inputHash', 'provider', 'model', 'configHash']
export function nextDevelopmentCacheIdentity(entries, identity) {
  const matches = entries.filter(entry => fields.every(field => entry.identity?.[field] === identity[field]))
  for (const entry of matches) if (entry.key !== benchmarkCacheKey(entry.identity)) throw new Error('DEVELOPMENT_CACHE_CORRUPT')
  const success = matches.find(entry => !entry.value.error && entry.value.normalized !== null && entry.value.normalized !== undefined)
  if (success) return { identity: success.identity, cacheHit: true }
  return { identity: { ...identity, runNumber: Math.max(0, ...matches.map(entry => entry.identity.runNumber)) + 1 }, cacheHit: false }
}

export function reusableLunaDevelopmentEntry(entries, record, configHash, allowedDatasetHashes) {
  return entries.find(entry => {
    const id = entry.identity
    if (id.domain !== 'responsibility' || id.caseId !== record.id || id.inputHash !== record.evidenceHash
      || id.configHash !== configHash || !allowedDatasetHashes.includes(id.datasetHash) || id.provider !== 'openai' || id.model !== 'gpt-6-luna') return false
    if (entry.key !== benchmarkCacheKey(id)) throw new Error('DEVELOPMENT_CACHE_CORRUPT')
    return !entry.value.error && entry.value.normalized !== null && entry.value.normalized !== undefined && entry.value.raw?.model === 'gpt-6-luna'
  })
}
