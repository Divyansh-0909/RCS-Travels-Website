import test from 'node:test'
import assert from 'node:assert/strict'

import { responsibilityCaseState } from '../services/responsibilityCaseState.js'
import { responsibilityClassification } from '../services/responsibilityContracts.js'
import {
  ensureAdverseNoticeWindow,
  syncAppealWindow,
} from '../services/responsibilityNoticeService.js'
import { reviewResponsibilityCase } from '../services/responsibilityReviewService.js'
import {
  reviewResponsibilityAppeal,
  submitDriverAppeal,
} from '../services/responsibilityAppealService.js'
import {
  finalizeNoAppeal,
  processFinalizationHandoff,
} from '../services/responsibilityFinalizationService.js'
import { processProvisionalResponsibilityDecision } from '../services/responsibilityProvisionalLifecycle.js'

const at = value => new Date(value)
const fixedClock = value => ({ now: () => at(value) })

function createRepository({
  state = responsibilityCaseState.PROVISIONAL_AUTO_UPHELD,
  policyVersion = 'policy-v1',
} = {}) {
  let id = 0
  const next = prefix => `${prefix}-${++id}`
  const data = {
    case: {
      id: 'case-1',
      bookingId: 'booking-1',
      state,
      evidenceHash: 'evidence-hash',
      evidenceVersion: 3,
      evidenceSnapshot: { timeline: [{ evidenceId: 'ev-1' }] },
    },
    booking: {
      id: 'booking-1',
      reference: 'RCS-1',
      driverId: 'driver-1',
      driver: { id: 'driver-1', name: 'Captain', phone: '9999999999', fcmToken: 'fcm' },
    },
    provisional: {
      id: 'provisional-1',
      caseId: 'case-1',
      policyVersion,
      route: state,
    },
    adminReview: null,
    appealWindow: null,
    appeal: null,
    appealReview: null,
    finalDecision: null,
    handoff: null,
    deliveries: [],
  }

  const repository = {
    data,
    findCase: async caseId => caseId === data.case.id ? { ...data.case } : null,
    findBookingDriver: async bookingId => bookingId === data.booking.id ? { ...data.booking } : null,
    findProvisionalDecision: async caseId => caseId === data.case.id ? data.provisional : null,
    findLatestAnalysis: async () => null,
    findAdminReview: async () => data.adminReview,
    createAdminReview: async record => {
      if (!data.adminReview) data.adminReview = { id: next('admin-review'), ...record }
      return data.adminReview
    },
    findAppealWindow: async () => data.appealWindow,
    createAppealWindow: async record => {
      if (!data.appealWindow) {
        data.appealWindow = {
          id: next('window'),
          appealStartedAt: null,
          appealDeadline: null,
          ...record,
        }
      }
      return data.appealWindow
    },
    startAppealWindow: async (caseId, appealStartedAt, appealDeadline) => {
      if (
        data.appealWindow?.caseId === caseId
        && !data.appealWindow.appealStartedAt
        && !data.appealWindow.appealDeadline
      ) {
        data.appealWindow.appealStartedAt = appealStartedAt
        data.appealWindow.appealDeadline = appealDeadline
        return { count: 1 }
      }
      return { count: 0 }
    },
    findNotificationDeliveries: async retryKey => data.deliveries.filter(row => row.retryKey === retryKey),
    findAppeal: async () => data.appeal,
    createAppeal: async record => {
      if (!data.appeal) data.appeal = { id: next('appeal'), ...record }
      return data.appeal
    },
    setAppealStatus: async (appealId, status) => {
      assert.equal(data.appeal?.id, appealId)
      data.appeal.status = status
      return data.appeal
    },
    findAppealReview: async () => data.appealReview,
    createAppealReview: async record => {
      if (!data.appealReview) data.appealReview = { id: next('appeal-review'), ...record }
      return data.appealReview
    },
    findFinalDecision: async () => data.finalDecision,
    createFinalDecision: async record => {
      if (!data.finalDecision) data.finalDecision = { id: next('final'), ...record }
      return data.finalDecision
    },
    findHandoff: async () => data.handoff,
    createHandoff: async record => {
      if (!data.handoff) {
        data.handoff = {
          id: next('handoff'),
          attemptCount: 0,
          lastAttemptAt: null,
          completedAt: null,
          lastError: null,
          ...record,
        }
      }
      return data.handoff
    },
    claimHandoff: async (handoffId, attemptedAt, staleBefore) => {
      const row = data.handoff
      if (!row || row.id !== handoffId) return { count: 0 }
      const stale = row.status === 'PROCESSING'
        && (!row.lastAttemptAt || new Date(row.lastAttemptAt).getTime() <= staleBefore.getTime())
      if (row.status !== 'PENDING' && !stale) return { count: 0 }
      row.status = 'PROCESSING'
      row.attemptCount += 1
      row.lastAttemptAt = attemptedAt
      row.lastError = null
      return { count: 1 }
    },
    markHandoffCompleted: async (handoffId, claimedAt, completedAt) => {
      const row = data.handoff
      if (
        !row
        || row.id !== handoffId
        || row.status !== 'PROCESSING'
        || new Date(row.lastAttemptAt).getTime() !== claimedAt.getTime()
      ) return { count: 0 }
      row.status = 'COMPLETED'
      row.completedAt = completedAt
      row.lastError = null
      return { count: 1 }
    },
    markHandoffFailed: async (handoffId, claimedAt, lastError) => {
      const row = data.handoff
      if (
        !row
        || row.id !== handoffId
        || row.status !== 'PROCESSING'
        || new Date(row.lastAttemptAt).getTime() !== claimedAt.getTime()
      ) return { count: 0 }
      row.status = 'PENDING'
      row.lastError = lastError
      return { count: 1 }
    },
    setCaseState: async (caseId, nextState) => {
      assert.equal(caseId, data.case.id)
      data.case.state = nextState
      return data.case
    },
    withLockedCase: async (caseId, work) => work(repository, caseId === data.case.id ? { ...data.case } : null),
  }
  return repository
}

