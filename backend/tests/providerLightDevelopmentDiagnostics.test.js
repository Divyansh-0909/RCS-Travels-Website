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
const load = async file => JSON.parse(await readFile(new URL(file, root), 'utf8'))
const diagnostic = name => load('output/provider-light-2026-10-07/' + name + '.json')
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
before(async () => {
  const manifest = await diagnostic('provider-resume-manifest')
  const versions = await Promise.all(manifest.search.sourceManifest.map(async entry => ({ ...entry,
    actual: createHash('sha256').update(await readFile(new URL(entry.file, root))).digest('hex') })))
  const drift = versions.find(entry => entry.actual !== entry.sha256)
  for (const file of ['phase81-provider-light-diagnostics', 'search-provider-light-diagnostics', 'provider-resume-manifest']) {
    const invoke = () => run(process.execPath, ['--import', 'tsx', 'scripts/' + file + '.mjs'], { cwd: backend, timeout: 30_000 })
    if (file === 'provider-resume-manifest' && drift) {
      // A versioned parser extension must not regenerate the sealed historical
      // resume manifest against a different source. Its recorded reports remain fixtures.
      await assert.rejects(invoke, error => error.code === 1 && error.stderr.includes(drift.actual) && error.stderr.includes(drift.sha256))
    } else await invoke()
  }
})

test('provider-light sufficiency audit preserves all 28 errors without changing guarded routes', async () => {
  const { summary, rows } = await diagnostic('responsibility-disagreements')
  assert.equal(summary.falsePositives, 28)
  assert.equal(summary.falseNegatives, 0)
  assert.equal(summary.routeAffecting, 0)
  assert.equal(summary.nonRouteAffecting, 28)
  assert.equal(summary.unsafeGuardedConsequences, 0)
  assert.deepEqual(Object.values(summary.familyCounts), [7, 7, 7, 7])
  assert.ok(rows.every(row => row.adapterMappingVerified && row.guardedRoute === row.correctedEvidenceRoute))
})

test('provider-light strata retain contained raw waiver errors separately from raw adverse', async () => {
  const { strata } = await diagnostic('responsibility-safety-strata')
  assert.equal(strata.length, 12)
  assert.ok(strata.every(row => row.unsafeGuardedOutcomes === 0 && row.unsafeRawAdverse === 0))
  const mandatory = strata.find(row => row.stratum === 'Mandatory review')
  assert.equal(mandatory.cases, 83)
  assert.equal(mandatory.review, 83)
  assert.equal(mandatory.unsafeRawWaivers, 11)
})

test('bounded cached ablations identify waiver, uphold and raw adverse predicate effects', async () => {
  const report = await diagnostic('responsibility-minimality')
  assert.deepEqual(report.newQuestionsAdded, [])
  assert.deepEqual(report.v4ToV5ChangedQuestions, ['needsHumanReview'])
  assert.equal(report.keyCases.safeWaivers.length, 10)
  assert.equal(report.keyCases.preservedSafeUpholds.length, 5)
  assert.equal(report.keyCases.removedV3UnsafeAdverse.length, 3)
  const reviewSwap = report.hybrids.find(row => row.donor === 'V4' && row.fields.length === 1 && row.fields[0] === 'needsHumanReview')
  assert.equal(reviewSwap.safeUpholds, 0)
  assert.equal(reviewSwap.safeWaives, 10)
  assert.ok(report.hybrids.every(row => row.unsafeGuardedOutcomes === 0))
})

test('eight literal locations in wrong roles cannot enter Places or authoritative form state', async () => {
  const { summary, rows } = await diagnostic('search-eight-locations')
  assert.equal(rows.length, 8)
  assert.equal(summary.metricArtifacts, 8)
  assert.equal(summary.rawWrongRoleErrors, 8)
  for (const row of rows) {
    assert.equal(row.literalSpanExists, true)
    assert.equal(row.survivesSourceValidation, true)
    assert.equal(row.reachesDiagnosticBookingDraft, true)
    assert.equal(row.reachesAdoptedBookingDraft, false)
    assert.equal(row.reachesGooglePlaces, false)
    assert.equal(row.reachesExplicitSelection, false)
    assert.equal(row.reachesBookingSubmission, false)
  }
})

test('routing diagnostic rejects inconsistent pair without replacing the captured 130/131 result', async () => {
  const report = await diagnostic('search-routing-miss')
  assert.equal(report.offlineInvalidPairRejected, true)
  assert.equal(report.offlineValidPairAccepted, true)
  assert.equal(report.fixMade, false)
  assert.equal(report.routingAfterDiagnostic, '130/131')
  assert.equal(report.realProviderCalls, 0)
})

test('metric layers preserve all attempts and distinguish adoption from full completion', async () => {
  const report = await diagnostic('search-metric-layers')
  assert.equal(report.rawProviderQuality.queryTypeCorrect, 131)
  assert.equal(report.intermediateValidatedInterpretation.metrics.cases, 131)
  assert.equal(report.intermediateValidatedInterpretation.absentRoleAssignments, 8)
  const final = report.finalApplicationSafeOutput
  assert.equal(final.adoption.length, 116)
  assert.equal(final.rejectedCases, 15)
  assert.equal(final.metrics.inventions.location, 0)
  assert.equal(final.fullSystemSignoff, false)
  assert.ok(final.adoption.every(row => !row.submissionAllowed))
})

test('resume manifest stays frozen with priority coverage and conditional dependencies', async () => {
  const manifest = await diagnostic('provider-resume-manifest')
  const { manifestHash, ...content } = manifest
  assert.equal(hash(content), manifestHash)
  assert.equal(manifest.responsibility.exactOrder.length, 77)
  assert.ok(manifest.responsibility.exactOrder.slice(0, 3).every(row => row.stratum === 'VALID_WAIVED'))
  assert.equal(new Set(manifest.responsibility.exactOrder.map(row => row.caseId)).size, 77)
  assert.equal(manifest.search.queue.length, 109)
  assert.equal(manifest.search.unknownFutureDependencyCases, 91)
  assert.equal(manifest.search.fullDependencyCountsKnown, false)
  assert.equal(manifest.integrity.leakageCount, 0)
  assert.deepEqual(manifest.callsThisContinuation, { Jev: 0, Places: 0, Luna: 0, heldOut: 0 })
  const packageData = await load('docs/search/s6-development/verifier-package.json')
  const { packageHash, ...packageContent } = packageData
  assert.equal(hash(packageContent), packageHash)
  assert.equal(manifest.s6.packageHash, packageHash)
  assert.equal(packageData.packet.traces.length, 32)
})

test('offline diagnostic CLIs reject execution or selective-case arguments', async () => {
  for (const file of ['phase81-provider-light-diagnostics', 'search-provider-light-diagnostics', 'provider-resume-manifest', 's6-provider-light-finalize', 'search-s6-verifier-package']) {
    await assert.rejects(run(process.execPath, ['--import', 'tsx', 'scripts/' + file + '.mjs', '--execute'], { cwd: backend, timeout: 15_000 }))
  }
})
