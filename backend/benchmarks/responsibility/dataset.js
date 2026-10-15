import { createHash } from 'node:crypto'
import { createTestClock } from '../../tests/helpers/testClock.js'
import { responsibilityEvidenceHash } from '../../services/responsibilityAnalyst.js'
import {
  createResponsibilityEvidence,
  evidenceCategory,
  responsibilityRequiredEvidenceByCase,
} from '../../services/responsibilityEvidence.js'
import { DEFAULT_RESPONSIBILITY_POLICY } from '../../services/responsibilityPolicyGate.js'
import {
  benchmarkCaseTypes,
  consequenceLevel,
  realResponsibilityBenchmarkMetadataSchema,
  responsibilityBenchmarkCohort,
  responsibilityBenchmarkLabelSchema,
  responsibilityBenchmarkRecordSchema,
  responsibilityGroundTruthSource,
} from './contracts.js'

export const RESPONSIBILITY_BENCHMARK_DATASET_VERSION = 'responsibility-benchmark-v1'
export const RESPONSIBILITY_BENCHMARK_SEED = 'rcs-responsibility-phase8-2026-09-30'
export const RESPONSIBILITY_BENCHMARK_FROZEN_HASH = 'f011610a6083cec0006f434c330c6cc51fb0090e66999d435f43d95070b400e0'

const NOW = '2026-09-30T10:00:00.000Z'
const classifications = Object.freeze({
  driver: 'DRIVER_CAUSED', platform: 'PLATFORM_CAUSED', waived: 'VALID_WAIVED',
  external: 'EXTERNAL_OR_UNCERTAIN',
})

const scenarios = Object.freeze([
  { name: 'ordinary_driver_evidence', cohort: 'A', responsibility: classifications.driver, level: consequenceLevel.LEVEL_1, flag: 'driverClear' },
  { name: 'serious_avoidable_abandonment', cohort: 'A', responsibility: classifications.driver, level: consequenceLevel.LEVEL_2, review: true, flag: 'driverSevere' },
  { name: 'ordinary_platform_evidence', cohort: 'A', responsibility: classifications.platform, waive: true, flag: 'platformClear' },
  { name: 'ordinary_external_evidence', cohort: 'A', responsibility: classifications.external, review: true, flag: 'externalClear' },
  { name: 'ordinary_valid_waiver', cohort: 'A', responsibility: classifications.waived, waive: true, flag: 'validWaiver' },
  { name: 'impossible_assignment', cohort: 'B', responsibility: classifications.platform, review: true, flag: 'impossible' },
  { name: 'network_loss_offline', cohort: 'B', responsibility: classifications.external, review: true, flag: 'network' },
  { name: 'stale_rider_gps', cohort: 'B', responsibility: classifications.external, review: true, insufficient: true, flag: 'staleGps' },
  { name: 'cancellation_after_impossible_assignment', cohort: 'B', responsibility: classifications.platform, review: true, flag: 'impossibleCancellation' },
  { name: 'rider_cancel_after_platform_delay', cohort: 'B', responsibility: classifications.platform, review: true, flag: 'platformDelay' },
  { name: 'contradictory_timestamps', cohort: 'B', responsibility: classifications.external, review: true, insufficient: true, flag: 'timestamps' },
  { name: 'missing_provenance', cohort: 'B', responsibility: classifications.external, review: true, missing: true, insufficient: true, flag: 'provenance' },
  { name: 'suggestive_not_proof', cohort: 'B', responsibility: classifications.external, review: true, insufficient: true, flag: 'suggestive' },
  { name: 'conflicting_gps', cohort: 'B', responsibility: classifications.external, review: true, critical: true, insufficient: true, flag: 'gpsConflict' },
  { name: 'traffic_deterioration', cohort: 'B', responsibility: classifications.external, review: true, flag: 'traffic' },
  { name: 'missing_notification_delivery', cohort: 'B', responsibility: classifications.external, review: true, missing: true, insufficient: true, flag: 'notification' },
  { name: 'provider_acceptance_vs_delivered', cohort: 'B', responsibility: classifications.external, review: true, insufficient: true, flag: 'providerDelivery' },
  { name: 'cached_vs_contemporaneous_route', cohort: 'B', responsibility: classifications.external, review: true, critical: true, insufficient: true, flag: 'routeConflict' },
  { name: 'received_at_vs_observed_at', cohort: 'B', responsibility: classifications.external, review: true, insufficient: true, flag: 'receivedObserved' },
  { name: 'available_driver_unresponsive', cohort: 'A', responsibility: classifications.driver, level: consequenceLevel.LEVEL_1, flag: 'driverClear' },
  { name: 'replacement_provider_failure', cohort: 'A', responsibility: classifications.platform, review: true, flag: 'replacementProviderFailure' },
  { name: 'rider_changed_mind', cohort: 'A', responsibility: classifications.waived, waive: true, flag: 'validWaiver' },
])

