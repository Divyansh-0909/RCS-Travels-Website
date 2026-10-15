/**
 * Route facts are deliberately separate from a booking's mutable current state.
 * The Prisma contract is documented below so the table can be introduced without
 * making a live Routes poll a persistence dependency.
 *
 * RouteObservation fields:
 *   id, bookingId, event (assignment_accepted | rider_cancelled),
 *   originLat, originLng, destinationLat, destinationLng,
 *   provider, trafficMode, durationSeconds?, trafficDurationSeconds?,
 *   distanceMeters?, calculatedAt, receivedAt,
 *   cacheIdentity?, cacheHit, cacheAgeMs?, providerRouteId?
 *
 * `bookingId` relates to Booking and should be indexed with `event, calculatedAt`.
 */

const finite = value => Number.isFinite(value) ? value : null

export const ROUTE_OBSERVATION_EVENT = Object.freeze({
  ASSIGNMENT_ACCEPTED: 'assignment_accepted',
  RIDER_CANCELLED: 'rider_cancelled',
})

const pointData = (prefix, point) => ({
  [`${prefix}Lat`]: finite(point?.lat),
  [`${prefix}Lng`]: finite(point?.lng),
})

/** Convert a navigation result into the storage contract without inventing fields. */
export function routeObservationData({ bookingId, event, route }) {
  const provenance = route?.provenance
  if (!bookingId || !event || !provenance) return null

  const calculatedAt = new Date(provenance.calculatedAt)
  const receivedAt = new Date(provenance.receivedAt)
  if (Number.isNaN(calculatedAt.getTime()) || Number.isNaN(receivedAt.getTime())) return null

  return {
    bookingId,
    event,
    ...pointData('origin', provenance.origin),
    ...pointData('destination', provenance.destination),
    provider: provenance.provider,
    trafficMode: provenance.trafficMode,
    durationSeconds: finite(provenance.durationSeconds),
    trafficDurationSeconds: finite(provenance.trafficDurationSeconds),
    distanceMeters: finite(provenance.distanceMeters),
    calculatedAt,
    receivedAt,
    cacheIdentity: provenance.cache?.identity ?? null,
    cacheHit: Boolean(provenance.cache?.hit),
    cacheAgeMs: finite(provenance.cache?.ageMs),
    providerRouteId: provenance.providerRouteId ?? null,
  }
}

/** The route-observation write is intentionally explicit at the two decision points. */
export async function persistRouteObservation(client, input) {
  return persistRouteObservationData(client, routeObservationData(input))
}

/** Persist a previously captured route fact in the caller's transaction. */
export async function persistRouteObservationData(client, data) {
  if (!data) return null
  return client.routeObservation.create({ data })
}