async function prepareDeliveredWindow(repository, deliveredAt = '2026-09-25T18:42:00.000Z') {
  const window = await ensureAdverseNoticeWindow('case-1', { repository })
  repository.data.deliveries.push({
    retryKey: window.noticeRetryKey,
    status: 'DELIVERED',
    deliveredAt: at(deliveredAt),
    readAt: null,
  })
  return syncAppealWindow('case-1', { repository })
}

test('auto-upheld adverse decision finalizes only after confirmed delivery and 24 hours', async () => {
  const repository = createRepository()
  const window = await prepareDeliveredWindow(repository)
  assert.equal(repository.data.case.state, responsibilityCaseState.APPEAL_WINDOW)
  assert.equal(window.appealStartedAt.toISOString(), '2026-09-25T18:42:00.000Z')
  assert.equal(window.appealDeadline.toISOString(), '2026-09-26T18:42:00.000Z')

  let authorizations = 0
  const result = await finalizeNoAppeal('case-1', {
    repository,
    clock: fixedClock('2026-09-26T18:42:00.001Z'),
    consequenceExecutor: async () => {
      authorizations += 1
      return { status: 'AUTHORIZED' }
    },
  })
  assert.equal(result.finalDecision.outcome, responsibilityCaseState.FINAL_UPHELD)
  assert.equal(repository.data.case.state, responsibilityCaseState.FINAL_UPHELD)
  assert.equal(repository.data.handoff.status, 'COMPLETED')
  assert.equal(authorizations, 1)
})

