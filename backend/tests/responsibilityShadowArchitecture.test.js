import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = relative => fs.readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8')

test('shadow orchestrator has no direct path to finalization, finance, reliability, notice, or operative provisional decisions', () => {
  const shadowSources = [
    read('services/responsibilityShadowAdjudication.js'),
    read('services/responsibilityShadowRepository.js'),
  ].join('\n')
  for (const forbidden of [
    'applyFinalizedResponsibilityConsequences',
    'responsibilityFinancialConsequences',
    'responsibilityReliabilityConsequences',
    'responsibilityFinalizationService',
    'responsibilityNoticeService',
    'responsibilityProvisionalDecision',
    'responsibilityFinalDecision.create',
    'responsibilityLiability.create',
    'responsibilityCompensation.create',
    'reliabilityStrike.create',
    'reliabilityBlock.create',
  ]) {
    assert.equal(shadowSources.includes(forbidden), false, `shadow source contains forbidden boundary: ${forbidden}`)
  }
})

test('production driver cancellation durably queues shadow work and the existing production responsibility job invokes the sweep', () => {
  const cancellation = read('services/driverCancellations.js')
  const jobs = read('lib/jobs.js')
  assert.match(cancellation, /enqueueResponsibilityShadowEvidence\(responsibilityCase\.evidenceSnapshot/)
  assert.match(cancellation, /driver-cancellation:\$\{bookingId\}:\$\{driverId\}/)
  assert.match(jobs, /import \{ sweepResponsibilityShadowAdjudication \}/)
  assert.match(jobs, /await sweepResponsibilityShadowAdjudication\(\)/)
  assert.match(jobs, /await sweepResponsibilityFinalization\(\)/)
  const adjudication = read('services/responsibilityShadowAdjudication.js')
  assert.match(adjudication, /loadProductionResponsibilityAnalystClient\(\)[\s\S]*import\('\.\.\/lib\/openai\.js'\)/)
  assert.match(adjudication, /createProductionResponsibilityAnalyst/)
})

test('only the actual production driver-cancellation path currently creates responsibility cases', () => {
  const productionSources = [
    read('services/driverCancellations.js'),
    read('services/driverDelay.js'),
    read('services/customerCancellation.js'),
    read('services/scheduledOffers.js'),
    read('services/driverAssignment.js'),
  ]
  const creationCounts = productionSources.map(source => (source.match(/responsibilityCase\.(?:create|upsert)/g) ?? []).length)
  assert.deepEqual(creationCounts, [1, 0, 0, 0, 0])
})
