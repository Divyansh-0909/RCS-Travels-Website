export const RESPONSIBILITY_LIABILITY_PERCENT = 10
export const RESPONSIBILITY_LIABILITY_CAP_PAISE = 10_000
export const SCHEDULED_ADVANCE_PERCENT = 10

/**
 * Responsibility financial calculations use non-negative, safe integer paise.
 * This prevents fractional currency and avoids silently losing precision in a
 * ledger calculation.
 */
export function assertPaise(value, name = 'value') {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer number of paise`)
  }
}

/**
 * Calculates the responsible party's liability as the lesser of 10% of fare
 * and ₹100. Because inputs are paise, dividing by ten can produce half a
 * paise. Ties round up (Math.round for non-negative values), making the rule
 * deterministic without converting through rupees.
 */
export function liabilityPaiseForFare(farePaise) {
  assertPaise(farePaise, 'farePaise')
  return Math.min(RESPONSIBILITY_LIABILITY_CAP_PAISE, Math.round(farePaise / 10))
}

/**
 * Applies the ordinary coupon first, then compensation only to the fare that
 * remains. Requested amounts are capped at the available balance so the
 * resulting customer obligation cannot become negative.
 */
export function customerObligationPaise({ farePaise, couponPaise = 0, compensationPaise = 0 }) {
  assertPaise(farePaise, 'farePaise')
  assertPaise(couponPaise, 'couponPaise')
  assertPaise(compensationPaise, 'compensationPaise')

  const appliedCouponPaise = Math.min(farePaise, couponPaise)
  const afterCouponPaise = farePaise - appliedCouponPaise
  const appliedCompensationPaise = Math.min(afterCouponPaise, compensationPaise)
  const obligationPaise = afterCouponPaise - appliedCompensationPaise

  return { appliedCouponPaise, appliedCompensationPaise, obligationPaise }
}

/**
 * Scheduled payment arithmetic: round the 10% advance to the nearest whole
 * rupee, then derive the remainder from the exact paise obligation. At .50
 * rupees and above, Math.round chooses the higher rupee.
 */
export function scheduledAdvancePaiseForObligation(obligationPaise) {
  assertPaise(obligationPaise, 'obligationPaise')
  const advancePaise = Math.min(obligationPaise, Math.round(obligationPaise / 1_000) * 100)
  return { advancePaise, remainingPaise: obligationPaise - advancePaise }
}

/**
 * Verifies the conservation identity for a liability after recovery:
 * gross liability - recovered amount = net outstanding amount.
 */
export function assertGrossRecoveryNetInvariant({ grossPaise, recoveryPaise, netPaise }) {
  assertPaise(grossPaise, 'grossPaise')
  assertPaise(recoveryPaise, 'recoveryPaise')
  assertPaise(netPaise, 'netPaise')
  if (recoveryPaise > grossPaise) {
    throw new RangeError('recoveryPaise must not exceed grossPaise')
  }
  if (grossPaise - recoveryPaise !== netPaise) {
    throw new RangeError('grossPaise minus recoveryPaise must equal netPaise')
  }
  return true
}