test('provider accepted, failed, or unknown notice evidence cannot start the appeal clock', async () => {
  for (const row of [
    { status: 'PROVIDER_ACCEPTED', providerAcceptedAt: at('2026-09-25T18:00:00Z') },
    { status: 'FAILED', failedAt: at('2026-09-25T18:01:00Z') },
    { status: 'UNKNOWN' },
  ]) {
    const repository = createRepository()
    const window = await ensureAdverseNoticeWindow('case-1', { repository })
    repository.data.deliveries.push({ retryKey: window.noticeRetryKey, deliveredAt: null, readAt: null, ...row })
    const synced = await syncAppealWindow('case-1', { repository })
    assert.equal(synced.appealStartedAt, null)
    assert.equal(repository.data.case.state, responsibilityCaseState.PROVISIONAL_AUTO_UPHELD)
    await assert.rejects(
      finalizeNoAppeal('case-1', { repository, clock: fixedClock('2026-09-30T00:00:00Z') }),
      error => error.code === 'APPEAL_WINDOW_NOT_ACTIVE',
    )
  }
})

test('earliest successful delivery across channels is authoritative and later callbacks do not reset it', async () => {
  const repository = createRepository()
  const window = await ensureAdverseNoticeWindow('case-1', { repository })
  repository.data.deliveries.push(
    { retryKey: window.noticeRetryKey, status: 'UNKNOWN', deliveredAt: null, readAt: null },
    { retryKey: window.noticeRetryKey, status: 'DELIVERED', deliveredAt: at('2026-09-25T18:42:00Z'), readAt: null },
  )
  const first = await syncAppealWindow('case-1', { repository })
  repository.data.deliveries.push({
    retryKey: window.noticeRetryKey,
    status: 'READ',
    deliveredAt: at('2026-09-25T19:00:00Z'),
    readAt: at('2026-09-25T19:05:00Z'),
  })
  const second = await syncAppealWindow('case-1', { repository })
  assert.equal(first.appealStartedAt.toISOString(), '2026-09-25T18:42:00.000Z')
  assert.equal(second.appealStartedAt.toISOString(), first.appealStartedAt.toISOString())
  assert.equal(second.appealDeadline.toISOString(), first.appealDeadline.toISOString())
})

test('appeal deadline is inclusive and a timely appeal prevents no-appeal finalization', async () => {
  const repository = createRepository()
  await prepareDeliveredWindow(repository)
  const appeal = await submitDriverAppeal({
    caseId: 'case-1',
    driverId: 'driver-1',
    reason: 'GPS evidence is incomplete',
    additionalEvidence: ['driver-note-1'],
  }, {
    repository,
    clock: fixedClock('2026-09-26T18:42:00.000Z'),
  })
  assert.equal(appeal.appeal.additionalEvidence[0], 'driver-note-1')
  assert.equal(repository.data.case.state, responsibilityCaseState.APPEAL_OPEN)
  await assert.rejects(
    finalizeNoAppeal('case-1', { repository, clock: fixedClock('2026-09-26T18:42:00.001Z') }),
    error => error.code === 'APPEAL_WINDOW_NOT_ACTIVE',
  )
})

test('appeal submitted after the exact deadline is rejected without changing case state', async () => {
  const repository = createRepository()
  await prepareDeliveredWindow(repository)
  await assert.rejects(
    submitDriverAppeal({
      caseId: 'case-1',
      driverId: 'driver-1',
      reason: 'This is late',
    }, {
      repository,
      clock: fixedClock('2026-09-26T18:42:00.001Z'),
    }),
    error => error.code === 'APPEAL_EXPIRED',
  )
  assert.equal(repository.data.case.state, responsibilityCaseState.APPEAL_WINDOW)
  assert.equal(repository.data.appeal, null)
})

test('driver can appeal only their own case', async () => {
  const repository = createRepository()
  await prepareDeliveredWindow(repository)
  await assert.rejects(
    submitDriverAppeal({ caseId: 'case-1', driverId: 'driver-2', reason: 'Wrong case' }, { repository }),
    error => error.code === 'APPEAL_FORBIDDEN',
  )
})

