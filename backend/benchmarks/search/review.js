import { buildSearchBenchmarkDataset, buildSearchBenchmarkReviewExport, searchBenchmarkIndex } from './dataset.js'
import { validateSearchDataset } from './validation.js'

const clean = value => String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
const value = (record, key) => record.truth.expected[key]?.status === 'LABELLED' ? record.truth.expected[key].value : null
const scalar = field => field?.state === 'RESOLVED' ? JSON.stringify(field.value) : field?.state ?? 'unlabelled'
function vehicleText(field) {
  if (!field) return 'unlabelled'
  if (field.state === 'RESOLVED') return `${field.value} (${field.strength})`
  if (field.state === 'AMBIGUOUS') return `AMBIGUOUS: ${field.alternatives.join(', ')}`
  return `${field.state}${field.excluded?.length ? `; exclude ${field.excluded.join(', ')}` : ''}`
}
function timingText(record) {
  return [value(record, 'timingMode'), `date ${scalar(value(record, 'date'))}`, `time ${scalar(value(record, 'time'))}`].filter(Boolean).join('; ')
}
const spanText = span => `${span.exactText} [${span.start},${span.end})`
const roleText = (record, field) => value(record, field)?.map(spanText).join(' OR ') ?? 'unlabelled'

function row(record) {
  const expected = record.truth.expected
  const flags = value(record, 'flags')
  const statedFlags = flags ? Object.entries(flags).filter(([, field]) => field.state !== 'UNSPECIFIED').map(([key, field]) => `${key}=${scalar(field)}`).join(', ') : 'unlabelled'
  return [record.id, record.modelInput.query, `${value(record, 'queryType') ?? 'UNLABELLED'} / ${value(record, 'complexity') ?? 'UNLABELLED'}`,
    `P: ${roleText(record, 'pickupSpans') || 'missing'}; D: ${roleText(record, 'dropSpans') || 'missing'}; target: ${value(record, 'groundingTarget') ?? 'unlabelled'}`,
    vehicleText(value(record, 'vehicle')), timingText(record),
    `missing: ${value(record, 'missingFields')?.join(', ') ?? 'unlabelled'}; ambiguous: ${value(record, 'ambiguities')?.join(', ') ?? 'unlabelled'}`,
    `unsupported: ${value(record, 'unsupportedRequests')?.join(', ') ?? 'unlabelled'}; fallback: ${value(record, 'fallbackExpected') ?? 'UNRESOLVED'}`,
    `passengers: ${scalar(value(record, 'passengers'))}; ${statedFlags}; stops: ${roleText(record, 'stopSpans')}`,
    `${record.truth.reviewReasons.join(', ') || 'Frozen-spec derivation'}${Object.entries(expected).filter(([, label]) => label.status === 'NOT_LABELLED' && label.reason !== 'COMPONENT_SCORING_ONLY_NO_TIMESTAMP_DEFAULTS').map(([key]) => `; ${key} unlabelled`).join('')}`,
  ].map(clean).join(' | ')
}

export function renderSearchReview(records, { requiredOnly = false } = {}) {
  validateSearchDataset(records)
  const selected = requiredOnly ? records.filter(record => record.truth.reviewReasons.length > 0) : records
  const index = searchBenchmarkIndex(records)
  const lines = [`# Search Benchmark V1 — ${requiredOnly ? 'REVIEW_REQUIRED' : 'proposed label review'}`, '',
    '**PROPOSED — NOT FROZEN. No final held-out provider inference has run.**', '',
    'The product owner is the final human reviewer. No Jev/Luna output was used to create these labels. Deterministic derivation means the label follows the frozen specification; it does not claim human approval.', '',
    `Dataset hash: \`${index.datasetHash}\`. Core: ${index.core}; exploratory: ${index.exploratory}. Proposed development: ${index.development}; held-out: ${index.heldOut}. Exploratory records are excluded from both core splits.`, '',
    `Frozen-spec derivations: ${index.deterministicallyLabelled}. Highlighted review cases: ${index.reviewRequired}. Core unresolved-policy cases: ${records.filter(record => record.cohort === 'CORE' && record.truth.unresolvedPolicies.length).length}. All ${index.total} records still need approval.`, '',
    'Offsets are zero-based UTF-16, exclusive end. Multiple spans joined by OR are acceptable source occurrences of the same phrase. Empty pickup/drop means not stated; geography remains ungrounded. Every usable place needs explicit selection. No exact timestamp is labelled where product policy is unresolved.', '',
    'Review each family summary and its variants. Return corrections by record ID, or approve a complete family by name. Review the highlighted subset first. Approving resolved fields does not resolve omitted-year, weekday, non-IST, or SUV-family policy; those affected fields stay excluded from resolved-label metrics.', '',
    '## Cohorts', '', '| Cohort | Count |', '|---|---:|', ...Object.entries(index.categories).map(([category, count]) => `| ${category} | ${count} |`), '',
  ]
  for (const category of [...new Set(selected.map(record => record.category))]) {
    lines.push(`## ${category}`, '')
    const cohort = selected.filter(record => record.category === category)
    for (const family of [...new Set(cohort.map(record => record.familyId))]) {
      const familyRecords = cohort.filter(record => record.familyId === family)
      lines.push(`### ${family} — ${familyRecords[0].split} — ${familyRecords.length} cases`, '',
        `Review: ${familyRecords[0].truth.reviewReasons.join(', ') || 'deterministic specification derivation; confirm the proposed interpretation'}.`, '',
        '| ID | Query | Type / complexity | Locations / target | Vehicle | Timing | Missing / ambiguity | Unsupported / fallback | Advisory / flags / stops | Review notes |',
        '|---|---|---|---|---|---|---|---|---|---|', ...familyRecords.map(record => `| ${row(record)} |`), '')
    }
  }
  return `${lines.join('\n').trimEnd()}\n`
}

export function searchReviewArtifacts(records = buildSearchBenchmarkDataset()) {
  validateSearchDataset(records)
  return { proposal: buildSearchBenchmarkReviewExport(records),
    reviewRequired: records.filter(record => record.truth.reviewReasons.length > 0),
    reviewMarkdown: renderSearchReview(records), requiredMarkdown: renderSearchReview(records, { requiredOnly: true }) }
}
