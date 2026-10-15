import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createSearchGroundingService } from '../services/search/locations/service.ts'
import { createLocationReview } from '../services/search/locations/review.ts'
import { formResolution } from '../services/search/locations/formResolution.ts'
import { createRideSearchParser } from '../services/search/parser.ts'
import { generateLocationCandidates } from '../services/search/locations/candidates.ts'
import { validateDraftProvenance } from '../services/search/provenance.ts'
import { searchPrediction } from '../benchmarks/search/prediction.js'
import { scoreSearchBenchmark } from '../benchmarks/search/metrics.js'
import { decisionFake } from '../tests/helpers/rideSearchFake.js'

assert.equal(process.argv.length, 2, 'Offline development diagnostic accepts no execution arguments')
const root = new URL('../../', import.meta.url)
const out = new URL('output/provider-light-2026-10-07/', root)
await mkdir(out, { recursive: true })
const load = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'))
const save = async (name, value) => writeFile(new URL(name, out), JSON.stringify(value, null, 2) + '\n')
const frozen = await load('docs/search/benchmark-v1/frozen-v1/dataset.json')
const records = frozen.records.filter(record => record.cohort === 'CORE' && record.split === 'DEVELOPMENT')
const byId = new Map(records.map(record => [record.id, record]))
const rows = await load('output/search-s5-authorized-development/live-development-source-any-strength-guard/rows.json')
const inputs = await load('output/search-s5-authorized-development/development-inputs.json')
assert.equal(rows.length, 131)
assert.equal(new Set(rows.map(row => row.caseId)).size, 131)
const observed = rows.map(row => ({ record: byId.get(row.caseId), prediction: searchPrediction(row.result) }))
assert.ok(observed.every(row => row.record))
const clockFor = record => ({ now: () => new Date(record.modelInput.context.clock) })
const adopted = [], rejected = [], inventionRows = []
let accidentalProviderCalls = 0
const forbidProvider = async () => { accidentalProviderCalls += 1; throw new Error('OFFLINE_PROVIDER_CALL_FORBIDDEN') }
const places = { autocomplete: forbidProvider, details: forbidProvider }
const grounding = createSearchGroundingService({ decide: forbidProvider }, places)
for (const row of rows) {
  const record = byId.get(row.caseId), parsed = row.result.parse
  try {
    const locationReview = createLocationReview(parsed, clockFor(record).now(), record.modelInput.context.timeZone)
    const resolution = formResolution(locationReview, clockFor(record))
    assert.equal(resolution.submissionAllowed, false, 'Cached interpretation alone cannot authorize submission')
    adopted.push({ caseId: row.caseId, observedStatus: row.status, submissionAllowed: resolution.submissionAllowed,
      formState: resolution.state, explicitSelectedLocations: Object.keys(locationReview.selected).length })
  } catch (error) {
    assert.equal(error.code, 'INVALID_PARSE_RESULT')
    assert.equal(parsed.fallbackRequired, true)
    rejected.push({ caseId: row.caseId, reason: error.code, fallbackReasons: parsed.fallbackReasons })
  }
  const prediction = searchPrediction(row.result)
  for (const role of ['pickup', 'drop']) {
    const expected = record.truth.expected[role + 'Spans']
    if (expected.status !== 'LABELLED' || expected.value.length || !prediction[role + 'Span']) continue
    const draft = parsed.draft, field = draft[role]
    const candidate = draft.candidates.find(candidate => candidate.candidateId === field.value.candidateId)
    assert.ok(candidate)
    assert.equal(draft.query.text.slice(candidate.start, candidate.end), candidate.exactText)
    assert.deepEqual(validateDraftProvenance(draft), [])
    const noGrounding = await grounding.groundParsed(parsed, { activeField: row.result.activeField, formRevision: row.result.formRevision })
    assert.deepEqual(noGrounding.locations, [])
    assert.equal(parsed.fallbackRequired, true)
    assert.ok(parsed.issues.some(issue => issue.code === 'ROLE_CONFLICT'))
    assert.ok(rejected.some(entry => entry.caseId === row.caseId))
    inventionRows.push({ caseId: row.caseId, query: draft.query.text,
      expectedPickupAvailable: record.truth.expected.pickupSpans.value.length > 0,
      expectedDropAvailable: record.truth.expected.dropSpans.value.length > 0,
      rawProviderOutput: parsed.providerMetadata.decisions, intermediateField: field, candidate,
      assignedRole: role, literalSourceText: draft.query.text.slice(candidate.start, candidate.end),
      literalSpanExists: true, survivesSourceValidation: true, provenanceIssues: [],
      actualRoute: parsed.route, fallbackReasons: parsed.fallbackReasons, issues: parsed.issues,
      reachesGooglePlaces: false, observedPlacesResults: row.result.locations.length,
      reachesDiagnosticBookingDraft: true, reachesAdoptedBookingDraft: false,
      reachesExplicitSelection: false, reachesBookingSubmission: false,
      survivesIntoAuthoritativeOrAdoptedUserVisibleState: false,
      primaryClassification: 'PARTIAL/INTERMEDIATE METRIC ARTIFACT',
      secondaryClassification: 'VALID SOURCE LOCATION MISCLASSIFIED BY METRIC',
      rawQualityError: 'EXISTING_PICKUP_CANDIDATE_ASSIGNED_TO_ABSENT_DROP_ROLE',
      explanation: 'Legacy inventions counts a resolved location in a gold-absent role. The text is literal, but its role is wrong. ROLE_CONFLICT blocks Places and S4 adoption. The metric is preserved as absent-role assignment; it is not evidence of fabricated geography.' })
  }
}
assert.equal(inventionRows.length, 8)
assert.equal(adopted.length, 116)
assert.equal(rejected.length, 15)
assert.equal(accidentalProviderCalls, 0)
const intermediateMetrics = scoreSearchBenchmark(observed, { diagnostic: true })
const acceptedIds = new Set(adopted.map(row => row.caseId))
const applicationMetrics = scoreSearchBenchmark(observed.filter(row => acceptedIds.has(row.record.id)), { diagnostic: true })
assert.equal(intermediateMetrics.inventions.location, 8)
assert.equal(applicationMetrics.inventions.location, 0)
const routingErrors = observed.filter(row => row.prediction.queryType !== row.record.truth.expected.queryType.value)
assert.equal(routingErrors.length, 1)
const miss = rows.find(row => row.caseId === routingErrors[0].record.id)
const record = byId.get(miss.caseId), source = inputs.find(input => input.caseId === miss.caseId)
const input = { query: { id: source.providerQueryId, revision: source.queryRevision, text: source.modelInput.query },
  timeZone: source.modelInput.context.timeZone, candidates: [] }