test('admin uphold remains provisional and prepares notice; admin waive becomes final waived with no handoff', async () => {
  const upheld = createRepository({ state: responsibilityCaseState.NEEDS_ADMIN_REVIEW })
  let notices = 0
  const review = await reviewResponsibilityCase({
    caseId: 'case-1',
    adminActorId: 'admin-1',
    decision: 'UPHOLD',
    classification: responsibilityClassification.DRIVER_CAUSED,
    reason: 'Evidence supports the provisional finding',
  }, {
    repository: upheld,
    noticeSender: async () => {
      notices += 1
      return { queued: true }
    },
  })
  assert.equal(review.state, responsibilityCaseState.PROVISIONAL_ADMIN_UPHELD)
  assert.equal(upheld.data.case.state, responsibilityCaseState.PROVISIONAL_ADMIN_UPHELD)
  assert.equal(upheld.data.finalDecision, null)
  assert.equal(upheld.data.adminReview.classification, responsibilityClassification.DRIVER_CAUSED)
  assert.equal(notices, 1)

  const waived = createRepository({ state: responsibilityCaseState.NEEDS_ADMIN_REVIEW })
  const waiver = await reviewResponsibilityCase({
    caseId: 'case-1',
    adminActorId: 'admin-1',
    decision: 'WAIVE',
    reason: 'Platform evidence makes driver responsibility unsafe',
  }, { repository: waived, clock: fixedClock('2026-09-25T20:00:00Z') })
  assert.equal(waiver.finalization.finalDecision.outcome, responsibilityCaseState.FINAL_WAIVED)
  assert.equal(waived.data.case.state, responsibilityCaseState.FINAL_WAIVED)
  assert.equal(waived.data.handoff, null)
})

test('new upheld human decisions require an explicit, idempotent final classification', async () => {
  const admin = createRepository({ state: responsibilityCaseState.NEEDS_ADMIN_REVIEW })
  const adminInput = {
    caseId: 'case-1', adminActorId: 'admin-1', decision: 'UPHOLD',
    reason: 'The complete record supports an upheld responsibility finding',
  }
  await assert.rejects(
    reviewResponsibilityCase(adminInput, { repository: admin, notify: false }),
    error => error.code === 'FINAL_CLASSIFICATION_REQUIRED',
  )
  await assert.rejects(
    reviewResponsibilityCase({ ...adminInput, classification: responsibilityClassification.PLATFORM_CAUSED }, {
      repository: admin, notify: false,
    }),
    error => error.code === 'UPHELD_CLASSIFICATION_INCOMPATIBLE',
  )
  await reviewResponsibilityCase({ ...adminInput, classification: responsibilityClassification.DRIVER_CAUSED }, {
    repository: admin, notify: false,
  })
  const reused = await reviewResponsibilityCase({ ...adminInput, classification: responsibilityClassification.DRIVER_CAUSED }, {
    repository: admin, notify: false,
  })
  assert.equal(reused.reused, true)
  await assert.rejects(
    reviewResponsibilityCase({ ...adminInput, classification: responsibilityClassification.PLATFORM_CAUSED }, {
      repository: admin, notify: false,
    }),
    error => error.code === 'ADMIN_REVIEW_CONFLICT',
  )

  const appeal = createRepository()
  await prepareDeliveredWindow(appeal)
  await submitDriverAppeal({ caseId: 'case-1', driverId: 'driver-1', reason: 'Please reconsider this conclusion' }, {
    repository: appeal, clock: fixedClock('2026-09-25T19:00:00Z'),
  })
  const appealInput = {
    caseId: 'case-1', reviewerId: 'admin-2', outcome: 'UPHOLD',
    reason: 'The appeal does not change the final responsibility conclusion',
  }
  await assert.rejects(
    reviewResponsibilityAppeal(appealInput, { repository: appeal, authorize: false }),
    error => error.code === 'FINAL_CLASSIFICATION_REQUIRED',
  )
  await assert.rejects(
    reviewResponsibilityAppeal({ ...appealInput, classification: responsibilityClassification.VALID_WAIVED }, {
      repository: appeal, authorize: false,
    }),
    error => error.code === 'UPHELD_CLASSIFICATION_INCOMPATIBLE',
  )
  await reviewResponsibilityAppeal({ ...appealInput, classification: responsibilityClassification.DRIVER_CAUSED }, {
    repository: appeal, authorize: false,
  })
  await assert.rejects(
    reviewResponsibilityAppeal({ ...appealInput, classification: responsibilityClassification.PLATFORM_CAUSED }, {
      repository: appeal, authorize: false,
    }),
    error => error.code === 'FINAL_OUTCOME_CONFLICT',
  )
})

