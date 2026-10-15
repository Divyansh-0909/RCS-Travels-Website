import {
  responsibilityClassification,
  responsibilitySeverity,
  suggestedActionCategory,
} from './responsibilityContracts.js'
import { responsibilityRequiredEvidenceByCase } from './responsibilityEvidence.js'
import { validateAnalysisAgainstEvidence } from './responsibilityAnalyst.js'
import { responsibilityCaseState } from './responsibilityCaseState.js'
import { independentResponsibilityGates } from './responsibilityEvidenceSafety.js'

export const RESPONSIBILITY_POLICY_VERSION = 'scheduled-responsibility-policy-v1'

export const provisionalResponsibilityRoute = Object.freeze({
  PROVISIONAL_AUTO_UPHELD: 'PROVISIONAL_AUTO_UPHELD',
  PROVISIONAL_AUTO_WAIVED: 'PROVISIONAL_AUTO_WAIVED',
  NEEDS_ADMIN_REVIEW: 'NEEDS_ADMIN_REVIEW',
})

const commonAutomation = Object.freeze({
  autoWaiveAllowed: true,
  autoUpholdAllowed: false,
  allowedSeverities: [responsibilitySeverity.LOW, responsibilitySeverity.MODERATE],
  minConfidence: 0.8,
  freshnessRequiredCategories: [],
  maxAgeMsByCategory: {},
})

export const DEFAULT_RESPONSIBILITY_POLICY = Object.freeze({
  policyVersion: RESPONSIBILITY_POLICY_VERSION,
  cases: Object.freeze({
    DRIVER_CANCELLATION: Object.freeze({
      ...commonAutomation,
      autoUpholdAllowed: true,
      requiredCategories: responsibilityRequiredEvidenceByCase.DRIVER_CANCELLATION,
      freshnessRequiredCategories: ['assignment', 'cancellation'],
      maxAgeMsByCategory: { assignment: 15 * 60 * 1000, cancellation: 5 * 60 * 1000 },
    }),
    FAILED_PICKUP: Object.freeze({
      ...commonAutomation,
      requiredCategories: responsibilityRequiredEvidenceByCase.FAILED_PICKUP,
      freshnessRequiredCategories: ['routing', 'location', 'connectivity', 'notification'],
      maxAgeMsByCategory: { routing: 10 * 60 * 1000, location: 5 * 60 * 1000, connectivity: 5 * 60 * 1000,
        notification: 10 * 60 * 1000 },
    }),
    DRIVER_LATE: Object.freeze({ ...commonAutomation, requiredCategories: responsibilityRequiredEvidenceByCase.DRIVER_LATE }),
    DRIVER_OFFLINE: Object.freeze({ ...commonAutomation, requiredCategories: responsibilityRequiredEvidenceByCase.DRIVER_OFFLINE }),
    RIDER_CANCELLATION: Object.freeze({ ...commonAutomation, requiredCategories: responsibilityRequiredEvidenceByCase.RIDER_CANCELLATION }),
    PLATFORM_ASSIGNMENT_FAILURE: Object.freeze({
      ...commonAutomation,
      requiredCategories: responsibilityRequiredEvidenceByCase.PLATFORM_ASSIGNMENT_FAILURE,
      freshnessRequiredCategories: ['feasibility'],
      maxAgeMsByCategory: { feasibility: 10 * 60 * 1000 },
    }),
    REPLACEMENT_FAILURE: Object.freeze({ ...commonAutomation, requiredCategories: responsibilityRequiredEvidenceByCase.REPLACEMENT_FAILURE }),
  }),
})

export const responsibilityEvaluationKey = ({ caseId, evidenceHash, analysisId, policyVersion }) =>
  [caseId, evidenceHash, analysisId, policyVersion].join(':')

const availableByCategory = bundle => {
  const grouped = new Map()
  for (const entry of bundle.timeline ?? []) {
    if (entry.availability !== 'available') continue
    const values = grouped.get(entry.category) ?? []
    values.push(entry)
    grouped.set(entry.category, values)
  }
  return grouped
}

