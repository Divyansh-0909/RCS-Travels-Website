import test from 'node:test'
import assert from 'node:assert/strict'

import {
  appealWindowEligibility,
  assertResponsibilityStateTransition,
  canTransitionResponsibilityState,
  responsibilityCaseState,
} from '../services/responsibilityCaseState.js'
import { responsibilityClassification } from '../services/responsibilityContracts.js'
import { createPrismaResponsibilityLifecycleRepository } from '../services/responsibilityLifecycleRepository.js'
import {
  ensureAdverseNoticeWindow,
  sendAdverseDecisionNotice,
  syncAppealWindow,
  syncAppealWindowForProviderMessage,
} from '../services/responsibilityNoticeService.js'
import {
  finalizeNoAppeal,
  finalizeWaivedCase,
  persistFinalOutcomeLocked,
  processFinalizationHandoff,
} from '../services/responsibilityFinalizationService.js'
import {
  getResponsibilityReviewContext,
  reviewResponsibilityCase,
} from '../services/responsibilityReviewService.js'
import {
  reviewResponsibilityAppeal,
  submitDriverAppeal,
} from '../services/responsibilityAppealService.js'
import { processProvisionalResponsibilityDecision } from '../services/responsibilityProvisionalLifecycle.js'
import { sweepResponsibilityFinalization } from '../services/responsibilityFinalizationSweep.js'

const at = value => new Date(value)
const fixedClock = value => ({ now: () => at(value) })

const expectCode = code => error => error?.code === code

function memoryRepository({
  state = responsibilityCaseState.PROVISIONAL_AUTO_UPHELD,
  driverId = 'driver-1',
  policyVersion = 'policy-v1',
} = {}) {
  let id = 0
  const next = prefix => `${prefix}-${++id}`
  const data = {
    case: {
      id: 'case-1',
      bookingId: 'booking-1',
      state,
      evidenceHash: 'hash-1',
      evidenceVersion: 7,
      evidenceSnapshot: { timeline: [{ evidenceId: 'ev-1' }] },
    },
    booking: {
      id: 'booking-1',
      reference: 'RCS-1',
      driverId,
      driver: { id: driverId, phone: '9999999999', fcmToken: 'token' },
    },
    provisional: { id: 'provisional-1', caseId: 'case-1', policyVersion },
    analysis: null,
    shadowResult: null,
    shadowHistory: [],
    adjudicationWork: null,
    evidenceVersions: [],
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
    findProvisionalDecision: async () => data.provisional,
    findLatestAnalysis: async () => data.analysis,
    findLatestShadowResult: async () => data.shadowResult,
    findShadowResults: async () => data.shadowHistory,
    findLatestAdjudicationWork: async () => data.adjudicationWork,
    findEvidenceVersions: async () => data.evidenceVersions,
    findAdminReview: async () => data.adminReview,
    createAdminReview: async record => {
      if (!data.adminReview) data.adminReview = { id: next('admin'), ...record }
      return data.adminReview
    },
    findAppealWindow: async () => data.appealWindow,
    createAppealWindow: async record => {
      if (!data.appealWindow) data.appealWindow = {
        id: next('window'),
        appealStartedAt: null,
        appealDeadline: null,
        ...record,
      }
      return data.appealWindow
    },
    startAppealWindow: async (_caseId, appealStartedAt, appealDeadline) => {
      data.appealWindow.appealStartedAt = appealStartedAt
      data.appealWindow.appealDeadline = appealDeadline
      return { count: 1 }
    },
    findNotificationDeliveries: async retryKey => data.deliveries.filter(row => row.retryKey === retryKey),
    findAppeal: async () => data.appeal,
    createAppeal: async record => {
      if (!data.appeal) data.appeal = { id: next('appeal'), ...record }
      return data.appeal
    },
    setAppealStatus: async (_appealId, status) => {
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
      if (!data.handoff) data.handoff = {
        id: next('handoff'),
        attemptCount: 0,
        lastAttemptAt: null,
        completedAt: null,
        lastError: null,
        ...record,
      }
      return data.handoff
    },
    claimHandoff: async (handoffId, attemptedAt) => {
      if (!data.handoff || data.handoff.id !== handoffId || data.handoff.status !== 'PENDING') return { count: 0 }
      data.handoff.status = 'PROCESSING'
      data.handoff.lastAttemptAt = attemptedAt
      data.handoff.attemptCount += 1
      return { count: 1 }
    },
    markHandoffCompleted: async (handoffId, claimedAt, completedAt) => {
      if (!data.handoff || data.handoff.id !== handoffId || data.handoff.lastAttemptAt !== claimedAt) return { count: 0 }
      data.handoff.status = 'COMPLETED'
      data.handoff.completedAt = completedAt
      return { count: 1 }
    },
    markHandoffFailed: async () => ({ count: 1 }),
    setCaseState: async (_caseId, nextState) => {
      data.case.state = nextState
      return data.case
    },
    withLockedCase: async (caseId, work) => work(repository, caseId === data.case.id ? { ...data.case } : null),
  }
  return repository
}

test('responsibility state rules cover legal, illegal, delivery-gated and appeal eligibility branches', () => {
  assert.equal(canTransitionResponsibilityState('BOGUS', responsibilityCaseState.AI_REVIEW), false)
  assert.equal(canTransitionResponsibilityState(responsibilityCaseState.EVIDENCE_COLLECTING, responsibilityCaseState.AI_REVIEW), true)
  assert.equal(canTransitionResponsibilityState(responsibilityCaseState.PROVISIONAL_AUTO_UPHELD, responsibilityCaseState.APPEAL_WINDOW), false)
  assert.equal(canTransitionResponsibilityState(
    responsibilityCaseState.PROVISIONAL_ADMIN_UPHELD,
    responsibilityCaseState.APPEAL_WINDOW,
    { adverseNoticeDelivered: true },
  ), true)
  assert.equal(assertResponsibilityStateTransition(responsibilityCaseState.APPEAL_OPEN, responsibilityCaseState.APPEAL_REVIEW), responsibilityCaseState.APPEAL_REVIEW)
  assert.throws(
    () => assertResponsibilityStateTransition(responsibilityCaseState.FINAL_WAIVED, responsibilityCaseState.FINAL_UPHELD),
    /Illegal responsibility state transition/,
  )

  const noNotice = appealWindowEligibility({ caseState: responsibilityCaseState.PROVISIONAL_AUTO_UPHELD, adverseNotice: null })
  assert.deepEqual(noNotice, { eligible: false, deliveredAt: null, closesAt: null, open: false })
  const nonAdverse = appealWindowEligibility({
    caseState: responsibilityCaseState.PROVISIONAL_AUTO_WAIVED,
    adverseNotice: { deliveredAt: '2026-09-25T18:42:00Z' },
  })
  assert.equal(nonAdverse.eligible, false)
  const byRead = appealWindowEligibility({
    caseState: responsibilityCaseState.PROVISIONAL_ADMIN_UPHELD,
    adverseNotice: { deliveredAt: null, readAt: '2026-09-25T18:42:00Z' },
    now: '2026-09-26T18:42:00Z',
  })
  assert.equal(byRead.open, true)
  assert.equal(byRead.closesAt, '2026-09-26T18:42:00.000Z')
  const expired = appealWindowEligibility({
    caseState: responsibilityCaseState.PROVISIONAL_AUTO_UPHELD,
    adverseNotice: { deliveredAt: '2026-09-25T18:42:00Z', readAt: '2026-09-25T19:00:00Z' },
    now: '2026-09-26T18:42:00.001Z',
  })
  assert.equal(expired.deliveredAt, '2026-09-25T18:42:00.000Z')
  assert.equal(expired.open, false)
})

test('Prisma lifecycle repository delegates every operation and handles uniqueness races and locks', async () => {
  const calls = []
  const model = name => ({
    findUnique: async args => { calls.push([name, 'findUnique', args]); return { id: `${name}-row`, caseId: args?.where?.caseId } },
    findFirst: async args => { calls.push([name, 'findFirst', args]); return { id: `${name}-latest` } },
    findMany: async args => { calls.push([name, 'findMany', args]); return [] },
    create: async args => { calls.push([name, 'create', args]); return { id: `${name}-created`, ...args.data } },
    update: async args => { calls.push([name, 'update', args]); return args.data },
    updateMany: async args => { calls.push([name, 'updateMany', args]); return { count: 1 } },
  })
  const db = {
    responsibilityCase: model('case'), booking: model('booking'), responsibilityProvisionalDecision: model('provisional'),
    responsibilityAnalysis: model('analysis'), responsibilityAdminReview: model('admin'), responsibilityAppealWindow: model('window'),
    notificationDelivery: model('delivery'), responsibilityAppeal: model('appeal'), responsibilityAppealReview: model('appealReview'),
    responsibilityFinalDecision: model('final'), responsibilityFinalizationHandoff: model('handoff'),
  }
  const repo = createPrismaResponsibilityLifecycleRepository(db)
  await repo.findCase('c'); await repo.findBookingDriver('b'); await repo.findProvisionalDecision('c'); await repo.findLatestAnalysis('c')
  await repo.findAdminReview('c'); await repo.createAdminReview({ caseId: 'c' }); await repo.findAppealWindow('c')
  await repo.createAppealWindow({ caseId: 'c' }); await repo.startAppealWindow('c', at('2026-01-01'), at('2026-01-02'))
  await repo.findNotificationDeliveries('retry'); await repo.findAppeal('c'); await repo.createAppeal({ caseId: 'c' })
  await repo.setAppealStatus('a', 'REVIEWED'); await repo.findAppealReview('c'); await repo.createAppealReview({ caseId: 'c' })
  await repo.findFinalDecision('c'); await repo.createFinalDecision({ caseId: 'c' }); await repo.findHandoff('c')
  await repo.createHandoff({ caseId: 'c' }); await repo.claimHandoff('h', at('2026-01-02'), at('2026-01-01'))
  await repo.markHandoffCompleted('h', at('2026-01-02'), at('2026-01-03')); await repo.markHandoffFailed('h', at('2026-01-02'), 'x')
  await repo.findExpiredAppealWindows(at('2026-01-03'), 2); await repo.findRecoverableHandoffs(at('2026-01-02'), 3)
  await repo.setCaseState('c', 'AI_REVIEW')
  assert.ok(calls.length >= 25)

  const raceDb = { ...db, responsibilityAdminReview: model('raceAdmin') }
  raceDb.responsibilityAdminReview.create = async () => { const error = new Error('unique'); error.code = 'P2002'; throw error }
  raceDb.responsibilityAdminReview.findUnique = async () => ({ id: 'existing' })
  assert.equal((await createPrismaResponsibilityLifecycleRepository(raceDb).createAdminReview({ caseId: 'c' })).id, 'existing')
  raceDb.responsibilityAdminReview.findUnique = async () => null
  await assert.rejects(createPrismaResponsibilityLifecycleRepository(raceDb).createAdminReview({ caseId: 'c' }), /unique/)
  raceDb.responsibilityAdminReview.create = async () => { throw new Error('write failed') }
  await assert.rejects(createPrismaResponsibilityLifecycleRepository(raceDb).createAdminReview({ caseId: 'c' }), /write failed/)

  await assert.rejects(repo.withLockedCase('c', async () => null), /Root Prisma client required/)
  const tx = { ...db, $queryRawUnsafe: async () => [] }
  const lockDb = { ...db, $transaction: async (work, options) => { assert.deepEqual(options, { timeout: 10_000, maxWait: 5_000 }); return work(tx) } }
  const missing = await createPrismaResponsibilityLifecycleRepository(lockDb).withLockedCase('c', async (_lockedRepo, locked) => locked)
  assert.equal(missing, null)
  tx.$queryRawUnsafe = async () => [{ id: 'c' }]
  tx.responsibilityCase.findUnique = async () => ({ id: 'c', state: 'AI_REVIEW' })
  const locked = await createPrismaResponsibilityLifecycleRepository(lockDb).withLockedCase('c', async (_lockedRepo, row) => row)
  assert.equal(locked.id, 'c')
})

