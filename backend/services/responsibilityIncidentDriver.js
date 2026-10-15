import { responsibilityEvidenceHash } from './responsibilityAnalyst.js'

const driverSelect = { id: true, name: true, phone: true, fcmToken: true }

// Route notice/appeal ownership to the committed incident actor. A replacement
// assignment cannot become the owner of the previous captain's cancellation.
export async function findResponsibilityIncidentDriver(db, responsibilityCase) {
  const booking = await db.booking.findUnique({ where: { id: responsibilityCase.bookingId },
    select: { id: true, reference: true, driverId: true, driver: { select: driverSelect } } })
  if (!booking || responsibilityCase.caseType !== 'DRIVER_CANCELLATION') return booking
  const snapshot = responsibilityCase.evidenceSnapshot
  try {
    if (responsibilityEvidenceHash(snapshot) !== responsibilityCase.evidenceHash) return null
  } catch { return null }
  if (snapshot.caseId !== responsibilityCase.id || snapshot.bookingId !== responsibilityCase.bookingId
    || snapshot.caseType !== responsibilityCase.caseType) return null
  const assignments = snapshot.timeline.filter(entry => entry.kind === 'assigned_driver_at_cancellation'
    && entry.basis === 'direct' && entry.availability === 'available')
  const cancellations = snapshot.timeline.filter(entry => entry.kind === 'driver_cancellation_recorded'
    && entry.basis === 'direct' && entry.availability === 'available')
  if (assignments.length !== 1 || cancellations.length !== 1) return null
  const actor = assignments[0].value
  const incident = cancellations[0].value
  if (typeof actor?.driverId !== 'string' || !actor.driverId.trim()
    || typeof incident?.cancellationId !== 'string' || !incident.cancellationId.trim() || incident.initiator !== 'driver') return null
  const committed = await db.driverCancellation.findUnique({ where: { id: incident.cancellationId },
    select: { driverId: true, bookingId: true } })
  if (!committed || committed.bookingId !== booking.id || committed.driverId !== actor.driverId) return null
  const driver = await db.driver.findUnique({ where: { id: committed.driverId }, select: driverSelect })
  if (!driver) return null
  return { ...booking, driverId: driver.id, driver }
}
