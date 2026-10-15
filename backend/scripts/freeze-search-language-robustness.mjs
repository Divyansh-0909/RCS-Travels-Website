import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'

assert.equal(process.argv.length, 2, 'Label preparation only; no model execution')
const root = new URL('../../', import.meta.url)
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const load = async file => JSON.parse(await readFile(new URL(file, root), 'utf8'))
const original = await load('docs/search/benchmark-v1/exploratory-unscored.json')
const frozenV1 = await load('docs/search/benchmark-v1/frozen-v1/dataset.json')
assert.equal(original.length, 40)
const unspecified = 'UNSPECIFIED'
const tomorrow = { kind: 'RELATIVE', anchor: 'TOMORROW', interpretedDate: '2026-10-05' }
const clock = (hour, period = 'PM', precision = 'EXACT', minute = null) => ({ kind: 'CLOCK', hour, minute,
  sourcePeriod: period, effectivePeriod: period ?? 'PM', notation: 'H12', precision,
  omittedMinutePolicy: minute === null ? 'PRESERVE_COMPONENT_ABSENCE_THEN_SHARED_TEMPORAL_POLICY' : 'EXPLICIT_MINUTE' })
const daypart = value => ({ kind: 'DAYPART', value, exactClockMustRemainUnspecified: true })
const vehicle = (value, strength = 'REQUIRED', excluded = []) => ({ state: 'RESOLVED', value, strength, excluded })
const any = { state: 'EXPLICIT_ANY', excluded: [] }
const negative = excluded => ({ state: 'EXCLUDED', excluded })
const base = (pickup = null, drop = null, more = {}) => ({ pickup, drop, ...more })
// Reviewed semantic expectations. These are author-written labels, never model outputs.
const existingSpecs = [
  base('campus', 'delta 2', { date: tomorrow, time: clock(6, null) }),
  base('campus', 'pari chowk'), base('metro', 'hostel', { date: tomorrow }),
  base(null, 'airport', { time: daypart('MORNING') }), base('sector 18', 'market', { timingMode: 'IMMEDIATE' }),
  base(null, null, { date: tomorrow, time: clock(7, null) }),
  base(null, null, { vehicle: vehicle('suv', 'REQUIRED', ['sedan']) }), base('station', 'lakeview hostel'),
  base('campus', 'museum road', { stops: ['market'] }), base('delta 2', null, { returnIntent: true }),
  base(null, null, { rental: true }), base(null, null, { ac: true, conditions: ['AC_IF_AVAILABLE_SOFT'], softAc: true }),
  base('hostel', 'gate 3', { timingMode: 'IMMEDIATE' }),
  base(null, null, { date: { state: 'AMBIGUOUS', alternatives: ['2026-10-05', '2026-10-06'] }, time: daypart('MORNING'), conflicts: ['DATE_ALTERNATIVE'] }),
  base('north library', 'central station'), base('airport', 'campus', { time: clock(8) }),
  base('sector 6', null, { conflicts: ['NEGATED_DESTINATION_WITHOUT_REPLACEMENT'], superseded: ['sector 6'], supersededOccurrence: 1 }),
  base(), base(null, null, { date: tomorrow, changedMind: true, supersededTemporal: ['IMMEDIATE'] }), base('mall', 'clinic'),
  base(null, null, { queryType: 'LOCATION_SEARCH', locationSearch: 'परी चौक' }),
  base('कॉलेज', 'एयरपोर्ट', { date: tomorrow, time: clock(6), daypartContext: 'EVENING' }),
  base(null, null, { timingMode: 'IMMEDIATE' }), base(null, null, { vehicle: negative(['sedan']) }),
  base('डेल्टा 1', 'डेल्टा 2'), base(null, null, { time: daypart('MORNING') }),
  base(null, null, { passengers: 3, queryType: 'BOOKING_REQUEST', riderFormContextAssumption: 'PASSENGER_COUNT_ONLY_IS_RIDE_FORM_INPUT' }),
  base(null, null, { date: { kind: 'WEEKDAY', weekday: 'FRIDAY', qualifier: 'NEXT', interpretedDate: '2026-10-09' } }),
  base(null, null, { ac: true }), base(null, null, { stops: [], unnamedStop: true }),
  base(null, null, { vehicle: any }), base('campus', null, { date: tomorrow, vehicle: vehicle('suv') }),
  base('hostel', 'airport'), base(null, 'Delhi', { date: { kind: 'ABSOLUTE', day: 5, month: 12, sourceYear: null, interpretedDate: '2026-12-05' } }),
  base(null, null, { date: { state: 'AMBIGUOUS', alternatives: ['NEXT_FRIDAY', 'SATURDAY_QUALIFIER_UNCLEAR'] }, conflicts: ['DATE_ALTERNATIVE'] }),
  base(null, null, { returnIntent: true, time: daypart('EVENING') }),
  base('campus', 'delta 2', { changedMind: true, superseded: ['pari chowk'] }),
  base(null, null, { flags: { preferSafeRoute: true } }), base(null, null, { flags: { needsCarrier: true } }),
  base(null, null, { flags: { sharing: false } }),
]
assert.equal(existingSpecs.length, 40)
const additions = [
  ['HINDI', 'कृपया कल सुबह 7 बजे पुस्तकालय से अस्पताल तक सेडान भेजिए', base('पुस्तकालय', 'अस्पताल', { date: tomorrow, time: clock(7, 'AM'), vehicle: vehicle('sedan'), prefix: 'POLITE' })],
  ['HINDI', 'मुझे शाम को परी चौक से छात्रावास जाना है', base('परी चौक', 'छात्रावास', { time: daypart('EVENING') })],
  ['HINDI', 'अल्फा 2 नहीं, असल में बीटा 1 जाना है कैंपस से', base('कैंपस', 'बीटा 1', { changedMind: true, superseded: ['अल्फा 2'], roleOrder: 'DROP_BEFORE_PICKUP' })],
  ['HINDI', 'एसयूवी नहीं चाहिए, सेडान मिले तो ठीक है', base(null, null, { vehicle: vehicle('sedan', 'PREFERRED', ['suv', 'suv_premium']), conditions: ['VEHICLE_AVAILABILITY_PREFERENCE'] })],
  ['HINDI', 'कल कैंपस से डेल्टा 2 जाना है, रात को वापसी भी हो सकती है', base('कैंपस', 'डेल्टा 2', { date: tomorrow, returnIntent: true, conditions: ['UNCERTAIN_RETURN'], uncertainty: true })],
  ['HINDI', 'परी चौक से स्टेशन जाना है और बीच में बाजार रुकना है', base('परी चौक', 'स्टेशन', { stops: ['बाजार'] })],
  ['HINDI', 'चार घंटे के लिए गाड़ी किराये पर चाहिए', base(null, null, { rental: true, rentalDuration: '4_HOURS' })],
  ['HINDI', 'अगर बारिश हुई तो एयरपोर्ट, नहीं तो स्टेशन; घर से चलेंगे', base('घर', null, { conditions: ['CONDITIONAL_DESTINATIONS'], destinationAlternatives: ['एयरपोर्ट', 'स्टेशन'] })],
  ['HINDI', 'आज शाम 5 बजे या 6 बजे होटल से मॉल जाना है', base('होटल', 'मॉल', { date: { kind: 'RELATIVE', anchor: 'TODAY', interpretedDate: '2026-10-04' }, time: { state: 'AMBIGUOUS', alternatives: [clock(5), clock(6)] }, conflicts: ['TIME_ALTERNATIVE'] })],
  ['HINDI', 'कल सुबह करीब साढ़े आठ बजे क्लिनिक से कॉलेज', base('क्लिनिक', 'कॉलेज', { date: tomorrow, time: clock(8, 'AM', 'APPROXIMATE', 30) })],
  ['HINDI', 'इस शुक्रवार शाम सात बजे गेट 3 से संग्रहालय', base('गेट 3', 'संग्रहालय', { date: { kind: 'WEEKDAY', weekday: 'FRIDAY', qualifier: 'THIS', interpretedDate: '2026-10-02', schedulingOutcome: 'PAST_REQUIRES_RESOLUTION' }, time: clock(7) })],
  ['HINDI', 'सोमवार रात 9 बजे झील रोड से सिटी सेंटर जाना है', base('झील रोड', 'सिटी सेंटर', { date: { kind: 'WEEKDAY', weekday: 'MONDAY', qualifier: 'BARE', interpretedDate: '2026-10-05' }, time: clock(9) })],
  ['HINDI', '5 दिसंबर को सुबह 10 बजे दिल्ली से नोएडा', base('दिल्ली', 'नोएडा', { date: { kind: 'ABSOLUTE', day: 5, month: 12, sourceYear: null, interpretedDate: '2026-12-05' }, time: clock(10, 'AM') })],
  ['HINDI', 'कल सेडान चाहिए, स्टेशन से होटल; हम तीन लोग हैं', base('स्टेशन', 'होटल', { date: tomorrow, vehicle: vehicle('sedan'), passengers: 3 })],
  ['HINDI', 'हवाई अड्डे से घर जाना है, सामान के लिए कैरियर चाहिए', base('हवाई अड्डे', 'घर', { flags: { needsCarrier: true } })],
  ['HINDI', 'अभी अस्पताल से घर, साझा कैब नहीं चाहिए', base('अस्पताल', 'घर', { timingMode: 'IMMEDIATE', flags: { sharing: false } })],
  ['HINDI', 'कल ऑफिस से घर ले चलो, सुरक्षित रास्ता लेना', base('ऑफिस', 'घर', { date: tomorrow, flags: { preferSafeRoute: true } })],
  ['HINDI', 'सुबह 7 बजे लंदन के समय पर एयरपोर्ट से होटल जाना है', base('एयरपोर्ट', 'होटल', { time: clock(7, 'AM'), timeZone: 'Europe/London', sourceZoneText: 'लंदन के समय', schedulingDateRequired: true })],
  ['HINDI', 'कल छात्रावास से स्टेशन तक कोई भी गाड़ी चलेगी', base('छात्रावास', 'स्टेशन', { date: tomorrow, vehicle: any })],
  ['HINDI', 'कल शाम नोएडा से दिल्ली चलना है, शायद', base('नोएडा', 'दिल्ली', { date: tomorrow, time: daypart('EVENING'), uncertainty: true })],
  ['ROMANIZED_HINDI', 'kripya kal saat baje pustakalaya se aspatal jaana hai', base('pustakalaya', 'aspatal', { date: tomorrow, time: clock(7, null), prefix: 'POLITE', noise: 'SPELLED_NUMBER' })],
  ['ROMANIZED_HINDI', 'mujhe shaam ko pari chowk se hostel gaadi chahiye', base('pari chowk', 'hostel', { time: daypart('EVENING') })],
  ['ROMANIZED_HINDI', 'beta 1 jaana hai alpha 2 se, subah 9 baje', base('alpha 2', 'beta 1', { time: clock(9, 'AM'), roleOrder: 'DROP_BEFORE_PICKUP' })],
  ['ROMANIZED_HINDI', 'kal campus se delta 2, par station par dost ko lena hai', base('campus', 'delta 2', { date: tomorrow, stops: ['station'] })],
  ['ROMANIZED_HINDI', 'gaadi teen ghante ke liye kiraye par chahiye', base(null, null, { rental: true, rentalDuration: '3_HOURS' })],
  ['ROMANIZED_HINDI', 'abhi nhi, parso college se bazaar jana h', base('college', 'bazaar', { date: { kind: 'RELATIVE', anchor: 'DAY_AFTER_TOMORROW', interpretedDate: '2026-10-06' }, changedMind: true, supersededTemporal: ['IMMEDIATE'], noise: 'SPELLING' })],
  ['ROMANIZED_HINDI', 'kal kareeb 6:30 baje clinic se ghar', base('clinic', 'ghar', { date: tomorrow, time: clock(6, null, 'APPROXIMATE', 30) })],
  ['ROMANIZED_HINDI', 'agar dost aaya toh mall warna airport, hostel se', base('hostel', null, { destinationAlternatives: ['mall', 'airport'], conditions: ['CONDITIONAL_DESTINATIONS'] })],
  ['ROMANIZED_HINDI', 'kal raat station se ghar, wapas bhi aana hai', base('station', 'ghar', { date: tomorrow, time: daypart('NIGHT'), returnIntent: true })],
  ['ROMANIZED_HINDI', 'sedan mat bhejna, koi aur gaadi chalegi campus se ghar', base('campus', 'ghar', { vehicle: { state: 'EXPLICIT_ANY', excluded: ['sedan'] } })],
  ['HINGLISH', 'Please: kal 7 baje campus se delta 2 jaana hai', base('campus', 'delta 2', { date: tomorrow, time: clock(7, null), prefix: 'POLITE' })],
  ['HINGLISH', 'actually alpha 2 nahi, beta 1 jaana hai from campus', base('campus', 'beta 1', { changedMind: true, superseded: ['alpha 2'] })],
  ['HINGLISH', 'SUV nahi chahiye, sedan mile toh theek hai from office to hotel', base('office', 'hotel', { vehicle: vehicle('sedan', 'PREFERRED', ['suv', 'suv_premium']), conditions: ['VEHICLE_AVAILABILITY_PREFERENCE'] })],
  ['HINGLISH', 'kal evening campus se delta 2 jaana hai, exact time abhi nahi pata', base('campus', 'delta 2', { date: tomorrow, time: daypart('EVENING'), uncertainty: true })],
  ['HINGLISH', 'Delta 2 jaana hai campus se tomorrow at 8 PM', base('campus', 'Delta 2', { date: tomorrow, time: clock(8), roleOrder: 'DROP_BEFORE_PICKUP' })],
  ['HINGLISH', 'kal campus se airport, return raat ko ho sakta hai', base('campus', 'airport', { date: tomorrow, returnIntent: true, conditions: ['UNCERTAIN_RETURN'], uncertainty: true })],
  ['HINGLISH', 'airport se hotel tomorrow 6 PM London time', base('airport', 'hotel', { date: tomorrow, time: clock(6), timeZone: 'Europe/London', sourceZoneText: 'London time', interpretedIST: '2026-10-05T22:30:00+05:30' })],
  ['HINGLISH', 'cab chahiye frm campus to clinc kal approx 5 pm', base('campus', 'clinc', { date: tomorrow, time: clock(5, 'PM', 'APPROXIMATE'), noise: 'SPELLING_PRESERVE_PROPER_NOUN_NO_AUTOCORRECTION' })],
  ['HINGLISH', 'tomorrow 7 PM ya 8 PM, mall ya clinic from hostel', base('hostel', null, { date: tomorrow, time: { state: 'AMBIGUOUS', alternatives: [clock(7), clock(8)] }, destinationAlternatives: ['mall', 'clinic'], conflicts: ['TIME_ALTERNATIVE', 'DESTINATION_ALTERNATIVE'] })],
  ['HINGLISH', 'tomorrow campus to hostel, AC if available aur 3 passengers', base('campus', 'hostel', { date: tomorrow, ac: true, softAc: true, conditions: ['AC_IF_AVAILABLE_SOFT'], passengers: 3 })],
]
assert.equal(additions.length, 40)
function span(text, literal, occurrence = 0) {
  if (literal === null) return []
  let start = -1
  for (let index = 0; index <= occurrence; index += 1) start = text.indexOf(literal, start + 1)
  assert.ok(start >= 0, 'Every geography label must be literally source-owned: ' + literal)
  return [{ start, end: start + literal.length, exactText: literal }]
}
function unsupportedKinds(spec) {
  return [...(spec.stops || spec.unnamedStop ? ['STOP'] : []), ...(spec.returnIntent ? ['RETURN_JOURNEY'] : []),
    ...(spec.rental ? ['RENTAL'] : []), ...(spec.ac ? ['AC_PREFERENCE'] : []), ...(spec.conditions ? ['CONDITIONAL_PREFERENCE'] : []),
    ...(spec.passengers ? ['PASSENGER_COUNT'] : [])]
}
function missingRequirements(spec, queryType, timingMode, date, time) {
  return queryType !== 'BOOKING_REQUEST' ? [] : [
    ...(!spec.pickup ? ['pickup'] : []), ...(!spec.drop ? ['drop'] : []), ...(!spec.vehicle || spec.vehicle.state !== 'RESOLVED' ? ['vehicleClass'] : []),
    ...(timingMode === 'UNSPECIFIED' ? ['timing'] : []),
    ...(timingMode === 'SCHEDULED' && date === unspecified ? ['timing.date'] : []),
    ...(timingMode === 'SCHEDULED' && time === unspecified ? ['timing.time'] : []),
  ]
}
function resolutionRequirements(spec, queryType, time, missing, unsupported) {
  return [...missing, ...(spec.pickup ? ['GROUND_PICKUP_EXPLICIT_SELECTION'] : []), ...(spec.drop ? ['GROUND_DROP_EXPLICIT_SELECTION'] : []),
    ...(time.kind === 'DAYPART' ? ['EXACT_TIME_REQUIRED'] : []), ...(spec.vehicle?.strength === 'PREFERRED' ? ['CONFIRM_VEHICLE'] : []),
    ...(spec.conflicts ?? []).map(name => 'RESOLVE_' + name), ...(spec.destinationAlternatives ? ['RESOLVE_DESTINATION_ALTERNATIVE'] : []),
    ...unsupported.filter(kind => !['PASSENGER_COUNT'].includes(kind) && !(spec.softAc && ['AC_PREFERENCE', 'CONDITIONAL_PREFERENCE'].includes(kind))).map(kind => 'RESOLVE_UNSUPPORTED_' + kind),
    ...(spec.date?.schedulingOutcome === 'PAST_REQUIRES_RESOLUTION' ? ['DATE_SCHEDULING_INVALID'] : []),
    ...(queryType === 'LOCATION_SEARCH' ? ['CHOOSE_LOCATION_TARGET'] : [])]
}
function coreLabels(text, spec, queryType, complexity, date, time, timingMode) {
  return { queryType, complexity, pickupSpans: span(text, spec.pickup), dropSpans: span(text, spec.drop),
    locationSearchSpans: span(text, spec.locationSearch ?? null), date, relativeDate: date.kind === 'RELATIVE' ? date.anchor : unspecified,
    weekday: date.kind === 'WEEKDAY' ? { weekday: date.weekday, qualifier: date.qualifier } : unspecified,
    time, timingMode, daypart: time.kind === 'DAYPART' ? time.value : spec.daypartContext ?? unspecified,
    timeZone: { default: 'Asia/Kolkata', sourceZone: spec.timeZone ?? null, sourceText: spec.sourceZoneText ?? null, interpretedIST: spec.interpretedIST ?? null },
    vehicle: spec.vehicle ?? { state: 'UNSPECIFIED' }, vehicleExclusions: spec.vehicle?.excluded ?? [], passengers: spec.passengers ?? unspecified,
    flags: Object.fromEntries(['sharing', 'isOutstation', 'preferSafeRoute', 'needsCarrier'].map(name => [name, spec.flags?.[name] ?? unspecified])) }
}
function journeyLabels(text, spec) {
  return {
    changedMind: Boolean(spec.changedMind), supersededLocationSpans: (spec.superseded ?? []).flatMap(literal => span(text, literal, spec.supersededOccurrence ?? 0)),
    supersededTemporal: spec.supersededTemporal ?? [], conflicts: spec.conflicts ?? [], uncertainty: Boolean(spec.uncertainty),
    returnIntent: Boolean(spec.returnIntent), stops: (spec.stops ?? []).flatMap(literal => span(text, literal)), unnamedStop: Boolean(spec.unnamedStop),
    rentalIntent: Boolean(spec.rental), rentalDuration: spec.rentalDuration ?? unspecified,
    conditionalAlternatives: spec.conditions ?? [], destinationAlternatives: (spec.destinationAlternatives ?? []).flatMap(literal => span(text, literal)) }
}
function reviewMetadata(spec) {
  return { roleOrder: spec.roleOrder ?? 'SOURCE_MARKERS', prefix: spec.prefix ?? unspecified, noise: spec.noise ?? unspecified,
    semanticReviewNotes: spec.riderFormContextAssumption ? [spec.riderFormContextAssumption] : [] }
}
function reviewedLabel(text, spec) {
  const queryType = spec.queryType ?? 'BOOKING_REQUEST'
  const complex = Boolean(spec.stops || spec.unnamedStop || spec.returnIntent || spec.rental || spec.conditions || spec.conflicts || spec.changedMind || spec.destinationAlternatives)
  const date = spec.date ?? unspecified, time = spec.time ?? unspecified
  const timingMode = spec.timingMode ?? (date !== unspecified || time !== unspecified ? 'SCHEDULED' : 'UNSPECIFIED')
  const complexity = queryType === 'LOCATION_SEARCH' ? 'NOT_APPLICABLE' : complex ? 'COMPLEX' : 'SIMPLE'
  const unsupported = unsupportedKinds(spec)
  const missing = missingRequirements(spec, queryType, timingMode, date, time)
  const requirements = resolutionRequirements(spec, queryType, time, missing, unsupported)
  return { ...coreLabels(text, spec, queryType, complexity, date, time, timingMode), ...journeyLabels(text, spec),
    missingFields: missing, unsupportedRequests: unsupported, plannedFeatureIntent: spec.stops || spec.unnamedStop ? ['MULTI_STOP'] : [],
    fallbackExpectation: complex ? 'REQUIRED_COMPLEX_SEMANTICS' : 'CONDITIONAL_ON_RUNTIME_CANDIDATE_OR_ROLE_FAILURE',
    missingAloneMustNotTriggerLuna: true, formResolutionRequirements: [...new Set(requirements)],
    universalSubmissionGates: ['TRUSTED_GROUNDED_ENDPOINTS', 'VALID_SCHEDULE_OR_IMMEDIATE', 'ACTUAL_VEHICLE_SELECTION', 'SUPPORTED_RESOLVED_JOURNEY', 'FARE_ROUTE_RECOMPUTED', 'EXPLICIT_LOCATION_REVIEW', 'EXPLICIT_FINAL_REVIEW'],
    ...reviewMetadata(spec),
  }
}
const corpus = original.map((row, index) => ({ id: 'hh-v1-seed-' + String(index + 1).padStart(3, '0'),
  originId: row.id, query: row.modelInput.query, language: index < 20 ? 'ROMANIZED_HINDI' : index < 30 ? 'HINDI' : 'HINGLISH', spec: existingSpecs[index] }))
  .concat(additions.map(([language, query, spec], index) => ({ id: 'hh-v1-added-' + String(index + 1).padStart(3, '0'), originId: null, language, query, spec })))