test('notice preparation and sending fail closed and support admin, existing, fallback-reference, and partial-send paths', async () => {
  const missing = memoryRepository(); missing.findCase = async () => null
  await assert.rejects(ensureAdverseNoticeWindow('case-1', { repository: missing }), expectCode('CASE_NOT_FOUND'))

  const invalid = memoryRepository({ state: responsibilityCaseState.PROVISIONAL_AUTO_WAIVED })
  await assert.rejects(ensureAdverseNoticeWindow('case-1', { repository: invalid }), expectCode('CASE_NOT_ADVERSE_PROVISIONAL'))

  const appealWithoutSource = memoryRepository({ state: responsibilityCaseState.APPEAL_WINDOW })
  await assert.rejects(ensureAdverseNoticeWindow('case-1', { repository: appealWithoutSource }), expectCode('SOURCE_DECISION_MISSING'))

  const appealWithStaleAdminReview = memoryRepository({ state: responsibilityCaseState.APPEAL_WINDOW })
  appealWithStaleAdminReview.data.adminReview = { id: 'stale-admin-review', policyVersion: 'policy-v1', adminActorId: 'admin-1' }
  await assert.rejects(ensureAdverseNoticeWindow('case-1', { repository: appealWithStaleAdminReview }), expectCode('SOURCE_DECISION_MISSING'))

  const sourceMissing = memoryRepository(); sourceMissing.data.provisional = null
  await assert.rejects(ensureAdverseNoticeWindow('case-1', { repository: sourceMissing }), expectCode('SOURCE_DECISION_MISSING'))

  const admin = memoryRepository({ state: responsibilityCaseState.PROVISIONAL_ADMIN_UPHELD })
  admin.data.adminReview = { id: 'admin-source', policyVersion: 'policy-v1', adminActorId: 'admin-1' }
  const adminWindow = await ensureAdverseNoticeWindow('case-1', { repository: admin })
  assert.equal(adminWindow.sourceDecisionType, 'ADMIN')
  assert.equal(await ensureAdverseNoticeWindow('case-1', { repository: admin }), adminWindow)

  const noDriver = memoryRepository(); noDriver.data.booking.driver = null
  await assert.rejects(sendAdverseDecisionNotice('case-1', { repository: noDriver, push: async () => {}, whatsapp: async () => {} }), expectCode('DRIVER_NOT_FOUND'))

  const sent = memoryRepository(); sent.data.booking.reference = null
  let whatsappMessage = ''
  const result = await sendAdverseDecisionNotice('case-1', {
    repository: sent,
    push: async () => { throw new Error('push unavailable') },
    whatsapp: async (_phone, message) => { whatsappMessage = message },
  })
  assert.deepEqual(result.attempts, ['rejected', 'fulfilled'])
  assert.match(whatsappMessage, /booking-1/)
})

test('appeal-window sync covers missing, prepared, already-started, non-adverse, read-only, and provider-message branches', async () => {
  const missing = memoryRepository(); missing.withLockedCase = async (_id, work) => work(missing, null)
  await assert.rejects(syncAppealWindow('case-1', { repository: missing }), expectCode('CASE_NOT_FOUND'))

  const unprepared = memoryRepository()
  await assert.rejects(syncAppealWindow('case-1', { repository: unprepared }), expectCode('APPEAL_WINDOW_NOT_PREPARED'))

  const nonAdverse = memoryRepository({ state: responsibilityCaseState.APPEAL_WINDOW })
  nonAdverse.data.appealWindow = { id: 'w', caseId: 'case-1', noticeRetryKey: 'r', appealStartedAt: null, appealDeadline: null }
  assert.equal((await syncAppealWindow('case-1', { repository: nonAdverse })).appealStartedAt, null)

  const readOnly = memoryRepository()
  const window = await ensureAdverseNoticeWindow('case-1', { repository: readOnly })
  readOnly.data.deliveries.push({ retryKey: window.noticeRetryKey, deliveredAt: null, readAt: at('2026-09-25T18:42:00Z') })
  const started = await syncAppealWindow('case-1', { repository: readOnly })
  assert.equal(started.appealStartedAt.toISOString(), '2026-09-25T18:42:00.000Z')
  assert.equal(await syncAppealWindow('case-1', { repository: readOnly }), started)

  assert.equal(await syncAppealWindowForProviderMessage(null, { db: {} }), null)
  assert.equal(await syncAppealWindowForProviderMessage('id', { db: null }), null)
  const dbMissingDelivery = { notificationDelivery: { findUnique: async () => null } }
  assert.equal(await syncAppealWindowForProviderMessage('id', { db: dbMissingDelivery, repository: readOnly }), null)
  const dbWrong = { notificationDelivery: { findUnique: async () => ({ purpose: 'other', retryKey: 'r' }) } }
  assert.equal(await syncAppealWindowForProviderMessage('id', { db: dbWrong, repository: readOnly }), null)
  const dbNoRetry = { notificationDelivery: { findUnique: async () => ({ purpose: 'responsibility_adverse_notice', retryKey: null }) } }
  assert.equal(await syncAppealWindowForProviderMessage('id', { db: dbNoRetry, repository: readOnly }), null)
  const dbNoWindow = {
    notificationDelivery: { findUnique: async () => ({ purpose: 'responsibility_adverse_notice', retryKey: 'r' }) },
    responsibilityAppealWindow: { findUnique: async () => null },
  }
  assert.equal(await syncAppealWindowForProviderMessage('id', { db: dbNoWindow, repository: readOnly }), null)
  const dbWindow = {
    notificationDelivery: { findUnique: async () => ({ purpose: 'responsibility_adverse_notice', retryKey: window.noticeRetryKey }) },
    responsibilityAppealWindow: { findUnique: async () => ({ caseId: 'case-1' }) },
  }
  assert.equal((await syncAppealWindowForProviderMessage('id', { db: dbWindow, repository: readOnly })).id, started.id)
})

test('admin review context and validation cover missing data, conflicts, reuse and notification suppression', async () => {
  const repository = memoryRepository({ state: responsibilityCaseState.NEEDS_ADMIN_REVIEW })
  repository.data.analysis = { envelope: { suggestedClassification: 'NEEDS_REVIEW' }, validation: { valid: true } }
  const context = await getResponsibilityReviewContext('case-1', { repository })
  assert.equal(context.analysis.envelope.suggestedClassification, 'NEEDS_REVIEW')
  repository.data.analysis = null
  assert.equal((await getResponsibilityReviewContext('case-1', { repository })).analysis, null)
  await assert.rejects(getResponsibilityReviewContext('missing', { repository }), expectCode('CASE_NOT_FOUND'))

  for (const [input, code] of [
    [{ caseId: 'case-1', decision: 'UPHOLD', reason: 'okay' }, 'ADMIN_ID_REQUIRED'],
    [{ caseId: 'case-1', adminActorId: 'a', decision: 'OTHER', reason: 'okay' }, 'INVALID_ADMIN_DECISION'],
    [{ caseId: 'case-1', adminActorId: 'a', decision: 'UPHOLD', reason: 'x' }, 'ADMIN_REASON_REQUIRED'],
  ]) await assert.rejects(reviewResponsibilityCase(input, { repository }), expectCode(code))

  const missing = memoryRepository({ state: responsibilityCaseState.NEEDS_ADMIN_REVIEW }); missing.withLockedCase = async (_id, work) => work(missing, null)
  await assert.rejects(reviewResponsibilityCase({ caseId: 'case-1', adminActorId: 'a', decision: 'UPHOLD', reason: 'valid reason' }, { repository: missing }), expectCode('CASE_NOT_FOUND'))

  const wrongState = memoryRepository()
  await assert.rejects(reviewResponsibilityCase({ caseId: 'case-1', adminActorId: 'a', decision: 'UPHOLD', reason: 'valid reason' }, { repository: wrongState }), expectCode('ADMIN_REVIEW_NOT_ALLOWED'))
  const noProvisional = memoryRepository({ state: responsibilityCaseState.NEEDS_ADMIN_REVIEW }); noProvisional.data.provisional = null
  const manualOnly = await reviewResponsibilityCase({
    caseId: 'case-1', adminActorId: 'a', decision: 'WAIVE', reason: 'valid reason',
  }, { repository: noProvisional, notify: false })
  assert.equal(manualOnly.review.policyVersion, 'scheduled-responsibility-policy-v1')

  const reused = memoryRepository({ state: responsibilityCaseState.PROVISIONAL_ADMIN_UPHELD })
  reused.data.adminReview = { id: 'r', decision: 'UPHOLD', policyVersion: 'p' }
  const reusedResult = await reviewResponsibilityCase({ caseId: 'case-1', adminActorId: 'a', decision: 'UPHOLD', reason: 'valid reason' }, { repository: reused, notify: false })
  assert.equal(reusedResult.reused, true)
  reused.data.adminReview.decision = 'WAIVE'
  await assert.rejects(reviewResponsibilityCase({ caseId: 'case-1', adminActorId: 'a', decision: 'UPHOLD', reason: 'valid reason' }, { repository: reused }), expectCode('ADMIN_REVIEW_CONFLICT'))

  const inconsistentWaive = memoryRepository({ state: responsibilityCaseState.NEEDS_ADMIN_REVIEW })
  inconsistentWaive.data.adminReview = { id: 'r', decision: 'WAIVE', policyVersion: 'p' }
  const inconsistentWaiveResult = await reviewResponsibilityCase({ caseId: 'case-1', adminActorId: 'a', decision: 'WAIVE', reason: 'valid reason' }, { repository: inconsistentWaive })
  assert.equal(inconsistentWaiveResult.state, responsibilityCaseState.NEEDS_ADMIN_REVIEW)

  const fresh = memoryRepository({ state: responsibilityCaseState.NEEDS_ADMIN_REVIEW })
  let notices = 0
  const upheld = await reviewResponsibilityCase({ caseId: 'case-1', adminActorId: 'a', decision: 'UPHOLD',
    classification: responsibilityClassification.DRIVER_CAUSED, reason: ' valid reason ' }, {
    repository: fresh,
    notify: false,
    noticeSender: async () => { notices += 1 },
  })
  assert.equal(upheld.state, responsibilityCaseState.PROVISIONAL_ADMIN_UPHELD)
  assert.equal(notices, 0)
})

