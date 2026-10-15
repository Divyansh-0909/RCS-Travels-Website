import assert from 'node:assert/strict'
import test from 'node:test'
import { scoreSearchBenchmark } from '../benchmarks/search/metrics.js'
import { searchPrediction } from '../benchmarks/search/prediction.js'

const unspecified = () => ({ state: 'UNSPECIFIED' })
const resolved = value => ({ state: 'RESOLVED', value, refs: [] })
const source = { start: 0, end: 6, exactText: 'campus' }
const destination = { start: 10, end: 17, exactText: 'airport' }
const scalarFields = () => Object.fromEntries(['passengers', 'sharing', 'isOutstation', 'preferSafeRoute', 'needsCarrier'].map(key => [key, unspecified()]))
function draft() {
  return { query: { id: 'q', revision: 2, text: 'campus to airport' }, queryType: 'BOOKING_REQUEST', complexity: 'SIMPLE',
    candidates: [{ candidateId: 'p', queryId: 'q', queryRevision: 2, ...source }, { candidateId: 'd', queryId: 'q', queryRevision: 2, ...destination }],
    pickup: resolved({ kind: 'QUERY_CANDIDATE', candidateId: 'p' }), drop: resolved({ kind: 'QUERY_CANDIDATE', candidateId: 'd' }),
    vehicleClass: unspecified(), timing: { mode: 'UNSPECIFIED', date: unspecified(), time: unspecified() },
    ...scalarFields(), unsupportedRequests: [] }
}
const labelled = value => ({ status: 'LABELLED', value })
function row(id, changes = {}) {
  const expected = { queryType: 'BOOKING_REQUEST', complexity: 'SIMPLE', pickupSpans: [source], dropSpans: [destination],
    vehicle: unspecified(), timingMode: 'UNSPECIFIED', date: unspecified(), time: unspecified(), passengers: unspecified(),
    flags: { sharing: unspecified(), isOutstation: unspecified(), preferSafeRoute: unspecified(), needsCarrier: unspecified() },
    missingFields: ['vehicleClass', 'timing'], ambiguities: [], unsupportedRequests: [], fallbackExpected: 'NOT_REQUIRED', ...changes }
  return { record: { id, cohort: 'CORE', split: 'DEVELOPMENT', truth: { status: 'PROPOSED', provenance: 'UNREVIEWED_PROPOSED_SYNTHETIC',
    reviewerMetadata: null, disagreementResolved: false, expected: Object.fromEntries(Object.entries(expected).map(([key, value]) => [key, labelled(value)])) } },
    prediction: { ...structuredClone(expected), pickupSpan: source, dropSpan: destination, fallbackInvoked: false } }
}
function approve(record) {
  record.truth.status = 'APPROVED'; record.truth.provenance = 'HUMAN_REVIEWED_SYNTHETIC'
  record.truth.reviewerMetadata = { reviewer: 'TEST_FIXTURE_ONLY' }; record.truth.disagreementResolved = true
}

