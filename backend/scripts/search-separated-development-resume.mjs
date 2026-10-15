import 'dotenv/config'
import assert from 'node:assert/strict'
import express from 'express'
import { TypeSafeClient } from '@typesafe-ai/sdk'
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import googleRouter from '../routes/googleAPI.js'
import { cachedInference } from '../benchmarks/common/cache.js'
import { frozenSearchDevelopment } from '../benchmarks/search/freeze.js'
import { groundingRoles, providerStageStatus } from '../benchmarks/search/providerStages.js'
import { createJevSearchProvider } from '../services/search/provider.ts'
import { createRideSearchParser } from '../services/search/parser.ts'
import { generateLocationCandidates } from '../services/search/locations/candidates.ts'
import { createSearchGroundingService } from '../services/search/locations/service.ts'
import { createGooglePlacesProvider, createRcsGooglePlacesHttpTransport, PlaceSearchError } from '../services/search/locations/places.ts'
import { fallbackEligibility } from '../services/search/complex/eligibility.ts'
import { createTestClock } from '../tests/helpers/testClock.js'

assert.equal(process.argv.length, 2, 'Authorized development queue only; no override arguments')
const root = new URL('../../', import.meta.url)
const out = new URL('output/provider-resume-2026-10-07/', root)
await mkdir(out, { recursive: true })
const digest = value => createHash('sha256').update(value).digest('hex')
const hash = value => digest(JSON.stringify(value))
const load = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'))
const save = (name, value) => writeFile(new URL(name, out), JSON.stringify(value, null, 2) + '\n')
const manifest = await load('output/provider-light-2026-10-07/provider-resume-manifest.json')
const { manifestHash, ...manifestContent } = manifest
assert.equal(hash(manifestContent), manifestHash)
assert.equal(manifest.s6.packageHash, 'e85d9dec14d137a37600b4a412cce6d5c74bdd507151128e642d50ec144af01a')
for (const entry of manifest.search.sourceManifest) {
  assert.equal(digest(await readFile(new URL(entry.file, root), 'utf8')), entry.sha256)
}
const frozen = await load('docs/search/benchmark-v1/frozen-v1/dataset.json')
const records = frozenSearchDevelopment(frozen)
assert.equal(frozen.datasetHash, manifest.search.datasetHash)
const allInputs = await load('output/search-s5-authorized-development/development-inputs.json')
const queue = manifest.search.queue.filter(row => row.status === 'UNATTEMPTED')
assert.equal(queue.length, 91)
const inputs = queue.map(row => {
  const input = allInputs.find(input => input.caseId === row.caseId)
  assert.ok(input)
  assert.equal(hash(input.modelInput), row.inputHash)
  assert.deepEqual(input.modelInput, records.find(record => record.id === row.caseId).modelInput)
  return input
})
const stageConfig = { version: 'search-development-separated-stage-v1',
  sourceManifestHash: manifest.search.parserSourceManifestHash,
  phase: 'JEV_S3_INTERPRETATION_ONLY_PLACES_SEPARATE', model: 'jev-latest', sdk: '0.6.0', retries: 0 }
const configHash = hash(stageConfig)
const plan = { scope: 'DEVELOPMENT_ONLY', parentManifestHash: manifestHash, datasetHash: frozen.datasetHash,
  splitHash: frozen.splitHash, stageConfig, configHash, exactOrder: inputs.map(input => input.caseId),
  queueHash: hash(queue), maximumJevRequests: 182, concurrency: 1, maximumPlacesPreflights: 1,
  LunaCallsAllowed: 0, heldOutCallsAllowed: 0, original131SuccessfulInterpretationsNotRerun: true,
  parserOrPromptChanged: false, existingProviderCachesInvalidated: 0, frozenBeforeNewInference: true }
try {
  const prior = JSON.parse(await readFile(new URL('execution-plan.json', out), 'utf8'))
  assert.deepEqual(prior, plan)
} catch (error) {
  if (error.code !== 'ENOENT') throw error
  await writeFile(new URL('execution-plan.json', out), JSON.stringify(plan, null, 2) + '\n', { flag: 'wx' })
}
// A completed or interrupted invocation keeps its exact failures and provider stop.
// Follow-on work resumes from the cached stage/pending manifest, never this live run.
try {
  const prior = JSON.parse(await readFile(new URL('receipt.json', out), 'utf8'))
  assert.equal(prior.configHash, configHash)
  console.log(JSON.stringify({ status: 'PREVIOUS_INVOCATION_RETAINED', priorStatus: prior.status,
    previouslyAttemptedCases: prior.newAttemptedCases ?? 0, JevCallsThisInvocation: 0,
    PlacesCallsThisInvocation: 0, LunaCallsThisInvocation: 0, heldOutCallsThisInvocation: 0 }))
  process.exit(0)
} catch (error) { if (error.code !== 'ENOENT') throw error }
const receipt = { status: 'RUNNING', startedAt: new Date().toISOString(), configHash,
  parentManifestHash: manifestHash, freshJevCases: 0, cachedCases: 0, LunaCalls: 0, heldOutCalls: 0 }
