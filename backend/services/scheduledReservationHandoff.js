/** A committed recovery event permits a new reservation; it never transfers the old hold. */
export async function hasScheduledReservationHandoff(tx, bookingId, driverId) {
  if (await tx.driverCancellation.findFirst({ where: { bookingId, driverId } })) return true
  const cases = await tx.responsibilityCase.findMany({ where: { bookingId, caseType: 'DRIVER_LATE' },
    select: { sourceKey: true, evidenceSnapshot: true } })
  return cases.some(row => {
    const assignment = row.evidenceSnapshot.timeline.find(entry => entry.kind === 'assignment_at_customer_transition')?.value
    const trigger = row.evidenceSnapshot.timeline.find(entry => entry.kind === 'committed_customer_transition')?.value
    return assignment?.driverId === driverId && trigger?.previousDriverId === driverId
      && trigger.transition === 'late_driver_recovery'
      && row.sourceKey === `late-driver-recovery:${bookingId}:${driverId}:${assignment.expectedPickupAt}`
  })
}