function semanticCategory(spec) {
  const priorities = [
    [spec.stops || spec.unnamedStop, 'STOP'], [spec.returnIntent, 'RETURN'], [spec.rental, 'RENTAL'],
    [spec.destinationAlternatives, 'CONDITIONAL_DESTINATION'], [spec.changedMind, 'CORRECTION'], [spec.conflicts, 'CONFLICT'],
    [spec.vehicle, 'VEHICLE_' + spec.vehicle?.state], [spec.date?.kind === 'WEEKDAY', 'WEEKDAY_' + spec.date?.qualifier],
    [spec.timeZone, 'TIMEZONE'], [spec.time?.kind === 'DAYPART', 'DAYPART'], [spec.passengers, 'PASSENGERS'],
    [spec.flags, 'FLAGS_' + Object.keys(spec.flags ?? {}).join('_')],
  ]
  return priorities.find(([matches]) => Boolean(matches))?.[1] ?? 'BASE_RIDE'
}
const semanticFamily = spec => [spec.queryType ?? 'BOOKING_REQUEST', semanticCategory(spec),
  spec.date?.kind ?? 'NO_DATE', spec.time?.kind ?? 'NO_TIME'].join(':')
const records = corpus.map(({ id, originId, language, query, spec }) => ({ id, originId, language,
  semanticFamily: semanticFamily(spec), split: 'FROZEN_ROBUSTNESS_SUITE',
  modelInput: { query, context: { clock: '2026-10-04T12:00:00+05:30', timeZone: 'Asia/Kolkata', activeField: null, capabilityVersion: 'ride-search-s4' } },
  truth: { status: 'REVIEWED_FROZEN', reviewer: 'CODEX_AGENT_SEMANTIC_REVIEW_NOT_HUMAN_FINAL',
    reviewedOn: '2026-10-08', labelsFromProviderOutput: false, expected: reviewedLabel(query, spec) } }))