test('driver appeal validation covers authentication, shape, ownership, reuse, window state and start requirements', async () => {
  const repository = memoryRepository({ state: responsibilityCaseState.APPEAL_WINDOW })
  repository.data.appealWindow = { id: 'w', caseId: 'case-1', appealStartedAt: at('2026-09-25T18:42:00Z'), appealDeadline: at('2026-09-26T18:42:00Z') }
  for (const [input, code] of [
    [{ caseId: 'case-1', reason: 'valid' }, 'DRIVER_ID_REQUIRED'],
    [{ caseId: 'case-1', driverId: 'driver-1', reason: 'x' }, 'APPEAL_REASON_REQUIRED'],
    [{ caseId: 'case-1', driverId: 'driver-1', reason: 'valid', additionalEvidence: 'bad' }, 'INVALID_APPEAL_EVIDENCE'],
  ]) await assert.rejects(submitDriverAppeal(input, { repository }), expectCode(code))

  const missing = memoryRepository({ state: responsibilityCaseState.APPEAL_WINDOW }); missing.withLockedCase = async (_id, work) => work(missing, null)
  await assert.rejects(submitDriverAppeal({ caseId: 'case-1', driverId: 'driver-1', reason: 'valid' }, { repository: missing }), expectCode('CASE_NOT_FOUND'))
  const noBooking = memoryRepository({ state: responsibilityCaseState.APPEAL_WINDOW }); noBooking.findBookingDriver = async () => null
  await assert.rejects(submitDriverAppeal({ caseId: 'case-1', driverId: 'driver-1', reason: 'valid' }, { repository: noBooking }), expectCode('APPEAL_FORBIDDEN'))

  repository.data.appeal = { id: 'appeal-1', driverId: 'driver-1' }
  assert.equal((await submitDriverAppeal({ caseId: 'case-1', driverId: 'driver-1', reason: 'valid' }, { repository })).reused, true)
  repository.data.appeal.driverId = 'other'
  await assert.rejects(submitDriverAppeal({ caseId: 'case-1', driverId: 'driver-1', reason: 'valid' }, { repository }), expectCode('APPEAL_FORBIDDEN'))

  const wrongState = memoryRepository({ state: responsibilityCaseState.PROVISIONAL_AUTO_UPHELD })
  await assert.rejects(submitDriverAppeal({ caseId: 'case-1', driverId: 'driver-1', reason: 'valid' }, { repository: wrongState }), expectCode('APPEAL_NOT_ELIGIBLE'))
  const notStarted = memoryRepository({ state: responsibilityCaseState.APPEAL_WINDOW }); notStarted.data.appealWindow = { id: 'w', appealStartedAt: null, appealDeadline: null }
  await assert.rejects(submitDriverAppeal({ caseId: 'case-1', driverId: 'driver-1', reason: 'valid' }, { repository: notStarted }), expectCode('APPEAL_WINDOW_NOT_STARTED'))
  const missingWindow = memoryRepository({ state: responsibilityCaseState.APPEAL_WINDOW }); missingWindow.data.appealWindow = null
  await assert.rejects(submitDriverAppeal({ caseId: 'case-1', driverId: 'driver-1', reason: 'valid' }, { repository: missingWindow }), expectCode('APPEAL_WINDOW_NOT_STARTED'))
})

test('appeal review validation covers identity, outcome, state, missing records, policy fallback and existing final reuse', async () => {
  const baseInput = { caseId: 'case-1', reviewerId: 'reviewer', outcome: 'UPHOLD',
    classification: responsibilityClassification.DRIVER_CAUSED, reason: 'valid reason' }
  const repository = memoryRepository({ state: responsibilityCaseState.APPEAL_OPEN })
  repository.data.appeal = { id: 'appeal-1', driverId: 'driver-1', status: 'OPEN' }
  for (const [input, code] of [
    [{ ...baseInput, reviewerId: null }, 'REVIEWER_ID_REQUIRED'],
    [{ ...baseInput, outcome: 'OTHER' }, 'INVALID_APPEAL_OUTCOME'],
    [{ ...baseInput, reason: 'x' }, 'APPEAL_REVIEW_REASON_REQUIRED'],
  ]) await assert.rejects(reviewResponsibilityAppeal(input, { repository }), expectCode(code))

  const missing = memoryRepository({ state: responsibilityCaseState.APPEAL_OPEN }); missing.withLockedCase = async (_id, work) => work(missing, null)
  await assert.rejects(reviewResponsibilityAppeal(baseInput, { repository: missing }), expectCode('CASE_NOT_FOUND'))
  const wrongState = memoryRepository()
  await assert.rejects(reviewResponsibilityAppeal(baseInput, { repository: wrongState }), expectCode('APPEAL_REVIEW_NOT_ALLOWED'))
  const noAppeal = memoryRepository({ state: responsibilityCaseState.APPEAL_OPEN })
  await assert.rejects(reviewResponsibilityAppeal(baseInput, { repository: noAppeal }), expectCode('APPEAL_MISSING'))
  const noPolicy = memoryRepository({ state: responsibilityCaseState.APPEAL_OPEN }); noPolicy.data.appeal = { id: 'a' }; noPolicy.data.provisional = null
  await assert.rejects(reviewResponsibilityAppeal(baseInput, { repository: noPolicy }), expectCode('POLICY_VERSION_MISSING'))

  const adminPolicy = memoryRepository({ state: responsibilityCaseState.APPEAL_REVIEW })
  adminPolicy.data.appeal = { id: 'appeal-1', status: 'OPEN' }
  adminPolicy.data.adminReview = { policyVersion: 'admin-policy' }
  const waived = await reviewResponsibilityAppeal({ ...baseInput, outcome: 'WAIVE',
    classification: responsibilityClassification.VALID_WAIVED }, { repository: adminPolicy, authorize: false })
  assert.equal(waived.finalDecision.policyVersion, 'admin-policy')

  const defaultExecutorSkipped = memoryRepository({ state: responsibilityCaseState.APPEAL_OPEN })
  defaultExecutorSkipped.data.appeal = { id: 'appeal-1', status: 'OPEN' }
  defaultExecutorSkipped.data.handoff = { id: 'handoff-1', status: 'COMPLETED' }
  const defaultExecutorResult = await reviewResponsibilityAppeal(baseInput, { repository: defaultExecutorSkipped })
  assert.equal(defaultExecutorResult.handoff.reused, true)

  const reused = memoryRepository({ state: responsibilityCaseState.FINAL_UPHELD })
  reused.data.appeal = { id: 'appeal-1' }
  reused.data.finalDecision = { id: 'final-1', outcome: responsibilityCaseState.FINAL_UPHELD,
    classification: responsibilityClassification.DRIVER_CAUSED }
  assert.equal((await reviewResponsibilityAppeal(baseInput, { repository: reused, authorize: false })).reused, true)
  reused.data.finalDecision.outcome = responsibilityCaseState.FINAL_WAIVED
  await assert.rejects(reviewResponsibilityAppeal(baseInput, { repository: reused }), expectCode('FINAL_OUTCOME_CONFLICT'))
})

