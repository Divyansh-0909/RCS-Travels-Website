import { createHash } from 'node:crypto'
import { validateSearchDataset } from './validation.js'
import { searchBenchmarkDatasetHash, SEARCH_BENCHMARK_SEED } from './dataset.js'

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export const FROZEN_SEARCH_DATASET_HASH = '2c2a0d7099c4b65be9495d08d5049e72fb44b6d49f84b82c65dbaf643ca61296'
export const FROZEN_SEARCH_SPLIT_HASH = 'aea66b52ac37ddea99d4bb1c2861d63c70c7e7a3e84f7946a9c0a1a5414ef5de'
export function freezeApprovedSearch(review, frozenAt) {
  validateSearchDataset(review.records)
  if (review.exceptions.length || !review.summary.originalDeterministicUnchanged
    || review.summary.datasetHash !== searchBenchmarkDatasetHash(review.records)) throw new Error('SEARCH_APPROVAL_INVALID')
  if (!Number.isFinite(Date.parse(frozenAt))) throw new Error('FREEZE_TIMESTAMP_INVALID')
  const records = review.records.filter(r => r.cohort === 'CORE')
  if (records.some(r => r.truth.status !== 'APPROVED' || !r.truth.disagreementResolved
    || r.truth.provenance !== 'HUMAN_REVIEWED_SYNTHETIC' || r.truth.reviewerMetadata === null)) throw new Error('SEARCH_APPROVAL_INCOMPLETE')
  const split = records.map(r => ({ caseId: r.id, templateFamily: r.templateFamily, split: r.split }))
  if (split.filter(r => r.split === 'DEVELOPMENT').length !== 222
    || split.filter(r => r.split === 'HELD_OUT').length !== 98) throw new Error('SEARCH_SPLIT_INVALID')
  return { version: 'search-benchmark-v1-frozen', schemaVersion: 'search-benchmark-record-v1',
    fixtureVersion: 'search-owner-approved-overlay-v3', ownerDecisionVersion: review.receipt.policyVersion,
    authorization: 'attachment:c52050c7-1861-4959-96e3-df23fd28feca', frozenAt,
    datasetHash: hash(records), approvedOverlayHash: review.summary.datasetHash, splitHash: hash(split),
    splitSeed: SEARCH_BENCHMARK_SEED, development: 222, heldOut: 98, templateFamilyLeakage: 0,
    exploratoryCount: 40, exploratoryStatus: 'EXPLORATORY_UNSCORED', records, split }
}

export function frozenSearchDevelopment(snapshot) {
  validateSearchDataset(snapshot.records, { full: false })
  if (snapshot.version !== 'search-benchmark-v1-frozen' || snapshot.datasetHash !== hash(snapshot.records)
    || snapshot.datasetHash !== FROZEN_SEARCH_DATASET_HASH || snapshot.splitHash !== FROZEN_SEARCH_SPLIT_HASH
    || snapshot.splitHash !== hash(snapshot.records.map(r => ({ caseId: r.id, templateFamily: r.templateFamily, split: r.split })))
    || snapshot.records.some(r => r.cohort !== 'CORE' || r.truth.status !== 'APPROVED')) throw new Error('FROZEN_SEARCH_CHANGED')
  return snapshot.records.filter(r => r.split === 'DEVELOPMENT')
}
