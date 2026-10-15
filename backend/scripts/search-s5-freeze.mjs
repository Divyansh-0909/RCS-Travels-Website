import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { buildFamilyOwnerReview } from '../benchmarks/search/familyOwnerReview.js'
import { freezeApprovedSearch } from '../benchmarks/search/freeze.js'
if (process.argv.length > 2) throw new Error('FREEZE_NO_ARGUMENTS')
const root = new URL('../../docs/search/benchmark-v1/frozen-v1/', import.meta.url)
await mkdir(root, { recursive: true })
const file = new URL('dataset.json', root)
let prior
try { prior = JSON.parse(await readFile(file, 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
const snapshot = freezeApprovedSearch(buildFamilyOwnerReview(), prior?.frozenAt ?? new Date().toISOString())
const serialized = `${JSON.stringify(snapshot, null, 2)}\n`
if (prior && JSON.stringify(prior) !== JSON.stringify(snapshot)) throw new Error('FROZEN_DATASET_IMMUTABLE')
if (!prior) await writeFile(file, serialized, { flag: 'wx' })
console.log(JSON.stringify({ version: snapshot.version, datasetHash: snapshot.datasetHash, splitHash: snapshot.splitHash,
  development: snapshot.development, heldOut: snapshot.heldOut, frozenAt: snapshot.frozenAt, heldOutExecuted: false }))