test('waiver and no-appeal finalization fail closed across missing, reused, source and deadline branches', async () => {
  const missing = memoryRepository(); missing.withLockedCase = async (_id, work) => work(missing, null)
  await assert.rejects(finalizeWaivedCase('case-1', { repository: missing }), expectCode('CASE_NOT_FOUND'))
  await assert.rejects(finalizeNoAppeal('case-1', { repository: missing }), expectCode('CASE_NOT_FOUND'))

  const finalWaived = memoryRepository({ state: responsibilityCaseState.FINAL_WAIVED })
  await assert.rejects(finalizeWaivedCase('case-1', { repository: finalWaived }), expectCode('FINAL_DECISION_MISSING'))
  finalWaived.data.finalDecision = { id: 'f', outcome: responsibilityCaseState.FINAL_WAIVED }
  assert.equal((await finalizeWaivedCase('case-1', { repository: finalWaived })).reused, true)

  const badWaiver = memoryRepository()
  badWaiver.data.adminReview = { policyVersion: 'p-admin', adminActorId: 'admin-1' }
  await assert.rejects(finalizeWaivedCase('case-1', { repository: badWaiver }), expectCode('CASE_NOT_WAIVER_PROVISIONAL'))
  const adminWaiver = memoryRepository({ state: responsibilityCaseState.PROVISIONAL_ADMIN_WAIVED })
  adminWaiver.data.adminReview = { policyVersion: 'p-admin', adminActorId: 'admin-1' }
  const adminResult = await finalizeWaivedCase('case-1', { repository: adminWaiver, clock: fixedClock('2026-09-26T00:00:00Z') })
  assert.equal(adminResult.finalDecision.source, 'ADMIN_WAIVER')
  assert.equal(adminResult.finalDecision.reason, 'Provisional waiver finalized')

  const finalUpheld = memoryRepository({ state: responsibilityCaseState.FINAL_UPHELD })
  await assert.rejects(finalizeNoAppeal('case-1', { repository: finalUpheld }), expectCode('FINAL_DECISION_MISSING'))
  finalUpheld.data.finalDecision = { id: 'f', outcome: responsibilityCaseState.FINAL_UPHELD }
  assert.equal((await finalizeNoAppeal('case-1', { repository: finalUpheld, authorize: false })).reused, true)

  const wrongState = memoryRepository()
  await assert.rejects(finalizeNoAppeal('case-1', { repository: wrongState }), expectCode('APPEAL_WINDOW_NOT_ACTIVE'))

  const noDelivery = memoryRepository({ state: responsibilityCaseState.APPEAL_WINDOW })
  noDelivery.data.appealWindow = { sourceDecisionType: 'AUTO', appealStartedAt: null, appealDeadline: null }
  await assert.rejects(finalizeNoAppeal('case-1', { repository: noDelivery }), expectCode('NOTICE_NOT_DELIVERED'))
  const missingAppealWindow = memoryRepository({ state: responsibilityCaseState.APPEAL_WINDOW })
  missingAppealWindow.data.appealWindow = null
  await assert.rejects(finalizeNoAppeal('case-1', { repository: missingAppealWindow }), expectCode('NOTICE_NOT_DELIVERED'))
  for (const partialWindow of [
    { sourceDecisionType: 'AUTO', appealStartedAt: at('2026-09-25T00:00:00Z'), appealDeadline: null },
    { sourceDecisionType: 'AUTO', appealStartedAt: null, appealDeadline: at('2026-09-26T00:00:00Z') },
  ]) {
    const partial = memoryRepository({ state: responsibilityCaseState.APPEAL_WINDOW })
    partial.data.appealWindow = partialWindow
    await assert.rejects(finalizeNoAppeal('case-1', {
      repository: partial,
      clock: fixedClock('2026-09-26T00:00:00.001Z'),
      authorize: false,
    }), expectCode('NOTICE_NOT_DELIVERED'))
  }
  noDelivery.data.appealWindow.appealStartedAt = at('2026-09-25T00:00:00Z')
  noDelivery.data.appealWindow.appealDeadline = at('2026-09-26T00:00:00Z')
  await assert.rejects(finalizeNoAppeal('case-1', { repository: noDelivery, clock: fixedClock('2026-09-26T00:00:00Z') }), expectCode('APPEAL_DEADLINE_ACTIVE'))
  noDelivery.data.appeal = { id: 'a' }
  await assert.rejects(finalizeNoAppeal('case-1', { repository: noDelivery, clock: fixedClock('2026-09-26T00:00:00.001Z') }), expectCode('TIMELY_APPEAL_EXISTS'))
  noDelivery.data.appeal = null; noDelivery.data.provisional = null
  await assert.rejects(finalizeNoAppeal('case-1', { repository: noDelivery, clock: fixedClock('2026-09-26T00:00:00.001Z') }), expectCode('SOURCE_DECISION_MISSING'))

  const adminAdverse = memoryRepository({ state: responsibilityCaseState.APPEAL_WINDOW })
  adminAdverse.data.adminReview = { id: 'r', policyVersion: 'p-admin', adminActorId: 'admin' }
  adminAdverse.data.appealWindow = { sourceDecisionType: 'ADMIN', appealStartedAt: at('2026-09-25'), appealDeadline: at('2026-09-26') }
  const result = await finalizeNoAppeal('case-1', { repository: adminAdverse, clock: fixedClock('2026-09-26T00:00:00.001Z'), authorize: false })
  assert.equal(result.finalDecision.source, 'NO_APPEAL_ADMIN')
  assert.equal(result.finalDecision.reason, 'Appeal window expired without a timely appeal')
  assert.equal(result.finalDecision.policyVersion, 'p-admin')
  assert.equal(result.finalDecision.actorId, 'admin')
  const autoAdverse = memoryRepository({ state: responsibilityCaseState.APPEAL_WINDOW, policyVersion: 'p-auto' })
  autoAdverse.data.appealWindow = { sourceDecisionType: 'AUTO', appealStartedAt: at('2026-09-25'), appealDeadline: at('2026-09-26') }
  const autoResult = await finalizeNoAppeal('case-1', { repository: autoAdverse, clock: fixedClock('2026-09-26T00:00:00.001Z'), authorize: false })
  assert.equal(autoResult.finalDecision.source, 'NO_APPEAL_AUTO')
  assert.equal(autoResult.finalDecision.reason, 'Appeal window expired without a timely appeal')
  assert.equal(autoResult.finalDecision.policyVersion, 'p-auto')
  assert.equal(autoResult.finalDecision.actorId, null)
  const unknownSource = memoryRepository({ state: responsibilityCaseState.APPEAL_WINDOW })
  unknownSource.data.adminReview = { id: 'stale-admin-review', policyVersion: 'p-admin', adminActorId: 'admin' }
  unknownSource.data.appealWindow = { sourceDecisionType: 'OTHER', appealStartedAt: at('2026-09-25'), appealDeadline: at('2026-09-26') }
  await assert.rejects(finalizeNoAppeal('case-1', { repository: unknownSource, clock: fixedClock('2026-09-26T00:00:00.001Z') }), expectCode('SOURCE_DECISION_MISSING'))
})

test('final outcome and handoff branches enforce immutability, authorization, fencing and retries', async () => {
  const repository = memoryRepository({ state: responsibilityCaseState.APPEAL_REVIEW })
  repository.data.finalDecision = { id: 'f', outcome: responsibilityCaseState.FINAL_UPHELD }
  assert.equal((await persistFinalOutcomeLocked(repository, repository.data.case, {
    outcome: 'UPHOLD', policyVersion: 'p', source: 'test', reason: 'r', finalizedAt: at('2026-09-26'),
  })).reused, true)
  await assert.rejects(persistFinalOutcomeLocked(repository, repository.data.case, {
    outcome: 'WAIVE', policyVersion: 'p', source: 'test', reason: 'r', finalizedAt: at('2026-09-26'),
  }), expectCode('FINAL_OUTCOME_CONFLICT'))

  const noHandoff = memoryRepository()
  await assert.rejects(processFinalizationHandoff('case-1', { repository: noHandoff }), expectCode('HANDOFF_MISSING'))
  const completed = memoryRepository(); completed.data.handoff = { id: 'h', status: 'COMPLETED' }
  assert.equal((await processFinalizationHandoff('case-1', { repository: completed })).reused, true)

  const lost = memoryRepository(); lost.data.handoff = { id: 'h', status: 'PROCESSING' }; lost.claimHandoff = async () => ({ count: 0 })
  let lostResult = await processFinalizationHandoff('case-1', { repository: lost })
  assert.equal(lostResult.reused, true)
  assert.equal(lostResult.inProgress, true)
  lost.data.handoff.status = 'PENDING'
  lostResult = await processFinalizationHandoff('case-1', { repository: lost })
  assert.equal(lostResult.reused, true)
  assert.equal(lostResult.inProgress, false)
  const completedDuringClaim = memoryRepository(); completedDuringClaim.data.handoff = { id: 'h', status: 'PROCESSING' }
  completedDuringClaim.claimHandoff = async () => { completedDuringClaim.data.handoff.status = 'COMPLETED'; return { count: 0 } }
  const completedDuringClaimResult = await processFinalizationHandoff('case-1', { repository: completedDuringClaim })
  assert.deepEqual(completedDuringClaimResult, { handoff: completedDuringClaim.data.handoff, reused: true })
  const missingAfterClaim = memoryRepository(); missingAfterClaim.data.handoff = { id: 'h', status: 'PROCESSING' }
  let missingAfterClaimReads = 0
  missingAfterClaim.findHandoff = async () => (++missingAfterClaimReads === 1 ? missingAfterClaim.data.handoff : null)
  missingAfterClaim.claimHandoff = async () => ({ count: 0 })
  await assert.rejects(processFinalizationHandoff('case-1', { repository: missingAfterClaim }), expectCode('HANDOFF_MISSING'))

  const blocked = memoryRepository(); blocked.data.handoff = { id: 'h', status: 'PENDING', attemptCount: 0 }
  await assert.rejects(processFinalizationHandoff('case-1', {
    repository: blocked,
    consequenceExecutor: async () => ({ status: 'BLOCKED', reason: 'not final' }),
  }), error => error?.code === 'CONSEQUENCE_AUTHORIZATION_BLOCKED' && error.message === 'not final')
  blocked.data.handoff.status = 'PENDING'
  await assert.rejects(processFinalizationHandoff('case-1', {
    repository: blocked,
    consequenceExecutor: async () => null,
  }), expectCode('CONSEQUENCE_AUTHORIZATION_BLOCKED'))

  const fenced = memoryRepository(); fenced.data.handoff = { id: 'h', status: 'PENDING', attemptCount: 0 }
  fenced.markHandoffCompleted = async () => ({ count: 0 })
  const fencedResult = await processFinalizationHandoff('case-1', {
    repository: fenced,
    clock: fixedClock('2026-09-26T12:00:00Z'),
    consequenceExecutor: async () => ({ status: 'AUTHORIZED' }),
    hooks: { afterAuthorization: async () => { fenced.data.handoff.status = 'PROCESSING' } },
  })
  assert.equal(fencedResult.reused, true)
  assert.equal(fencedResult.claimLost, true)
  assert.equal(fencedResult.inProgress, true)
  const completedAfterLostClaim = memoryRepository(); completedAfterLostClaim.data.handoff = { id: 'h', status: 'PENDING', attemptCount: 0 }
  completedAfterLostClaim.markHandoffCompleted = async () => {
    completedAfterLostClaim.data.handoff.status = 'COMPLETED'
    return { count: 0 }
  }
  const completedAfterLostClaimResult = await processFinalizationHandoff('case-1', {
    repository: completedAfterLostClaim,
    consequenceExecutor: async () => ({ status: 'AUTHORIZED' }),
  })
  assert.equal(completedAfterLostClaimResult.reused, true)
  assert.equal(completedAfterLostClaimResult.claimLost, true)
  assert.equal(completedAfterLostClaimResult.inProgress, false)
  const missingAfterCompletion = memoryRepository(); missingAfterCompletion.data.handoff = { id: 'h', status: 'PENDING', attemptCount: 0 }
  let missingAfterCompletionReads = 0
  missingAfterCompletion.findHandoff = async () => (++missingAfterCompletionReads === 1 ? missingAfterCompletion.data.handoff : null)
  missingAfterCompletion.markHandoffCompleted = async () => ({ count: 0 })
  await assert.rejects(processFinalizationHandoff('case-1', {
    repository: missingAfterCompletion,
    consequenceExecutor: async () => ({ status: 'AUTHORIZED' }),
  }), expectCode('HANDOFF_MISSING'))

  const nonError = memoryRepository(); nonError.data.handoff = { id: 'h', status: 'PENDING', attemptCount: 0 }
  let recorded = null
  nonError.markHandoffFailed = async (_id, _at, error) => { recorded = error; return { count: 1 } }
  await assert.rejects(processFinalizationHandoff('case-1', { repository: nonError, consequenceExecutor: async () => { throw 'boom' } }))
  assert.equal(recorded, 'Unknown handoff failure')
})

