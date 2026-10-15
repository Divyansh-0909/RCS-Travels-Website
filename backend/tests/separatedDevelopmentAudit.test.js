import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const run = promisify(execFile)
const backend = fileURLToPath(new URL('../', import.meta.url))
const root = new URL('../../', import.meta.url)
const load = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'))
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
before(async () => {
  await run(process.execPath, ['--import', 'tsx', 'scripts/audit-separated-development.mjs'], { cwd: backend, timeout: 30_000 })
  await run(process.execPath, ['scripts/prepare-responsibility-luna-consistency.mjs'], { cwd: backend, timeout: 15_000 })
})

test('all 91 frozen unattempted records retain first Jev outputs while other providers are pending', async () => {
  const plan = await load('output/provider-resume-2026-10-07/execution-plan.json')
  const rows = await load('output/provider-resume-2026-10-07/rows.json')
  assert.deepEqual(rows.map(row => row.caseId), plan.exactOrder)
  assert.equal(rows.length, 91)
  assert.ok(rows.every(row => row.jevStage.parsed.providerMetadata.attemptedRequests > 0))
  assert.ok(rows.every(row => row.result.parse === undefined || hash(row.result.parse) === hash(row.jevStage.parsed)))
  const aggregate = await load('output/provider-resume-2026-10-07/aggregate-development-audit.json')
  assert.equal(aggregate.totalAttempted, 222)
  assert.equal(aggregate.providerTerminalCompleted, 124)
  assert.equal(aggregate.LunaPending, 50)
  assert.equal(aggregate.PlacesPending, 48)
  assert.equal(aggregate.combinedProviderPending, 0)
  assert.equal(aggregate.validationFailures, 0)
  assert.equal(aggregate.unattempted, 0)
})

test('Places stops after the first quota failure without repeating preflight or Jev', async () => {
  const stop = await load('output/provider-resume-2026-10-07/places-quota-stop.json')
  const rows = await load('output/provider-resume-2026-10-07/rows.json')
  assert.equal(stop.preflightAttempts, 1)
  assert.equal(stop.totalActualAutocompleteRequests, 14)
  assert.equal(stop.actualRequestsOnQuotaCase, 1)
  const index = rows.findIndex(row => row.caseId === stop.firstQuotaCase)
  assert.ok(index >= 0)
  assert.ok(rows.slice(index + 1).every(row => row.placesRequestsThisEvaluation === 0))
  assert.ok(rows.filter(row => row.groundingDeferredWithoutFabricatedProviderResponse).every(row => row.result.locations.length === 0))
})

test('full-stage metrics retain raw errors and incomplete provider work without safety signoff', async () => {
  const audit = await load('output/provider-resume-2026-10-07/aggregate-development-audit.json')
  assert.equal(audit.layers.rawProviderQuality.rawQueryCorrect, 222)
  assert.equal(audit.layers.validatedIntermediateInterpretation.metrics.fields.queryType.numerator, 221)
  assert.equal(audit.rawWrongRoleErrors.length, 8)
  assert.equal(audit.roleConflictCases.length, 10)
  assert.equal(audit.caughtRawValidationCases.length, 24)
  const application = audit.layers.applicationAuthoritativeOutput
  assert.equal(application.offlineAdoptionAccepted + application.offlineAdoptionRejected, 222)
  assert.equal(application.adoptedRoleReversals, 0)
  assert.equal(Object.values(application.unsupportedLoss).flat().length, 0)
  assert.equal(application.inventedAuthoritativeGroundedLocations, 0)
  assert.equal(audit.readyToFreezeSearch, false)
  assert.equal(audit.newUsage.LunaCalls, 0)
  assert.equal(audit.newUsage.heldOutCalls, 0)
})

test('runtime pending state and Luna consistency plan remain precommitted and isolated', async () => {
  const pending = await load('output/provider-resume-2026-10-07/runtime-pending-manifest.json')
  const { stateHash, ...pendingContent } = pending
  assert.equal(hash(pendingContent), stateHash)
  assert.equal(pending.LunaQueue.length, 50)
  assert.equal(pending.PlacesQueue.length, 48)
  assert.ok(pending.pending.every(row => row.noFreshJevRequired))
  const consistency = await load('output/provider-resume-2026-10-07/responsibility-consistency-plan.json')
  const { planHash, ...planContent } = consistency
  assert.equal(hash(planContent), planHash)
  assert.equal(consistency.caseCount, 20)
  assert.equal(consistency.observationsTotal, 100)
  assert.equal(consistency.maximumFreshRepeatCalls, 80)
  assert.equal(consistency.existingFirstSuccessesReused, 13)
  assert.ok(Object.values(consistency.strataCoverage).every(ids => ids.length > 0))
  assert.equal(consistency.providerCallsMade, 0)
  const packageData = await load('docs/search/s6-development/verifier-package.json')
  assert.equal(packageData.packageHash, 'e85d9dec14d137a37600b4a412cce6d5c74bdd507151128e642d50ec144af01a')
  assert.equal(pending.s6PackageHashUnchanged, packageData.packageHash)
})

test('development execution and audit reject selective or provider override arguments', async () => {
  for (const file of ['search-separated-development-resume', 'audit-separated-development', 'prepare-responsibility-luna-consistency']) {
    await assert.rejects(run(process.execPath, ['--import', 'tsx', 'scripts/' + file + '.mjs', '--held-out'], { cwd: backend, timeout: 15_000 }))
  }
})

test('historical invocation preserves its receipt and rejects source drift before provider work', async () => {
  const receiptPath = new URL('output/provider-resume-2026-10-07/receipt.json', root)
  const before = await readFile(receiptPath, 'utf8')
  const manifest = await load('output/provider-light-2026-10-07/provider-resume-manifest.json')
  const versions = await Promise.all(manifest.search.sourceManifest.map(async entry => ({ ...entry,
    actual: createHash('sha256').update(await readFile(new URL(entry.file, root))).digest('hex') })))
  const drift = versions.find(entry => entry.actual !== entry.sha256)
  const invoke = () => run(process.execPath, ['--import', 'tsx', 'scripts/search-separated-development-resume.mjs'], { cwd: backend, timeout: 15_000 })
  if (drift) {
    await assert.rejects(invoke, error => error.code === 1 && error.stderr.includes(drift.actual) && error.stderr.includes(drift.sha256))
    assert.equal(await readFile(receiptPath, 'utf8'), before)
    return
  }
  const result = await invoke()
  const status = JSON.parse(result.stdout.trim())
  assert.equal(status.status, 'PREVIOUS_INVOCATION_RETAINED')
  assert.equal(status.previouslyAttemptedCases, 91)
  assert.equal(status.JevCallsThisInvocation, 0)
  assert.equal(status.PlacesCallsThisInvocation, 0)
  assert.equal(status.LunaCallsThisInvocation, 0)
  assert.equal(await readFile(receiptPath, 'utf8'), before)
})
