import { readFile, writeFile, mkdir } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { phase81DevelopmentDataset, phase81WaiverDevelopmentDataset, phase81DevelopmentHash } from '../benchmarks/responsibility/phase81Development.js'
import { simulateJevResponsibilityRoute } from '../benchmarks/responsibility/benchmark.js'

const root = new URL('../../output/phase81/', import.meta.url)
const records = [...phase81DevelopmentDataset(), ...phase81WaiverDevelopmentDataset()]
const rows = JSON.parse(await readFile(new URL('criteria-v3-development/rows.json', root), 'utf8'))
const receipt = JSON.parse(await readFile(new URL('criteria-v3-development/receipt.json', root), 'utf8'))
assert.equal(phase81DevelopmentHash(records), receipt.datasetHash)
assert.equal(records.length, 113); assert.equal(rows.length, 113)
const audits = records.filter(record => record.label.autoWaiveAllowed).map(record => {
  const row = rows.find(row => row.id === record.id)
  assert.deepEqual(row.label, record.label)
  const evidence = record.evidence
  const waiver = evidence.timeline.filter(item => item.basis === 'direct' && item.availability === 'available'
    && item.value?.adminWaiverApprovalRecorded === true && item.value.approvalBoundToSameIncident === true
    && item.value.riderAuthenticatedCancellationRequest === true && item.value.driverReleaseRequestedByRider === true
    && item.value.driverMisconductObserved === false && item.value.unresolvedComplaint === false)
  const impossible = evidence.timeline.filter(item => item.basis === 'direct' && item.availability === 'available'
    && item.value?.assignmentFeasible === false && item.value.platformCapacityAvailable === false)
  const classification = waiver.length ? 'VALID_WAIVED' : impossible.length ? 'PLATFORM_CAUSED' : null
  // This is a diagnostic counterfactual using explicit frozen facts, NOT inference and NOT an operative decision.
  const counterfactual = classification ? simulateJevResponsibilityRoute({ evidence, result: { classification,
    confidence: 1, severity: 'LOW', evidenceSufficient: true, needsHumanReview: false,
    externalCauseMaterial: false, platformMateriallyContributed: classification === 'PLATFORM_CAUSED' } }) : null
  const eligible = counterfactual?.route === 'PROVISIONAL_AUTO_WAIVED'
  const raw = row.results.criteriaV3; const guarded = row.results.guardedCriteriaV3
  return { caseId: record.id, caseType: evidence.caseType, groundTruth: record.label,
    whyGroundTruth: waiver.length ? 'Incident-bound recorded administrative approval of authenticated rider-requested release.'
      : 'Affirmative impossible assignment and unavailable platform capacity.',
    evidenceIds: [...waiver, ...impossible].map(item => item.id), factualWaiverClassification: classification,
    counterfactualGate: counterfactual, automationEligibleFromFrozenEvidence: eligible,
    diagnosticNotGroundTruthChange: true, decisions: raw.raw.decisions,
    rawRoute: raw.gate.route, postGuardRoute: guarded.gate.route, failedConditions: guarded.gate.failedGates,
    cause: waiver.length ? ['external-cause criteria too broad for resolved approved release', 'model judgment error']
      : ['review predicate too broad for proven impossible assignment', ...(raw.normalized.externalCauseMaterial ? ['external-cause criteria too broad'] : [])] }
})
const adverse = rows.filter(row => {
  const result = row.results.criteriaV3.normalized
  return result.classification === 'DRIVER_CAUSED' && result.evidenceSufficient && !result.needsHumanReview && row.label.needsReview
}).map(row => {
  const record = records.find(record => record.id === row.id)
  return { caseId: row.id, groundTruth: row.label, decisions: row.results.criteriaV3.raw.decisions,
    unsafeField: 'needsHumanReview=NO for corroborated serious deliberate unavailability',
    evidenceIds: record.evidence.timeline.filter(item => item.value?.driverAuthenticatedDisableDispatch === true).map(item => item.id),
    evidenceCitedByModel: null, modelProvidesEvidenceCitations: false,
    rawRoute: row.results.criteriaV3.gate.route, postGuardRoute: row.results.guardedCriteriaV3.gate.route,
    blockingGates: row.results.guardedCriteriaV3.gate.failedGates,
    rootCause: 'Contradictory bounded choices: serious/aggravating and ordinary YES, review NO. Classification and LEVEL_2 are correct; review is unsafe.',
    disposition: 'Criteria defect worth development testing; safely contained by severity allowlist, confidence floor and affirmative aggravation guard.' }
})
assert.equal(audits.length, 10); assert.equal(adverse.length, 3)
const valid = audits.filter(row => row.groundTruth.responsibility === 'VALID_WAIVED')
const eligible = valid.filter(row => row.automationEligibleFromFrozenEvidence)
const correct = eligible.filter(row => row.postGuardRoute === 'PROVISIONAL_AUTO_WAIVED')
const result = { status: 'DEVELOPMENT_DIAGNOSTIC_NOT_LABEL_CHANGE', datasetHash: receipt.datasetHash,
  correction: 'Ten refers to safe-waive positives: three VALID_WAIVED and seven PLATFORM_CAUSED, not ten VALID_WAIVED.',
  invariants: ['Explicit supported waiver or proven platform impossibility', 'Required fresh quality evidence',
    'No unresolved contradiction, external cause or attribution conflict', 'No serious affirmative misconduct',
    'Model evidence sufficient YES and review NO', 'Existing policy autoWaiveAllowed', 'LEVEL_0 alone never implies waiver'],
  validWaivedCases: valid.length, platformWaiveCases: audits.length - valid.length,
  automationEligibleValidWaived: eligible.length, automationEligibleAllWaivers: audits.filter(row => row.automationEligibleFromFrozenEvidence).length,
  correctlySafeWaivedValid: correct.length, safeWaivePrecision: null,
  safeWaiveEligibleRecall: { numerator: correct.length, denominator: eligible.length, value: correct.length / eligible.length },
  audits, rawAdverse: adverse, labelsChanged: false, guardChanged: false, heldOutExamined: false,
  criteriaV4Justified: true, criteriaV4LiveEvaluation: 'NOT RUN: deterministic mutation work has priority' }
await mkdir(root, { recursive: true })
await writeFile(new URL('waiver-adverse-development-audit.json', root), JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify({ validWaived: valid.length, safeWaivePositives: audits.length, eligibleValid: eligible.length,
  eligibleAll: result.automationEligibleAllWaivers, rawAdverse: adverse.length, labelsChanged: false, guardChanged: false }))
