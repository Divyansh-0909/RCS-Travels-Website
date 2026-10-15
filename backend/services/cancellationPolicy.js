export const CANCELLATION_CHARGE_PCT = 10
export const CANCELLATION_CHARGE_CAP_PAISE = 10_000

export const CUSTOMER_VALID_CANCELLATION_REASONS = Object.freeze([
  'driver_asked_to_cancel',
  'driver_taking_too_long',
  'driver_not_moving_to_pickup',
  'driver_wrong_pickup',
  'driver_demands_extra_money',
  'wrong_vehicle',
  'driver_threatening_abusive_harassing',
  'requested_carrier_unavailable',
])

const VALID_REASON_SET = new Set(CUSTOMER_VALID_CANCELLATION_REASONS)

export function isValidCustomerCancellationReason(reason) {
  return typeof reason === 'string' && VALID_REASON_SET.has(reason)
}

export function customerCancellationChargePaise({ booking, driverAtPickup, reason = null }) {
  if (!booking?.scheduledAt || !booking.driverId || !driverAtPickup || booking.scheduledAdvancePaidAmount <= 0) return 0
  if (isValidCustomerCancellationReason(reason)) return 0

  const finalFarePaise = Math.max(0, Math.round(Number(booking.customerPayment || 0) * 100))
  const statutoryCharge = Math.min(
    Math.round((finalFarePaise * CANCELLATION_CHARGE_PCT) / 100),
    CANCELLATION_CHARGE_CAP_PAISE,
  )
  return Math.min(statutoryCharge, booking.scheduledAdvancePaidAmount)
}
