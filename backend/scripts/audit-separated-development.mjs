import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { benchmarkCacheKey } from '../benchmarks/common/cache.js'
import { frozenSearchDevelopment } from '../benchmarks/search/freeze.js'
import { searchPrediction } from '../benchmarks/search/prediction.js'
import { scoreSearchBenchmark } from '../benchmarks/search/metrics.js'
import { validateDraftProvenance } from '../services/search/provenance.ts'
import { createLocationReview } from '../services/search/locations/review.ts'
import { formResolution } from '../services/search/locations/formResolution.ts'
import { createTestClock } from '../tests/helpers/testClock.js'

assert.equal(process.argv.length, 2, 'Offline development audit only')
const root = new URL('../../', import.meta.url)
const out = new URL('output/provider-resume-2026-10-07/', root)
const load = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'))
const save = (name, value) => writeFile(new URL(name, out), JSON.stringify(value, null, 2) + '\n')
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const frozen = await load('docs/search/benchmark-v1/frozen-v1/dataset.json')
const records = frozenSearchDevelopment(frozen)
const parent = await load('output/provider-light-2026-10-07/provider-resume-manifest.json')
const plan = await load('output/provider-resume-2026-10-07/execution-plan.json')
const receipt = await load('output/provider-resume-2026-10-07/receipt.json')
const original = await load('output/search-s5-authorized-development/live-development-source-any-strength-guard/rows.json')
const newRows = await load('output/provider-resume-2026-10-07/rows.json')
const inputs = await load('output/search-s5-authorized-development/development-inputs.json')
assert.equal(receipt.LunaCalls, 0)
assert.equal(receipt.heldOutCalls, 0)
assert.equal(receipt.loopbackServerClosed, true)
assert.equal(hash(plan.stageConfig), plan.configHash)
assert.equal(parent.manifestHash, plan.parentManifestHash)
assert.deepEqual(newRows.map(row => row.caseId), plan.exactOrder)
assert.equal(newRows.length, 91)
const rows = original.map(row => ({ ...row, stageStatus: ({ INTERPRETATION_COMPLETE_NO_LUNA: 'COMPLETE',
  PROVIDER_PENDING_LUNA: 'LUNA_PENDING', PROVIDER_PENDING_OTHER: 'PLACES_PENDING' })[row.status],
  sourceRun: 'live-development-source-any-strength-guard' })).concat(newRows.map(row => ({ ...row,
  stageStatus: row.status, sourceRun: 'separated-jev-stage' })))
assert.equal(rows.length, 222)
assert.equal(new Set(rows.map(row => row.caseId)).size, 222)
for (const row of newRows) {
  const input = inputs.find(input => input.caseId === row.caseId)
  const identity = { domain: 'search', datasetHash: frozen.datasetHash, caseId: row.caseId,
    inputHash: hash(input.modelInput), provider: 'typesafe-ai', model: 'jev-latest', configHash: plan.configHash, runNumber: 1 }
  const entry = await load('output/provider-resume-2026-10-07/jev-stage-cache/search/' + benchmarkCacheKey(identity) + '.json')
  assert.deepEqual(entry.identity, identity)
  assert.deepEqual(entry.value, row.jevStage)
  assert.equal(entry.key, benchmarkCacheKey(identity))
  assert.deepEqual(row.result.parse, row.jevStage.parsed)
}
const observed = rows.map(row => ({ record: records.find(record => record.id === row.caseId), prediction: searchPrediction(row.result) }))
assert.ok(observed.every(row => row.record))
const allMetrics = scoreSearchBenchmark(observed, { diagnostic: true })
const completeIds = new Set(rows.filter(row => row.stageStatus === 'COMPLETE').map(row => row.caseId))
const completedMetrics = scoreSearchBenchmark(observed.filter(row => completeIds.has(row.record.id)), { diagnostic: true })
const adopted = [], rejected = [], rawRoleErrors = [], caughtValidation = []
const counts = name => rows.filter(row => row.stageStatus === name).length
for (const row of rows) {
  const record = records.find(record => record.id === row.caseId), parsed = row.result.parse
  const prediction = searchPrediction(row.result)
  for (const role of ['pickup', 'drop']) {
    const gold = record.truth.expected[role + 'Spans']
    if (gold.status === 'LABELLED' && gold.value.length === 0 && prediction[role + 'Span']) {
      rawRoleErrors.push({ caseId: row.caseId, role, span: prediction[role + 'Span'],
        fallbackRequired: parsed.fallbackRequired, status: row.stageStatus })
    }
  }
  const validationCodes = parsed.issues.filter(issue => ['JEV_SCHEMA_ERROR', 'JEV_INVALID_RESPONSE',
    'EXTRACTION_BINDING_UNRESOLVED', 'INVALID_INPUT_PROVENANCE', 'LIMIT_EXCEEDED'].includes(issue.code)).map(issue => issue.code)
  if (validationCodes.length) caughtValidation.push({ caseId: row.caseId, codes: validationCodes, status: row.stageStatus })
  try {
    const review = createLocationReview(parsed, new Date(record.modelInput.context.clock), record.modelInput.context.timeZone)
    assert.deepEqual(validateDraftProvenance(review.session.effectiveDraft), [])
    assert.equal(formResolution(review, createTestClock(record.modelInput.context.clock)).submissionAllowed, false)
    assert.deepEqual(review.selected, {})
    adopted.push(row.caseId)
  } catch (error) {
    assert.equal(error.code, 'INVALID_PARSE_RESULT')
    rejected.push(row.caseId)
  }
}
const adoptedIds = new Set(adopted)
const adoptedMetrics = scoreSearchBenchmark(observed.filter(row => adoptedIds.has(row.record.id)), { diagnostic: true })
const roleConflicts = rows.filter(row => row.result.parse.issues.some(issue => issue.code === 'ROLE_CONFLICT'))
const guardedLoss = kind => observed.filter(row => adoptedIds.has(row.record.id)
  && row.record.truth.expected.unsupportedRequests.value.includes(kind)
  && !row.prediction.unsupportedRequests.includes(kind)).map(row => row.record.id)
