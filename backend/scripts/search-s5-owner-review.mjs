import { mkdir, writeFile } from 'node:fs/promises'
import { buildSearchBenchmarkDataset } from '../benchmarks/search/dataset.js'
import { buildClassReviewPack } from '../benchmarks/search/classReview.js'
import { buildOwnerPolicyReview } from '../benchmarks/search/ownerPolicyReview.js'

const baseline = buildSearchBenchmarkDataset()
const result = buildOwnerPolicyReview(baseline)
const originalPack = buildClassReviewPack(baseline)
const root = new URL('../../docs/search/benchmark-v1/owner-policy-v2/', import.meta.url)
await mkdir(root, { recursive: true })
const write = (name, value) => writeFile(new URL(name, root), `${JSON.stringify(value, null, 2)}\n`)
await write('dataset.json', { status: result.status, receipt: result.receipt, summary: result.summary, records: result.records })
await write('approval-ledger.json', { receipt: result.receipt, approval: result.approval })
await write('policy-change-audit.json', { receipt: result.receipt, changes: result.changes })
await write('REVIEW_REQUIRED.json', { status: 'PROPOSED_REQUIRES_FAMILY_REVIEW', records: result.review })
await write('summary.json', result.summary)
const contextual = result.review.filter(row => row.familyId === 'vehicle-self-conflict').map(row => ({ caseId: row.id,
  policy: 'P5', excludedByNegativeClause: ['suv', 'suv_premium'], requiredByPositiveClause: 'suv',
  currentVehicleLabel: row.truth.expected.vehicle, status: 'STILL_AMBIGUOUS_REVIEW_REQUIRED',
  reason: 'Owner clarified the exclusion family; the required/excluded contradiction remains. No silent winning clause or new AMBIGUOUS contract field.' }))
await write('policy-context-still-review.json', contextual)
const lines = ['# Search V1 remaining family review', '',
  `The owner approved the original **178 / 178** certified cases. Their labels are unchanged. P2–P5 are frozen.`, '',
  `Of the former 142 review cases, **${result.summary.policyResolved}** now follow the explicit owner policies. **${result.summary.coreReviewRemaining} cases in ${result.summary.familyReviewsRemaining} families** still need judgment.`, '',
  'The proposal is not frozen. No held-out inference has run. The 40 exploratory inputs remain unscored.', '',
  'Reply `APPROVE FAMILY <family-id>` or `APPROVE EXCEPT <case-ids>`; corrections may identify a field. Each family has the same judgment rule. Different locations, cars and exact times are deterministic substitutions, not additional decisions.', '',
  'The weekday qualifier policy is approved. Five next-Friday records retain an unscored resolved date because the existing application has no calendar-week start convention. This is a separately recorded implementation detail; no Monday/Sunday default was inserted into labels.', '']
const clean = value => String(value).replace(/\|/g, '\\|').replace(/\n/g, ' ')
const compact = expected => Object.fromEntries(Object.entries(expected).filter(([key]) => !['flags', 'resolvedDate', 'resolvedTime', 'placeSelectionRequired', 'groundingTarget', 'stopSpans', 'locationSearchSpans'].includes(key)))
for (const familyId of new Set(result.review.map(row => row.familyId))) {
  const records = result.review.filter(row => row.familyId === familyId)
  const decisions = originalPack.coreReview.find(row => row.templateFamily === familyId).decisions
  const fields = [...new Set(decisions.flatMap(decision => decision.fields))]
  lines.push(`## ${familyId} — ${records.length} cases`, '', `**IDs:** ${records.map(row => row.id).join(', ')}`, '',
    `**Judgment fields:** ${fields.join(', ')}. All unrelated supported literal fields retain their prior labels.`, '')
  if (familyId === 'vehicle-self-conflict') lines.push('**Frozen P5 context:** the negative clause excludes both suv and suv_premium. The positive clause requires suv. This remains a contradiction, not a new policy question; the existing AMBIGUOUS vehicle schema has no exclusion-list member. Both clauses remain in the source query and the separate policy context audit.', '')
  for (const decision of decisions) lines.push(`**Review:** ${decision.decision}`, '', `**Recommended:** ${decision.recommendation}`, '', `**Alternative:** ${decision.alternative}`, '')
  lines.push('| Representative query | Proposed route | Pickup → drop | Vehicle / timing | Missing / ambiguity / unsupported |', '|---|---|---|---|---|')
  for (const row of [records[0], ...(records.length > 1 ? [records.at(-1)] : [])]) {
    const labels = row.truth.expected
    const label = key => labels[key].status === 'LABELLED' ? labels[key].value : `UNSCORED: ${labels[key].reason}`
    const spans = key => label(key).map(span => `${span.exactText} [${span.start},${span.end})`).join('; ') || 'unspecified'
    lines.push(`| ${clean(row.modelInput.query)} | ${label('queryType')} / ${label('complexity')} / fallback ${label('fallbackExpected')} | ${clean(spans('pickupSpans'))} → ${clean(spans('dropSpans'))} | ${clean(JSON.stringify({ vehicle: label('vehicle'), timing: label('timingMode'), date: label('date'), time: label('time') }))} | ${clean(JSON.stringify({ missing: label('missingFields'), ambiguity: label('ambiguities'), unsupported: label('unsupportedRequests') }))} |`)
  }
  lines.push('', `**Variant exceptions:** none approved. Full labels for every ID are in [REVIEW_REQUIRED.json](REVIEW_REQUIRED.json).`, '')
}
await write('family-review.json', { families: [...new Set(result.review.map(row => row.familyId))].map(familyId => ({ familyId,
  cases: result.review.filter(row => row.familyId === familyId).map(row => ({ id: row.id, query: row.modelInput.query, labels: compact(row.truth.expected) })) })) })
await writeFile(new URL('FAMILY_REVIEW.md', root), `${lines.join('\n')}\n`)
console.log(JSON.stringify(result.summary))
