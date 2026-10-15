import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { phase81DevelopmentDataset, phase81WaiverDevelopmentDataset, phase81DevelopmentHash } from '../benchmarks/responsibility/phase81Development.js'
import { simulateJevResponsibilityRoute } from '../benchmarks/responsibility/benchmark.js'
import { applyDevelopmentSeverityGuard } from '../benchmarks/responsibility/developmentSeverityGate.js'
import { normalizeEvidenceAware } from '../benchmarks/responsibility/evidenceAwareSeverity.js'
import { evidenceCriteriaV3Questions } from '../benchmarks/responsibility/evidenceCriteriaV3.js'
import { evidenceCriteriaV4Questions } from '../benchmarks/responsibility/evidenceCriteriaV4.js'
import { evidenceCriteriaV5Questions } from '../benchmarks/responsibility/evidenceCriteriaV5.js'

const root = new URL('../../', import.meta.url)
assert.equal(process.argv.length, 2, 'Offline development diagnostic accepts no execution arguments')
const out = new URL('output/provider-light-2026-10-07/', root)
await mkdir(out, { recursive: true })
const load = async file => JSON.parse(await readFile(new URL(file, root), 'utf8'))
const save = async (name, data) => writeFile(new URL(name, out), JSON.stringify(data, null, 2) + '\n')
const records = [...phase81DevelopmentDataset(), ...phase81WaiverDevelopmentDataset()]
const rows = await load('output/phase81/criteria-v5-development/rows.json')
const plan = await load('output/phase81/criteria-v5-development/plan.json')
assert.equal(phase81DevelopmentHash(records), plan.datasetHash)
assert.equal(records.length, 113)
assert.equal(rows.length, 113)
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const byId = new Map(records.map(record => [record.id, record]))
const actual = row => row.results.criteriaV5
const yes = value => value ? 'YES' : 'NO'
const upheld = run => run.gate.route === 'PROVISIONAL_AUTO_UPHELD'
const waived = run => run.gate.route === 'PROVISIONAL_AUTO_WAIVED'
const review = run => run.gate.route === 'NEEDS_ADMIN_REVIEW'
const rawUpheld = run => run.normalized.classification === 'DRIVER_CAUSED' && run.normalized.evidenceSufficient && !run.normalized.needsHumanReview
const rawWaived = run => ['PLATFORM_CAUSED', 'VALID_WAIVED'].includes(run.normalized.classification) && run.normalized.evidenceSufficient && !run.normalized.needsHumanReview
const rawRoute = run => rawUpheld(run) ? 'UPHOLD_CANDIDATE' : rawWaived(run) ? 'WAIVE_CANDIDATE' : 'REVIEW_OR_NO_AUTOMATION'
const unsafe = (run, label) => (upheld(run) && !label.autoUpholdAllowed) || (waived(run) && !label.autoWaiveAllowed) || (label.needsReview && !review(run))
const rawUnsafeAdverse = (run, label) => rawUpheld(run) && (label.responsibility !== 'DRIVER_CAUSED' || label.needsReview || !label.evidenceSufficient || (run.normalized.severity === 'HIGH' && label.consequenceLevel !== 'LEVEL_2'))
const rawUnsafeWaiver = (run, label) => rawWaived(run) && (label.responsibility !== run.normalized.classification || label.needsReview || !label.evidenceSufficient)
const rawUnsafe = (run, label) => rawUnsafeAdverse(run, label) || rawUnsafeWaiver(run, label)
function replay(record, normalized, raw) {
  const gate = simulateJevResponsibilityRoute({ evidence: record.evidence, result: normalized })
  return applyDevelopmentSeverityGuard({ normalized, raw, gate, error: null }, record.evidence)
}
const causes = {
  stale_rider_gps: { categories: ['evidence interpretation', 'criteria wording', 'label boundary', 'downstream guard intentionally compensates'],
    detail: 'GPS is explicitly stale (sample age 1800 seconds). Category presence and mandatory-record completeness do not establish fresh causal attribution; the model reports sufficiency while retaining uncertain attribution.' },
  contradictory_timestamps: { categories: ['evidence interpretation', 'contradiction conservatism', 'criteria wording', 'downstream guard intentionally compensates'],
    detail: 'Cancellation precedes trip start and a trip-start entry is received before it was observed. This is semantic chronology conflict, not a frozen critical-contradiction flag. The model preserves uncertain attribution/review but calls the supplied records sufficient.' },
  suggestive_not_proof: { categories: ['evidence interpretation', 'criteria wording', 'label boundary', 'downstream guard intentionally compensates'],
    detail: 'An uncorroborated might-be-late message suggests risk without proving responsibility. Mandatory categories are present; reliable attribution remains unsupported.' },
  received_at_vs_observed_at: { categories: ['evidence interpretation', 'criteria wording', 'label boundary', 'downstream guard intentionally compensates'],
    detail: 'An offline event observed one hour earlier is only received at incident time. Receipt time is not event time or contemporaneous proof of driver availability.' },
}
const disagreements = []
for (const row of rows) {
  const record = byId.get(row.id)
  assert.ok(record)
  assert.deepEqual(row.label, record.label)
  const run = actual(row)
  assert.equal(run.developmentGuard.evidenceHash, hash(record.evidence))
  assert.equal(replay(record, run.normalized, run.raw).gate.route, run.gate.route)
  if (run.normalized.evidenceSufficient === row.label.evidenceSufficient) continue
  const corrected = replay(record, { ...run.normalized, evidenceSufficient: row.label.evidenceSufficient },
    { ...run.raw, decisions: { ...run.raw.decisions, evidenceSufficient: row.label.evidenceSufficient ? 'YES' : 'NO' } })
  const cause = causes[record.scenario]
  assert.ok(cause, 'Every disagreement needs a reviewed family-specific cause')
  const routeChanged = run.gate.route !== corrected.gate.route
   disagreements.push({ caseId: row.id, scenarioFamily: record.scenario, frozenScenarioFamily: record.scenarioFamily,
    groundTruthResponsibility: row.label.responsibility, groundTruthEvidenceSufficient: row.label.evidenceSufficient,
    v5EvidenceSufficient: run.normalized.evidenceSufficient, rawEvidenceAnswer: run.raw.decisions.evidenceSufficient,
    error: run.normalized.evidenceSufficient ? 'FALSE_POSITIVE' : 'FALSE_NEGATIVE',
    v5Responsibility: run.normalized.classification, v5Severity: run.normalized.severity,
    rawReviewAnswer: run.raw.decisions.needsHumanReview, v5ReviewFlag: run.normalized.needsHumanReview,
    rawRoute: rawRoute(run), guardedRoute: run.gate.route,
    safeUpholdEligible: yes(row.label.autoUpholdAllowed), safeWaiveEligible: yes(row.label.autoWaiveAllowed),
    criticalContradictionPresent: yes(row.label.contradictionCritical),
    missingMaterialEvidence: yes(row.label.requiredMissingEvidence.length > 0 || !record.evidence.completeness.complete),
    unreliableAttributionEvidence: 'YES', semanticChronologyConflict: yes(cause.categories.includes('contradiction conservatism')),
    disagreementChangesFinalSafeRoute: yes(routeChanged), correctedEvidenceRoute: corrected.gate.route,
    unsafeGuardedConsequence: unsafe(run, row.label),
    unnecessaryReviewCaused: routeChanged && review(run) && !row.label.needsReview && !review(corrected),
    missedSafeAutomationCaused: routeChanged && review(run) && ((upheld(corrected) && row.label.autoUpholdAllowed) || (waived(corrected) && row.label.autoWaiveAllowed)),
    failedGates: run.gate.failedGates.map(gate => gate.code),
    rootCauseCategories: cause.categories, likelyCause: cause.detail, causeAssessment: 'OFFLINE_DIAGNOSTIC_INFERENCE_NOT_PROVIDER_REASONING',
    adapterMappingVerified: run.normalized.evidenceSufficient === (run.raw.decisions.evidenceSufficient === 'YES'),
    evidenceHash: record.evidenceHash })
}
assert.equal(disagreements.length, 28)
const count = predicate => disagreements.filter(predicate).length
const summary = { cases: 28, falsePositives: count(row => row.error === 'FALSE_POSITIVE'), falseNegatives: count(row => row.error === 'FALSE_NEGATIVE'),
  routeAffecting: count(row => row.disagreementChangesFinalSafeRoute === 'YES'), nonRouteAffecting: count(row => row.disagreementChangesFinalSafeRoute === 'NO'),
  unsafeGuardedConsequences: count(row => row.unsafeGuardedConsequence), unnecessaryReviewsCaused: count(row => row.unnecessaryReviewCaused),
  missedSafeAutomationCaused: count(row => row.missedSafeAutomationCaused),
  falseDriverCaused: count(row => row.v5Responsibility === 'DRIVER_CAUSED' && row.groundTruthResponsibility !== 'DRIVER_CAUSED'),
   falseLevel2: count(row => row.v5Severity === 'HIGH'),
   unsafeUpholds: count(row => row.guardedRoute === 'PROVISIONAL_AUTO_UPHELD' && row.safeUpholdEligible === 'NO'),
   unsafeWaives: count(row => row.guardedRoute === 'PROVISIONAL_AUTO_WAIVED' && row.safeWaiveEligible === 'NO'),
   missedMandatoryReview: count(row => row.guardedRoute !== 'NEEDS_ADMIN_REVIEW'),
   criticalContradictionBypasses: count(row => row.criticalContradictionPresent === 'YES' && row.guardedRoute !== 'NEEDS_ADMIN_REVIEW'),
  metricDisposition: 'RAW_MODEL_QUALITY_ERROR_WITHOUT_OBSERVED_SYSTEM_SAFETY_ERROR',
  v5RetainedUnchanged: true, v6Created: false, providerCalls: 0, labelsChanged: false, readyToFreeze: false,
  counterfactual: 'Only evidenceSufficient changes to its frozen label; same evidence, other decisions, normalization and deterministic guards. This is diagnostic replay, not inference or relabeling.',
  missingEvidenceDefinition: 'Absent/unavailable mandatory material records per frozen missing-evidence label and bundle completeness. Staleness, uncorroborated claims and unreliable chronology are recorded separately; present records can still be insufficient.',
  familyCounts: Object.fromEntries(Object.keys(causes).map(family => [family, count(row => row.scenarioFamily === family)])) }
