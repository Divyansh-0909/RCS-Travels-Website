import { isDeepStrictEqual } from 'node:util'
import { responsibilityEvidenceHash } from '../../services/responsibilityAnalyst.js'
import { benchmarkCacheKey } from '../common/cache.js'
import { PHASE81_CONFIGURATION } from './phase81.js'
import { RESPONSIBILITY_BENCHMARK_DATASET_V2_FROZEN_HASH } from './datasetV2.js'

export function verifiedDevelopmentReplays(receipt, entries, development) {
  if (receipt.split !== 'development' || !isDeepStrictEqual(receipt.configuration.jev, PHASE81_CONFIGURATION.jev)
    || !isDeepStrictEqual(receipt.configuration.luna, PHASE81_CONFIGURATION.luna)) return []
  const inputs = new Map(development.map(record => [record.id, record.evidenceHash]))
  return entries.filter(entry => entry.key === benchmarkCacheKey(entry.identity) && entry.identity.domain === 'responsibility'
    && entry.identity.datasetHash === RESPONSIBILITY_BENCHMARK_DATASET_V2_FROZEN_HASH && entry.identity.configHash === receipt.configHash
    && entry.identity.runNumber === 1 && inputs.get(entry.identity.caseId) === entry.identity.inputHash
    && !entry.value.error && entry.value.raw && entry.value.normalized)
}
export function replayDevelopmentAdapter(adapter, entries) {
  const inputs = new Map(entries.filter(entry => entry.identity.provider === adapter.provider && entry.identity.model === adapter.model)
    .map(entry => [entry.identity.inputHash, entry]))
  return { ...adapter, async analyzeResponsibilityCase(evidence) {
    const prior = inputs.get(responsibilityEvidenceHash(evidence))
    if (!prior) return adapter.analyzeResponsibilityCase(evidence)
    return { raw: { ...structuredClone(prior.value.raw), replay: { key: prior.key, originalLatencyMs: prior.value.latencyMs,
      originalConfigHash: prior.identity.configHash, liveRequests: 0 } }, normalized: structuredClone(prior.value.normalized) }
  } }
}