test('auto-waived provisional decisions finalize directly to immutable FINAL_WAIVED without a handoff', async () => {
  const repository = createRepository({ state: responsibilityCaseState.PROVISIONAL_AUTO_WAIVED })
  const result = await processProvisionalResponsibilityDecision('case-1', {
    repository,
    clock: fixedClock('2026-09-25T20:00:00Z'),
  })
  assert.equal(result.action, 'FINALIZE_WAIVER')
  assert.equal(repository.data.case.state, responsibilityCaseState.FINAL_WAIVED)
  assert.equal(repository.data.finalDecision.outcome, responsibilityCaseState.FINAL_WAIVED)
  assert.equal(repository.data.handoff, null)
})

test('appeal review uphold creates one final upheld handoff; waiver creates no handoff', async () => {
  for (const outcome of ['UPHOLD', 'WAIVE']) {
    const repository = createRepository()
    await prepareDeliveredWindow(repository)
    await submitDriverAppeal({
      caseId: 'case-1',
      driverId: 'driver-1',
      reason: 'Please review the additional context',
    }, { repository, clock: fixedClock('2026-09-26T12:00:00Z') })
    let authorizations = 0
    const result = await reviewResponsibilityAppeal({
      caseId: 'case-1',
      reviewerId: 'admin-2',
      outcome,
      classification: outcome === 'UPHOLD'
        ? responsibilityClassification.DRIVER_CAUSED
        : responsibilityClassification.VALID_WAIVED,
      reason: outcome === 'UPHOLD' ? 'Appeal does not change responsibility' : 'Appeal evidence supports waiver',
    }, {
      repository,
      clock: fixedClock('2026-09-26T13:00:00Z'),
      consequenceExecutor: async () => {
        authorizations += 1
        return { status: 'AUTHORIZED' }
      },
    })
    assert.equal(result.finalDecision.outcome, outcome === 'UPHOLD'
      ? responsibilityCaseState.FINAL_UPHELD
      : responsibilityCaseState.FINAL_WAIVED)
    assert.equal(authorizations, outcome === 'UPHOLD' ? 1 : 0)
    assert.equal(repository.data.handoff?.status ?? null, outcome === 'UPHOLD' ? 'COMPLETED' : null)
    assert.equal(result.finalDecision.classification, outcome === 'UPHOLD'
      ? responsibilityClassification.DRIVER_CAUSED
      : responsibilityClassification.VALID_WAIVED)
  }
})