assert.equal(summary.unsafeGuardedConsequences, 0)
const strata = [
  ['DRIVER_CAUSED LEVEL_1', record => record.label.responsibility === 'DRIVER_CAUSED' && record.label.consequenceLevel === 'LEVEL_1'],
  ['DRIVER_CAUSED LEVEL_2', record => record.label.responsibility === 'DRIVER_CAUSED' && record.label.consequenceLevel === 'LEVEL_2'],
  ...['PLATFORM_CAUSED', 'VALID_WAIVED', 'EXTERNAL_OR_UNCERTAIN'].map(name => [name, record => record.label.responsibility === name]),
  ['Deliberate unavailability', record => record.evidence.timeline.some(entry => entry.value?.driverAuthenticatedDisableDispatch === true)],
  ['Conflicting commitments', record => record.evidence.timeline.some(entry => entry.value?.secondOverlappingBookingAccepted === true)],
  ['Missing evidence', record => record.label.requiredMissingEvidence.length > 0],
  ['Contradictory evidence', record => record.label.contradictionCritical || record.evidence.contradictions.length > 0],
  ['Safe uphold', record => record.label.autoUpholdAllowed], ['Safe waive', record => record.label.autoWaiveAllowed],
  ['Mandatory review', record => record.label.needsReview],
].map(([name, predicate]) => {
  const subset = rows.filter(row => predicate(byId.get(row.id)))
  return { stratum: name, cases: subset.length, classificationCorrect: subset.filter(row => actual(row).normalized.classification === row.label.responsibility).length,
    unsafeRawRecommendations: subset.filter(row => rawUnsafe(actual(row), row.label)).length,
     unsafeRawAdverse: subset.filter(row => rawUnsafeAdverse(actual(row), row.label)).length,
     unsafeRawWaivers: subset.filter(row => rawUnsafeWaiver(actual(row), row.label)).length,
     rawCandidatesOutsidePolicy: subset.filter(row => (rawUpheld(actual(row)) && !row.label.autoUpholdAllowed) || (rawWaived(actual(row)) && !row.label.autoWaiveAllowed)).length,
    unsafeGuardedOutcomes: subset.filter(row => unsafe(actual(row), row.label)).length,
    safeAutomation: subset.filter(row => (upheld(actual(row)) && row.label.autoUpholdAllowed) || (waived(actual(row)) && row.label.autoWaiveAllowed)).length,
    review: subset.filter(row => review(actual(row))).length, caseIds: subset.map(row => row.id) }
})
await save('responsibility-disagreements.json', { summary, rows: disagreements })
await save('responsibility-safety-strata.json', { overlappingStrata: true, rawMetricDefinition: 'Unsafe raw adverse matches the existing canonical rawAdverse metric. Unsafe raw waiver additionally counts non-adverse class/review/evidence errors. Candidates outside automated case-type policy are reported separately; they are not automatically false factual recommendations.', contradictoryEvidenceDefinition: 'Frozen critical flag or explicit bundle contradiction; noncritical semantic chronology families are analyzed separately.', strata })

