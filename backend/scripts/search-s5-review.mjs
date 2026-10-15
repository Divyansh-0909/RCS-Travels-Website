import { mkdir, writeFile } from 'node:fs/promises'
import { searchReviewArtifacts } from '../benchmarks/search/review.js'

const root = new URL('../../docs/search/benchmark-v1/', import.meta.url)
const artifacts = searchReviewArtifacts()
await mkdir(root, { recursive: true })
for (const [file, contents] of [
  ['proposed.json', JSON.stringify(artifacts.proposal, null, 2)],
  ['REVIEW_REQUIRED.json', JSON.stringify(artifacts.reviewRequired, null, 2)],
  ['review.md', artifacts.reviewMarkdown], ['REVIEW_REQUIRED.md', artifacts.requiredMarkdown],
  ['manifest.json', JSON.stringify({ ...artifacts.proposal.index, version: artifacts.proposal.version,
    status: 'PROPOSED', frozen: false, humanReviewer: 'PRODUCT_OWNER_PENDING_REVIEW',
    templateFamilyLeakage: 0, finalHeldOutInferenceExecuted: false }, null, 2)],
]) await writeFile(new URL(file, root), `${contents.trimEnd()}\n`)
console.log(JSON.stringify({ output: root.pathname, ...artifacts.proposal.index }))
