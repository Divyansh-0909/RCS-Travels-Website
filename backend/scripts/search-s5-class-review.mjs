import { readFile, writeFile } from 'node:fs/promises'
import { buildClassReviewPack, renderCoreClassReview } from '../benchmarks/search/classReview.js'
const root = new URL('../../docs/search/benchmark-v1/', import.meta.url)
const records = JSON.parse(await readFile(new URL('proposed.json', root), 'utf8')).records
const pack = buildClassReviewPack(records)
for (const [file, value] of [['class-approval.json', pack.certificate], ['CORE_REVIEW_REQUIRED.json', pack.coreReview],
  ['product-policy-decisions.json', pack.policyCases], ['exploratory-unscored.json', pack.exploratory]]) {
  await writeFile(new URL(file, root), `${JSON.stringify(value, null, 2)}\n`)
}
await writeFile(new URL('CORE_REVIEW_REQUIRED.md', root), renderCoreClassReview(pack))
await writeFile(new URL('class-review-summary.json', root), `${JSON.stringify({ status: pack.status, datasetHash: pack.certificate.datasetHash,
  originalDeterministic: pack.certificate.originalDeterministic, stillDeterministic: pack.certificate.stillDeterministic,
  movedToReview: pack.certificate.movedToReview, coreReview: pack.coreReview.length, exploratoryUnscored: pack.exploratory.length,
  policyCases: pack.policyCases.length, proposedDev: pack.index.development, proposedHeldOut: pack.index.heldOut,
  templateFamilyLeakage: 0, humanReviewComplete: false, frozen: false, finalHeldOutRun: false }, null, 2)}\n`)
console.log(JSON.stringify({ eligible: pack.certificate.stillDeterministic, movedToReview: pack.certificate.movedToReview,
  coreReview: pack.coreReview.length, exploratoryUnscored: pack.exploratory.length, policyCases: pack.policyCases.length }))