const v3 = await load('output/phase81/criteria-v3-development/rows.json')
const v4 = await load('output/phase81/criteria-v4-development/rows.json')
const hybrids = []
for (const [version, donors] of [['V3', v3], ['V4', v4]]) for (const fields of [['externalCauseMaterial'], ['needsHumanReview'], ['externalCauseMaterial', 'needsHumanReview']]) {
  const results = rows.map(row => {
    const donor = donors.find(candidate => candidate.id === row.id)
    assert.deepEqual(donor.label, row.label)
    const donorRun = donor.results['criteria' + version]
    const original = actual(row)
    const decisions = { ...original.raw.decisions }
    for (const field of fields) decisions[field] = donorRun.raw.decisions[field]
    const response = { model: original.raw.model,
      answers: Object.fromEntries(Object.entries(decisions).map(([field, choice]) => [field, { choice, confidence: original.raw.confidences[field] }])) }
    const replayed = normalizeEvidenceAware(response, byId.get(row.id).evidence)
    const run = replay(byId.get(row.id), replayed.normalized, replayed.raw)
    return { caseId: row.id, changedFields: fields, donor: version, originalRoute: original.gate.route, hybridRoute: run.gate.route,
      routeChanged: original.gate.route !== run.gate.route, safeUphold: upheld(run) && row.label.autoUpholdAllowed,
      safeWaive: waived(run) && row.label.autoWaiveAllowed, review: review(run), rawUnsafe: rawUnsafe(run, row.label), guardedUnsafe: unsafe(run, row.label) }
  })
  hybrids.push({ donor: version, fields, cases: results.length, safeUpholds: results.filter(row => row.safeUphold).length,
    safeWaives: results.filter(row => row.safeWaive).length, reviews: results.filter(row => row.review).length,
    unsafeRawRecommendations: results.filter(row => row.rawUnsafe).length, unsafeGuardedOutcomes: results.filter(row => row.guardedUnsafe).length,
    changedRoutes: results.filter(row => row.routeChanged), rows: results })
}
const q3 = evidenceCriteriaV3Questions(), q4 = evidenceCriteriaV4Questions(), q5 = evidenceCriteriaV5Questions()
assert.equal(hash(q5), plan.criteria.questionsHash)
const changed = (before, after) => Object.keys(after).filter(key => hash(before[key]) !== hash(after[key]))
const keyCase = row => ({ caseId: row.id, label: row.label,
  versions: Object.fromEntries([['V3', v3], ['V4', v4], ['V5', rows]].map(([version, cohort]) => {
    const run = cohort.find(candidate => candidate.id === row.id).results['criteria' + version]
    return [version, { decisions: run.raw.decisions, classification: run.normalized.classification,
      rawRoute: rawRoute(run), guardedRoute: run.gate.route, failedGates: run.gate.failedGates.map(gate => gate.code) }]
  })) })
