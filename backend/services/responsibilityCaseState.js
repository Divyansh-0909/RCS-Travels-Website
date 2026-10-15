export const responsibilityCaseState = Object.freeze({
  EVIDENCE_COLLECTING: 'EVIDENCE_COLLECTING',
  AI_REVIEW: 'AI_REVIEW',
  POLICY_EVALUATION: 'POLICY_EVALUATION',
  PROVISIONAL_AUTO_UPHELD: 'PROVISIONAL_AUTO_UPHELD',
  PROVISIONAL_AUTO_WAIVED: 'PROVISIONAL_AUTO_WAIVED',
  NEEDS_ADMIN_REVIEW: 'NEEDS_ADMIN_REVIEW',
  PROVISIONAL_ADMIN_UPHELD: 'PROVISIONAL_ADMIN_UPHELD',
  PROVISIONAL_ADMIN_WAIVED: 'PROVISIONAL_ADMIN_WAIVED',
  APPEAL_WINDOW: 'APPEAL_WINDOW',
  APPEAL_OPEN: 'APPEAL_OPEN',
  APPEAL_REVIEW: 'APPEAL_REVIEW',
  FINAL_UPHELD: 'FINAL_UPHELD',
  FINAL_WAIVED: 'FINAL_WAIVED',
})

const responsibilityTransitions = Object.freeze({
  EVIDENCE_COLLECTING: ['AI_REVIEW'],
  AI_REVIEW: ['POLICY_EVALUATION', 'NEEDS_ADMIN_REVIEW'],
  POLICY_EVALUATION: ['PROVISIONAL_AUTO_UPHELD', 'PROVISIONAL_AUTO_WAIVED', 'NEEDS_ADMIN_REVIEW'],
  PROVISIONAL_AUTO_UPHELD: ['APPEAL_WINDOW'],
  PROVISIONAL_AUTO_WAIVED: ['FINAL_WAIVED'],
  NEEDS_ADMIN_REVIEW: ['PROVISIONAL_ADMIN_UPHELD', 'PROVISIONAL_ADMIN_WAIVED'],
  PROVISIONAL_ADMIN_UPHELD: ['APPEAL_WINDOW'],
  PROVISIONAL_ADMIN_WAIVED: ['FINAL_WAIVED'],
  APPEAL_WINDOW: ['APPEAL_OPEN', 'FINAL_UPHELD'],
  APPEAL_OPEN: ['APPEAL_REVIEW'],
  APPEAL_REVIEW: ['FINAL_UPHELD', 'FINAL_WAIVED'],
})

export function canTransitionResponsibilityState(from, to, { adverseNoticeDelivered = false } = {}) {
  const allowed = responsibilityTransitions[from] ?? []
  if (!allowed.includes(to)) return false
  if (to === responsibilityCaseState.APPEAL_WINDOW && !adverseNoticeDelivered) return false
  return true
}

export function assertResponsibilityStateTransition(from, to, options) {
  if (!canTransitionResponsibilityState(from, to, options)) {
    throw new Error(`Illegal responsibility state transition: ${from} -> ${to}`)
  }
  return to
}

const successfulDeliveryAt = notification => notification?.deliveredAt ?? notification?.readAt ?? null

/**
 * Appeal preparation only. It never mutates case state or finalizes a case.
 * Provider acceptance/sent states cannot start the frozen 24-hour clock.
 */
export function appealWindowEligibility({ caseState, adverseNotice, now = new Date() }) {
  const adverse = caseState === responsibilityCaseState.PROVISIONAL_AUTO_UPHELD
    || caseState === responsibilityCaseState.PROVISIONAL_ADMIN_UPHELD
  const deliveredAt = successfulDeliveryAt(adverseNotice)
  if (!adverse || !deliveredAt) {
    return { eligible: false, deliveredAt: null, closesAt: null, open: false }
  }
  const delivered = new Date(deliveredAt)
  const closesAt = new Date(delivered.getTime() + 24 * 60 * 60 * 1000)
  return {
    eligible: true,
    deliveredAt: delivered.toISOString(),
    closesAt: closesAt.toISOString(),
    open: new Date(now).getTime() <= closesAt.getTime(),
  }
}
