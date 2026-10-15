import {
  MAX_LOCATION_AGE_MS,
  MAX_LOCATION_FUTURE_SKEW_MS,
  PICKUP_RADIUS_KM,
  freshLocationWithinPickup,
  haversineDistanceKm,
} from './rideGeofence.js'

const finite = value => Number.isFinite(value) ? value : null

const validDate = value => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function observationIsFresh(location, nowMs) {
  const observedAt = validDate(location?.observedAt)
  const ageMs = observedAt ? nowMs - observedAt.getTime() : null
  return ageMs !== null && ageMs >= -MAX_LOCATION_FUTURE_SKEW_MS && ageMs <= MAX_LOCATION_AGE_MS
}

/** Capture the exact location/state facts used by a rider-cancellation fee decision. */
export function cancellationLocationDecision(booking, nowMs = Date.now()) {
  const decisionAt = new Date(nowMs)
  const location = booking.driver?.location ?? null
  const latitude = finite(location?.latitude)
  const longitude = finite(location?.longitude)
  const pickupLat = finite(booking.pickupLat)
  const pickupLng = finite(booking.pickupLng)
  const locationUpdatedAt = validDate(location?.updatedAt)
  const locationFresh = observationIsFresh(location, nowMs)
  const distanceKm = latitude !== null && longitude !== null && pickupLat !== null && pickupLng !== null
    ? haversineDistanceKm(latitude, longitude, pickupLat, pickupLng)
    : null
  const driverAtPickup = booking.status === 'reached' || freshLocationWithinPickup(
    location,
    { lat: booking.pickupLat, lng: booking.pickupLng },
    nowMs,
  )

  return {
    bookingId: booking.id,
    driverId: booking.driverId ?? booking.driver?.id ?? null,
    bookingStatus: booking.status,
    decisionAt,
    pickupLat,
    pickupLng,
    locationLat: latitude,
    locationLng: longitude,
    locationObservedAt: validDate(location?.observedAt),
    locationReceivedAt: validDate(location?.receivedAt),
    locationUpdatedAt,
    accuracyMeters: finite(location?.accuracyMeters),
    distanceKm,
    locationFresh,
    pickupRadiusKm: PICKUP_RADIUS_KM,
    driverAtPickup,
  }
}

export async function persistCancellationLocationEvidence(client, data) {
  if (!data) return null
  return client.cancellationLocationEvidence.create({ data })
}
