import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildFamilyOwnerReview } from '../benchmarks/search/familyOwnerReview.js'
import { freezeApprovedSearch, frozenSearchDevelopment } from '../benchmarks/search/freeze.js'
import { searchBenchmarkDatasetHash } from '../benchmarks/search/dataset.js'
import { createRideSearchParser } from '../services/search/parser.ts'
import { collectObservations } from '../services/search/observations.ts'
import { emptyDraft } from '../services/search/contracts.ts'
import { extractVehicle } from '../services/search/extractor.ts'
import { resolutionRequirements } from '../services/search/locations/followup.ts'
import { generateLocationCandidates } from '../services/search/locations/candidates.ts'
import { sourceTimeZone, timeZoneTokens } from '../services/search/timezonePolicy.ts'
import { createTestClock } from './helpers/testClock.js'
import { inputFor, decisionFake, bookingRouting, expressionChoices, candidateFor } from './helpers/rideSearchFake.js'

const clock = createTestClock('2026-10-04T12:00:00+05:30')
test('frozen approved Search dataset preserves the split, rejects changed labels and exposes development only', () => {
  const review = buildFamilyOwnerReview(); const freeze = freezeApprovedSearch(review, clock.now().toISOString())
  assert.equal(frozenSearchDevelopment(freeze).length, 222)
  assert.ok(frozenSearchDevelopment(freeze).every(r => r.split === 'DEVELOPMENT'))
  const corrupt = structuredClone(freeze); corrupt.records[0].truth.expected.queryType.value = 'CORRUPTED'
  assert.throws(() => frozenSearchDevelopment(corrupt), /FROZEN_SEARCH_CHANGED/)
  const invalid = edit => { const r = structuredClone(review); edit(r); assert.throws(() => freezeApprovedSearch(r, clock.now().toISOString())) }
  invalid(r => { r.exceptions.push({ caseId: 'unresolved' }) })
  invalid(r => { r.summary.originalDeterministicUnchanged = false })
  invalid(r => { r.summary.datasetHash = 'wrong' })
  const malformed = structuredClone(review); malformed.records[0].modelInput.context.timeZone = 42
  malformed.summary.datasetHash = searchBenchmarkDatasetHash(malformed.records)
  assert.throws(() => freezeApprovedSearch(malformed, clock.now().toISOString()))
  assert.throws(() => freezeApprovedSearch(review, 'invalid'), /FREEZE_TIMESTAMP_INVALID/)
  for (const edit of [r => { r.records[0].truth.status = 'PROPOSED' }, r => { r.records[0].truth.disagreementResolved = false },
    r => { r.records[0].truth.provenance = 'UNREVIEWED_PROPOSED_SYNTHETIC' }, r => { r.records[0].truth.reviewerMetadata = null }]) {
    const changed = structuredClone(review); edit(changed); changed.summary.datasetHash = searchBenchmarkDatasetHash(changed.records)
    assert.throws(() => freezeApprovedSearch(changed, clock.now().toISOString()), /SEARCH_APPROVAL_INCOMPLETE/)
  }
  const splitChanged = structuredClone(review); const family = splitChanged.records.find(r => r.split === 'DEVELOPMENT').familyId
  splitChanged.records.filter(r => r.familyId === family).forEach(r => { r.split = 'HELD_OUT' })
  splitChanged.summary.datasetHash = searchBenchmarkDatasetHash(splitChanged.records)
  assert.throws(() => freezeApprovedSearch(splitChanged, clock.now().toISOString()), /SEARCH_SPLIT_INVALID/)
  const fixture = process.env.RCS_SEARCH_FROZEN_DATASET_PATH ?? new URL('../../docs/search/benchmark-v1/frozen-v1/dataset.json', import.meta.url)
  const file = JSON.parse(readFileSync(fixture))
  assert.equal(file.datasetHash, freeze.datasetHash); assert.equal(file.splitHash, freeze.splitHash)
  for (const key of ['version', 'schemaVersion', 'fixtureVersion', 'ownerDecisionVersion', 'authorization', 'approvedOverlayHash', 'splitSeed', 'development', 'heldOut', 'exploratoryStatus']) assert.deepEqual(freeze[key], file[key])
  assert.throws(() => frozenSearchDevelopment({ ...freeze, version: 'unapproved-version' }), /FROZEN_SEARCH_CHANGED/)
  assert.throws(() => frozenSearchDevelopment({ ...freeze, splitHash: 'wrong' }), /FROZEN_SEARCH_CHANGED/)
})