assert.equal(records.length, 80)
assert.equal(new Set(records.map(row => row.modelInput.query.normalize('NFC').trim().toLocaleLowerCase('hi'))).size, 80)
assert.ok(records.every(row => row.truth.expected.pickupSpans.concat(row.truth.expected.dropSpans, row.truth.expected.stops,
  row.truth.expected.destinationAlternatives, row.truth.expected.supersededLocationSpans).every(span => row.modelInput.query.slice(span.start, span.end) === span.exactText)))
const languageCounts = Object.fromEntries(['HINDI', 'ROMANIZED_HINDI', 'HINGLISH'].map(language => [language, records.filter(row => row.language === language).length]))
const dataset = { version: 'search-hindi-hinglish-robustness-v1', schemaVersion: 'multilingual-semantic-labels-v1',
  scope: 'ADDITIONAL_ROLLOUT_READINESS_BENCHMARK_NOT_SEARCH_V1', frozenOn: '2026-10-08',
  baselineArchitecture: 'RAW_ORIGINAL_QUERY_CURRENT_JEV_PLUS_ELIGIBLE_LUNA_NO_TRANSLATION_NO_NORMALIZATION',
  frozenBeforeAnyScoredOutput: true, scoredProviderCalls: 0, cases: 80, originalExploratoryCases: 40, expandedCases: 40,
  languageCounts, semanticFamilyCount: new Set(records.map(row => row.semanticFamily)).size,
  independence: 'Frozen robustness suite, not an independent statistical held-out. Eighty purposeful synthetic inputs spanning overlapping language/policy families do not establish population representativeness. Original 40 were previously exposed as exploratory inputs; their old index-modulo family IDs are not meaningful semantic families.',
  split: 'FROZEN_ROBUSTNESS_SUITE_NO_INDEPENDENT_HELD_OUT_CLAIM',
  originalCorpusHash: hash(original), SearchV1DatasetHash: frozenV1.datasetHash, SearchV1SplitHash: frozenV1.splitHash,
  SearchV1Unmodified: true, reviewerIsNotHumanOwner: true, modelOutputsNeverBecomeTruth: true,
  fieldScoring: 'Score each semantic expectation and literal UTF-16 span, preserving raw/intermediate/authoritative layers. UNRECOGNIZED, wrong role, wrong component and missing values are errors against frozen labels; policy form requirements are not conversational prompts.',
  languageTagDefinition: 'Romanized Hindi may contain borrowed ride nouns and proper English place names. Hinglish uses explicit English functional clauses/preferences; language tags describe script/style buckets, not a claim of monolingual vocabulary.',
  adversarialRequirements: ['NEGATION_PRESERVED', 'ALTERNATIVES_UNRESOLVED', 'UNCERTAINTY_NOT_CERTAINTY', 'CORRECTED_DESTINATION_NOT_SUPERSEDED',
    'DAYPART_NOT_EXACT_CLOCK', 'PROPER_NOUNS_SOURCE_OWNED', 'MULTI_STOP_PLANNED_NOT_IMPLEMENTED', 'ORIGINAL_QUERY_AUTHORITATIVE'],
  normalizationExperimentTrigger: 'Only after raw baseline demonstrates a material language-specific deficit against diagnostic English semantic pairs; current requirement UNDECIDED.',
  records }