await save('receipt.json', receipt)
let capture = { responses: [], failures: [] }
const sdk = new TypeSafeClient({ timeout: 60_000, retry: { maxRetries: 0 } })
const client = { async systemOne(request, options) {
  try {
    const response = await sdk.systemOne(request, options)
    capture.responses.push({ model: response.model, answers: response.answers, usage: response.usage })
    return response
  } catch (error) {
    capture.failures.push({ name: error.name, status: error.status ?? null, code: error.code ?? null,
      retryAfter: error.headers?.get?.('retry-after') ?? null,
      validationIssues: Array.isArray(error.issues) ? error.issues.map(issue => ({ code: issue.code, path: issue.path })) : [] })
    throw error
  }
} }
const decisions = createJevSearchProvider({ client })
const app = express()
app.use('/api/googleAPI', googleRouter)
const server = app.listen(0, '127.0.0.1')
await new Promise(resolve => server.once('listening', resolve))
const google = createGooglePlacesProvider({ transport: createRcsGooglePlacesHttpTransport({ baseUrl: `http://127.0.0.1:${server.address().port}` }) })
let placesState = 'NOT_RUN', lastPlacesError = null, chain = Promise.resolve()
const places = { getMetadata: google.getMetadata,
  getPlaceDetails: async () => { throw new Error('NO_EXPLICIT_SELECTION_NO_DETAILS') },
  searchAutocomplete(request) {
    const work = chain.then(async () => {
      if (placesState !== 'PASS') throw lastPlacesError ?? new PlaceSearchError('provider')
      try { return await google.searchAutocomplete(request) }
      catch (error) { placesState = 'BLOCKED'; lastPlacesError = error; throw error }
    })
    chain = work.catch(() => {})
    return work
  },
}
async function preflightPlacesOnce() {
  const file = new URL('places-preflight.json', out)
  try {
    const prior = JSON.parse(await readFile(file, 'utf8'))
    placesState = prior.status
    if (prior.category) lastPlacesError = new PlaceSearchError(prior.category)
    return
  } catch (error) { if (error.code !== 'ENOENT') throw error }
  await writeFile(file, JSON.stringify({ status: 'CLAIMED', claimedAt: new Date().toISOString(), maximumAttempts: 1 }) + '\n', { flag: 'wx' })
  try {
    const matches = await google.searchAutocomplete({ input: 'Pari Chowk', sessionToken: 'search_oct7_resume_preflight' })
    assert.ok(matches.length > 0)
    placesState = 'PASS'
    await save('places-preflight.json', { status: 'PASS', recordedAt: new Date().toISOString(), matchCount: matches.length,
      metadata: google.getMetadata(), retries: 0, detailsCalls: 0 })
  } catch (error) {
    placesState = 'BLOCKED'; lastPlacesError = error
    await save('places-preflight.json', { status: 'BLOCKED', recordedAt: new Date().toISOString(),
      category: error.code ?? 'provider', issueCode: error.code === 'quota' ? 'PLACES_QUOTA' : 'PLACES_UNAVAILABLE',
      retryAfter: 'NOT_REPORTED_BY_PROXY', metadata: google.getMetadata(), retries: 0, detailsCalls: 0 })
  }
  console.log(JSON.stringify({ PlacesPreflight: placesState, category: lastPlacesError?.code, LunaCalls: 0 }))
}
const rows = []
let infrastructureStreak = 0
function validationFailure(parsed) {
  return parsed.issues.some(issue => ['INVALID_INPUT_PROVENANCE', 'LIMIT_EXCEEDED'].includes(issue.code))
}
async function evaluateParse(input, parsed) {
  const fallbackReasons = fallbackEligibility(parsed)
  const requiredRoles = groundingRoles(parsed, input.modelInput.context.activeField)
  const service = createSearchGroundingService(decisions, places, createTestClock(input.modelInput.context.clock))
  let result = { parse: parsed, formRevision: 0, activeField: input.modelInput.context.activeField,
    targetRefs: [], locations: [], issues: [] }
  const before = google.getMetadata().requestCount
  if (requiredRoles.length === 0 || placesState === 'PASS') {
    result = await service.groundParsed(parsed, { activeField: input.modelInput.context.activeField, formRevision: 0 })
  }
  const placesIssues = result.issues.filter(issue => issue.code.startsWith('PLACES_'))
  const groundingComplete = requiredRoles.length === 0 || result.locations.length === requiredRoles.length
    && result.locations.every(location => location.status !== 'FAILED')
  const state = { validationFailed: validationFailure(parsed),
    otherProviderPending: parsed.issues.some(issue => ['JEV_AUTH_ERROR', 'JEV_CONFIG_ERROR'].includes(issue.code)),
    lunaRequired: fallbackReasons.length > 0, placesRequired: requiredRoles.length > 0,
    placesAvailable: placesState === 'PASS', groundingComplete }
  return { caseId: input.caseId, status: providerStageStatus(state), result, fallbackReasons,
    observedDependencies: { ...state, groundingRoles: requiredRoles,
      PlacesAfterLuna: state.lunaRequired ? 'CONDITIONAL_ON_ACCEPTED_SOURCE_OWNED_LOCATIONS' : 'NOT_APPLICABLE' },
    placesRequestsThisEvaluation: google.getMetadata().requestCount - before,
    placesIssues: placesIssues.map(issue => issue.code),
    groundingDeferredWithoutFabricatedProviderResponse: requiredRoles.length > 0 && result.locations.length === 0 }
}
try {
  await preflightPlacesOnce()
  for (const input of inputs) {
    const identity = { domain: 'search', datasetHash: frozen.datasetHash, caseId: input.caseId,
      inputHash: hash(input.modelInput), provider: 'typesafe-ai', model: 'jev-latest', configHash, runNumber: 1 }
    const cached = await cachedInference(fileURLToPath(new URL('jev-stage-cache/', out)), identity, async () => {
      capture = { responses: [], failures: [] }
      receipt.freshJevCases += 1
      const started = performance.now()
      const parsed = await createRideSearchParser(decisions, createTestClock(input.modelInput.context.clock), generateLocationCandidates)
        .parse({ query: { id: input.providerQueryId, revision: input.queryRevision, text: input.modelInput.query },
          candidates: [], timeZone: input.modelInput.context.timeZone })
      return { caseId: input.caseId, inputHash: identity.inputHash, elapsedMs: performance.now() - started,
        parsed, rawSdk: capture, recordedAt: new Date().toISOString() }
    })
    receipt.cachedCases += Number(cached.cached)
    assert.equal(cached.value.caseId, input.caseId)
    const evaluated = await evaluateParse(input, cached.value.parsed)
    rows.push({ ...evaluated, jevStage: cached.value, cachedJev: cached.cached })
    await save('rows.json', rows)
    const codes = cached.value.parsed.issues.map(issue => issue.code)
    infrastructureStreak = codes.some(code => ['JEV_TIMEOUT', 'JEV_PROVIDER_ERROR'].includes(code)) ? infrastructureStreak + 1 : 0
    const capacityFailure = cached.value.rawSdk.failures.some(failure => failure.status === 429)
    if (capacityFailure || codes.includes('JEV_AUTH_ERROR') || infrastructureStreak >= 2) {
      receipt.status = 'JEV_PROVIDER_STOPPED'
      receipt.stopReason = capacityFailure ? 'JEV_RATE_LIMIT' : codes.includes('JEV_AUTH_ERROR') ? 'JEV_AUTH_ERROR' : 'CONSECUTIVE_INFRASTRUCTURE_FAILURES'
      break
    }
    if (rows.length % 10 === 0 || rows.length === inputs.length) {
      console.log(JSON.stringify({ newJevCases: rows.length, statusCounts: Object.fromEntries([...new Set(rows.map(row => row.status))].map(status => [status, rows.filter(row => row.status === status).length])),
        Places: placesState, GoogleRequests: google.getMetadata().requestCount, LunaCalls: 0 }))
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  if (receipt.status === 'RUNNING') receipt.status = 'JEV_QUEUE_EXECUTED_LUNA_PAUSED'
  if (placesState === 'PASS') {
    const original = await load('output/search-s5-authorized-development/live-development-source-any-strength-guard/rows.json')
    const blocked = original.filter(row => row.status === 'PROVIDER_PENDING_OTHER')
    const resumed = []
    for (const row of blocked) {
      if (placesState !== 'PASS') break
      const input = allInputs.find(input => input.caseId === row.caseId)
      resumed.push(await evaluateParse(input, row.result.parse))
    }
    await save('prior-places-resume.json', resumed)
  }
} catch (error) {
  receipt.status = 'LOCAL_EXECUTION_FAILURE'
  receipt.localError = { name: error.name, code: error.code ?? null }
  throw error
} finally {
  await new Promise(resolve => server.close(resolve))
  receipt.finishedAt = new Date().toISOString()
  receipt.loopbackServerClosed = true
  receipt.newAttemptedCases = rows.length
  receipt.remainingUnattempted = inputs.length - rows.length
  receipt.Google = google.getMetadata()
  receipt.PlacesState = placesState
  receipt.JevAttemptedRequests = rows.reduce((sum, row) => sum + row.result.parse.providerMetadata.attemptedRequests, 0)
  receipt.JevCompletedRequests = rows.reduce((sum, row) => sum + row.result.parse.providerMetadata.completedRequests, 0)
  receipt.statusCounts = Object.fromEntries([...new Set(rows.map(row => row.status))].map(status => [status, rows.filter(row => row.status === status).length]))
  await save('receipt.json', receipt)
  console.log(JSON.stringify(receipt))
}