test('clear exclusion-only wording dominates inconsistent positive Jev choices without inventing a required class', async () => {
  for (const [text, excluded] of [['not SUV', ['suv', 'suv_premium']], ['anything except SUV', ['suv', 'suv_premium']],
    ['no sedan', ['sedan']], ['not regular SUV', ['suv']], ['not regular  SUV', ['suv']], ['any car except sedan', ['sedan']],
    ["don't send an SUV", ['suv', 'suv_premium']], ["don't  send an SUV", ['suv', 'suv_premium']],
    ["don't SUV", ['suv', 'suv_premium']], ['do not SUV', ['suv', 'suv_premium']], ['do  not  send  a  SUV', ['suv', 'suv_premium']]]) {
    for (const selected of ['hatchback', 'sedan', 'suv', 'UNCLEAR']) {
      const provider = decisionFake([bookingRouting, { vehicle_class: selected, vehicle_strength: 'REQUIRED',
        vehicle_any: 'EXPLICIT_ANY', exclude_suv: 'UNCLEAR' }])
      const result = await createRideSearchParser(provider, clock).parse(inputFor(text))
      assert.equal(result.fallbackRequired, false); assert.equal(result.draft.vehicleClass.state, 'EXCLUDED')
      assert.deepEqual(result.draft.vehicleClass.excluded, excluded)
      assert.ok(!result.issues.some(i => i.field === 'vehicleClass' && i.category !== 'MISSING'))
      assert.ok(!resolutionRequirements(result.draft, result.issues).some(i => i.field === 'vehicleClass'))
      for (const field of ['pickup', 'drop', 'timing']) assert.ok(resolutionRequirements(result.draft, result.issues).some(i => i.field === field), field)
      assert.ok(!Object.hasOwn(result.draft.vehicleClass, 'value'))
      assert.ok(!Object.keys(provider.requests[1].questions).some(k => k.startsWith('vehicle_') || k.startsWith('exclude_')))
    }
  }
  const text = 'no hatchback, no sedan, no regular SUV, no premium SUV'
  const draft = emptyDraft(inputFor(text).query); const issues = []
  const vehicle = extractVehicle(draft, { choices: {} }, collectObservations(draft.query, []), issues)
  assert.equal(vehicle.state, 'AMBIGUOUS'); assert.equal(vehicle.excluded.length, 4)
  assert.equal(issues[0].code, 'VEHICLE_CONFLICT')
  const ignoredPositive = await createRideSearchParser(decisionFake([bookingRouting, { vehicle_any: 'EXPLICIT_ANY', vehicle_strength: 'PREFERRED',
    exclude_sedan: 'EXCLUDED' }]), clock).parse(inputFor('prefer SUV, anything except sedan'))
  assert.equal(ignoredPositive.fallbackRequired, true)
  assert.equal(ignoredPositive.draft.vehicleClass.state, 'AMBIGUOUS')
  assert.deepEqual(ignoredPositive.draft.vehicleClass.excluded, ['sedan'])
  const any = await createRideSearchParser(decisionFake([bookingRouting, { vehicle_any: 'EXPLICIT_ANY' }]), clock).parse(inputFor('any car'))
  assert.equal(any.draft.vehicleClass.state, 'EXPLICIT_ANY')
  const anyFields = resolutionRequirements(any.draft, any.issues).map(i => i.field)
  assert.ok(!anyFields.includes('vehicleClass'))
  for (const field of ['pickup', 'drop', 'timing']) assert.ok(anyFields.includes(field), field)
  const positive = await createRideSearchParser(decisionFake([bookingRouting, { vehicle_class: 'suv', vehicle_strength: 'REQUIRED', exclude_sedan: 'EXCLUDED' }]), clock).parse(inputFor('no sedan, SUV only'))
  assert.equal(positive.draft.vehicleClass.state, 'RESOLVED'); assert.equal(positive.draft.vehicleClass.value, 'suv')
  assert.equal(positive.draft.vehicleClass.strength, 'REQUIRED'); assert.deepEqual(positive.draft.vehicleClass.excluded, ['sedan'])
})