const sourceFor = category => `benchmark:${category}`
const add = (journal, category, kind, value, options = {}) => journal.record({
  category, kind, value, source: sourceFor(category), quality: { benchmark: true, ...options.quality },
  claimKey: options.claimKey ?? null, availability: options.availability ?? 'available',
  observedAt: options.observedAt ?? NOW, receivedAt: options.receivedAt ?? NOW,
})

const addImpossibleAssignmentEvidence = journal => {
  add(journal, evidenceCategory.FEASIBILITY, 'assignment_capacity', { availableDrivers: 0 }, { claimKey: 'assignment.feasible' })
}

const scenarioEvidenceHandlers = Object.freeze({
  driverClear: journal => add(journal, evidenceCategory.CANCELLATION, 'driver_action', { initiator: 'driver', avoidable: true, platformIssueObserved: false }),
  driverSevere: journal => add(journal, evidenceCategory.CANCELLATION, 'driver_abandonment', { initiator: 'driver', repeatedRefusalAfterAcceptance: true }),
  platformClear: journal => add(journal, evidenceCategory.FEASIBILITY, 'platform_assignment_failure', { assignmentFeasible: false, platformCapacityAvailable: false }),
  externalClear: journal => add(journal, evidenceCategory.EXTERNAL, 'verified_external_disruption', { independentlyVerified: true, affectedRoute: true }),
  validWaiver: journal => add(journal, evidenceCategory.CANCELLATION, 'documented_waiver_reason', { reasonCode: 'APPROVED_OPERATIONAL_WAIVER', corroborated: true }),
  replacementProviderFailure: journal => add(journal, evidenceCategory.FEASIBILITY, 'replacement_capacity_failure', { replacementAvailable: false, platformSupplyFailure: true }),
  impossible: addImpossibleAssignmentEvidence,
  impossibleCancellation: addImpossibleAssignmentEvidence,
  network: journal => add(journal, evidenceCategory.CONNECTIVITY, 'network_loss', { online: false }),
  staleGps: journal => add(journal, evidenceCategory.LOCATION, 'rider_gps', { ageSeconds: 1800 }, { quality: { stale: true } }),
  platformDelay: journal => add(journal, evidenceCategory.ASSIGNMENT, 'platform_delay', { delayedSeconds: 900 }),
  timestamps: journal => {
    add(journal, evidenceCategory.CANCELLATION, 'cancelled', { state: 'cancelled' }, { observedAt: '2026-09-30T10:05:00.000Z', receivedAt: '2026-09-30T10:20:00.000Z' })
    add(journal, evidenceCategory.PROGRESS, 'trip_started', { state: 'started' }, { observedAt: '2026-09-30T10:15:00.000Z' })
  },
  provenance: journal => add(journal, evidenceCategory.LOCATION, 'position', null, { availability: 'unknown', quality: { provenance: 'missing' } }),
  suggestive: journal => add(journal, evidenceCategory.CANCELLATION, 'driver_message', { text: 'might be late' }, { quality: { corroborated: false } }),
  gpsConflict: journal => {
    add(journal, evidenceCategory.LOCATION, 'gps_a', { lat: 28.61, lng: 77.21 }, { claimKey: 'driver.position' })
    add(journal, evidenceCategory.LOCATION, 'gps_b', { lat: 28.81, lng: 77.41 }, { claimKey: 'driver.position' })
  },
  traffic: journal => add(journal, evidenceCategory.EXTERNAL, 'traffic_deterioration', { etaIncreaseSeconds: 1200 }),
  notification: journal => add(journal, evidenceCategory.NOTIFICATION, 'delivery', null, { availability: 'not_available' }),
  providerDelivery: journal => {
    add(journal, evidenceCategory.NOTIFICATION, 'provider_accepted', { accepted: true }, { claimKey: 'notification.delivery' })
    add(journal, evidenceCategory.NOTIFICATION, 'device_received', { delivered: false }, { claimKey: 'notification.delivery' })
  },
  routeConflict: journal => {
    add(journal, evidenceCategory.ROUTING, 'cached_route', { etaSeconds: 300 }, { claimKey: 'route.eta', quality: { cached: true } })
    add(journal, evidenceCategory.ROUTING, 'live_route', { etaSeconds: 1200 }, { claimKey: 'route.eta' })
  },
  receivedObserved: journal => add(journal, evidenceCategory.CONNECTIVITY, 'offline_ping', { online: false }, { observedAt: '2026-09-30T09:00:00.000Z', receivedAt: NOW }),
})

function scenarioEvidence(caseType, scenario, caseId) {
  const journal = createResponsibilityEvidence({
    caseId, caseType, bookingId: `booking-${caseId}`, occurredAt: NOW,
    scheduledAt: '2026-09-30T10:30:00.000Z', clock: createTestClock(NOW),
  })
  const withheldCategory = scenario.flag === 'notification' && responsibilityRequiredEvidenceByCase[caseType].includes(evidenceCategory.NOTIFICATION)
    ? evidenceCategory.NOTIFICATION
    : scenario.missing ? responsibilityRequiredEvidenceByCase[caseType][0] : null
  for (const category of responsibilityRequiredEvidenceByCase[caseType]) {
    if (category === withheldCategory) continue
    add(journal, category, `baseline_${category}`, { present: true })
  }
  scenarioEvidenceHandlers[scenario.flag]?.(journal)
  return journal.snapshot()
}