test('provisional lifecycle covers all routes and invalid states', async () => {
  const missing = memoryRepository(); missing.findCase = async () => null
  await assert.rejects(processProvisionalResponsibilityDecision('case-1', { repository: missing }), expectCode('CASE_NOT_FOUND'))
  const upheld = memoryRepository()
  assert.equal((await processProvisionalResponsibilityDecision('case-1', { repository: upheld, noticeSender: async () => ({ sent: true }) })).action, 'ADVERSE_NOTICE')
  const review = memoryRepository({ state: responsibilityCaseState.NEEDS_ADMIN_REVIEW })
  assert.equal((await processProvisionalResponsibilityDecision('case-1', { repository: review })).action, 'ADMIN_REVIEW_REQUIRED')
  for (const state of [responsibilityCaseState.APPEAL_WINDOW, responsibilityCaseState.FINAL_WAIVED]) {
    const advanced = memoryRepository({ state })
    assert.equal((await processProvisionalResponsibilityDecision('case-1', { repository: advanced })).action, 'ALREADY_ADVANCED')
  }
  const invalid = memoryRepository({ state: responsibilityCaseState.AI_REVIEW })
  await assert.rejects(processProvisionalResponsibilityDecision('case-1', { repository: invalid }), expectCode('PROVISIONAL_LIFECYCLE_NOT_READY'))
})

test('finalization sweep reports finalized, skipped, processed, in-progress and failed work', async () => {
  const repository = {
    findExpiredAppealWindows: async (now, take) => { assert.equal(now.toISOString(), '2026-09-26T12:00:00.000Z'); assert.equal(take, 3); return [{ caseId: 'ok' }, { caseId: 'bad' }, { caseId: 'odd' }] },
    findRecoverableHandoffs: async (staleBefore, take) => { assert.equal(staleBefore.toISOString(), '2026-09-26T11:59:59.000Z'); assert.equal(take, 3); return [{ caseId: 'processed' }, { caseId: 'busy' }, { caseId: 'failed' }, { caseId: 'odd-failed' }] },
  }
  const result = await sweepResponsibilityFinalization({
    repository,
    clock: fixedClock('2026-09-26T12:00:00Z'),
    batchSize: 3,
    handoffLeaseMs: 1000,
    finalize: async caseId => {
      if (caseId === 'bad') throw new Error('finalize failed')
      if (caseId === 'odd') throw 17
    },
    processHandoff: async caseId => {
      if (caseId === 'busy') return { inProgress: true }
      if (caseId === 'failed') throw new Error('handoff failed')
      if (caseId === 'odd-failed') throw 22
      return { inProgress: false }
    },
  })
  assert.equal(result.expiredWindows, 3)
  assert.deepEqual(result.finalizations.map(item => item.status), ['FINALIZED', 'SKIPPED', 'SKIPPED'])
  assert.equal(result.finalizations[2].error, 'Unknown responsibility finalization failure')
  assert.deepEqual(result.handoffs.map(item => item.status), ['PROCESSED', 'IN_PROGRESS', 'FAILED', 'FAILED'])
  assert.equal(result.handoffs[3].error, 'Unknown responsibility finalization failure')
})

test('state machine preserves every Phase 6B legal edge and exact appeal-window semantics', () => {
  const legalEdges = [
    [responsibilityCaseState.EVIDENCE_COLLECTING, responsibilityCaseState.AI_REVIEW],
    [responsibilityCaseState.AI_REVIEW, responsibilityCaseState.POLICY_EVALUATION],
    [responsibilityCaseState.AI_REVIEW, responsibilityCaseState.NEEDS_ADMIN_REVIEW],
    [responsibilityCaseState.POLICY_EVALUATION, responsibilityCaseState.PROVISIONAL_AUTO_UPHELD],
    [responsibilityCaseState.POLICY_EVALUATION, responsibilityCaseState.PROVISIONAL_AUTO_WAIVED],
    [responsibilityCaseState.POLICY_EVALUATION, responsibilityCaseState.NEEDS_ADMIN_REVIEW],
    [responsibilityCaseState.PROVISIONAL_AUTO_WAIVED, responsibilityCaseState.FINAL_WAIVED],
    [responsibilityCaseState.NEEDS_ADMIN_REVIEW, responsibilityCaseState.PROVISIONAL_ADMIN_UPHELD],
    [responsibilityCaseState.NEEDS_ADMIN_REVIEW, responsibilityCaseState.PROVISIONAL_ADMIN_WAIVED],
    [responsibilityCaseState.PROVISIONAL_ADMIN_WAIVED, responsibilityCaseState.FINAL_WAIVED],
    [responsibilityCaseState.APPEAL_WINDOW, responsibilityCaseState.APPEAL_OPEN],
    [responsibilityCaseState.APPEAL_WINDOW, responsibilityCaseState.FINAL_UPHELD],
    [responsibilityCaseState.APPEAL_OPEN, responsibilityCaseState.APPEAL_REVIEW],
    [responsibilityCaseState.APPEAL_REVIEW, responsibilityCaseState.FINAL_UPHELD],
    [responsibilityCaseState.APPEAL_REVIEW, responsibilityCaseState.FINAL_WAIVED],
  ]
  for (const [from, to] of legalEdges) {
    assert.equal(canTransitionResponsibilityState(from, to), true, `${from} -> ${to}`)
  }
  for (const from of [responsibilityCaseState.PROVISIONAL_AUTO_UPHELD, responsibilityCaseState.PROVISIONAL_ADMIN_UPHELD]) {
    assert.equal(canTransitionResponsibilityState(from, responsibilityCaseState.APPEAL_WINDOW), false)
    assert.equal(canTransitionResponsibilityState(from, responsibilityCaseState.APPEAL_WINDOW, { adverseNoticeDelivered: true }), true)
  }
  assert.equal(canTransitionResponsibilityState('BOGUS', 'Stryker was here'), false)

  const exactDeadline = appealWindowEligibility({
    caseState: responsibilityCaseState.PROVISIONAL_AUTO_UPHELD,
    adverseNotice: { deliveredAt: '2026-09-25T18:42:00Z' },
    now: '2026-09-26T18:42:00Z',
  })
  assert.deepEqual(exactDeadline, {
    eligible: true,
    deliveredAt: '2026-09-25T18:42:00.000Z',
    closesAt: '2026-09-26T18:42:00.000Z',
    open: true,
  })
})