const freshnessAge = entry => {
  if (entry.quality?.fresh === true) return 0
  if (Number.isFinite(entry.quality?.ageMs)) return entry.quality.ageMs
  const observed = Date.parse(entry.observedAt)
  const received = Date.parse(entry.receivedAt)
  if (!Number.isFinite(observed) || !Number.isFinite(received)) return Number.POSITIVE_INFINITY
  return Math.max(0, received - observed)
}

const requiredEvidenceCheck = (bundle, casePolicy) => {
  const grouped = availableByCategory(bundle)
  const missing = casePolicy.requiredCategories.filter(category => !grouped.has(category))
  return { pass: missing.length === 0, detail: missing.length ? `missing:${missing.join(',')}` : 'complete' }
}

const freshnessCheck = (bundle, casePolicy) => {
  const grouped = availableByCategory(bundle)
  const stale = casePolicy.freshnessRequiredCategories.filter((category) => {
    const entries = grouped.get(category) ?? []
    const maxAge = casePolicy.maxAgeMsByCategory[category] ?? 0
    return !entries.some(entry => freshnessAge(entry) <= maxAge)
  })
  return { pass: stale.length === 0, detail: stale.length ? `stale-or-unproven:${stale.join(',')}` : 'fresh' }
}

const qualityCheck = bundle => {
  const ids = new Set((bundle.timeline ?? []).map(entry => entry.id))
  const invalid = (bundle.timeline ?? []).filter(entry => entry.quality?.invalid === true
    || entry.quality?.provenance === 'missing'
    || (entry.basis === 'derived' && entry.derivedFrom.some(id => !ids.has(id))))
  return { pass: invalid.length === 0, detail: invalid.length ? `invalid:${invalid.map(item => item.id).join(',')}` : 'acceptable' }
}

const compatibilityCheck = analysis => {
  const classification = analysis.suggestedClassification
  const action = analysis.suggestedActionCategory
  if (classification === responsibilityClassification.DRIVER_CAUSED) {
    return action === suggestedActionCategory.AUTO_UPHOLD_CANDIDATE
  }
  if ([responsibilityClassification.PLATFORM_CAUSED, responsibilityClassification.VALID_WAIVED].includes(classification)) {
    return action === suggestedActionCategory.AUTO_WAIVE_CANDIDATE
  }
  return action === suggestedActionCategory.ADMIN_REVIEW
}

const gateResult = (route, policyVersion, evaluatedAt, passedGates, failedGates, reasons) => ({
  route,
  policyVersion,
  evaluatedAt: evaluatedAt.toISOString(),
  passedGates,
  failedGates,
  reasons,
  humanReviewRequired: route === provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW,
})

const createGateAudit = () => {
  const passedGates = []
  const failedGates = []
  const reasons = []
  return {
    passedGates,
    failedGates,
    reasons,
    add(code, pass, detail) {
      const item = { code, detail }
      ;(pass ? passedGates : failedGates).push(item)
      if (!pass) reasons.push(`${code}:${detail}`)
    },
  }
}

const adminReviewResult = (policyVersion, evaluatedAt, audit) => gateResult(
  provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW,
  policyVersion,
  evaluatedAt,
  audit.passedGates,
  audit.failedGates,
  audit.reasons,
)

const runEvidenceAndEnvelopeGates = ({
  evidence,
  analysisEnvelope,
  evidenceHash,
  currentState,
  idempotencyKey,
  policy,
  casePolicy,
  audit,
}) => {
  const validation = validateAnalysisAgainstEvidence(evidence, analysisEnvelope)
  audit.add('ANALYSIS_VALIDATION', validation.valid, validation.valid ? 'valid' : validation.errors.join(','))
  audit.add('CURRENT_STATE', currentState === responsibilityCaseState.POLICY_EVALUATION, currentState)
  const expectedKey = responsibilityEvaluationKey({
    caseId: evidence.caseId,
    evidenceHash,
    analysisId: analysisEnvelope?.analysisId ?? 'invalid-analysis',
    policyVersion: policy.policyVersion,
  })
  audit.add('IDEMPOTENCY_KEY', idempotencyKey === expectedKey, idempotencyKey === expectedKey ? 'valid' : 'invalid')

  const required = requiredEvidenceCheck(evidence, casePolicy)
  audit.add('REQUIRED_EVIDENCE', required.pass, required.detail)
  const fresh = freshnessCheck(evidence, casePolicy)
  audit.add('EVIDENCE_FRESHNESS', fresh.pass, fresh.detail)
  const quality = qualityCheck(evidence)
  audit.add('EVIDENCE_QUALITY', quality.pass, quality.detail)
  audit.add('MATERIAL_CONTRADICTIONS', (evidence.contradictions?.length ?? 0) === 0,
    evidence.contradictions?.length ? 'unresolved' : 'none')
  if (validation.valid) {
    for (const check of independentResponsibilityGates(evidence, analysisEnvelope.output.suggestedClassification, casePolicy.requiredCategories)) {
      audit.add(check.code, check.pass, check.detail)
    }
  }
  return validation
}