const invalid = decisionFake([{ query_type: 'LOCATION_SEARCH', booking_complexity: 'SIMPLE' }])
const invalidResult = await createRideSearchParser(invalid, clockFor(record), generateLocationCandidates).parse(input)
assert.ok(invalidResult.issues.some(issue => issue.code === 'JEV_SCHEMA_ERROR'))
assert.equal(invalidResult.fallbackRequired, true)
const valid = decisionFake([{ query_type: 'LOCATION_SEARCH', booking_complexity: 'NOT_APPLICABLE' },
  request => ({ location_search_candidate: Object.keys(request.questions.location_search_candidate.choices).find(id => id !== 'NONE_OR_UNCLEAR') })])
const validResult = await createRideSearchParser(valid, clockFor(record), generateLocationCandidates).parse(input)
assert.equal(validResult.route, 'LOCATION_SEARCH')
assert.equal(validResult.fallbackRequired, false)
assert.equal(validResult.draft.locationSearch.state, 'RESOLVED')
const routing = { caseId: miss.caseId, query: input.query.text, expectedQueryType: record.truth.expected.queryType.value,
  expectedRoute: 'LOCATION_SEARCH', actualQueryType: miss.result.parse.draft.queryType,
  actualRoute: miss.result.parse.route, expectedReason: 'Standalone source location with NOT_APPLICABLE booking complexity',
  actualReason: miss.result.parse.issues, rawOutput: miss.result.parse.providerMetadata.decisions,
  rootCause: 'Jev returned LOCATION_SEARCH with SIMPLE complexity, an invalid cross-question pair. Draft schema rejects it and providerFailure resets routing to UNCLEAR_OR_UNRELATED/NOT_APPLICABLE, requiring Luna fallback.',
  classification: ['JEV_OUTPUT_DEFECT', 'INTENTIONALLY_CONSERVATIVE_SCHEMA_REJECTION'],
  deterministicDefectDemonstrated: false, fixMade: false,
  rationale: 'The same standalone input succeeds with a valid pair using the existing candidate generator. Normalizing invalid provider pairs would weaken the strict contract; no benchmark-specific routing override is justified.',
  offlineInvalidPairRejected: true, offlineValidPairAccepted: true, fakeRequests: invalid.requests.length + valid.requests.length,
  realProviderCalls: 0, routingAfterDiagnostic: '130/131' }