test('Prisma lifecycle repository preserves exact query, write, race-reload and lock contracts', async () => {
  const calls = []
  const model = name => ({
    findUnique: async args => { calls.push([name, 'findUnique', args]); return { id: `${name}-row` } },
    findFirst: async args => { calls.push([name, 'findFirst', args]); return { id: `${name}-row` } },
    findMany: async args => { calls.push([name, 'findMany', args]); return [] },
    create: async args => { calls.push([name, 'create', args]); return { id: `${name}-created`, ...args.data } },
    update: async args => { calls.push([name, 'update', args]); return args.data },
    updateMany: async args => { calls.push([name, 'updateMany', args]); return { count: 1 } },
  })
  const db = {
    responsibilityCase: model('case'), booking: model('booking'), responsibilityProvisionalDecision: model('provisional'),
    responsibilityAnalysis: model('analysis'), responsibilityAdminReview: model('admin'), responsibilityAppealWindow: model('window'),
    notificationDelivery: model('delivery'), responsibilityAppeal: model('appeal'), responsibilityAppealReview: model('appealReview'),
    responsibilityFinalDecision: model('final'), responsibilityFinalizationHandoff: model('handoff'),
  }
  const repo = createPrismaResponsibilityLifecycleRepository(db)
  const startedAt = at('2026-09-25T18:42:00Z')
  const deadline = at('2026-09-26T18:42:00Z')
  const staleBefore = at('2026-09-26T18:37:00Z')
  const completedAt = at('2026-09-26T18:43:00Z')
  await repo.findCase('case-x')
  await repo.findBookingDriver('booking-x')
  await repo.findProvisionalDecision('case-x')
  await repo.findLatestAnalysis('case-x')
  await repo.findAdminReview('case-x')
  await repo.createAdminReview({ caseId: 'case-x', decision: 'UPHOLD' })
  await repo.findAppealWindow('case-x')
  await repo.createAppealWindow({ caseId: 'case-x', sourceDecisionType: 'AUTO' })
  await repo.startAppealWindow('case-x', startedAt, deadline)
  await repo.findNotificationDeliveries('retry-x')
  await repo.findAppeal('case-x')
  await repo.createAppeal({ caseId: 'case-x', driverId: 'driver-x' })
  await repo.setAppealStatus('appeal-x', 'REVIEWED')
  await repo.findAppealReview('case-x')
  await repo.createAppealReview({ caseId: 'case-x', outcome: 'UPHOLD' })
  await repo.findFinalDecision('case-x')
  await repo.createFinalDecision({ caseId: 'case-x', outcome: responsibilityCaseState.FINAL_UPHELD })
  await repo.findHandoff('case-x')
  await repo.createHandoff({ caseId: 'case-x', finalDecisionId: 'final-x', status: 'PENDING' })
  await repo.claimHandoff('handoff-x', startedAt, staleBefore)
  await repo.markHandoffCompleted('handoff-x', startedAt, completedAt)
  await repo.markHandoffFailed('handoff-x', startedAt, 'boom')
  await repo.findExpiredAppealWindows(deadline, 7)
  await repo.findRecoverableHandoffs(staleBefore, 9)
  await repo.setCaseState('case-x', responsibilityCaseState.APPEAL_OPEN)

  const args = (name, method) => calls.find(call => call[0] === name && call[1] === method)?.[2]
  assert.deepEqual(args('case', 'findUnique'), { where: { id: 'case-x' } })
  assert.deepEqual(args('booking', 'findUnique'), {
    where: { id: 'booking-x' },
    select: { id: true, reference: true, driverId: true, driver: { select: { id: true, name: true, phone: true, fcmToken: true } } },
  })
  assert.deepEqual(args('provisional', 'findUnique'), { where: { caseId: 'case-x' } })
  assert.deepEqual(args('analysis', 'findFirst'), { where: { caseId: 'case-x' }, orderBy: { createdAt: 'desc' } })
  assert.deepEqual(args('admin', 'findUnique'), { where: { caseId: 'case-x' } })
  assert.deepEqual(args('window', 'findUnique'), { where: { caseId: 'case-x' } })
  assert.deepEqual(args('appeal', 'findUnique'), { where: { caseId: 'case-x' } })
  assert.deepEqual(args('appealReview', 'findUnique'), { where: { caseId: 'case-x' } })
  assert.deepEqual(args('final', 'findUnique'), { where: { caseId: 'case-x' } })
  assert.deepEqual(args('handoff', 'findUnique'), { where: { caseId: 'case-x' } })
  assert.deepEqual(args('admin', 'create'), { data: { caseId: 'case-x', decision: 'UPHOLD' } })
  assert.deepEqual(args('window', 'create'), { data: { caseId: 'case-x', sourceDecisionType: 'AUTO' } })
  assert.deepEqual(args('window', 'updateMany'), {
    where: { caseId: 'case-x', appealStartedAt: null, appealDeadline: null },
    data: { appealStartedAt: startedAt, appealDeadline: deadline },
  })
  assert.deepEqual(args('delivery', 'findMany'), {
    where: { retryKey: 'retry-x' },
    select: { id: true, channel: true, status: true, providerAcceptedAt: true, deliveredAt: true, readAt: true, failedAt: true },
    orderBy: { attemptedAt: 'asc' },
  })
  assert.deepEqual(args('appeal', 'create'), { data: { caseId: 'case-x', driverId: 'driver-x' } })
  assert.deepEqual(args('appeal', 'update'), { where: { id: 'appeal-x' }, data: { status: 'REVIEWED' } })
  assert.deepEqual(args('appealReview', 'create'), { data: { caseId: 'case-x', outcome: 'UPHOLD' } })
  assert.deepEqual(args('final', 'create'), { data: { caseId: 'case-x', outcome: responsibilityCaseState.FINAL_UPHELD } })
  assert.deepEqual(args('handoff', 'create'), { data: { caseId: 'case-x', finalDecisionId: 'final-x', status: 'PENDING' } })
  const handoffUpdates = calls.filter(call => call[0] === 'handoff' && call[1] === 'updateMany').map(call => call[2])
  assert.deepEqual(handoffUpdates[0], {
    where: {
      id: 'handoff-x',
      OR: [
        { status: 'PENDING' },
        { status: 'PROCESSING', lastAttemptAt: null },
        { status: 'PROCESSING', lastAttemptAt: { lte: staleBefore } },
      ],
    },
    data: { status: 'PROCESSING', attemptCount: { increment: 1 }, lastAttemptAt: startedAt, lastError: null },
  })
  assert.deepEqual(handoffUpdates[1], {
    where: { id: 'handoff-x', status: 'PROCESSING', lastAttemptAt: startedAt },
    data: { status: 'COMPLETED', completedAt, lastError: null },
  })
  assert.deepEqual(handoffUpdates[2], {
    where: { id: 'handoff-x', status: 'PROCESSING', lastAttemptAt: startedAt },
    data: { status: 'PENDING', lastError: 'boom' },
  })
  const windowFindMany = calls.find(call => call[0] === 'window' && call[1] === 'findMany')?.[2]
  assert.deepEqual(windowFindMany, {
    where: { appealDeadline: { lt: deadline }, case: { state: 'APPEAL_WINDOW' } },
    select: { caseId: true }, orderBy: { appealDeadline: 'asc' }, take: 7,
  })
  const handoffFindMany = calls.find(call => call[0] === 'handoff' && call[1] === 'findMany')?.[2]
  assert.deepEqual(handoffFindMany, {
    where: { OR: [
      { status: 'PENDING' },
      { status: 'PROCESSING', lastAttemptAt: null },
      { status: 'PROCESSING', lastAttemptAt: { lte: staleBefore } },
    ] },
    select: { caseId: true }, orderBy: { createdAt: 'asc' }, take: 9,
  })
  const caseUpdate = calls.find(call => call[0] === 'case' && call[1] === 'update')?.[2]
  assert.deepEqual(caseUpdate, { where: { id: 'case-x' }, data: { state: responsibilityCaseState.APPEAL_OPEN } })

  const uniqueModels = [
    ['responsibilityAdminReview', 'createAdminReview'],
    ['responsibilityAppealWindow', 'createAppealWindow'],
    ['responsibilityAppeal', 'createAppeal'],
    ['responsibilityAppealReview', 'createAppealReview'],
    ['responsibilityFinalDecision', 'createFinalDecision'],
    ['responsibilityFinalizationHandoff', 'createHandoff'],
  ]
  for (const [modelName, methodName] of uniqueModels) {
    const raceCalls = []
    const raceModel = {
      create: async args => {
        raceCalls.push(['create', args])
        const error = new Error('unique')
        error.code = 'P2002'
        throw error
      },
      findUnique: async args => { raceCalls.push(['findUnique', args]); return { id: 'existing', caseId: 'race-case' } },
    }
    const raceDb = { ...db, [modelName]: raceModel }
    const raceRepo = createPrismaResponsibilityLifecycleRepository(raceDb)
    const result = await raceRepo[methodName]({ caseId: 'race-case', marker: methodName })
    assert.equal(result.id, 'existing')
    assert.deepEqual(raceCalls, [
      ['create', { data: { caseId: 'race-case', marker: methodName } }],
      ['findUnique', { where: { caseId: 'race-case' } }],
    ])
  }

  const nonUniqueError = new Error('write failed')
  nonUniqueError.code = 'P2025'
  const nonUniqueDb = {
    ...db,
    responsibilityAdminReview: {
      create: async () => { throw nonUniqueError },
      findUnique: async () => ({ id: 'must-not-reload' }),
    },
  }
  await assert.rejects(
    createPrismaResponsibilityLifecycleRepository(nonUniqueDb).createAdminReview({ caseId: 'case-error' }),
    error => error === nonUniqueError,
  )

  const lockCalls = []
  const tx = {
    ...db,
    $queryRawUnsafe: async (...queryArgs) => { lockCalls.push(['query', queryArgs]); return [{ id: 'lock-case' }] },
    responsibilityCase: {
      ...db.responsibilityCase,
      findUnique: async queryArgs => { lockCalls.push(['lockedFind', queryArgs]); return { id: 'lock-case', state: 'AI_REVIEW' } },
    },
  }
  const root = {
    ...db,
    $transaction: async (work, options) => { lockCalls.push(['txOptions', options]); return work(tx) },
  }
  const lockedResult = await createPrismaResponsibilityLifecycleRepository(root).withLockedCase('lock-case', async (lockedRepo, lockedCase) => {
    assert.equal((await lockedRepo.findCase('lock-case')).id, 'lock-case')
    return lockedCase
  })
  assert.equal(lockedResult.id, 'lock-case')
  assert.deepEqual(lockCalls[0], ['txOptions', { timeout: 10_000, maxWait: 5_000 }])
  assert.deepEqual(lockCalls[1], ['query', ['SELECT id FROM "responsibility_cases" WHERE id = $1 FOR UPDATE', 'lock-case']])
  assert.deepEqual(lockCalls[2], ['lockedFind', { where: { id: 'lock-case' } }])
})

