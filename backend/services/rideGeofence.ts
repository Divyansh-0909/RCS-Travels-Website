export const PICKUP_RADIUS_KM = 0.50
export const DROP_RADIUS_KM = 0.50
export const DROP_SUPPORT_RADIUS_KM = 2
export const MAX_LOCATION_ACCURACY_M = 100
export const MAX_LOCATION_AGE_MS = 30_000
export const MAX_LOCATION_FUTURE_SKEW_MS = 5_000

export const COMPLETION_OVERRIDE_REASONS = [
  'customer_requested_early_drop',
  'drop_inaccessible',
  'road_or_security_restriction',
  'incorrect_drop_pin',
] as const

export type CompletionOverrideReason = typeof COMPLETION_OVERRIDE_REASONS[number]

export function haversineDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = (degrees: number) => degrees * Math.PI / 180
  const dLat = rad(lat2 - lat1)
  const dLng = rad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(a))
}

export function freshLocationWithinPickup(
  location: { latitude: number; longitude: number; updatedAt: Date } | null | undefined,
  pickup: { lat: number; lng: number },
  nowMs = Date.now(),
): boolean {
  if (!location || nowMs - new Date(location.updatedAt).getTime() > MAX_LOCATION_AGE_MS) return false
  return haversineDistanceKm(location.latitude, location.longitude, pickup.lat, pickup.lng) <= PICKUP_RADIUS_KM
}

export function locationProblem(
  fix: { lat?: number; lng?: number; accuracy?: number; capturedAt?: number; mocked?: boolean },
  nowMs = Date.now(),
): string | null {
  if (fix.lat === undefined || fix.lng === undefined || fix.accuracy === undefined || fix.capturedAt === undefined)
    return 'A current GPS location is required for this action.'
  if (fix.mocked)
    return 'Mock location detected. Turn off the mock-location provider and try again.'
  if (fix.accuracy > MAX_LOCATION_ACCURACY_M)
    return `Location accuracy is too low (${Math.round(fix.accuracy)} m). Move into the open and try again.`
  const age = nowMs - fix.capturedAt
  if (age > MAX_LOCATION_AGE_MS)
    return 'The location reading is out of date. Refresh your location and try again.'
  if (age < -MAX_LOCATION_FUTURE_SKEW_MS)
    return 'The device location time is invalid. Check the phone clock and try again.'
  return null
}

export function completionGeofence(distanceKm: number): 'normal' | 'customer_confirmation' | 'support' {
  if (distanceKm <= DROP_RADIUS_KM) return 'normal'
  if (distanceKm <= DROP_SUPPORT_RADIUS_KM) return 'customer_confirmation'
  return 'support'
}
