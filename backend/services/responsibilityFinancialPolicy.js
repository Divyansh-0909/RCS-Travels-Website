import { responsibilityCaseType } from './responsibilityEvidence.js'

export const responsibilityFinancialDisposition = Object.freeze({
  FINANCIALLY_SUPPORTED_DRIVER_INCIDENT: 'FINANCIALLY_SUPPORTED_DRIVER_INCIDENT',
  EXPLICITLY_NON_FINANCIAL: 'EXPLICITLY_NON_FINANCIAL',
  NOT_YET_SAFE: 'NOT_YET_SAFE',
})

// This is deliberately exhaustive. Adding a Phase 4/5 case type requires a
// financial policy decision here before it can enter the executor.
export const responsibilityFinancialPolicyByCaseType = Object.freeze({
  [responsibilityCaseType.DRIVER_CANCELLATION]: Object.freeze({
    disposition: responsibilityFinancialDisposition.FINANCIALLY_SUPPORTED_DRIVER_INCIDENT,
    fareSource: 'booking_state_at_driver_cancellation.authoritativeFarePaise',
  }),
  [responsibilityCaseType.FAILED_PICKUP]: Object.freeze({
    disposition: responsibilityFinancialDisposition.NOT_YET_SAFE,
    blockedReason: 'FINANCIAL_SEMANTICS_UNSUPPORTED_FAILED_PICKUP',
  }),
  [responsibilityCaseType.DRIVER_LATE]: Object.freeze({
    disposition: responsibilityFinancialDisposition.NOT_YET_SAFE,
    blockedReason: 'FINANCIAL_SEMANTICS_UNSUPPORTED_DRIVER_LATE',
  }),
  [responsibilityCaseType.DRIVER_OFFLINE]: Object.freeze({
    disposition: responsibilityFinancialDisposition.NOT_YET_SAFE,
    blockedReason: 'FINANCIAL_SEMANTICS_UNSUPPORTED_DRIVER_OFFLINE',
  }),
  [responsibilityCaseType.RIDER_CANCELLATION]: Object.freeze({
    disposition: responsibilityFinancialDisposition.NOT_YET_SAFE,
    blockedReason: 'FINANCIAL_SEMANTICS_UNSUPPORTED_RIDER_CANCELLATION',
  }),
  [responsibilityCaseType.PLATFORM_ASSIGNMENT_FAILURE]: Object.freeze({
    disposition: responsibilityFinancialDisposition.EXPLICITLY_NON_FINANCIAL,
    blockedReason: 'FINANCIAL_CASE_TYPE_NON_FINANCIAL',
  }),
  [responsibilityCaseType.REPLACEMENT_FAILURE]: Object.freeze({
    disposition: responsibilityFinancialDisposition.NOT_YET_SAFE,
    blockedReason: 'FINANCIAL_SEMANTICS_UNSUPPORTED_REPLACEMENT_FAILURE',
  }),
})

export const durableFinancialBlockedReasons = Object.freeze([...new Set([
  'FINANCIAL_CASE_TYPE_UNCLASSIFIED',
  'FINALIZED_DRIVER_CLASSIFICATION_MISSING',
  ...Object.values(responsibilityFinancialPolicyByCaseType)
    .map(policy => policy.blockedReason)
    .filter(Boolean),
])])

export function financialPolicyForCaseType(caseType) {
  const policy = responsibilityFinancialPolicyByCaseType[caseType]
  if (!policy) return {
    disposition: responsibilityFinancialDisposition.NOT_YET_SAFE,
    blockedReason: 'FINANCIAL_CASE_TYPE_UNCLASSIFIED',
  }
  return policy
}