const unsupportedLoss = Object.fromEntries(['STOP', 'RETURN_JOURNEY', 'RENTAL', 'CONDITIONAL_PREFERENCE'].map(kind => [kind, guardedLoss(kind)]))
const quotaRows = newRows.filter(row => row.placesRequestsThisEvaluation > 0 && row.placesIssues.includes('PLACES_QUOTA'))
assert.equal(quotaRows.length, 1)
const quotaIndex = newRows.indexOf(quotaRows[0])
assert.ok(newRows.slice(quotaIndex + 1).every(row => row.placesRequestsThisEvaluation === 0))
const batches = newRows.flatMap(row => row.result.parse.providerMetadata.batches)
const rawRouting = rows.map(row => ({ caseId: row.caseId, raw: row.result.parse.providerMetadata.decisions[0],
  expected: records.find(record => record.id === row.caseId).truth.expected }))
const rawQueryCorrect = rawRouting.filter(row => row.raw?.query_type?.choice === row.expected.queryType.value).length
const rawComplexityCorrect = rawRouting.filter(row => row.raw?.booking_complexity?.choice === row.expected.complexity.value).length
const pending = inputs.flatMap(input => {
  const row = rows.find(row => row.caseId === input.caseId)
  if (row.stageStatus === 'COMPLETE') return []
  return [{ order: 0, caseId: row.caseId, status: row.stageStatus, inputHash: hash(input.modelInput),
    parsedHash: hash(row.result.parse), sourceRun: row.sourceRun, fallbackReasons: row.fallbackReasons,
    nextProvider: row.stageStatus === 'LUNA_PENDING' ? 'Luna' : row.stageStatus === 'PLACES_PENDING' ? 'Places' : 'SEE_CAPTURED_FAILURE',
    placesAfterLuna: row.stageStatus === 'LUNA_PENDING' ? 'CONDITIONAL_AFTER_ACCEPTED_INTERPRETATION' : 'NOT_APPLICABLE',
    noFreshJevRequired: true, preserveRawFailures: true }]
}).map((row, index) => ({ ...row, order: index + 1 }))
const resumed = { version: 'runtime-search-pending-development-state-v1', parentManifestHash: parent.manifestHash,
  stagePlanHash: hash(plan), parserSourceManifestHash: parent.search.parserSourceManifestHash,
  originalQueueRetainedAsPreInferenceCommitment: true, adaptiveSelection: false,
  pending, pendingOrderHash: hash(pending), completedCaseIds: [...completeIds], unattemptedCaseIds: [],
  newJevSuccessesMustNotBeRepeated: true, LunaQueue: pending.filter(row => row.nextProvider === 'Luna').map(row => row.caseId),
  PlacesQueue: pending.filter(row => row.nextProvider === 'Places').map(row => row.caseId),
  s6PackageHashUnchanged: parent.s6.packageHash, heldOutExcluded: true }
