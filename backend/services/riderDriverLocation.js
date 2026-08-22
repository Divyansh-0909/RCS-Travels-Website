// An assigned captain's exact position is useful for Ride Now immediately, but
// a scheduled rider does not need to follow that captain around hours before
// pickup. Start scheduled tracking at T-30 minutes and keep it available through
// the active ride states.
export const SCHEDULED_LOCATION_LEAD_MS = 30 * 60 * 1000

const TRACKABLE_STATUSES = new Set(['assigned', 'en_route', 'reached', 'started'])

export function driverLocationVisibleToRider({ status, scheduledAt }, now = Date.now()) {
  if (!TRACKABLE_STATUSES.has(status)) return false
  if (!scheduledAt) return true

  const pickupAt = scheduledAt instanceof Date
    ? scheduledAt.getTime()
    : new Date(scheduledAt).getTime()

  return Number.isFinite(pickupAt) && pickupAt - now <= SCHEDULED_LOCATION_LEAD_MS
}
