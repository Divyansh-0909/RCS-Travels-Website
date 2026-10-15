import { prisma } from '../db/prisma.js'
import { findResponsibilityIncidentDriver } from './responsibilityIncidentDriver.js'

const uniqueRace = async (write, reload) => {
  try {
    return await write()
  } catch (error) {
    if (error?.code !== 'P2002') throw error
    const existing = await reload()
    if (!existing) throw error
    return existing
  }
}

export function createPrismaResponsibilityLifecycleRepository(db = prisma) {
  return {
    findCase: caseId => db.responsibilityCase.findUnique({ where: { id: caseId } }),
    findCaseDriver: responsibilityCase => findResponsibilityIncidentDriver(db, responsibilityCase),
    findBookingDriver: bookingId => db.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        reference: true,
        driverId: true,
        driver: { select: { id: true, name: true, phone: true, fcmToken: true } },
      },
    }),
    findProvisionalDecision: caseId => db.responsibilityProvisionalDecision.findUnique({ where: { caseId } }),
    findLatestAnalysis: caseId => db.responsibilityAnalysis.findFirst({
      where: { caseId },
      orderBy: { createdAt: 'desc' },
    }),
    findLatestShadowResult: caseId => db.responsibilityShadowResult.findFirst({
      where: { caseId },
      orderBy: { createdAt: 'desc' },
    }),
    findShadowResults: caseId => db.responsibilityShadowResult.findMany({
      where: { caseId },
      orderBy: { createdAt: 'asc' },
    }),
    findLatestAdjudicationWork: caseId => db.responsibilityAdjudicationWork.findFirst({
      where: { caseId },
      orderBy: { createdAt: 'desc' },
    }),
    findEvidenceVersions: caseId => db.responsibilityEvidenceVersion.findMany({
      where: { caseId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, evidenceVersion: true, evidenceHash: true, generatedAt: true, createdAt: true },
    }),
    findAdminReview: caseId => db.responsibilityAdminReview.findUnique({ where: { caseId } }),
    createAdminReview: record => uniqueRace(
      () => db.responsibilityAdminReview.create({ data: record }),
      () => db.responsibilityAdminReview.findUnique({ where: { caseId: record.caseId } }),
    ),
    findAppealWindow: caseId => db.responsibilityAppealWindow.findUnique({ where: { caseId } }),
    createAppealWindow: record => uniqueRace(
      () => db.responsibilityAppealWindow.create({ data: record }),
      () => db.responsibilityAppealWindow.findUnique({ where: { caseId: record.caseId } }),
    ),
    startAppealWindow: (caseId, appealStartedAt, appealDeadline) => db.responsibilityAppealWindow.updateMany({
      where: { caseId, appealStartedAt: null, appealDeadline: null },
      data: { appealStartedAt, appealDeadline },
    }),
    findNotificationDeliveries: retryKey => db.notificationDelivery.findMany({
      where: { retryKey },
      select: {
        id: true,
        channel: true,
        status: true,
        providerAcceptedAt: true,
        deliveredAt: true,
        readAt: true,
        failedAt: true,
      },
      orderBy: { attemptedAt: 'asc' },
    }),
    findAppeal: caseId => db.responsibilityAppeal.findUnique({ where: { caseId } }),
    createAppeal: record => uniqueRace(
      () => db.responsibilityAppeal.create({ data: record }),
      () => db.responsibilityAppeal.findUnique({ where: { caseId: record.caseId } }),
    ),
    setAppealStatus: (appealId, status) => db.responsibilityAppeal.update({
      where: { id: appealId },
      data: { status },
    }),
    findAppealReview: caseId => db.responsibilityAppealReview.findUnique({ where: { caseId } }),
    createAppealReview: record => uniqueRace(
      () => db.responsibilityAppealReview.create({ data: record }),
      () => db.responsibilityAppealReview.findUnique({ where: { caseId: record.caseId } }),
    ),
    findFinalDecision: caseId => db.responsibilityFinalDecision.findUnique({ where: { caseId } }),
    createFinalDecision: record => uniqueRace(
      () => db.responsibilityFinalDecision.create({ data: record }),
      () => db.responsibilityFinalDecision.findUnique({ where: { caseId: record.caseId } }),
    ),
    findHandoff: caseId => db.responsibilityFinalizationHandoff.findUnique({ where: { caseId } }),
    createHandoff: record => uniqueRace(
      () => db.responsibilityFinalizationHandoff.create({ data: record }),
      () => db.responsibilityFinalizationHandoff.findUnique({ where: { caseId: record.caseId } }),
    ),
    claimHandoff: (id, attemptedAt, staleBefore) => db.responsibilityFinalizationHandoff.updateMany({
      where: {
        id,
        OR: [
          { status: 'PENDING' },
          { status: 'PROCESSING', lastAttemptAt: null },
          { status: 'PROCESSING', lastAttemptAt: { lte: staleBefore } },
        ],
      },
      data: {
        status: 'PROCESSING',
        attemptCount: { increment: 1 },
        lastAttemptAt: attemptedAt,
        lastError: null,
      },
    }),
    markHandoffCompleted: (id, claimedAt, completedAt) => db.responsibilityFinalizationHandoff.updateMany({
      where: { id, status: 'PROCESSING', lastAttemptAt: claimedAt },
      data: { status: 'COMPLETED', completedAt, lastError: null },
    }),
    markHandoffFailed: (id, claimedAt, lastError) => db.responsibilityFinalizationHandoff.updateMany({
      where: { id, status: 'PROCESSING', lastAttemptAt: claimedAt },
      data: { status: 'PENDING', lastError },
    }),
    findExpiredAppealWindows: (now, take = 50) => db.responsibilityAppealWindow.findMany({
      where: {
        appealDeadline: { lt: now },
        case: { state: 'APPEAL_WINDOW' },
      },
      select: { caseId: true },
      orderBy: { appealDeadline: 'asc' },
      take,
    }),
    findRecoverableHandoffs: (staleBefore, take = 50) => db.responsibilityFinalizationHandoff.findMany({
      where: {
        OR: [
          { status: 'PENDING' },
          { status: 'PROCESSING', lastAttemptAt: null },
          { status: 'PROCESSING', lastAttemptAt: { lte: staleBefore } },
        ],
      },
      select: { caseId: true },
      orderBy: { createdAt: 'asc' },
      take,
    }),
    setCaseState: (caseId, state) => db.responsibilityCase.update({ where: { id: caseId }, data: { state } }),
    withLockedCase: async (caseId, work) => {
      if (typeof db.$transaction !== 'function') throw new Error('Root Prisma client required for case lock')
      return db.$transaction(async tx => {
        const rows = await tx.$queryRawUnsafe(
          'SELECT id FROM "responsibility_cases" WHERE id = $1 FOR UPDATE',
          caseId,
        )
        if (!rows.length) return work(createPrismaResponsibilityLifecycleRepository(tx), null)
        const locked = await tx.responsibilityCase.findUnique({ where: { id: caseId } })
        return work(createPrismaResponsibilityLifecycleRepository(tx), locked)
      }, { timeout: 10_000, maxWait: 5_000 })
    },
  }
}