test('notice delivery uses earliest proof, exact provider provenance, and idempotent window start', async () => {
  const repository = memoryRepository()
  const window = await ensureAdverseNoticeWindow('case-1', { repository })
  assert.equal(window.sourceDecisionId, 'provisional-1')
  assert.equal(window.sourceDecisionType, 'AUTO')
  repository.data.deliveries.push(
    { retryKey: window.noticeRetryKey, deliveredAt: at('2026-09-25T19:15:00Z'), readAt: null },
    { retryKey: window.noticeRetryKey, deliveredAt: null, readAt: at('2026-09-25T18:42:00Z') },
    { retryKey: window.noticeRetryKey, deliveredAt: at('2026-09-25T20:00:00Z'), readAt: at('2026-09-25T20:01:00Z') },
  )
  const started = await syncAppealWindow('case-1', { repository })
  assert.equal(started.appealStartedAt.toISOString(), '2026-09-25T18:42:00.000Z')
  assert.equal(started.appealDeadline.toISOString(), '2026-09-26T18:42:00.000Z')

  let deliveryReads = 0
  let starts = 0
  const alreadyStarted = memoryRepository({ state: responsibilityCaseState.APPEAL_WINDOW })
  alreadyStarted.data.appealWindow = { ...started }
  alreadyStarted.findNotificationDeliveries = async () => { deliveryReads += 1; return [] }
  alreadyStarted.startAppealWindow = async () => { starts += 1; return { count: 1 } }
  assert.equal((await syncAppealWindow('case-1', { repository: alreadyStarted })).appealDeadline.toISOString(), '2026-09-26T18:42:00.000Z')
  assert.equal(deliveryReads, 0)
  assert.equal(starts, 0)

  const alreadyStartedAdverse = memoryRepository({ state: responsibilityCaseState.PROVISIONAL_AUTO_UPHELD })
  alreadyStartedAdverse.data.appealWindow = { ...started }
  alreadyStartedAdverse.findNotificationDeliveries = async () => { throw new Error('completed appeal window must not re-read delivery evidence') }
  assert.equal((await syncAppealWindow('case-1', { repository: alreadyStartedAdverse })).appealDeadline.toISOString(), '2026-09-26T18:42:00.000Z')

  const existingWindowRepo = memoryRepository()
  existingWindowRepo.data.appealWindow = { id: 'existing-window', caseId: 'case-1', noticeRetryKey: 'existing-retry' }
  existingWindowRepo.findProvisionalDecision = async () => { throw new Error('existing window must bypass source lookup') }
  assert.equal((await ensureAdverseNoticeWindow('case-1', { repository: existingWindowRepo })).id, 'existing-window')

  const adminSource = memoryRepository({ state: responsibilityCaseState.PROVISIONAL_ADMIN_UPHELD })
  adminSource.data.adminReview = { id: 'admin-review-1', policyVersion: 'policy-admin', adminActorId: 'admin-1' }
  const adminWindow = await ensureAdverseNoticeWindow('case-1', { repository: adminSource })
  assert.equal(adminWindow.sourceDecisionId, 'admin-review-1')
  assert.equal(adminWindow.sourceDecisionType, 'ADMIN')

  for (const partialWindow of [
    { id: 'partial-start', caseId: 'case-1', noticeRetryKey: 'retry-partial-start', appealStartedAt: at('2026-09-25T18:00:00Z'), appealDeadline: null },
    { id: 'partial-deadline', caseId: 'case-1', noticeRetryKey: 'retry-partial-deadline', appealStartedAt: null, appealDeadline: at('2026-09-26T19:00:00Z') },
  ]) {
    const partial = memoryRepository()
    partial.data.appealWindow = partialWindow
    partial.data.deliveries.push({ retryKey: partialWindow.noticeRetryKey, deliveredAt: at('2026-09-25T18:42:00Z'), readAt: null })
    const repaired = await syncAppealWindow('case-1', { repository: partial })
    assert.equal(repaired.appealStartedAt.toISOString(), '2026-09-25T18:42:00.000Z')
    assert.equal(repaired.appealDeadline.toISOString(), '2026-09-26T18:42:00.000Z')
  }

  const nonAdverse = memoryRepository({ state: responsibilityCaseState.APPEAL_WINDOW })
  nonAdverse.data.appealWindow = { id: 'w', caseId: 'case-1', noticeRetryKey: 'retry', appealStartedAt: null, appealDeadline: null }
  nonAdverse.data.deliveries.push({ retryKey: 'retry', deliveredAt: at('2026-09-25T18:42:00Z'), readAt: null })
  nonAdverse.startAppealWindow = async () => { throw new Error('non-adverse state must not start a window') }
  assert.equal((await syncAppealWindow('case-1', { repository: nonAdverse })).appealStartedAt, null)

  const sent = memoryRepository()
  const pushCalls = []
  const whatsappCalls = []
  const notice = await sendAdverseDecisionNotice('case-1', {
    repository: sent,
    push: async (...args) => { pushCalls.push(args) },
    whatsapp: async (...args) => { whatsappCalls.push(args) },
  })
  assert.deepEqual(notice.attempts, ['fulfilled', 'fulfilled'])
  assert.deepEqual(pushCalls[0][0], sent.data.booking.driver)
  assert.deepEqual(pushCalls[0][1], {
    title: 'Responsibility review decision',
    body: 'A provisional decision is ready. Open the case to review and appeal.',
    data: { responsibilityCaseId: 'case-1' },
  })
  assert.equal(pushCalls[0][2], undefined)
  assert.deepEqual(pushCalls[0][3], {
    bookingId: 'booking-1', purpose: 'responsibility_adverse_notice', retryKey: notice.window.noticeRetryKey,
  })
  assert.equal(whatsappCalls[0][0], '9999999999')
  assert.match(whatsappCalls[0][1], /RCS-1/)
  assert.equal(whatsappCalls[0][2], undefined)
  assert.deepEqual(whatsappCalls[0][3], pushCalls[0][3])

  const nullBooking = memoryRepository()
  nullBooking.findBookingDriver = async () => null
  await assert.rejects(sendAdverseDecisionNotice('case-1', {
    repository: nullBooking, push: async () => {}, whatsapp: async () => {},
  }), expectCode('DRIVER_NOT_FOUND'))

  const callbackRepo = memoryRepository({ state: responsibilityCaseState.APPEAL_WINDOW })
  callbackRepo.data.appealWindow = { ...started, noticeRetryKey: 'retry-provider' }
  const callbackCalls = []
  const callbackDb = {
    notificationDelivery: {
      findUnique: async args => {
        callbackCalls.push(['delivery', args])
        return { purpose: 'responsibility_adverse_notice', retryKey: 'retry-provider' }
      },
    },
    responsibilityAppealWindow: {
      findUnique: async args => {
        callbackCalls.push(['window', args])
        return { caseId: 'case-1' }
      },
    },
  }
  await syncAppealWindowForProviderMessage('provider-1', { db: callbackDb, repository: callbackRepo })
  assert.deepEqual(callbackCalls, [
    ['delivery', { where: { providerMessageId: 'provider-1' }, select: { purpose: true, retryKey: true } }],
    ['window', { where: { noticeRetryKey: 'retry-provider' } }],
  ])
})

test('appeal submission and review preserve exact deadline, audit, transition and trimming behavior', async () => {
  const repository = memoryRepository({ state: responsibilityCaseState.APPEAL_WINDOW })
  repository.data.appealWindow = {
    id: 'window-1', caseId: 'case-1', appealStartedAt: at('2026-09-25T18:42:00Z'), appealDeadline: at('2026-09-26T18:42:00Z'),
  }
  await assert.rejects(submitDriverAppeal({
    caseId: 'case-1', driverId: 'driver-1', reason: '   ',
  }, { repository, clock: fixedClock('2026-09-26T18:41:59Z') }), expectCode('APPEAL_REASON_REQUIRED'))
  await assert.rejects(submitDriverAppeal({
    caseId: 'case-1', driverId: 'driver-1', reason: 'ab',
  }, { repository, clock: fixedClock('2026-09-26T18:41:59Z') }), expectCode('APPEAL_REASON_REQUIRED'))
  await assert.rejects(submitDriverAppeal({
    caseId: 'case-1', driverId: 'driver-1', reason: 123,
  }, { repository, clock: fixedClock('2026-09-26T18:41:59Z') }), expectCode('APPEAL_REASON_REQUIRED'))
  const accepted = await submitDriverAppeal({
    caseId: 'case-1', driverId: 'driver-1', reason: ' abc ',
  }, { repository, clock: fixedClock('2026-09-26T18:42:00Z') })
  assert.equal(accepted.reused, false)
  assert.deepEqual(repository.data.appeal, {
    id: repository.data.appeal.id,
    caseId: 'case-1', appealWindowId: 'window-1', driverId: 'driver-1', submittedAt: at('2026-09-26T18:42:00Z'),
    reason: 'abc', status: 'OPEN', additionalEvidence: [],
  })
  assert.equal(repository.data.case.state, responsibilityCaseState.APPEAL_OPEN)

  for (const appealWindow of [
    { id: 'w', appealStartedAt: at('2026-09-25T18:42:00Z'), appealDeadline: null },
    { id: 'w', appealStartedAt: null, appealDeadline: at('2026-09-26T18:42:00Z') },
  ]) {
    const partial = memoryRepository({ state: responsibilityCaseState.APPEAL_WINDOW })
    partial.data.appealWindow = appealWindow
    await assert.rejects(submitDriverAppeal({
      caseId: 'case-1', driverId: 'driver-1', reason: 'abc',
    }, { repository: partial }), expectCode('APPEAL_WINDOW_NOT_STARTED'))
  }

  const reviewRepo = memoryRepository({ state: responsibilityCaseState.APPEAL_OPEN })
  reviewRepo.data.appeal = { id: 'appeal-1', driverId: 'driver-1', status: 'OPEN' }
  await assert.rejects(reviewResponsibilityAppeal({
    caseId: 'case-1', reviewerId: 'reviewer-1', outcome: 'WAIVE', reason: 123,
  }, { repository: reviewRepo, authorize: false }), expectCode('APPEAL_REVIEW_REASON_REQUIRED'))
  await assert.rejects(reviewResponsibilityAppeal({
    caseId: 'case-1', reviewerId: 'reviewer-1', outcome: 'WAIVE', reason: ' a ',
  }, { repository: reviewRepo, authorize: false }), expectCode('APPEAL_REVIEW_REASON_REQUIRED'))
  const stateCalls = []
  const originalSetCaseState = reviewRepo.setCaseState
  reviewRepo.setCaseState = async (caseId, state) => { stateCalls.push(state); return originalSetCaseState(caseId, state) }
  const reviewed = await reviewResponsibilityAppeal({
    caseId: 'case-1', reviewerId: 'reviewer-1', outcome: 'WAIVE', reason: ' abc ',
  }, { repository: reviewRepo, clock: fixedClock('2026-09-26T19:00:00Z'), authorize: false })
  assert.equal(reviewed.reused, false)
  assert.deepEqual(stateCalls, [responsibilityCaseState.APPEAL_REVIEW, responsibilityCaseState.FINAL_WAIVED])
  assert.deepEqual(reviewRepo.data.appealReview, {
    id: reviewRepo.data.appealReview.id,
    caseId: 'case-1', appealId: 'appeal-1', reviewerId: 'reviewer-1', outcome: 'WAIVE', reason: 'abc',
    reviewedAt: at('2026-09-26T19:00:00Z'), evidenceVersion: 7, evidenceHash: 'hash-1', policyVersion: 'policy-v1',
    consequenceLevel: 'LEVEL_0',
  })
  assert.equal(reviewRepo.data.appeal.status, 'REVIEWED')
  assert.equal(reviewed.finalDecision.outcome, responsibilityCaseState.FINAL_WAIVED)
  assert.equal(reviewed.finalDecision.source, 'APPEAL_REVIEW')
  assert.equal(reviewed.finalDecision.reason, 'abc')

  const reusedWaiver = memoryRepository({ state: responsibilityCaseState.FINAL_WAIVED })
  reusedWaiver.data.finalDecision = { id: 'final-waived', outcome: responsibilityCaseState.FINAL_WAIVED }
  const reusedWaiverResult = await reviewResponsibilityAppeal({
    caseId: 'case-1', reviewerId: 'reviewer-1', outcome: 'WAIVE', reason: 'valid reason',
  }, { repository: reusedWaiver, authorize: false })
  assert.equal(reusedWaiverResult.reused, true)

  const alreadyReviewing = memoryRepository({ state: responsibilityCaseState.APPEAL_REVIEW })
  alreadyReviewing.data.appeal = { id: 'appeal-2', driverId: 'driver-1', status: 'OPEN' }
  const alreadyCalls = []
  const alreadySet = alreadyReviewing.setCaseState
  alreadyReviewing.setCaseState = async (caseId, state) => { alreadyCalls.push(state); return alreadySet(caseId, state) }
  await reviewResponsibilityAppeal({
    caseId: 'case-1', reviewerId: 'reviewer-1', outcome: 'WAIVE', reason: 'abc',
  }, { repository: alreadyReviewing, authorize: false })
  assert.deepEqual(alreadyCalls, [responsibilityCaseState.FINAL_WAIVED])
})