const rawRouting = observed.map(row => {
  const decisions = rows.find(entry => entry.caseId === row.record.id).result.parse.providerMetadata.decisions[0]
  return { caseId: row.record.id, queryCorrect: decisions?.query_type?.choice === row.record.truth.expected.queryType.value,
    complexityCorrect: decisions?.booking_complexity?.choice === row.record.truth.expected.complexity.value }
})
const layers = {
  scope: 'DEVELOPMENT_CURRENT_CONFIG_CACHED_PREFIX_ONLY_NOT_FULL_222_SIGNOFF',
  legacyMetricsPreserved: true, completedSubsetMetrics: (await load('output/search-s5-authorized-development/current-development-audit.json')).completedMetrics,
  rawProviderQuality: { name: 'RAW PROVIDER QUALITY', cases: 131,
    queryTypeCorrect: rawRouting.filter(row => row.queryCorrect).length,
    complexityCorrect: rawRouting.filter(row => row.complexityCorrect).length,
    wrongAbsentLocationRoles: 8, fabricatedLocationTextAmongEight: 0, inconsistentRoutingPairs: 1,
    rawDecisions: 'Each cached providerMetadata.decisions batch is retained; failed/incomplete SDK requests remain in the current audit (3/261).',
    fieldLimit: 'Raw choices are categorical IDs, not complete normalized date/vehicle/missing-field outputs. Those normalized benchmark metrics belong to the intermediate layer; no raw full-field accuracy is inferred.' },
  intermediateValidatedInterpretation: { name: 'INTERMEDIATE VALIDATED INTERPRETATION',
    meaning: 'Source/schema-bound diagnostic drafts, including drafts rejected for fallback. Source validity alone does not establish correct roles or adoption.',
    metrics: intermediateMetrics, absentRoleAssignments: intermediateMetrics.inventions.location,
    fallbackRejectedCases: rejected, sourceBypassObserved: 0 },
  finalApplicationSafeOutput: { name: 'FINAL APPLICATION-SAFE OUTPUT',
    meaning: 'Offline S4 adoption probe of cached interpretations. 116 adoptable: 113 completed interpretations, 1 Places-blocked, 2 unresolved standalone candidates. 15 rejected. Adoptable incomplete drafts retain missing requirements; none authorizes submission. This is not full-system completion.',
    metrics: applicationMetrics, adoption: adopted, rejectedCases: rejected.length,
    authoritativeInventedGroundedLocationsObserved: 0, explicitSelectionsInProbe: 0, allowedSubmissionsInProbe: 0,
    selectedGoogleCanonicalIdSafety: 'NOT_LIVE_EVALUATED; existing regression evidence only',
    fullSystemSignoff: false },
  definitions: {
    locations: 'Raw selected candidate in an absent role remains a provider error. Intermediate absent-role assignment retains legacy count. Final error requires invalid adoption/grounding or submission; rejected diagnostics are counted as blocked, never as correct completions.',
    conflictingTimes: 'Raw temporal choices and failures are retained; intermediate ambiguous/component outputs and TEMPORAL_CONFLICT are measured. Final error means conflicting time silently resolved in an adopted draft.',
    conflictingVehicles: 'Raw class/strength/ANY/exclusion choices are retained; source-binding rejects and intermediate ambiguity are separate. Final error means an unsupported or conflicting preference silently adopted.',
    unsupportedIntent: 'Raw unsupported-service choice is retained. Intermediate unsupportedRequests recall and issue preservation are measured. Final loss means adopted state or submission silently discards supported evidence of unsupported intent.',
    roleReversal: 'Compare source-owned pickup/drop spans with frozen role labels. Report raw candidate assignment, intermediate reversal count and adopted reversal count separately.',
    missingFields: 'Mandatory requirements derive from deterministic policy, not provider guesses. Report intermediate and adopted requirement recall/false positives; raw choice accuracy is not a missing-fields metric.',
    candidateSpans: 'Exact UTF-16 offsets, candidate IDs, source query ownership and revision are required at every stage. Literal validity is distinct from correct span/role and canonical selected-place validity.' },
  calls: { Places: 0, Luna: 0, Jev: 0, heldOut: 0 }, directlyInvalidatedProviderCacheEntries: 0,
  parserCodeChanged: false, datasetLabelsChanged: false, executionContractFrozen: false }
