import { scoreRawGatedResponsibility } from '../responsibility/rawGatedMetrics.js'
import { scoreResponsibilityBenchmark, aggregateBenchmarkOperationalStats } from '../responsibility/metrics.js'

export function unsafeGuardedCount(rows, candidate) {
  return rows.filter(row => {
    const route = row.results[candidate].gate.route
    return route === 'PROVISIONAL_AUTO_UPHELD' && !row.label.autoUpholdAllowed
      || route === 'PROVISIONAL_AUTO_WAIVED' && !row.label.autoWaiveAllowed
      || row.label.needsReview && route !== 'NEEDS_ADMIN_REVIEW'
  }).length
}
export function scoreCodexCohort(rows, candidate) {
  if (rows.length === 0) return null
  const waived = rows.filter(row => row.results[candidate].gate.route === 'PROVISIONAL_AUTO_WAIVED')
  const eligible = rows.filter(row => row.label.autoWaiveAllowed)
  const correct = waived.filter(row => row.label.autoWaiveAllowed)
  const errors = rows.filter(row => row.results[candidate].normalized.evidenceSufficient !== row.label.evidenceSufficient)
  return { cases: rows.length, canonicalRawAndGated: scoreRawGatedResponsibility(rows, candidate),
    classified: scoreResponsibilityBenchmark(rows.map(row => ({ ...row, prediction: row.results[candidate].prediction }))),
    guardedUnsafeOutcomes: unsafeGuardedCount(rows, candidate),
    safeWaive: { predicted: waived.length, eligible: eligible.length, correct: correct.length,
      precision: waived.length ? correct.length / waived.length : null,
      recall: eligible.length ? correct.length / eligible.length : null },
    evidenceSufficiency: { falsePositives: errors.filter(row => row.results[candidate].normalized.evidenceSufficient).length,
      falseNegatives: errors.filter(row => !row.results[candidate].normalized.evidenceSufficient).length,
      caseIds: errors.map(row => row.id) },
    safetyCoverage: { missingEvidence: rows.filter(row => row.label.requiredMissingEvidence.length > 0).length,
      criticalContradictions: rows.filter(row => row.label.contradictionCritical).length,
      zeroDenominatorIsUnmeasured: true },
    operations: aggregateBenchmarkOperationalStats(rows.map(row => ({ ...row.results[candidate], ...row.results[candidate].raw.usage }))),
    cost: 'NOT_COMPARABLE_NO_AUTHORITATIVE_PRICE_SCHEDULE' }
}
export function compareCodexDevelopment(codexRows, v5Rows, apiRows) {
  const v5 = new Map(v5Rows.map(row => [row.id, row])), api = new Map(apiRows.map(row => [row.id, row]))
  const matched = [], overlap = []
  if (new Set(codexRows.map(row => row.id)).size !== codexRows.length) throw new Error('CODEX_DUPLICATE_CASE')
  for (const row of codexRows) {
    const existing = v5.get(row.id)
    if (!existing || JSON.stringify(existing.label) !== JSON.stringify(row.label)
      || existing.results.criteriaV5.developmentGuard.evidenceHash !== row.results.codex.developmentGuard.evidenceHash) {
      throw new Error('CODEX_COMPARISON_INPUT_MISMATCH')
    }
    const common = { ...row, results: { ...row.results, criteriaV5: existing.results.criteriaV5 } }
    matched.push(common)
    const direct = api.get(row.id)
    if (direct) {
      if (JSON.stringify(direct.label) !== JSON.stringify(row.label)
        || direct.results.luna.developmentGuard.evidenceHash !== row.results.codex.developmentGuard.evidenceHash) throw new Error('CODEX_COMPARISON_INPUT_MISMATCH')
      overlap.push({ ...common, results: { ...common.results, luna: direct.results.luna } })
    }
  }
  return { codexComplete: matched.length, totalDevelopment: 113,
    cohortA: { cases: matched.length, full113: matched.length === 113,
      scores: { criteriaV5: scoreCodexCohort(matched, 'criteriaV5'), codex: scoreCodexCohort(matched, 'codex') } },
    cohortB: { cases: overlap.length, selectionBias: 'API_AVAILABLE_SUBSET_NOT_REPRESENTATIVE_OF_FULL113',
      scores: { criteriaV5: scoreCodexCohort(overlap, 'criteriaV5'), luna: scoreCodexCohort(overlap, 'luna'), codex: scoreCodexCohort(overlap, 'codex') },
      classificationAgreement: { numerator: overlap.filter(row => row.results.luna.normalized.classification === row.results.codex.normalized.classification).length,
        denominator: overlap.length, value: overlap.length ? overlap.filter(row => row.results.luna.normalized.classification === row.results.codex.normalized.classification).length / overlap.length : null } },
    executionDifferences: 'KNOWN_DIFFERENT_CONFIG_AND_EXECUTION_SURFACES; CAUSAL_ATTRIBUTION_OF_OUTPUT_DIFFERENCES_UNMEASURED',
    originalApiComparisonGate: 'STILL_REQUIRED', selectedProductionCandidate: 'NONE', heldOutExecuted: false }
}
export function codexConsistency(receipt, caseIds) {
  const unstable = []
  if (caseIds.length === 0 || new Set(caseIds).size !== caseIds.length || receipt.results.length !== caseIds.length * 5) return { status: 'INCOMPLETE', unstable }
  if (new Set(receipt.results.map(row => row.identity.configHash)).size !== 1) return { status: 'INCOMPLETE', unstable }
  const fields = {
    classification: run => run.normalized.classification, severity: run => run.normalized.severity,
    evidenceSufficiency: run => run.normalized.evidenceSufficient, review: run => run.normalized.needsHumanReview,
    route: run => run.gate.route, safeUphold: run => run.gate.route === 'PROVISIONAL_AUTO_UPHELD',
    safeWaive: run => run.gate.route === 'PROVISIONAL_AUTO_WAIVED',
  }
  for (const caseId of caseIds) {
    const rows = receipt.results.filter(row => row.identity.caseId === caseId)
    if (rows.length !== 5 || JSON.stringify(rows.map(row => row.identity.observation).sort((a, b) => a - b)) !== '[1,2,3,4,5]'
      || rows.some(row => row.identity.backendId !== 'luna-codex' || !row.result.success)) return { status: 'INCOMPLETE', unstable }
    const values = Object.fromEntries(Object.entries(fields).map(([field, select]) => [field,
      rows.map(row => ({ observation: row.identity.observation, value: select(row.result.guardedRun) }))]))
    const changed = Object.entries(values).filter(([, observations]) => new Set(observations.map(row => row.value)).size > 1).map(([field]) => field)
    if (changed.length) unstable.push({ caseId, fields: changed, observations: values })
  }
  return { status: unstable.length ? 'FAIL' : 'PASS', cases: caseIds.length, observations: caseIds.length * 5, unstable, majorityVotingApplied: false }
}