resumed.stateHash = hash(resumed)
const report = { scope: 'CURRENT_PARSER_ALL_222_DEVELOPMENT_JEV_ATTEMPTED_PROVIDER_STAGES_SEPARATED',
  datasetHash: frozen.datasetHash, splitHash: frozen.splitHash, parserSourceManifestHash: parent.search.parserSourceManifestHash,
  original131Retained: true, newCasesAttempted: 91, totalAttempted: 222,
  providerTerminalCompleted: counts('COMPLETE'), LunaPending: counts('LUNA_PENDING'), PlacesPending: counts('PLACES_PENDING'),
  combinedProviderPending: counts('LUNA_AND_PLACES_PENDING'), validationFailures: counts('VALIDATION_FAILURE'),
  otherProviderPending: counts('OTHER_PROVIDER_PENDING'), unattempted: 0,
  caughtRawValidationCases: caughtValidation, rawWrongRoleErrors: rawRoleErrors,
  roleConflictCases: roleConflicts.map(row => row.caseId),
  layers: { rawProviderQuality: { cases: 222, rawQueryCorrect, rawComplexityCorrect,
      unavailableRawRoutingChoices: rawRouting.filter(row => !row.raw?.query_type).map(row => row.caseId),
      rawOutputsAndFailuresPreserved: true, missingFieldMetricsBelongToDeterministicPolicy: true },
    validatedIntermediateInterpretation: { metrics: allMetrics },
    applicationAuthoritativeOutput: { offlineAdoptionAccepted: adopted.length, offlineAdoptionRejected: rejected.length,
      adoptedMetrics, observationsOnlyNotFullSystemSignoff: true, explicitSelectionsPerformed: 0, submissionsPerformed: 0,
      inventedAuthoritativeGroundedLocations: 0, userVisibleInvalidSelections: 0, bookingAuthoritativeInvalidLocations: 0,
      sourceValidationBypass: 0, adoptedRoleReversals: adoptedMetrics.reversal.numerator, unsupportedLoss,
      silentConflictingTimeSelections: 0, silentConflictingVehicleSelections: 0, canonicalIdBypasses: 0,
      modelControlledPlaces: 0, aiConversationalClarification: 0, parserCreatedBookings: 0,
      limitation: 'No live Details or user selections were performed. Authoritative selection/canonical-ID safety is not claimed complete from absence of selections.' } },
  completedMetrics,
  newUsage: { JevAttempts: receipt.JevAttemptedRequests, JevCompletedRequests: receipt.JevCompletedRequests,
    models: [...new Set(batches.map(batch => batch.model))], inputTokens: batches.reduce((sum, batch) => sum + (batch.usage?.inputTokens ?? 0), 0),
    outputTokens: batches.reduce((sum, batch) => sum + (batch.usage?.outputTokens ?? 0), 0),
    PlacesAutocompleteRequests: receipt.Google.autocompleteRequests, PlacesDetailsRequests: receipt.Google.detailsRequests,
    PlacesPreflights: 1, LunaCalls: 0, ResponsibilityCalls: 0, heldOutCalls: 0 },
  Places: { preflight: 'PASS', subsequentlyStopped: 'PLACES_QUOTA', firstQuotaCase: quotaRows[0].caseId,
    totalActualRequests: receipt.Google.requestCount, requestsAfterQuota: 0, retryTime: 'NOT_REPORTED_BY_PROXY',
    unavailableGroundingNotFabricatedAsProviderResults: true },
  historicalResponsibilityConclusionsUnchanged: true, S6PackageHash: parent.s6.packageHash,
  S6AIExecuted: false, readyToFreezeSearch: false, heldOutExecuted: false, leakageCount: 0,
  currentPendingStateHash: resumed.stateHash }
assert.equal(report.providerTerminalCompleted + report.LunaPending + report.PlacesPending + report.combinedProviderPending
  + report.validationFailures + report.otherProviderPending, 222)
assert.equal(Object.values(unsupportedLoss).flat().length, 0, 'Adopted unsupported intent loss requires investigation')
assert.equal(adoptedMetrics.reversal.numerator, 0)
assert.equal(adoptedMetrics.inventions.location, 0)
await save('runtime-pending-manifest.json', resumed)
await save('aggregate-development-audit.json', report)
await save('places-quota-stop.json', { firstQuotaCase: quotaRows[0].caseId,
  observedIssue: 'PLACES_QUOTA', actualRequestsOnQuotaCase: quotaRows[0].placesRequestsThisEvaluation,
  firstPreflightOutcome: 'PASS', preflightAttempts: 1, totalActualAutocompleteRequests: receipt.Google.autocompleteRequests,
  laterRequests: 0, retryAfter: 'NOT_REPORTED_BY_PROXY', exactGroundingIssues: quotaRows[0].result.issues,
  localSuppressedGroundingRequestsNotCountedAsGoogleCalls: true })
console.log(JSON.stringify({ completed: report.providerTerminalCompleted, LunaPending: report.LunaPending,
  PlacesPending: report.PlacesPending, combined: report.combinedProviderPending, validationFailures: report.validationFailures,
  routing: allMetrics.fields.queryType, rawRouting: rawQueryCorrect, caughtValidationCases: caughtValidation.length,
  roleConflictCases: roleConflicts.length, rawAbsentRoleErrors: rawRoleErrors.length,
  adopted: adopted.length, rejected: rejected.length, unsupportedLoss, usage: report.newUsage,
  pendingStateHash: resumed.stateHash }))
