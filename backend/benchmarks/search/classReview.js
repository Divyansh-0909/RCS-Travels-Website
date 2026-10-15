import { validateDeterministicApproval } from './approval.js'
import { searchBenchmarkIndex } from './dataset.js'

const policyDefinitions = {
  OMITTED_YEAR_SEMANTICS: { fields: ['resolvedDate'], decision: 'Choose an omitted-year rule; the extracted month/day remains unchanged.',
    options: ['Always clarify the year', 'Current year if valid, otherwise next year', 'Next future occurrence'],
    effect: 'Changes timestamp resolution and scheduling eligibility; do not score resolvedDate until frozen.' },
  WEEKDAY_SEMANTICS: { fields: ['resolvedDate'], decision: 'Define BARE/THIS/NEXT weekdays, including same-day handling.',
    options: ['Clarify each qualifier', 'Specify occurrence rules separately for BARE/THIS/NEXT'],
    effect: 'Changes selected calendar date and scheduling bounds; extracted weekday/qualifier is still independently scoreable.' },
  NON_IST_TIMEZONE: { fields: ['resolvedDate', 'resolvedTime'], decision: 'Define how an explicit non-IST local time is accepted.',
    options: ['Clarify and convert explicitly to IST', 'Support explicit IANA zone with date/clock confirmation', 'Do not support non-IST booking interpretation'],
    effect: 'Changes UTC scheduledAt and daylight-saving ambiguity handling; no resolved timestamp metric yet.' },
  SUV_FAMILY_EXCLUSION_SCOPE: { fields: ['vehicle'], decision: 'Define whether generic SUV exclusion also excludes suv_premium.',
    options: ['Exclude only suv', 'Exclude suv and suv_premium', 'Clarify the family scope with the user'],
    effect: 'Changes allowed vehicle classes; retain literal suv exclusion and keep family-scope metric unlabelled.' },
}
const reviewDefinitions = {
  UNSUPPORTED_PASSENGER_ENFORCEMENT: { fields: ['unsupportedRequests', 'fallbackExpected'], decision: 'Confirm advisory passenger count is retained, with unsupported enforcement disclosed; missing fields alone do not trigger Luna.', recommendation: 'Preserve PASSENGER_COUNT; no fallback solely for passengers.', alternative: 'Request explicit clarification about enforceable capacity; do not invent enforcement.' },
  DAYPART_CLARIFICATION: { fields: ['ambiguities', 'fallbackExpected'], decision: 'Confirm a daypart requires a time follow-up rather than an invented exact time.', recommendation: 'Keep DAYPART and clarify exact time.', alternative: 'No exact-time interpretation is frozen.' },
  AM_PM_CLARIFICATION: { fields: ['ambiguities', 'fallbackExpected'], decision: 'Confirm approximate H12 clock without period requires AM/PM clarification.', recommendation: 'Keep approximate hour; clarify period.', alternative: 'No default AM/PM.' },
  PRODUCT_POLICY_UNRESOLVED: { fields: [], decision: 'Decide only the policy-specific fields listed below; other direct labels remain proposed.', recommendation: 'Keep affected semantic resolution NOT_LABELLED.', alternative: 'Choose one of the explicit policy options.' },
  NONTRIVIAL_DIRECTION: { fields: ['pickupSpans', 'dropSpans', 'complexity', 'fallbackExpected'], decision: 'Confirm the proposed pickup/drop direction and whether the simple route is faithful.', recommendation: 'Use the explicit origin/destination markers; never reverse endpoints.', alternative: 'Require clarification if either directional span is not trustworthy.' },
  DETERMINISTIC_MARKER_ONLY: { fields: ['pickupSpans', 'dropSpans', 'fallbackExpected'], decision: 'Confirm raw se/jaana hai markers express direction without translation.', recommendation: 'Preserve source spans; evaluate this marker-specific case separately.', alternative: 'Clarify direction if raw wording is ambiguous.' },
  REPEATED_PLACE: { fields: ['pickupSpans', 'dropSpans', 'ambiguities'], decision: 'Confirm equivalent repeated source occurrences and distinct endpoint roles.', recommendation: 'Allow labelled equivalent pickup occurrences; preserve actual destination.', alternative: 'Require role clarification when occurrences disagree.' },
  UNSUPPORTED_STOP: { fields: ['stopSpans', 'unsupportedRequests', 'complexity', 'fallbackExpected'], decision: 'Confirm stops are retained and not flattened into a one-way supported booking.', recommendation: 'Preserve STOP and complex fallback where proposed.', alternative: 'Keep unsupported follow-up if meaning is simple; never discard the stop.' },
  UNSUPPORTED_RETURN: { fields: ['unsupportedRequests', 'complexity', 'fallbackExpected'], decision: 'Confirm return intent is preserved without inventing a supported return booking mode.', recommendation: 'Preserve RETURN_JOURNEY and proposed fallback.', alternative: 'Clarify the return requirement, retaining unsupported intent.' },
  UNSUPPORTED_RENTAL: { fields: ['unsupportedRequests', 'complexity', 'fallbackExpected'], decision: 'Confirm rental duration is unsupported and cannot become an ordinary one-way ride silently.', recommendation: 'Preserve RENTAL; follow proposed unsupported route.', alternative: 'Ask about supported service; do not invent a rental mode.' },
  CONDITIONAL_DESTINATION: { fields: ['dropSpans', 'complexity', 'fallbackExpected', 'unsupportedRequests'], decision: 'Confirm conditional destinations require interpretation and cannot be resolved by choosing one branch.', recommendation: 'COMPLEX; preserve conditional alternatives.', alternative: 'Clarify which branch applies before producing an effective destination.' },
  UNSUPPORTED_CONDITIONAL_AC: { fields: ['unsupportedRequests', 'complexity', 'fallbackExpected'], decision: 'Confirm AC/availability conditions are unsupported and preserved.', recommendation: 'Retain AC_PREFERENCE and CONDITIONAL_PREFERENCE.', alternative: 'Clarify availability preference without promising enforcement.' },
  TEMPORAL_AMBIGUITY: { fields: ['time', 'ambiguities', 'complexity', 'fallbackExpected'], decision: 'Confirm conflicting stated times remain ambiguous, with no arbitrary last-clause winner.', recommendation: 'Preserve alternatives and clarify.', alternative: 'Treat as a correction only after explicit owner-approved interpretation.' },
  CONFLICTING_PREFERENCE: { fields: ['vehicle', 'ambiguities', 'fallbackExpected'], decision: 'Confirm required and excluded SUV conflict remains ambiguous.', recommendation: 'AMBIGUOUS; retain both contradictory clauses.', alternative: 'Ask which clause the user intended; do not silently choose.' },
  CANDIDATE_GENERATION_DIFFICULT: { fields: ['pickupSpans', 'dropSpans', 'fallbackExpected'], decision: 'Confirm intended phrases despite noisy directional spelling and expected candidate-failure fallback.', recommendation: 'Retain proposed spans if human-confirmed; fallback on actual candidate miss.', alternative: 'Clarify route if noisy text cannot establish direction.' },
  JUDGMENT_REQUIRED: { fields: ['queryType', 'complexity', 'fallbackExpected'], decision: 'Confirm the intended query type and interpretation route.', recommendation: 'No class approval for semantic judgment.', alternative: 'Mark unclear and ask a focused follow-up.' },
  CANDIDATE_OVERLAP: { fields: ['pickupSpans', 'fallbackExpected'], decision: 'Confirm the full landmark phrase must be retained, including near/gate qualifiers.', recommendation: 'Preserve full source span and useful overlap alternatives.', alternative: 'Clarify landmark precision rather than dropping qualifiers.' },
  CORRECTION_JUDGMENT: { fields: ['dropSpans', 'complexity', 'fallbackExpected'], decision: 'Confirm how the explicit actually-use clause changes the destination.', recommendation: 'Preserve correction semantics and proposed complex route.', alternative: 'Ask which destination is current if the correction is not definitive.' },
}
function risk(record) {
  if (record.truth.unresolvedPolicies.length || record.truth.reviewReasons.some(reason => /DIRECTION|MARKER|REPEATED|DAYPART|AM_PM|UNSUPPORTED_STOP|UNSUPPORTED_RETURN|UNSUPPORTED_RENTAL|CONDITIONAL|TEMPORAL|CONFLICTING|CORRECTION/.test(reason))) return 1
  return record.truth.reviewReasons.some(reason => /CANDIDATE|JUDGMENT|PREFERENCE/.test(reason)) ? 2 : 3
}
function reviewCase(record, failures) {
  const decisions = record.truth.reviewReasons.map(reason => {
    const definition = reviewDefinitions[reason]
    if (!definition) throw new Error('REVIEW_REASON_UNMAPPED')
    return { reason, ...definition }
  })
  const policies = record.truth.unresolvedPolicies.map(policy => {
    const definition = policyDefinitions[policy]
    if (!definition) throw new Error('CORE_POLICY_UNMAPPED')
    return { policy, ...definition }
  })
  const affected = new Set([...decisions, ...policies].flatMap(decision => decision.fields))
  if (failures.length) decisions.push({ reason: 'DETERMINISTIC_CERTIFICATE_FAILED', fields: failures.map(f => f.split(':')[0]),
    decision: 'Review failed independent proof; do not change labels to match a provider.', recommendation: 'Keep PROPOSED until correction/approval.', alternative: 'Reject the case from scored ground truth.' })
  for (const failure of failures) if (record.truth.expected[failure.split(':')[0]]) affected.add(failure.split(':')[0])
  return { caseId: record.id, templateFamily: record.familyId, query: record.modelInput.query, priority: failures.length ? 1 : risk(record),
    split: record.split, status: 'PROPOSED_REVIEW_REQUIRED', decisions, policies,
    proposedLabelsForReview: Object.fromEntries([...affected].map(field => [field, record.truth.expected[field]])),
    contextOnly: { queryType: record.truth.expected.queryType, complexity: record.truth.expected.complexity }, proofFailures: failures }
}
export function buildClassReviewPack(records) {
  const certificate = validateDeterministicApproval(records)
  const failed = new Map(certificate.results.filter(row => !row.eligible).map(row => [row.caseId, row.failures]))
  const coreReview = records.filter(row => row.cohort === 'CORE' && (row.truth.reviewReasons.length || failed.has(row.id)))
    .map(row => reviewCase(row, failed.get(row.id) ?? [])).sort((a, b) => a.priority - b.priority || a.templateFamily.localeCompare(b.templateFamily) || a.caseId.localeCompare(b.caseId))
  const exploratory = records.filter(row => row.cohort === 'EXPLORATORY').map(row => ({ ...row, evaluationDisposition: 'EXPLORATORY_UNSCORED' }))
  return { status: 'PROPOSED_NOT_FROZEN', certificate, coreReview, exploratory, index: searchBenchmarkIndex(records),
    policyCases: coreReview.filter(row => row.policies.length), humanReviewComplete: false, finalHeldOutRun: false }
}
const clean = text => String(text).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
function describe(value) {
  if (Array.isArray(value)) return value.length ? value.map(describe).join('; ') : 'none'
  if (value === null || typeof value !== 'object') return String(value)
  if (Object.hasOwn(value, 'exactText')) return `${value.exactText} [${value.start},${value.end})`
  if (value.state === 'UNSPECIFIED') return 'UNSPECIFIED'
  return Object.entries(value).map(([key, nested]) => `${key}: ${describe(nested)}`).join(', ')
}
function labelText(labels) {
  return Object.entries(labels).map(([field, label]) => `${field}: ${label.status === 'LABELLED' ? describe(label.value) : `UNLABELLED (${label.reason})`}`).join(' • ')
}
export function renderCoreClassReview(pack) {
  const lines = ['# Search Benchmark V1 — risk-ordered core review', '', '**PROPOSED. No labels approved or dataset frozen.**', '',
    `${pack.certificate.stillDeterministic} cases have an independent class-approval certificate. Class approval still needs the product owner. Review ${pack.coreReview.length} core cases below, grouped by shared decision. The 40 exploratory inputs are unscored and excluded.`, '',
    `Dataset hash: \`${pack.certificate.datasetHash}\`. Proposed split: ${pack.index.development} development / ${pack.index.heldOut} held-out; template leakage 0.`, '',
    'Approve/correct a family and list any variant exceptions by case ID. Only the listed fields need judgment; query type/complexity shown as context do not imply a request to re-review unrelated deterministic fields.', '']
  for (const priority of [1, 2, 3]) {
    lines.push(`## Priority ${priority}`, '')
    const selected = pack.coreReview.filter(row => row.priority === priority)
    for (const family of new Set(selected.map(row => row.templateFamily))) {
      const rows = selected.filter(row => row.templateFamily === family); const first = rows[0]
      lines.push(`### ${family} (${rows.length} cases)`, '')
      for (const decision of first.decisions) lines.push(`- **Decision:** ${decision.decision} **Fields:** ${decision.fields.join(', ') || 'policy-specific fields'}. **Recommended:** ${decision.recommendation} **Alternative:** ${decision.alternative}`)
      for (const policy of first.policies) lines.push(`- **Unresolved policy:** ${policy.policy}. ${policy.decision} **Options:** ${policy.options.join(' / ')}. **Effect:** ${policy.effect}`)
      lines.push('', '| Case ID | Query | Type / complexity (context) | Proposed labels requiring review |', '|---|---|---|---|',
        ...rows.map(row => `| ${clean(row.caseId)} | ${clean(row.query)} | ${clean(`${row.contextOnly.queryType.value} / ${row.contextOnly.complexity.value}`)} | ${clean(labelText(row.proposedLabelsForReview))} |`), '')
    }
  }
  return `${lines.join('\n')}\n`
}