test('Search metrics reject proposed held-out labels even in diagnostic mode; explicit development diagnostics are isolated', () => {
  const proposed = row('proposed')
  assert.throws(() => scoreSearchBenchmark([proposed]), /LABEL_REVIEW_REQUIRED/)
  assert.equal(scoreSearchBenchmark([proposed], { diagnostic: true }).cases, 1)
  proposed.record.split = 'HELD_OUT'
  assert.throws(() => scoreSearchBenchmark([proposed], { diagnostic: true }), /LABEL_REVIEW_REQUIRED/)
  const testFixture = row('approved-test-only'); approve(testFixture.record); testFixture.record.split = 'HELD_OUT'
  assert.equal(scoreSearchBenchmark([testFixture]).cases, 1)
  for (const edit of [truth => { truth.status = 'PROPOSED' }, truth => { truth.provenance = 'UNREVIEWED_PROPOSED_SYNTHETIC' },
    truth => { truth.reviewerMetadata = null }, truth => { delete truth.reviewerMetadata }, truth => { truth.disagreementResolved = false }]) {
    const modified = structuredClone(testFixture); edit(modified.record.truth)
    assert.throws(() => scoreSearchBenchmark([modified]), /LABEL_REVIEW_REQUIRED/)
  }
  assert.throws(() => scoreSearchBenchmark([proposed, proposed], { diagnostic: true }), /LABEL_REVIEW_REQUIRED/)
  assert.throws(() => scoreSearchBenchmark([testFixture, testFixture]), /DUPLICATE_CASE/)
  const exploratory = row('language'); exploratory.record.cohort = 'EXPLORATORY'; exploratory.record.split = 'EXPLORATORY_ONLY'
  assert.equal(scoreSearchBenchmark([exploratory]).exploratoryExcluded, 1)
  assert.equal(scoreSearchBenchmark([]).fields.queryType.value, null)
})
test('pickup/drop reversal is counted separately, preserves case IDs and excludes intrinsically indistinguishable roles', () => {
  const valid = row('correct'); const reversed = row('reversed'); const missed = row('missing')
  reversed.prediction.pickupSpan = destination; reversed.prediction.dropSpan = source; missed.prediction = null
  const repeated = row('same-text', { dropSpans: [{ ...destination, exactText: 'campus' }] })
  const unknown = row('unlabelled'); unknown.record.truth.expected.pickupSpans = { status: 'NOT_LABELLED', reason: 'POLICY_UNRESOLVED' }
  const noRoles = row('none', { pickupSpans: [], dropSpans: [] }); noRoles.prediction.pickupSpan = null; noRoles.prediction.dropSpan = null
  const partial = row('only-pickup', { dropSpans: [] }); partial.prediction.dropSpan = null
  const result = scoreSearchBenchmark([valid, reversed, missed, repeated, unknown, noRoles, partial], { diagnostic: true })
  assert.deepEqual(result.reversal, { numerator: 1, denominator: 3, value: 1 / 3, caseIds: ['reversed'] })
  assert.equal(result.pickupSpan.denominator, 5); assert.equal(result.dropSpan.denominator, 5)
  assert.equal(result.pickupSpan.numerator, 3); assert.equal(result.dropSpan.numerator, 2)
  const endMismatch = row('invalid-end'); endMismatch.prediction.pickupSpan = { ...source, end: 5 }
  const textMismatch = row('invalid-text'); textMismatch.prediction.pickupSpan = { ...source, exactText: 'wrong' }
  assert.equal(scoreSearchBenchmark([endMismatch, textMismatch], { diagnostic: true }).pickupSpan.numerator, 0)
  const partialReversal = row('partial-reversal'); partialReversal.prediction.pickupSpan = destination; partialReversal.prediction.dropSpan = null
  assert.equal(scoreSearchBenchmark([partialReversal], { diagnostic: true }).reversal.numerator, 0)
})
test('fallback recall and unnecessary invocation use distinct known cohorts; absent labels never become negative truth', () => {
  const needed = row('needed', { fallbackExpected: 'REQUIRED' }); needed.prediction.fallbackInvoked = true
  needed.prediction.candidateGeneratorMiss = true; needed.prediction.recoveredMissingCandidate = true
  const missed = row('missed', { fallbackExpected: 'REQUIRED' }); missed.prediction.candidateGeneratorMiss = true
  const unnecessary = row('unnecessary'); unnecessary.prediction.fallbackInvoked = true
  const partial = row('partial'); const abstention = row('abstention'); abstention.prediction = null
  const unknown = row('policy'); unknown.record.truth.expected.fallbackExpected = { status: 'NOT_LABELLED', reason: 'NEEDS_HUMAN_REVIEW' }
  const actual = scoreSearchBenchmark([needed, missed, unnecessary, partial, abstention, unknown], { diagnostic: true }).fallback
  assert.equal(actual.necessaryRecall.value, 0.5); assert.equal(actual.unnecessaryRate.value, 1 / 3)
  assert.equal(actual.invocationRate.value, 1 / 3); assert.equal(actual.candidateGeneratorMissRate.value, 1 / 3)
  assert.equal(actual.lunaCandidateRecoveryRate.value, 0.5)
})
test('missing, ambiguity and unsupported recall count omitted and invented fields without rewarding hallucination', () => {
  const input = row('missing', { missingFields: ['pickup', 'drop'], ambiguities: ['TIME_PERIOD_REQUIRED'], unsupportedRequests: ['STOP'] })
  input.prediction.missingFields = ['pickup', 'pickup', 'vehicleClass']; input.prediction.ambiguities = []
  input.prediction.unsupportedRequests = ['STOP', 'RENTAL']
  const absent = row('absent', { missingFields: ['timing'] }); absent.prediction = null
  const invented = row('invented', { pickupSpans: [], dropSpans: [] })
  invented.prediction.date = { state: 'RESOLVED', value: 'fabricated' }; invented.prediction.time = { state: 'RESOLVED', value: 18 }
  invented.prediction.passengers = { state: 'RESOLVED', value: 3 }
  const ambiguous = row('ambiguous', { time: { state: 'AMBIGUOUS' }, passengers: { state: 'AMBIGUOUS' } })
  ambiguous.prediction.time = { state: 'RESOLVED', value: 'untrusted' }; ambiguous.prediction.passengers = { state: 'RESOLVED', value: 5 }
  const unknown = row('unknown'); for (const key of ['missingFields', 'ambiguities', 'unsupportedRequests', 'date', 'time', 'passengers']) {
    unknown.record.truth.expected[key] = { status: 'NOT_LABELLED', reason: 'UNRESOLVED' }
  }
  const result = scoreSearchBenchmark([input, absent, invented, ambiguous, unknown], { diagnostic: true })
  assert.equal(result.missingRecall.falsePositive, 1); assert.equal(result.ambiguityRecall.value, 0)
  assert.deepEqual(result.unsupportedRecall, { numerator: 1, denominator: 1, value: 1, falsePositive: 1 })
  assert.deepEqual(result.inventions, { location: 2, timing: 2, passenger: 1 })
  assert.equal(result.fields.time.denominator, 4)
})
test('explicit any, exclusions and required/preferred vehicle metrics have separate denominators', () => {
  const any = row('any', { vehicle: { state: 'EXPLICIT_ANY', excluded: [] } })
  const excluded = row('excluded', { vehicle: { state: 'EXCLUDED', excluded: ['sedan'] } })
  excluded.prediction.vehicle = unspecified()
  const preferred = row('preferred', { vehicle: { state: 'RESOLVED', value: 'suv', strength: 'PREFERRED', excluded: [] } })
  preferred.prediction.vehicle.strength = 'REQUIRED'
  const unknown = row('unknown'); delete unknown.record.truth.expected.vehicle
  const result = scoreSearchBenchmark([any, excluded, preferred, unknown], { diagnostic: true })
  assert.equal(result.vehicleAny.value, 1); assert.equal(result.vehicleExclusions.value, 0)
  assert.equal(result.vehicleStrength.value, 0); assert.equal(result.fields.vehicle.denominator, 3)
})
test('prediction normalization reads draft observations, preserves timing and flags, and never consumes ground truth', () => {
  assert.equal(searchPrediction({}), null)
  const input = draft()
  input.vehicleClass = { state: 'RESOLVED', value: 'suv', strength: 'PREFERRED', excluded: ['sedan', 'hatchback'] }
  input.sharing = resolved(false); input.passengers = resolved(3)
  const direct = searchPrediction({ draft: input })
  assert.deepEqual(direct.pickupSpan, source); assert.deepEqual(direct.dropSpan, destination)
  assert.equal(direct.timingMode, 'UNSPECIFIED'); assert.deepEqual(direct.time, unspecified())
  assert.deepEqual(direct.flags.sharing, { state: 'RESOLVED', value: false }); assert.deepEqual(direct.flags.needsCarrier, unspecified())
  assert.deepEqual(direct.vehicle.excluded, ['hatchback', 'sedan']); assert.equal(direct.fallbackInvoked, false)
  input.timing = { mode: 'SCHEDULED', date: resolved({ kind: 'ABSOLUTE', day: resolved(5), month: resolved(12), year: unspecified() }),
    time: resolved({ kind: 'CLOCK', hour: 7, minute: resolved(0), notation: 'H12', period: { state: 'AMBIGUOUS' }, precision: 'APPROXIMATE' }) }
  input.unsupportedRequests = [{ kind: 'PASSENGER_COUNT' }, { kind: 'STOP' }, { kind: 'STOP' }]
  const partial = searchPrediction({ parse: { draft: input, issues: [{ category: 'MISSING', field: 'timing.date' }, { category: 'AMBIGUOUS', code: 'TIME_PERIOD_REQUIRED' }] },
    issues: [{ category: 'MISSING', field: 'timing.date' }, { category: 'POLICY', code: 'DATE_POLICY_CLARIFICATION_REQUIRED' },
      { category: 'PROVIDER', code: 'PLACES_TIMEOUT' }, { category: 'PROVIDER', code: 'JEV_PROVIDER_ERROR' }, { category: 'INVALID', code: 'ROLE_CONFLICT' }],
    telemetry: { lunaAttempts: 1, fallbackReasons: ['LOCATION_CANDIDATE_MISSING'], recoveredMissingCandidates: true } })
  assert.deepEqual(partial.date.value, { kind: 'ABSOLUTE', day: 5, month: 12, year: null })
  assert.deepEqual(partial.time.value, { kind: 'CLOCK', hour: 7, minute: 0, notation: 'H12', period: null, precision: 'APPROXIMATE' })
  assert.deepEqual(partial.missingFields, ['timing.date']); assert.deepEqual(partial.ambiguities, ['TIME_PERIOD_REQUIRED', 'DATE_POLICY_CLARIFICATION_REQUIRED'])
  assert.deepEqual(partial.unsupportedRequests, ['PASSENGER_COUNT', 'STOP']); assert.deepEqual(partial.providerFailures, ['PLACES_TIMEOUT', 'JEV_PROVIDER_ERROR'])
  assert.equal(partial.fallbackInvoked, true); assert.equal(partial.candidateGeneratorMiss, true); assert.equal(partial.recoveredMissingCandidate, true)
  input.timing.date = resolved({ kind: 'RELATIVE', anchor: 'TOMORROW' }); input.timing.time = resolved({ kind: 'DAYPART', value: 'EVENING' })
  assert.deepEqual(searchPrediction({ draft: input }).time.value, { kind: 'DAYPART', value: 'EVENING' })
  for (const state of ['EXPLICIT_ANY', 'EXCLUDED', 'AMBIGUOUS']) {
    input.vehicleClass = { state, excluded: ['suv'], alternatives: ['suv', 'sedan'] }
    const vehicle = searchPrediction({ draft: input }).vehicle
    assert.equal(vehicle.state, state)
    if (state === 'AMBIGUOUS') assert.deepEqual(vehicle.alternatives, ['sedan', 'suv'])
    else assert.deepEqual(vehicle.excluded, ['suv'])
  }
  input.pickup = unspecified(); input.drop = resolved({ kind: 'GROUNDED_LOCATION' })
  assert.equal(searchPrediction({ draft: input }).pickupSpan, null); assert.equal(searchPrediction({ draft: input }).dropSpan, null)
})
test('prediction source spans reject ownership, bounds, missing candidate IDs, exact-text and surrogate-splitting errors', () => {
  const edits = [candidate => { candidate.queryId = 'another' }, candidate => { candidate.queryRevision = 3 },
    candidate => { candidate.candidateId = 'absent' }, candidate => { candidate.exactText = 'fabricated' },
    candidate => { candidate.start = -1 }, candidate => { candidate.start = 0.5 }, candidate => { candidate.end = 6.5 },
    candidate => { candidate.end = candidate.start }, candidate => { candidate.end = 9000; candidate.exactText = 'campus to airport' }]
  for (const edit of edits) { const input = draft(); edit(input.candidates[0]); assert.throws(() => searchPrediction({ draft: input }), /SOURCE_INVALID/) }
  for (const [start, end] of [[1, 2], [0, 1]]) {
    const input = draft(); input.query.text = '\uD83D\uDE95'; input.drop = unspecified()
    Object.assign(input.candidates[0], { start, end, exactText: input.query.text.slice(start, end) })
    assert.throws(() => searchPrediction({ draft: input }), /SOURCE_INVALID/)
  }
  const emoji = draft(); emoji.query.text = '\uD83D\uDE95'; emoji.drop = unspecified()
  Object.assign(emoji.candidates[0], { start: 0, end: 2, exactText: emoji.query.text })
  assert.deepEqual(searchPrediction({ draft: emoji }).pickupSpan, { start: 0, end: 2, exactText: '\uD83D\uDE95' })
  emoji.query.text = '\uD800'; Object.assign(emoji.candidates[0], { start: 0, end: 1, exactText: emoji.query.text })
  assert.deepEqual(searchPrediction({ draft: emoji }).pickupSpan, { start: 0, end: 1, exactText: '\uD800' })
})