test('authoritative consequence levels are persisted and copied into final decisions', async () => {
  const admin = createRepository({ state: responsibilityCaseState.NEEDS_ADMIN_REVIEW })
  await reviewResponsibilityCase({
    caseId: 'case-1', adminActorId: 'admin-1', decision: 'UPHOLD',
    classification: responsibilityClassification.DRIVER_CAUSED,
    consequenceLevel: 'LEVEL_2', reason: 'The record supports an elevated consequence',
  }, { repository: admin, notify: false })
  await prepareDeliveredWindow(admin)
  const noAppeal = await finalizeNoAppeal('case-1', {
    repository: admin, clock: fixedClock('2026-09-26T18:42:00.001Z'), authorize: false,
  })
  assert.equal(admin.data.adminReview.consequenceLevel, 'LEVEL_2')
  assert.equal(noAppeal.finalDecision.consequenceLevel, 'LEVEL_2')

  const appeal = createRepository()
  await prepareDeliveredWindow(appeal)
  await submitDriverAppeal({ caseId: 'case-1', driverId: 'driver-1', reason: 'Please reconsider this finding' }, {
    repository: appeal, clock: fixedClock('2026-09-26T12:00:00Z'),
  })
  const appealResult = await reviewResponsibilityAppeal({
    caseId: 'case-1', reviewerId: 'admin-2', outcome: 'UPHOLD',
    classification: responsibilityClassification.DRIVER_CAUSED,
    consequenceLevel: 'LEVEL_2', reason: 'The appeal confirms the elevated consequence',
  }, { repository: appeal, authorize: false })
  assert.equal(appeal.data.appealReview.consequenceLevel, 'LEVEL_2')
  assert.equal(appealResult.finalDecision.consequenceLevel, 'LEVEL_2')

  const autoWaived = createRepository({ state: responsibilityCaseState.PROVISIONAL_AUTO_WAIVED })
  const waiver = await processProvisionalResponsibilityDecision('case-1', { repository: autoWaived })
  assert.equal(waiver.finalization.finalDecision.consequenceLevel, 'LEVEL_0')

  const auto = createRepository()
  await prepareDeliveredWindow(auto)
  const autoFinal = await finalizeNoAppeal('case-1', {
    repository: auto, clock: fixedClock('2026-09-26T18:42:00.001Z'), authorize: false,
  })
  assert.equal(autoFinal.finalDecision.consequenceLevel, 'LEVEL_1')
})

test('a conflicting appeal-review outcome cannot rewrite an authoritative final decision', async () => {
  const repository = createRepository()
  await prepareDeliveredWindow(repository)
  await submitDriverAppeal({
    caseId: 'case-1',
    driverId: 'driver-1',
    reason: 'Please review this case',
  }, { repository, clock: fixedClock('2026-09-26T12:00:00Z') })
  await reviewResponsibilityAppeal({
    caseId: 'case-1',
    reviewerId: 'admin-2',
    outcome: 'WAIVE',
    reason: 'New appeal evidence supports waiver',
  }, { repository, clock: fixedClock('2026-09-26T13:00:00Z') })
  await assert.rejects(
    reviewResponsibilityAppeal({
      caseId: 'case-1',
      reviewerId: 'admin-3',
      outcome: 'UPHOLD',
      reason: 'Attempt to reverse the final outcome',
    }, { repository, clock: fixedClock('2026-09-26T14:00:00Z') }),
    error => error.code === 'FINAL_OUTCOME_CONFLICT',
  )
  assert.equal(repository.data.finalDecision.outcome, responsibilityCaseState.FINAL_WAIVED)
})

test('handoff failure remains retryable and retry authorizes exactly once successfully', async () => {
  const repository = createRepository()
  await prepareDeliveredWindow(repository)
  await finalizeNoAppeal('case-1', {
    repository,
    clock: fixedClock('2026-09-26T18:42:00.001Z'),
    authorize: false,
  })
  let attempts = 0
  await assert.rejects(
    processFinalizationHandoff('case-1', {
      repository,
      clock: fixedClock('2026-09-26T19:00:00Z'),
      consequenceExecutor: async () => {
        attempts += 1
        throw new Error('simulated crash after durable final decision')
      },
    }),
    /simulated crash/,
  )
  assert.equal(repository.data.handoff.status, 'PENDING')
  const recovered = await processFinalizationHandoff('case-1', {
    repository,
    clock: fixedClock('2026-09-26T19:01:00Z'),
    consequenceExecutor: async () => {
      attempts += 1
      return { status: 'AUTHORIZED' }
    },
  })
  assert.equal(recovered.handoff.status, 'COMPLETED')
  assert.equal(attempts, 2)

  await processFinalizationHandoff('case-1', {
    repository,
    clock: fixedClock('2026-09-26T19:02:00Z'),
    consequenceExecutor: async () => {
      attempts += 1
      return { status: 'AUTHORIZED' }
    },
  })
  assert.equal(attempts, 2)
})