function labelFor(scenario, evidence) {
  const missing = evidence.completeness.missing.concat(evidence.completeness.unavailable)
  const casePolicy = DEFAULT_RESPONSIBILITY_POLICY.cases[evidence.caseType]
  const clear = !scenario.review && !scenario.critical && missing.length === 0 && evidence.contradictions.length === 0
  return responsibilityBenchmarkLabelSchema.parse({
    responsibility: scenario.responsibility,
    needsReview: Boolean(scenario.review || scenario.critical || missing.length),
    consequenceLevel: scenario.responsibility === classifications.driver ? scenario.level : consequenceLevel.LEVEL_0,
    autoUpholdAllowed: Boolean(clear && scenario.responsibility === classifications.driver && casePolicy?.autoUpholdAllowed),
    autoWaiveAllowed: Boolean(clear && scenario.waive && casePolicy?.autoWaiveAllowed),
    evidenceSufficient: !scenario.insufficient && missing.length === 0 && evidence.contradictions.length === 0,
    requiredMissingEvidence: missing,
    contradictionCritical: Boolean(scenario.critical),
    source: responsibilityGroundTruthSource.FROZEN_SYNTHETIC,
  })
}

const opaqueId = value => createHash('sha256').update(`${RESPONSIBILITY_BENCHMARK_DATASET_VERSION}:${value}`).digest('hex').slice(0, 20)

const deepFreeze = value => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const nested of Object.values(value)) deepFreeze(nested)
  return Object.freeze(value)
}

export function buildFrozenResponsibilityBenchmarkDataset() {
  const records = []
  for (const caseType of benchmarkCaseTypes) {
    for (const scenario of scenarios) {
      const id = `${caseType.toLowerCase()}-${scenario.name}`
      const evidence = scenarioEvidence(caseType, scenario, `case-${opaqueId(id)}`)
      const cohort = scenario.cohort === 'A'
        ? responsibilityBenchmarkCohort.FROZEN_SYNTHETIC : responsibilityBenchmarkCohort.ADVERSARIAL_SAFETY
      records.push(deepFreeze(responsibilityBenchmarkRecordSchema.parse({
        id, cohort, evidence, evidenceHash: responsibilityEvidenceHash(evidence),
        modelInput: { evidence }, label: labelFor(scenario, evidence), scenario: scenario.name, scenarioFamily: scenario.flag,
      })))
    }
  }
  return Object.freeze(records)
}

export function responsibilityBenchmarkDatasetHash(records = buildFrozenResponsibilityBenchmarkDataset()) {
  const canonical = records.map(record => ({ id: record.id, evidenceHash: record.evidenceHash, label: record.label }))
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}

const seededRank = (seed, value) => createHash('sha256').update(`${seed}:${value}`).digest('hex')

export function splitResponsibilityBenchmark(records, { seed = RESPONSIBILITY_BENCHMARK_SEED, heldOutFraction = 0.25 } = {}) {
  if (!(heldOutFraction > 0 && heldOutFraction < 1)) throw new Error('heldOutFraction must be between zero and one')
  const labeled = records.filter(record => record.label && record.label.source !== responsibilityGroundTruthSource.UNLABELED)
  const families = new Map()
  for (const record of labeled) {
    const scenarioFamily = record.scenarioFamily ?? record.scenario
    const existing = families.get(scenarioFamily)
    if (existing && existing.responsibility !== record.label.responsibility) throw new Error('SCENARIO_FAMILY_LABEL_CONFLICT')
    families.set(scenarioFamily, { scenario: scenarioFamily, responsibility: record.label.responsibility })
  }
  const strata = new Map()
  for (const family of families.values()) {
    strata.set(family.responsibility, (strata.get(family.responsibility) ?? []).concat(family.scenario))
  }
  const heldOutFamilies = new Set()
  for (const scenarioNames of strata.values()) {
    const ordered = [...scenarioNames].sort((left, right) => seededRank(seed, left).localeCompare(seededRank(seed, right)))
    const heldOutCount = Math.max(1, Math.min(ordered.length - 1, Math.round(ordered.length * heldOutFraction)))
    for (const scenario of ordered.slice(0, heldOutCount)) heldOutFamilies.add(scenario)
  }
  // Reserve the mandatory-provenance safety family before any inference results are collected.
  if (families.has('provenance')) heldOutFamilies.add('provenance')
  const development = []
  const heldOut = []
  for (const record of labeled) {
    ;(heldOutFamilies.has(record.scenarioFamily ?? record.scenario) ? heldOut : development).push(record)
  }
  return Object.freeze({
    development: Object.freeze(development), heldOut: Object.freeze(heldOut), seed,
    stratifiedBy: 'scenarioFamily:responsibility', heldOutScenarioFamilies: Object.freeze([...heldOutFamilies].sort()),
  })
}

export function createRealResponsibilityBenchmarkMetadata(input) {
  return realResponsibilityBenchmarkMetadataSchema.parse(input)
}
