import { isDeepStrictEqual } from 'node:util'
const rate = (numerator, denominator) => ({ numerator, denominator, value: denominator ? numerator / denominator : null })
const label = (row, key) => row.record.truth.expected[key]
const known = (row, key) => label(row, key)?.status === 'LABELLED'
const value = (row, key) => label(row, key).value
const matchesSpan = (actual, acceptable) => actual !== null && acceptable.some(span => span.start === actual.start && span.end === actual.end && span.exactText === actual.exactText)

function fieldMetric(rows, key) {
  const eligible = rows.filter(row => known(row, key))
  return rate(eligible.filter(row => isDeepStrictEqual(row.prediction?.[key], value(row, key))).length, eligible.length)
}
function spanMetric(rows, role) {
  const eligible = rows.filter(row => known(row, `${role}Spans`) && value(row, `${role}Spans`).length > 0)
  return rate(eligible.filter(row => matchesSpan(row.prediction?.[`${role}Span`] ?? null, value(row, `${role}Spans`))).length, eligible.length)
}
function setRecall(rows, key) {
  let expected = 0; let recovered = 0; let falsePositive = 0
  for (const row of rows.filter(item => known(item, key))) {
    const gold = new Set(value(row, key)); const actual = new Set(row.prediction?.[key] ?? [])
    expected += gold.size
    recovered += [...gold].filter(item => actual.has(item)).length
    falsePositive += [...actual].filter(item => !gold.has(item)).length
  }
  return { ...rate(recovered, expected), falsePositive }
}
function reversals(rows) {
  const eligible = rows.filter(row => known(row, 'pickupSpans') && known(row, 'dropSpans')
    && value(row, 'pickupSpans').length && value(row, 'dropSpans').length
    && !value(row, 'pickupSpans').some(pickup => value(row, 'dropSpans').some(drop => pickup.exactText === drop.exactText)))
  const reversed = eligible.filter(row => matchesSpan(row.prediction?.pickupSpan ?? null, value(row, 'dropSpans'))
    && matchesSpan(row.prediction?.dropSpan ?? null, value(row, 'pickupSpans')))
  return { ...rate(reversed.length, eligible.length), caseIds: reversed.map(row => row.record.id) }
}
function fallbackMetrics(rows) {
  const required = rows.filter(row => known(row, 'fallbackExpected') && value(row, 'fallbackExpected') === 'REQUIRED')
  const simple = rows.filter(row => known(row, 'fallbackExpected') && value(row, 'fallbackExpected') === 'NOT_REQUIRED')
  const misses = rows.filter(row => row.prediction?.candidateGeneratorMiss)
  return { necessaryRecall: rate(required.filter(row => row.prediction?.fallbackInvoked).length, required.length),
    unnecessaryRate: rate(simple.filter(row => row.prediction?.fallbackInvoked).length, simple.length),
    invocationRate: rate(rows.filter(row => row.prediction?.fallbackInvoked).length, rows.length),
    candidateGeneratorMissRate: rate(misses.length, rows.length),
    lunaCandidateRecoveryRate: rate(misses.filter(row => row.prediction?.recoveredMissingCandidate).length, misses.length) }
}
function inventions(rows) {
  const counts = { location: 0, timing: 0, passenger: 0 }
  for (const row of rows) {
    for (const role of ['pickup', 'drop']) {
      if (known(row, `${role}Spans`) && value(row, `${role}Spans`).length === 0 && row.prediction?.[`${role}Span`]) counts.location += 1
    }
    for (const key of ['date', 'time']) {
      if (known(row, key) && value(row, key).state === 'UNSPECIFIED' && row.prediction?.[key]?.state === 'RESOLVED') counts.timing += 1
    }
    if (known(row, 'passengers') && value(row, 'passengers').state === 'UNSPECIFIED' && row.prediction?.passengers?.state === 'RESOLVED') counts.passenger += 1
  }
  return counts
}

export function scoreSearchBenchmark(rows, { diagnostic = false } = {}) {
  const primary = rows.filter(row => row.record.cohort === 'CORE')
  for (const row of primary) {
    const reviewed = row.record.truth.status === 'APPROVED' && row.record.truth.provenance === 'HUMAN_REVIEWED_SYNTHETIC'
      && row.record.truth.reviewerMetadata != null && row.record.truth.disagreementResolved
    if (!reviewed && (!diagnostic || row.record.split !== 'DEVELOPMENT')) throw new Error('SEARCH_LABEL_REVIEW_REQUIRED')
  }
  if (new Set(primary.map(row => row.record.id)).size !== primary.length) throw new Error('SEARCH_METRIC_DUPLICATE_CASE')
  const fields = Object.fromEntries(['queryType', 'complexity', 'vehicle', 'timingMode', 'date', 'time', 'passengers', 'flags'].map(key => [key, fieldMetric(primary, key)]))
  const any = primary.filter(row => known(row, 'vehicle') && value(row, 'vehicle').state === 'EXPLICIT_ANY')
  const excluded = primary.filter(row => known(row, 'vehicle') && (value(row, 'vehicle').excluded?.length ?? 0) > 0)
  const strength = primary.filter(row => known(row, 'vehicle') && value(row, 'vehicle').state === 'RESOLVED')
  return { cases: primary.length, exploratoryExcluded: rows.length - primary.length, diagnostic,
    fields, pickupSpan: spanMetric(primary, 'pickup'), dropSpan: spanMetric(primary, 'drop'), reversal: reversals(primary),
    vehicleAny: fieldMetric(any, 'vehicle'), vehicleExclusions: fieldMetric(excluded, 'vehicle'), vehicleStrength: fieldMetric(strength, 'vehicle'),
    missingRecall: setRecall(primary, 'missingFields'), ambiguityRecall: setRecall(primary, 'ambiguities'), unsupportedRecall: setRecall(primary, 'unsupportedRequests'),
    fallback: fallbackMetrics(primary), inventions: inventions(primary) }
}
