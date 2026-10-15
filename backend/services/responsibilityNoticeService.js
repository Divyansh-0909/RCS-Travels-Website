import { systemClock } from '../lib/clock.js'
import { sendPush, sendWhatsApp } from './notification.js'
import { responsibilityCaseState } from './responsibilityCaseState.js'
import { createPrismaResponsibilityLifecycleRepository } from './responsibilityLifecycleRepository.js'
import { lifecycleError } from './responsibilityLifecycleErrors.js'

export const ADVERSE_NOTICE_PURPOSE = 'responsibility_adverse_notice'
const APPEAL_WINDOW_MS = 24 * 60 * 60 * 1000

const adverseState = state =>
  state === responsibilityCaseState.PROVISIONAL_AUTO_UPHELD
  || state === responsibilityCaseState.PROVISIONAL_ADMIN_UPHELD

const earliestDelivery = rows => {
  const values = rows.flatMap(row => [row.deliveredAt, row.readAt]).filter(Boolean).map(value => new Date(value))
  if (!values.length) return null
  return new Date(Math.min(...values.map(value => value.getTime())))
}

const retryKeyFor = (caseId, sourceDecisionId) => `responsibility-adverse:${caseId}:${sourceDecisionId}`

async function sourceDecision(repository, responsibilityCase) {
  if (responsibilityCase.state === responsibilityCaseState.PROVISIONAL_AUTO_UPHELD) {
    const decision = await repository.findProvisionalDecision(responsibilityCase.id)
    return decision && { id: decision.id, type: 'AUTO' }
  }
  if (responsibilityCase.state === responsibilityCaseState.PROVISIONAL_ADMIN_UPHELD) {
    const review = await repository.findAdminReview(responsibilityCase.id)
    return review && { id: review.id, type: 'ADMIN' }
  }
  return null
}

export async function ensureAdverseNoticeWindow(caseId, {
  repository = createPrismaResponsibilityLifecycleRepository(),
} = {}) {
  const responsibilityCase = await repository.findCase(caseId)
  if (!responsibilityCase) throw lifecycleError('CASE_NOT_FOUND', 'Responsibility case not found', 404)
  if (!adverseState(responsibilityCase.state) && responsibilityCase.state !== responsibilityCaseState.APPEAL_WINDOW) {
    throw lifecycleError('CASE_NOT_ADVERSE_PROVISIONAL', 'Case is not an adverse provisional decision')
  }
  const existing = await repository.findAppealWindow(caseId)
  if (existing) return existing
  const source = await sourceDecision(repository, responsibilityCase)
  if (!source) throw lifecycleError('SOURCE_DECISION_MISSING', 'Adverse provisional decision source is missing')
  return repository.createAppealWindow({
    caseId,
    sourceDecisionId: source.id,
    sourceDecisionType: source.type,
    noticeRetryKey: retryKeyFor(caseId, source.id),
  })
}

export async function sendAdverseDecisionNotice(caseId, {
  repository = createPrismaResponsibilityLifecycleRepository(),
  push = sendPush,
  whatsapp = sendWhatsApp,
} = {}) {
  const window = await ensureAdverseNoticeWindow(caseId, { repository })
  const responsibilityCase = await repository.findCase(caseId)
  const booking = repository.findCaseDriver
    ? await repository.findCaseDriver(responsibilityCase)
    : await repository.findBookingDriver(responsibilityCase.bookingId)
  if (!booking?.driver) throw lifecycleError('DRIVER_NOT_FOUND', 'Assigned driver is unavailable for adverse notice')
  const provenance = {
    bookingId: responsibilityCase.bookingId,
    purpose: ADVERSE_NOTICE_PURPOSE,
    retryKey: window.noticeRetryKey,
  }
  const message = `RCS Travels: responsibility review for ride ${booking.reference ?? responsibilityCase.bookingId} was provisionally upheld. You may appeal after confirmed delivery; open your responsibility case for details.`
  const results = await Promise.allSettled([
    push(booking.driver, {
      title: 'Responsibility review decision',
      body: 'A provisional decision is ready. Open the case to review and appeal.',
      data: { responsibilityCaseId: caseId },
    }, undefined, provenance),
    whatsapp(booking.driver.phone, message, undefined, provenance),
  ])
  return { window, attempts: results.map(result => result.status) }
}

export async function syncAppealWindow(caseId, {
  repository = createPrismaResponsibilityLifecycleRepository(),
  clock = systemClock,
} = {}) {
  void clock
  return repository.withLockedCase(caseId, async (lockedRepository, responsibilityCase) => {
    if (!responsibilityCase) throw lifecycleError('CASE_NOT_FOUND', 'Responsibility case not found', 404)
    const window = await lockedRepository.findAppealWindow(caseId)
    if (!window) throw lifecycleError('APPEAL_WINDOW_NOT_PREPARED', 'Adverse notice window is not prepared')
    if (window.appealStartedAt && window.appealDeadline) return window
    if (!adverseState(responsibilityCase.state)) return window

    const deliveries = await lockedRepository.findNotificationDeliveries(window.noticeRetryKey)
    const deliveredAt = earliestDelivery(deliveries)
    if (!deliveredAt) return window
    const deadline = new Date(deliveredAt.getTime() + APPEAL_WINDOW_MS)
    await lockedRepository.startAppealWindow(caseId, deliveredAt, deadline)
    await lockedRepository.setCaseState(caseId, responsibilityCaseState.APPEAL_WINDOW)
    return lockedRepository.findAppealWindow(caseId)
  })
}

export async function syncAppealWindowForProviderMessage(providerMessageId, {
  db,
  repository = createPrismaResponsibilityLifecycleRepository(db),
  clock = systemClock,
} = {}) {
  if (!db || !providerMessageId) return null
  const delivery = await db.notificationDelivery.findUnique({
    where: { providerMessageId },
    select: { purpose: true, retryKey: true },
  })
  if (delivery?.purpose !== ADVERSE_NOTICE_PURPOSE || !delivery.retryKey) return null
  const window = await db.responsibilityAppealWindow.findUnique({ where: { noticeRetryKey: delivery.retryKey } })
  if (!window) return null
  return syncAppealWindow(window.caseId, { repository, clock })
}