dataset.datasetHash = hash(dataset)
const out = new URL('docs/search/hindi-hinglish-robustness-v1/', root)
await mkdir(out, { recursive: true })
const file = new URL('dataset.json', out)
try {
  const prior = JSON.parse(await readFile(file, 'utf8'))
  assert.deepEqual(prior, dataset, 'Frozen labels cannot silently change after preparation')
} catch (error) {
  if (error.code !== 'ENOENT') throw error
  await writeFile(file, JSON.stringify(dataset, null, 2) + '\n', { flag: 'wx' })
}
await writeFile(new URL('review.md', out), [
  '# Hindi/Hinglish robustness labels v1', '',
  `Dataset frozen before scoring. Cases 80: 40 original + 40 additions. Language buckets: Hindi ${languageCounts.HINDI}, Romanized Hindi ${languageCounts.ROMANIZED_HINDI}, Hinglish ${languageCounts.HINGLISH}. Semantic families ${dataset.semanticFamilyCount}. Hash: \`${dataset.datasetHash}\`.`, '',
  'Agent-reviewed semantic labels; no claim of human-final linguistic calibration. Existing owner rules govern PM default, week qualifiers, omitted years, exclusions, source ownership and form resolution. Original input remains authoritative; no translation/normalization is added. No model outputs informed labels.', '',
  'This is a separately versioned frozen robustness suite, not an independent statistical held-out. The old exploratory family IDs cycle by position, so new family grouping is based on reviewed semantics. Exact duplicates 0; repeated policy families are disclosed, not counted as independent empirical evidence. Search Benchmark V1 remains unchanged.', '',
  'Label-boundary decisions: prospective kal in a ride request means tomorrow; parso with prospective ride wording means day after tomorrow. Bare Hindi/Romanized hours follow owner PM default; subah/shaam override period. Alone “तीन लोग हैं” is labeled ride-form passenger context, with all mandatory ride fields missing; this assumption is explicit. A negated destination without replacement stays unresolved. Source spellings/proper nouns are not autocorrected. THIS Friday under the controlled Sunday clock preserves a past extracted date and requires scheduling resolution.', '',
  '| Case | Language | Query | Type/complexity | Pickup | Drop | Timing | Vehicle | Intent/required resolution |',
  '|---|---|---|---|---|---|---|---|---|',
  ...records.map(row => { const e = row.truth.expected; return `| ${row.id} | ${row.language} | ${row.modelInput.query} | ${e.queryType}/${e.complexity} | ${e.pickupSpans.map(span => span.exactText).join('; ') || 'missing'} | ${e.dropSpans.map(span => span.exactText).join('; ') || 'missing'} | ${e.timingMode}; ${JSON.stringify(e.date)}; ${JSON.stringify(e.time)} | ${JSON.stringify(e.vehicle)} | ${e.formResolutionRequirements.join('; ')} |` }), '',
  'All remaining requested label fields (relative date, weekday, daypart, timezone, passengers, flags, corrections, superseded spans, conflicts, return/stops/rental, conditions, missing requirements, fallback) are explicit per record in dataset.json. Baseline NOT RUN. Language deficit UNKNOWN. Normalization UNDECIDED; experiment NOT RUN. Authoritative safety UNMEASURED. Rollout readiness NO.', '',
].join('\n'))
console.log(JSON.stringify({ datasetHash: dataset.datasetHash, cases: 80, languageCounts,
  semanticFamilies: dataset.semanticFamilyCount, exactDuplicates: 0, scoredCalls: 0, SearchV1Changed: false, baseline: 'NOT_RUN' }))
