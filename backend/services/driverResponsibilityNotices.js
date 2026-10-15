import { systemClock } from '../lib/clock.js'
import { findResponsibilityIncidentDriver } from './responsibilityIncidentDriver.js'

// Read-only notice projection. Submission still uses the locked appeal service;
// these display fields cannot supply eligibility or final authority.
export async function getDriverResponsibilityNotices(driverId, {
  db, clock = systemClock, findOwner = findResponsibilityIncidentDriver,
}) {
  if (typeof driverId !== 'string' || !driverId.trim()) throw new Error('Authenticated driver required')
  const cancellations = await db.driverCancellation.findMany({ where: { driverId },
    select: { bookingId: true }, orderBy: { createdAt: 'desc' }, take: 50 })
  const cases = await db.responsibilityCase.findMany({
    where: { caseType: 'DRIVER_CANCELLATION', bookingId: { in: cancellations.map(row => row.bookingId) } },
    include: { adminReview: true, appealWindow: true, appeal: true, finalDecision: true },
    orderBy: { updatedAt: 'desc' }, take: 50,
  })
  const notices = []
  for (const incident of cases) {
    const owner = await findOwner(db, incident)
    if (owner?.driverId !== driverId || !incident.appealWindow) continue
    const window = incident.appealWindow
    notices.push({ caseId: incident.id, reference: owner.reference, state: incident.state,
      evidenceVersion: incident.evidenceVersion, evidenceHash: incident.evidenceHash,
      noticeDeliveredAt: window.appealStartedAt, appealDeadline: window.appealDeadline,
      reviewReason: incident.adminReview?.reason ?? null,
      appeal: incident.appeal && { status: incident.appeal.status, reason: incident.appeal.reason,
        submittedAt: incident.appeal.submittedAt },
      finalOutcome: incident.finalDecision?.outcome ?? null,
      canAppeal: incident.state === 'APPEAL_WINDOW' && !incident.appeal && !incident.finalDecision
        && Boolean(window.appealStartedAt) && Boolean(window.appealDeadline)
        && clock.now().getTime() <= new Date(window.appealDeadline).getTime(),
    })
  }
  return { notices }
}