test('PM development sweep preserves explicit overrides, approximate precision and dayparts', async () => {
  for (const [text, period, precision] of [['at 7','PM','EXACT'],['around 7','PM','APPROXIMATE'],['7 tomorrow','PM','EXACT'],
    ['tomorrow 7','PM','EXACT'],['7 in the morning','AM','EXACT'],['7 AM','AM','EXACT'],['7 PM','PM','EXACT'],['7 tonight','PM','EXACT']]) {
    const provider = decisionFake([bookingRouting, r => ({ ...expressionChoices(r), timing_mode: 'SCHEDULED' })])
    const result = await createRideSearchParser(provider, clock).parse(inputFor(text))
    assert.equal(result.draft.timing.time.state, 'RESOLVED', text)
    assert.equal(result.draft.timing.time.value.period.value, period, text)
    assert.equal(result.draft.timing.time.value.precision, precision, text)
  }
  assert.equal(collectObservations(inputFor('tomorrow 7 people').query, []).times.length, 0)
  for (const text of ['tomorrow 8 hours rental', 'tomorrow 7 km', 'today 6 minutes']) assert.equal(collectObservations(inputFor(text).query, []).times.length, 0)
  assert.equal(collectObservations(inputFor('18:00').query, []).times[0].value.notation, 'H24')
  assert.equal(collectObservations(inputFor('evening').query, []).times[0].value.kind, 'DAYPART')
  const input = inputFor('from Tower 7 tonight to UTC Garden tomorrow at 7')
  const candidates = [candidateFor(input, 'Tower 7 tonight', 'pickup'), candidateFor(input, 'UTC Garden', 'drop')]
  const observations = collectObservations(input.query, candidates)
  assert.equal(observations.times.length, 1); assert.equal(observations.times[0].text.trim(), 'at 7')
  assert.equal(observations.dates.length, 1)
  for (const text of ['from campus to airport tomorrow 7', 'from campus to airport tomorrow around 7', 'from campus to airport tomorrow at 7 PM']) {
    const q = inputFor(text).query
    const generated = generateLocationCandidates(q, 'BOOKING_REQUEST').candidates
    assert.deepEqual(generated.map(c => c.exactText), ['campus', 'airport'])
    assert.equal(collectObservations(q, generated).times.length, 1)
    for (const c of generated) assert.equal(q.text.slice(c.start, c.end), c.exactText)
  }
  assert.deepEqual(generateLocationCandidates(inputFor('from campus to Gate 7 tomorrow').query, 'BOOKING_REQUEST').candidates.map(c => c.exactText), ['campus', 'Gate 7'])
  for (const unit of ['hour', 'hr', 'minute', 'min']) assert.equal(collectObservations(inputFor(`tomorrow 7 ${unit}`).query, []).times.length, 0)
  for (const text of ['tomorrow  7', '7  tomorrow', 'at  7', '7pm', 'tomorrow 7 leave in 30 minutes']) assert.equal(collectObservations(inputFor(text).query, []).times.length, 1, text)
  for (const text of ['tomorrowland gate 7', 'today unrelated 7', '7 things tomorrow']) assert.equal(collectObservations(inputFor(text).query, []).times.length, 0, text)
  for (const [suffix, kind] of [['tomorrow at 7 UTC', 'CLOCK'], ['tomorrow at 7 PM Europe/London', 'CLOCK'],
    ['tomorrow evening UTC', 'DAYPART'], ['tomorrow in the morning', 'DAYPART']]) {
    const q = inputFor(`from UTC Garden to airport ${suffix}`).query
    const candidates = generateLocationCandidates(q, 'BOOKING_REQUEST').candidates
    assert.deepEqual(candidates.map(c => c.exactText), ['UTC Garden', 'airport'])
    const observed = collectObservations(q, candidates)
    assert.equal(observed.dates.length, 1); assert.equal(observed.times.length, 1); assert.equal(observed.times[0].value.kind, kind)
    const zone = suffix.includes('Europe/London') ? 'Europe/London' : suffix.includes('UTC') ? 'UTC' : 'Asia/Kolkata'
    assert.equal(sourceTimeZone(q.text, 'Asia/Kolkata', candidates), new Intl.DateTimeFormat('en', { timeZone: zone }).resolvedOptions().timeZone)
  }
  const landmark = inputFor('from campus to Tower 7 UTC').query
  assert.deepEqual(generateLocationCandidates(landmark, 'BOOKING_REQUEST').candidates.map(c => c.exactText), ['campus', 'Tower 7 UTC'])
  assert.deepEqual(timeZoneTokens('😀 UTC Garden'), [{ start: 3, end: 6, text: 'UTC' }])
  const zonedInput = inputFor('from UTC Garden to airport tomorrow at 7 UTC')
  const zonedProvider = decisionFake([bookingRouting, request => {
    const candidates = JSON.parse(request.state).candidates
    return { ...expressionChoices(request), timing_mode: 'SCHEDULED', pickup_presence: 'PRESENT', drop_presence: 'PRESENT',
      pickup_candidate: candidates.find(c => c.exactText === 'UTC Garden').candidateId,
      drop_candidate: candidates.find(c => c.exactText === 'airport').candidateId, role_consistency: 'CONSISTENT' }
  }])
  const zoned = await createRideSearchParser(zonedProvider, clock, generateLocationCandidates).parse(zonedInput)
  assert.equal(zoned.fallbackRequired, false)
  assert.equal(zoned.temporal.scheduledAt, '2026-10-05T19:00:00.000Z')
})