const keyCases = { safeWaivers: rows.filter(row => row.label.autoWaiveAllowed).map(keyCase),
  preservedSafeUpholds: rows.filter(row => upheld(actual(row)) && row.label.autoUpholdAllowed).map(keyCase),
  removedV3UnsafeAdverse: v3.filter(row => rawUnsafeAdverse(row.results.criteriaV3, row.label)).map(keyCase) }
assert.equal(keyCases.safeWaivers.length, 10)
assert.equal(keyCases.preservedSafeUpholds.length, 5)
assert.equal(keyCases.removedV3UnsafeAdverse.length, 3)
const minimality = { method: 'OFFLINE_PREDICATE_SWAP_REPLAY_NOT_FRESH_CRITERIA_INFERENCE', freshProviderCalls: 0,
  questionCount: Object.keys(q5).length, v3ToV4ChangedQuestions: changed(q3, q4), v4ToV5ChangedQuestions: changed(q4, q5),
   v3ToV5ChangedQuestions: changed(q3, q5), newQuestionsAdded: Object.keys(q5).filter(key => !Object.hasOwn(q3, key)), hybrids, keyCases,
  limitations: ['Swaps isolate cached predicate effects with fixed V5 classification, confidences and evidence. They cannot prove how a shorter prompt would change a fresh provider response.',
    'The existing 42-call single-question ablation is retained as prior inference evidence. No new ablation calls were made.',
    'V5 evidence-sufficiency wording is inherited unchanged from V2/V3/V4; the 28 errors are not introduced by an extra V5 criterion.'],
  decision: 'RETAIN_V5_UNCHANGED_NOT_SELECTED_NOT_FROZEN; NO_V6' }
