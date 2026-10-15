import { mkdir, writeFile } from 'node:fs/promises'
import { buildFamilyOwnerReview } from '../benchmarks/search/familyOwnerReview.js'
const result = buildFamilyOwnerReview()
const root = new URL('../../docs/search/benchmark-v1/owner-approved-v3/', import.meta.url)
await mkdir(root, { recursive: true })
for (const [file, value] of Object.entries({ 'dataset.json': result, 'summary.json': result.summary,
  'change-audit.json': result.changes, 'exceptions.json': result.exceptions,
  'freeze-preparation.json': { status: result.summary.readyToFreeze ? 'READY_TO_FREEZE_NOT_FROZEN' : 'REVIEW_REQUIRED',
    datasetHash: result.summary.datasetHash, receipt: result.receipt, heldOutExecuted: false,
    labelsAreNotProviderInput: true, exploratoryStatus: 'EXPLORATORY_UNSCORED' } })) {
  await writeFile(new URL(file, root), `${JSON.stringify(value, null, 2)}\n`)
}
console.log(JSON.stringify(result.summary))