const runStructuredAnalysisGates = (output, casePolicy, audit) => {
  audit.add('AI_REPORTED_MISSING_EVIDENCE', output.missingEvidence.length === 0,
    output.missingEvidence.length ? 'reported' : 'none')
  audit.add('AI_REPORTED_CONTRADICTIONS', output.contradictions.length === 0,
    output.contradictions.length ? 'reported' : 'none')
  audit.add('CLASSIFICATION_ACTION_COMPATIBILITY', compatibilityCheck(output),
    `${output.suggestedClassification}/${output.suggestedActionCategory}`)
  audit.add('CONFIDENCE_FLOOR', output.confidence >= casePolicy.minConfidence, String(output.confidence))
  audit.add('SEVERITY_ALLOWLIST', casePolicy.allowedSeverities.includes(output.severityAssessment), output.severityAssessment)
}

const routeEligibleAnalysis = (output, casePolicy, policyVersion, evaluatedAt, audit) => {
  if (output.suggestedClassification === responsibilityClassification.DRIVER_CAUSED) {
    audit.add('AUTO_UPHOLD_ENABLED', casePolicy.autoUpholdAllowed, casePolicy.autoUpholdAllowed ? 'enabled' : 'disabled')
    const route = casePolicy.autoUpholdAllowed
      ? provisionalResponsibilityRoute.PROVISIONAL_AUTO_UPHELD
      : provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW
    return gateResult(route, policyVersion, evaluatedAt, audit.passedGates, audit.failedGates, audit.reasons)
  }

  const safeWaive = [responsibilityClassification.PLATFORM_CAUSED, responsibilityClassification.VALID_WAIVED]
    .includes(output.suggestedClassification)
  const autoWaiveAllowed = safeWaive && casePolicy.autoWaiveAllowed
  audit.add('AUTO_WAIVE_ENABLED', autoWaiveAllowed, autoWaiveAllowed ? 'enabled' : 'disabled-or-ineligible')
  const route = autoWaiveAllowed
    ? provisionalResponsibilityRoute.PROVISIONAL_AUTO_WAIVED
    : provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW
  return gateResult(route, policyVersion, evaluatedAt, audit.passedGates, audit.failedGates, audit.reasons)
}

export function evaluateResponsibilityPolicy({
  evidence,
  analysisEnvelope,
  evidenceHash,
  currentState,
  idempotencyKey,
  policy = DEFAULT_RESPONSIBILITY_POLICY,
  evaluatedAt = new Date(),
}) {
  const audit = createGateAudit()
  const casePolicy = policy.cases[evidence?.caseType]
  audit.add('CASE_TYPE_ALLOWLIST', Boolean(casePolicy), casePolicy ? 'allowed' : 'unknown-or-disabled')
  if (!casePolicy) return adminReviewResult(policy.policyVersion, evaluatedAt, audit)

  const validation = runEvidenceAndEnvelopeGates({
    evidence,
    analysisEnvelope,
    evidenceHash,
    currentState,
    idempotencyKey,
    policy,
    casePolicy,
    audit,
  })
  if (!validation.valid) return adminReviewResult(policy.policyVersion, evaluatedAt, audit)

  const output = analysisEnvelope.output
  runStructuredAnalysisGates(output, casePolicy, audit)
  if (audit.failedGates.length > 0) return adminReviewResult(policy.policyVersion, evaluatedAt, audit)
  return routeEligibleAnalysis(output, casePolicy, policy.policyVersion, evaluatedAt, audit)
}
