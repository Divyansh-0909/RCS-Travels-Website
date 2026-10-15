// Provider-independent observations from the existing S2/S3/S4 result; never benchmark labels.
function component(field) { return field.state === 'RESOLVED' ? field.value : null }
function expression(field) {
  if (field.state !== 'RESOLVED') return { state: field.state }
  const value = field.value
  if (value.kind === 'ABSOLUTE') return { state: 'RESOLVED', value: { kind: value.kind,
    day: component(value.day), month: component(value.month), year: component(value.year) } }
  if (value.kind === 'CLOCK') return { state: 'RESOLVED', value: { kind: value.kind, hour: value.hour,
    minute: component(value.minute), notation: value.notation, period: component(value.period), precision: value.precision } }
  return { state: 'RESOLVED', value }
}
function scalar(field) { return field.state === 'RESOLVED' ? { state: field.state, value: field.value } : { state: field.state } }
function vehicle(field) {
  if (field.state === 'RESOLVED') return { state: field.state, value: field.value, strength: field.strength, excluded: [...field.excluded].sort() }
  if (field.state === 'AMBIGUOUS') return { state: field.state, alternatives: [...field.alternatives].sort() }
  if (field.state === 'EXPLICIT_ANY' || field.state === 'EXCLUDED') return { state: field.state, excluded: [...field.excluded].sort() }
  return { state: field.state }
}
const splitsSurrogate = (text, offset) => /[\uD800-\uDBFF]/.test(text[offset - 1] ?? '') && /[\uDC00-\uDFFF]/.test(text[offset] ?? '')
function sourceSpan(draft, role) {
  const field = draft[role]
  if (field.state !== 'RESOLVED' || field.value.kind !== 'QUERY_CANDIDATE') return null
  const candidate = draft.candidates.find(item => item.candidateId === field.value.candidateId)
  if (!candidate || candidate.queryId !== draft.query.id || candidate.queryRevision !== draft.query.revision
    || !Number.isInteger(candidate.start) || !Number.isInteger(candidate.end)
    || candidate.start < 0 || candidate.end <= candidate.start || candidate.end > draft.query.text.length
    || splitsSurrogate(draft.query.text, candidate.start) || splitsSurrogate(draft.query.text, candidate.end)
    || draft.query.text.slice(candidate.start, candidate.end) !== candidate.exactText) throw new Error('SEARCH_METRIC_SOURCE_INVALID')
  return { start: candidate.start, end: candidate.end, exactText: candidate.exactText }
}

export function searchPrediction(result) {
  const draft = result.draft ?? result.parse?.draft
  if (!draft) return null
  const issues = [...(result.parse?.issues ?? []), ...(result.issues ?? [])]
  return { queryType: draft.queryType, complexity: draft.complexity,
    pickupSpan: sourceSpan(draft, 'pickup'), dropSpan: sourceSpan(draft, 'drop'),
    vehicle: vehicle(draft.vehicleClass), timingMode: draft.timing.mode,
    date: expression(draft.timing.date), time: expression(draft.timing.time), passengers: scalar(draft.passengers),
    flags: Object.fromEntries(['sharing', 'isOutstation', 'preferSafeRoute', 'needsCarrier'].map(key => [key, scalar(draft[key])])),
    missingFields: [...new Set(issues.filter(item => item.category === 'MISSING').map(item => item.field))],
    ambiguities: [...new Set(issues.filter(item => item.category === 'AMBIGUOUS' || item.category === 'POLICY').map(item => item.code))],
    unsupportedRequests: [...new Set(draft.unsupportedRequests.map(item => item.kind))],
    fallbackInvoked: (result.telemetry?.lunaAttempts ?? 0) > 0,
    candidateGeneratorMiss: result.telemetry?.fallbackReasons?.includes('LOCATION_CANDIDATE_MISSING') === true,
    recoveredMissingCandidate: result.telemetry?.recoveredMissingCandidates === true,
    providerFailures: issues.filter(item => /^(?:JEV|LUNA|PLACES)_/.test(item.code) && /ERROR|TIMEOUT|UNAVAILABLE|QUOTA/.test(item.code)).map(item => item.code),
  }
}