await save('responsibility-minimality.json', minimality)
const detailTable = disagreements.map(row => `| ${row.caseId} | ${row.groundTruthResponsibility} | ${row.groundTruthEvidenceSufficient} → ${row.v5EvidenceSufficient} | ${row.error} | ${row.v5Responsibility}/${row.v5Severity} | ${row.rawReviewAnswer}/${row.v5ReviewFlag} | ${row.rawRoute} | ${row.guardedRoute} | ${row.safeUpholdEligible}/${row.safeWaiveEligible} | ${row.criticalContradictionPresent}/${row.missingMaterialEvidence} | ${row.disagreementChangesFinalSafeRoute} | ${row.scenarioFamily} |`)
const document = ['# Responsibility provider-light diagnostics — 7 October 2026', '',
  'Development only; 113 cached V5 records, no inference, unchanged evidence/labels/criteria/guards. V3 remains reference; V5 remains internal, not selected or frozen.', '',
  '## Evidence-sufficiency disagreements', '',
  `False positives ${summary.falsePositives}; false negatives ${summary.falseNegatives}; route-affecting ${summary.routeAffecting}; non-route-affecting ${summary.nonRouteAffecting}; unsafe guarded consequences ${summary.unsafeGuardedConsequences}; unnecessary reviews caused ${summary.unnecessaryReviewsCaused}; missed safe automation caused ${summary.missedSafeAutomationCaused}.`, '',
  'All 28 retain EXTERNAL_OR_UNCERTAIN classification and mandatory guarded review. Correcting only sufficiency changes failed-gate detail, not final route. No false driver attribution, false LEVEL_2, unsafe uphold/waive, missed mandatory review or contradiction bypass is caused by these disagreements. They remain raw model quality errors.', '',
  'Missing material records below means explicit mandatory-record absence/unavailability. Present records are not necessarily fresh, corroborated or sufficient for reliable attribution. The separate quality gap remains in all 28. Critical contradiction follows the frozen flag; semantic timestamp conflicts are not silently relabeled critical.', '',
  '| Case | Gold responsibility | Gold → V5 sufficiency | Error | V5 class/severity | Raw/normalized review | Raw route | Guarded route | Uphold/waive eligible | Critical/missing | Route changes | Cause family |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|', ...detailTable, '',
  ...Object.entries(causes).map(([family, cause]) => `- **${family} (7 cases):** ${cause.detail} Root-cause categories: ${cause.categories.join('; ')}.`), '',
  'Cause assessments are offline inferences from recorded evidence and outputs, not provider explanations. Categorical adapter mapping is exact in all 28.', '',
  '## Safety strata', '', 'Strata overlap. Accuracy below is classification only; automation eligibility comes from unchanged frozen labels.', '',
   'Unsafe raw includes adverse errors and waiver errors before confidence/external-cause/cross-question gates. Canonical unsafe raw adverse remains 0; this additional audit finds 11 raw waiver candidates on mandatory-review cases (4 uncertain network-loss, 7 impossible-assignment cases), all contained. Policy-ineligible candidates alone are not labeled factual errors. These are distinct from the 28 sufficiency disagreements.', '',
  '| Stratum | Cases | Correct class | Unsafe raw | Unsafe guarded | Safe automation | Review |', '|---|---:|---:|---:|---:|---:|---:|',
  ...strata.map(row => `| ${row.stratum} | ${row.cases} | ${row.classificationCorrect}/${row.cases} | ${row.unsafeRawRecommendations} | ${row.unsafeGuardedOutcomes} | ${row.safeAutomation} | ${row.review} |`), '',
  '## Minimality and bounded ablation', '',
  `V3→V4 changes only ${minimality.v3ToV4ChangedQuestions.join(', ')}. V4→V5 changes only ${minimality.v4ToV5ChangedQuestions.join(', ')}. V5 adds zero questions; total bounded questions ${minimality.questionCount}. Sufficiency and severity predicates are unchanged.`, '',
  '| Fixed V5 outputs with donor predicates | Safe upholds | Safe waives | Reviews | Unsafe raw | Unsafe guarded |', '|---|---:|---:|---:|---:|---:|',
  ...hybrids.map(row => `| ${row.donor}: ${row.fields.join(' + ')} | ${row.safeUpholds} | ${row.safeWaives} | ${row.reviews} | ${row.unsafeRawRecommendations} | ${row.unsafeGuardedOutcomes} |`), '',
  'These are cached-output causal replays, not shortened-prompt inference. The observed route contribution of each changed predicate is explicit; irreducibility of the wording is unmeasured. Retain V5 unchanged rather than adding V6 or weakening evidence rules.', '',
   'Waiver recovery needs both the V4 distinction between an authenticated valid administrative/rider release and a material external cause, and bounded review wording. Swapping only V3 external-cause answers leaves 2/10 waives; only V3 review leaves 3/10; both leave 0/10. V5 preserves the five ordinary safe upholds because its review question distinguishes them from serious unresolved reliability cases: replacing only review with V4 collapses safe upholds to 0. All three V3 deliberate-unavailability cases retain identical attribution, sufficiency, platform/external and severity answers in V5; needsHumanReview changes NO→YES and removes their raw adverse recommendation. The factual guard remains unchanged. Exactly 15 safe automated routes (5 uphold + 10 waive) leave 98 reviews; 83 mandatory-review labels plus 15 other conservative/policy reviews.', '',
   'The machine-readable minimality report contains every decision and guard failure for each of the ten eligible waivers, five preserved upholds and three removed V3 unsafe adverse cases.', '',
  'Remaining freeze blockers: adequate Luna development and VALID_WAIVED coverage, Luna consistency and an adequate common-cohort comparison, then final selection and configuration freeze. Human-final calibration remains zero; production consequences remain off.', '',
].join('\n')
await writeFile(new URL('docs/benchmarks/phase81-provider-light-diagnostics.md', root), document)
const summarize = (cohort, omitted) => cohort.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => !omitted.includes(key))))
console.log(JSON.stringify({ summary, strata: summarize(strata, ['caseIds']), ablations: summarize(hybrids, ['rows', 'changedRoutes']) }))
