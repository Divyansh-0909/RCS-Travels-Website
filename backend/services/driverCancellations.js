export const DRIVER_CANCELLATION_WINDOW_DAYS = 30
export const DRIVER_CANCELLATION_BENEFIT_THRESHOLD = 3
export const DRIVER_CANCELLATION_SUSPEND_THRESHOLD = 5

export const cancellationWindowStart = (now = new Date()) =>
  new Date(now.getTime() - DRIVER_CANCELLATION_WINDOW_DAYS * 24 * 60 * 60 * 1000)

export async function applyDriverCancellationConsequences(tx, driverId, { bookingId, fromStatus, now = new Date() }) {
  await tx.driverCancellation.create({ data: { driverId, bookingId, fromStatus, createdAt: now } })
  const cancellations = await tx.driverCancellation.count({
    where: { driverId, createdAt: { gte: cancellationWindowStart(now) } },
  })
  const benefitRestrictedUntil = new Date(now.getTime() + DRIVER_CANCELLATION_WINDOW_DAYS * 24 * 60 * 60 * 1000)

  if (cancellations >= DRIVER_CANCELLATION_BENEFIT_THRESHOLD) {
    await tx.driver.update({ where: { id: driverId }, data: {
      commissionFreeRidesRemaining: 0,
      cancellationBenefitRestrictedUntil: benefitRestrictedUntil,
    } })
  }
  if (cancellations === DRIVER_CANCELLATION_SUSPEND_THRESHOLD) {
    await tx.driver.updateMany({ where: { id: driverId, suspendedAt: null }, data: {
      suspendedAt: now,
      suspensionReason: `${cancellations} driver cancellations in ${DRIVER_CANCELLATION_WINDOW_DAYS} days`,
      isOnline: false,
    } })
    await tx.rideOffer.updateMany({ where: { driverId, status: 'pending' }, data: { status: 'withdrawn', respondedAt: now } })
  }
  return {
    cancellations,
    benefitsRestricted: cancellations >= DRIVER_CANCELLATION_BENEFIT_THRESHOLD,
    suspended: cancellations >= DRIVER_CANCELLATION_SUSPEND_THRESHOLD,
    benefitRestrictedUntil: cancellations >= DRIVER_CANCELLATION_BENEFIT_THRESHOLD ? benefitRestrictedUntil : null,
  }
}