const summary = { cases: 8, trueFinalSystemInventions: 0, rawFabricationsCaught: 0,
  metricArtifacts: 8, other: 0, rawWrongRoleErrors: 8, authoritativeStateSafetyViolations: 0,
  inventionCanReachAuthoritativeState: false, noClaimsAboutCompletedLunaRecovery: true }
await save('search-eight-locations.json', { summary, rows: inventionRows })
await save('search-routing-miss.json', routing)
await save('search-metric-layers.json', layers)
await writeFile(new URL('docs/search/search-provider-light-diagnostics.md', root), [
  '# Search provider-light diagnostics — 7 October 2026', '',
  'Development only. No provider calls, new retries, labels/split changes, parser changes or cache invalidations.', '',
  '## Eight apparent location inventions', '',
  'All eight are existing source pickup locations assigned to an absent drop role. Keep eight raw wrong-role failures and the legacy intermediate count. Fabricated geography among these eight: 0; authoritative-state violations: 0. Diagnostic BookingDraft contains the wrong role; ROLE_CONFLICT prevents Places and S4 form adoption.', '',
  '| Case | Query | Candidate span/text | Literal/source-valid | Places | Diagnostic/adopted draft | Selection/submission | Classification |',
  '|---|---|---|---|---|---|---|---|',
  ...inventionRows.map(row => `| ${row.caseId} | ${row.query} | ${row.candidate.start}..${row.candidate.end}: ${row.candidate.exactText} | YES/YES | NO | YES/NO | NO/NO | Intermediate artifact; raw wrong role |`), '',
  'Per-case raw decisions, confidence, candidate provenance, expected roles, validation and authority paths are in output/provider-light-2026-10-07/search-eight-locations.json.', '',
  '## Remaining routing miss', '', `${routing.caseId}: ${routing.query}. ${routing.rootCause}`, '',
  'Offline fake replay reproduces rejection and confirms the valid pair succeeds. No generalized parser defect was demonstrated. No code override is made; current interpreted query-type accuracy stays 130/131. Raw provider query-type accuracy is ' + layers.rawProviderQuality.queryTypeCorrect + '/131; raw complexity accuracy is ' + layers.rawProviderQuality.complexityCorrect + '/131.', '',
  '## Metric layers', '',
  ...Object.entries(layers.definitions).map(([name, text]) => `- **${name}:** ${text}`), '',
  'All 131 cached attempts stay in the intermediate report. S4 adoption accepts 116 and rejects 15; the 116 include one incomplete Places case and two unresolved standalone candidates. They retain missing requirements and cannot authorize submission. Adoption-probe selected locations/submissions: 0. Full 222-case and selected canonical-place safety are unmeasured. Completed subset remains 113. Caught failures remain errors and pending work.', '',
].join('\n'))
console.log(JSON.stringify({ summary, routing: routing.caseId, rawRouting: layers.rawProviderQuality,
  intermediateQueryType: intermediateMetrics.fields.queryType, adopted: adopted.length, rejected: rejected.length,
  applicationInventions: applicationMetrics.inventions, accidentalProviderCalls }))