test('admin review, finalization and provisional routing preserve exact audit and handoff invariants', async () => {
  const adminRepo = memoryRepository({ state: responsibilityCaseState.NEEDS_ADMIN_REVIEW })
  await assert.rejects(reviewResponsibilityCase({
    caseId: 'case-1', adminActorId: 'admin-1', decision: 'UPHOLD', reason: '  ',
  }, { repository: adminRepo }), expectCode('ADMIN_REASON_REQUIRED'))
  await assert.rejects(reviewResponsibilityCase({
    caseId: 'case-1', adminActorId: 'admin-1', decision: 'UPHOLD', reason: 'ab',
  }, { repository: adminRepo }), expectCode('ADMIN_REASON_REQUIRED'))
  await assert.rejects(reviewResponsibilityCase({
    caseId: 'case-1', adminActorId: 'admin-1', decision: 'UPHOLD', reason: 123,
  }, { repository: adminRepo }), expectCode('ADMIN_REASON_REQUIRED'))
  await assert.rejects(reviewResponsibilityCase({
    caseId: 'case-1', adminActorId: 'admin-1', decision: 'UPHOLD', reason: ' a ',
  }, { repository: adminRepo }), expectCode('ADMIN_REASON_REQUIRED'))
  let noticeOptions = null
  const adminResult = await reviewResponsibilityCase({
    caseId: 'case-1', adminActorId: 'admin-1', decision: 'UPHOLD',
    classification: responsibilityClassification.DRIVER_CAUSED, reason: ' abc ',
  }, {
    repository: adminRepo,
    clock: fixedClock('2026-09-26T12:00:00Z'),
    noticeSender: async (caseId, options) => { noticeOptions = [caseId, options]; return { sent: true } },
  })
  assert.equal(adminResult.reused, false)
  assert.equal(adminResult.state, responsibilityCaseState.PROVISIONAL_ADMIN_UPHELD)
  assert.deepEqual(adminRepo.data.adminReview, {
    id: adminRepo.data.adminReview.id,
    caseId: 'case-1', adminActorId: 'admin-1', decision: 'UPHOLD', classification: responsibilityClassification.DRIVER_CAUSED,
    reason: 'abc', decidedAt: at('2026-09-26T12:00:00Z'),
    evidenceVersion: 7, evidenceHash: 'hash-1', policyVersion: 'policy-v1', previousState: responsibilityCaseState.NEEDS_ADMIN_REVIEW,
    consequenceLevel: 'LEVEL_1',
  })
  assert.deepEqual(noticeOptions, ['case-1', { repository: adminRepo }])

  const invalidFinal = memoryRepository({ state: responsibilityCaseState.APPEAL_WINDOW })
  let finalCreates = 0
  invalidFinal.createFinalDecision = async record => { finalCreates += 1; return record }
  await assert.rejects(persistFinalOutcomeLocked(invalidFinal, invalidFinal.data.case, {
    outcome: 'WAIVE', policyVersion: 'p', source: 'test', reason: 'x', finalizedAt: at('2026-09-26T12:00:00Z'),
  }), /Illegal responsibility state transition/)
  assert.equal(finalCreates, 0)

  const invalidOutcome = memoryRepository({ state: responsibilityCaseState.APPEAL_REVIEW })
  await assert.rejects(persistFinalOutcomeLocked(invalidOutcome, invalidOutcome.data.case, {
    outcome: 'BOGUS', policyVersion: 'p', source: 'test', reason: 'x', finalizedAt: at('2026-09-26T12:00:00Z'),
  }), expectCode('INVALID_FINAL_OUTCOME'))
  assert.equal(invalidOutcome.data.finalDecision, null)
  assert.equal(invalidOutcome.data.case.state, responsibilityCaseState.APPEAL_REVIEW)

  const waived = memoryRepository({ state: responsibilityCaseState.APPEAL_REVIEW })
  const waivedResult = await persistFinalOutcomeLocked(waived, waived.data.case, {
    outcome: 'WAIVE', policyVersion: 'p', source: 'test', reason: 'waived', finalizedAt: at('2026-09-26T12:00:00Z'),
  })
  assert.equal(waivedResult.reused, false)
  assert.equal(waived.data.handoff, null)
  assert.equal(waivedResult.finalDecision.outcome, responsibilityCaseState.FINAL_WAIVED)

  const upheld = memoryRepository({ state: responsibilityCaseState.APPEAL_REVIEW })
  const upheldResult = await persistFinalOutcomeLocked(upheld, upheld.data.case, {
    outcome: 'UPHOLD', policyVersion: 'p', source: 'test', reason: 'upheld', finalizedAt: at('2026-09-26T12:00:00Z'),
  })
  assert.equal(upheldResult.reused, false)
  assert.equal(upheldResult.finalDecision.outcome, responsibilityCaseState.FINAL_UPHELD)
  assert.deepEqual(upheld.data.handoff, {
    id: upheld.data.handoff.id, attemptCount: 0, lastAttemptAt: null, completedAt: null, lastError: null,
    caseId: 'case-1', finalDecisionId: upheldResult.finalDecision.id, status: 'PENDING',
  })

  const autoWaiverMissing = memoryRepository({ state: responsibilityCaseState.PROVISIONAL_AUTO_WAIVED })
  autoWaiverMissing.data.provisional = null
  await assert.rejects(finalizeWaivedCase('case-1', { repository: autoWaiverMissing }), expectCode('CASE_NOT_WAIVER_PROVISIONAL'))
  const autoWaiver = memoryRepository({ state: responsibilityCaseState.PROVISIONAL_AUTO_WAIVED })
  const autoWaiverResult = await finalizeWaivedCase('case-1', { repository: autoWaiver, clock: fixedClock('2026-09-26T12:00:00Z') })
  assert.equal(autoWaiverResult.finalDecision.source, 'AUTO_WAIVER')
  assert.equal(autoWaiverResult.finalDecision.reason, 'Provisional waiver finalized')
  assert.equal(autoWaiverResult.finalDecision.policyVersion, 'policy-v1')
  assert.equal(autoWaiverResult.finalDecision.actorId, null)

  const adminWaiver = memoryRepository({ state: responsibilityCaseState.PROVISIONAL_ADMIN_WAIVED })
  adminWaiver.data.adminReview = { id: 'admin-waiver', policyVersion: 'policy-admin', adminActorId: 'admin-9' }
  const adminWaiverResult = await finalizeWaivedCase('case-1', { repository: adminWaiver, clock: fixedClock('2026-09-26T12:00:00Z') })
  assert.equal(adminWaiverResult.finalDecision.source, 'ADMIN_WAIVER')
  assert.equal(adminWaiverResult.finalDecision.reason, 'Provisional waiver finalized')
  assert.equal(adminWaiverResult.finalDecision.policyVersion, 'policy-admin')
  assert.equal(adminWaiverResult.finalDecision.actorId, 'admin-9')

  const handoffRepo = memoryRepository()
  handoffRepo.data.handoff = { id: 'handoff-1', status: 'PENDING', attemptCount: 0, lastAttemptAt: null }
  let claimArgs = null
  let completeArgs = null
  let hookCalls = 0
  handoffRepo.claimHandoff = async (...args) => { claimArgs = args; handoffRepo.data.handoff.status = 'PROCESSING'; return { count: 1 } }
  handoffRepo.markHandoffCompleted = async (...args) => { completeArgs = args; handoffRepo.data.handoff.status = 'COMPLETED'; return { count: 1 } }
  const handoffResult = await processFinalizationHandoff('case-1', {
    repository: handoffRepo,
    clock: fixedClock('2026-09-26T12:00:00Z'),
    consequenceExecutor: async () => ({ status: 'AUTHORIZED', authorizationId: 'auth-1' }),
    hooks: { afterAuthorization: async authorization => { hookCalls += 1; assert.equal(authorization.authorizationId, 'auth-1') } },
  })
  assert.deepEqual(claimArgs, ['handoff-1', at('2026-09-26T12:00:00Z'), at('2026-09-26T11:55:00Z')])
  assert.equal(completeArgs[0], 'handoff-1')
  assert.deepEqual(completeArgs[1], at('2026-09-26T12:00:00Z'))
  assert.deepEqual(completeArgs[2], at('2026-09-26T12:00:00Z'))
  assert.equal(hookCalls, 1)
  assert.equal(handoffResult.reused, false)
  assert.equal(handoffResult.handoff.status, 'COMPLETED')

  const completed = memoryRepository()
  completed.data.handoff = { id: 'handoff-1', status: 'COMPLETED' }
  completed.claimHandoff = async () => { throw new Error('completed handoff must not be claimed') }
  assert.equal((await processFinalizationHandoff('case-1', { repository: completed })).reused, true)

  const provisionalRepo = memoryRepository()
  let provisionalNotice = null
  const provisionalResult = await processProvisionalResponsibilityDecision('case-1', {
    repository: provisionalRepo,
    noticeSender: async (caseId, options) => { provisionalNotice = [caseId, options]; return { sent: true } },
  })
  assert.equal(provisionalResult.action, 'ADVERSE_NOTICE')
  assert.deepEqual(provisionalNotice, ['case-1', { repository: provisionalRepo }])
  const provisionalWaive = memoryRepository({ state: responsibilityCaseState.PROVISIONAL_AUTO_WAIVED })
  let waiverArgs = null
  const clock = fixedClock('2026-09-26T12:00:00Z')
  await processProvisionalResponsibilityDecision('case-1', {
    repository: provisionalWaive,
    clock,
    waiverFinalizer: async (caseId, options) => { waiverArgs = [caseId, options]; return { finalized: true } },
  })
  assert.deepEqual(waiverArgs, ['case-1', { repository: provisionalWaive, clock }])
})

test('finalization sweep passes exact worker options and lease cutoff', async () => {
  const clock = fixedClock('2026-09-26T12:00:00Z')
  const repository = {
    findExpiredAppealWindows: async (now, take) => {
      assert.deepEqual(now, at('2026-09-26T12:00:00Z'))
      assert.equal(take, 4)
      return [{ caseId: 'finalize-1' }]
    },
    findRecoverableHandoffs: async (staleBefore, take) => {
      assert.deepEqual(staleBefore, at('2026-09-26T11:59:58Z'))
      assert.equal(take, 4)
      return [{ caseId: 'handoff-1' }]
    },
  }
  let finalArgs = null
  let handoffArgs = null
  const result = await sweepResponsibilityFinalization({
    repository,
    clock,
    batchSize: 4,
    handoffLeaseMs: 2000,
    finalize: async (...args) => { finalArgs = args },
    processHandoff: async (...args) => { handoffArgs = args; return { inProgress: false } },
  })
  assert.deepEqual(finalArgs, ['finalize-1', { repository, clock, authorize: false }])
  assert.deepEqual(handoffArgs, ['handoff-1', { repository, clock, handoffLeaseMs: 2000 }])
  assert.deepEqual(result, {
    expiredWindows: 1,
    finalizations: [{ caseId: 'finalize-1', status: 'FINALIZED' }],
    recoverableHandoffs: 1,
    handoffs: [{ caseId: 'handoff-1', status: 'PROCESSED' }],
  })
})
