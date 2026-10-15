import { systemClock } from '../lib/clock.js'
import { applyCustomerCancellationInTransaction } from './customerCancellation.js'
import { persistCancellationLocationEvidence } from './cancellationLocationEvidence.js'
import { persistRouteObservationData } from './routeProvenance.js'
import { releaseDriverCapacity } from './driverCapacity.js'
import { isDriverDelayed } from './driverDelay.js'
import { recordCustomerLifecycleIncident } from './lifecycleIncidentEvidence.js'

export async function cancelCustomerWithEvidenceInTransaction(tx, args, {
  location = null, route = null, clock = systemClock,
} = {}) {
  if (!await applyCustomerCancellationInTransaction(tx, args)) return false
  await persistCancellationLocationEvidence(tx, location)
  await persistRouteObservationData(tx, route)
  await recordCustomerLifecycleIncident(tx, { booking: args.booking, caseType: 'RIDER_CANCELLATION',
    sourceKey: `rider-cancellation:${args.booking.id}`, now: clock.now(),
    trigger: { initiator: 'rider', reason: args.cancellationReason ?? null, transition: 'cancelled' } })
  return true
}

/** Same ten-minute recovery rule as the protected customer route. Lateness is not a fault finding. */
export async function requestLateDriverRecoveryInTransaction(tx, booking, { clock = systemClock } = {}) {
  const now = clock.now()
  if (!booking.driverId || !booking.driver || booking.driver.id !== booking.driverId
    || !isDriverDelayed(booking, now.getTime())) return false
  const moved = await tx.booking.updateMany({ where: { id: booking.id, driverId: booking.driverId,
    status: booking.status, expectedPickupAt: booking.expectedPickupAt }, data: {
    status: booking.scheduledAt ? 'confirmed' : 'pending', driverId: null,
    driverAssignedAt: null, expectedPickupAt: null,
  } })
  if (!moved.count) return false
  await tx.rideOffer.updateMany({ where: { bookingId: booking.id, status: 'pending' },
    data: { status: 'withdrawn', respondedAt: now } })
  await releaseDriverCapacity(tx, { driverId: booking.driverId, vehicleClass: booking.driver.vehicleClass, sharing: booking.sharing })
  await recordCustomerLifecycleIncident(tx, { booking, caseType: 'DRIVER_LATE',
    sourceKey: `late-driver-recovery:${booking.id}:${booking.driverId}:${booking.expectedPickupAt.toISOString()}`,
    now, trigger: { initiator: 'rider', transition: 'late_driver_recovery', previousDriverId: booking.driverId,
      previousAssignedAt: booking.driverAssignedAt?.toISOString() ?? null, fault: 'UNDETERMINED' } })
  return true
}
