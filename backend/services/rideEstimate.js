import { prisma } from '../db/prisma.js'
import { matchZone, isNearCampus } from './fareZones.js'

// Booking flow still selects by seats; sedan pricing activates once the
// frontend exposes vehicle classes.
const VEHICLE_CLASS = {
  4: 'hatchback',
  6: 'suv',
  1: 'hatchback', // ANY — price as the cheapest class
}

// Fitted to the provider's rate card. Power law so the effective per-km rate
// declines with distance, with a cheaper flat ₹16/km beyond 56 km (long trips
// are priced softer — Dwarka/Gurugram/Manesar). The far segment continues from
// the curve's value at 56 km, so shorter fares are unaffected.
// hatchback ≈ 36.7·km^0.897, sedan = +100 flat, Ertiga ≈ 1.6× hatchback.
const FAR_KM = 56
const FAR_RATE = 16
const FAR_BASE = 36.7 * Math.pow(FAR_KM, 0.897) // ≈1358, curve value at 56 km

// Distance bands the provider prices above the curve. 20–25 km: congested
// near-NCR (Gaur City, Ghaziabad) — the flat ₹400 GN locals at that distance
// are zone-priced, so the formula leans toward the congested side. 49–52 km:
// central Delhi ring (Old Delhi, Kashmiri Gate, Karol Bagh, Hauz Khas).
const PREMIUM_BANDS = [
  { from: 20, to: 25, bump: 50 },
  { from: 49, to: 52, bump: 50 },
]

function formulaFare(distanceKm, vehicleClass) {
  let base =
    distanceKm <= FAR_KM
      ? 36.7 * Math.pow(distanceKm, 0.897)
      : FAR_BASE + FAR_RATE * (distanceKm - FAR_KM)
  for (const b of PREMIUM_BANDS)
    if (distanceKm >= b.from && distanceKm <= b.to) base += b.bump
  const hatchback = Math.max(400, base)
  const fare =
    vehicleClass === 'sedan' ? hatchback + 100 :
    vehicleClass === 'suv'   ? hatchback * 1.6 :
    hatchback
  return Math.round(fare / 50) * 50
}

// Google has no notion of a "safe" route — that knowledge is local. So we don't
// ask it for one; we force the route through a point on the lit highway, which
// makes it compute pickup → waypoint → drop and excludes the unlit shortcut.
//
// !! MUST BE FILLED IN with a real lat/lng on the safe stretch. While it's null
// the safer-route option changes nothing about the road path — see ROADMAP.
const SAFE_WAYPOINT = null // { latitude: __, longitude: __ }

// Flat add-on, mirrored in frontend VehicleSelect (SAFE_ROUTE_SURCHARGE).
export const SAFE_ROUTE_SURCHARGE = 150

const GOOGLE_ROUTES_MONTHLY_LIMIT = 10_000

const currentMonth = () => new Date().toISOString().slice(0, 7) // "YYYY-MM"

// to keep under google free usage limit
async function checkAndIncrementRoutesUsage() {
  const month = currentMonth()

  const usage = await prisma.apiUsage.findUnique({
    where: { service_month: { service: 'google_routes', month } },
  })

  if (usage && usage.count >= GOOGLE_ROUTES_MONTHLY_LIMIT) {
    throw new Error('GOOGLE_ROUTES_LIMIT_EXCEEDED')
  }

  await prisma.apiUsage.upsert({
    where:  { service_month: { service: 'google_routes', month } },
    update: { count: { increment: 1 } },
    create: { service: 'google_routes', month, count: 1 },
  })
}

// Pin-adjusted coords are more precise than the typed address, so prefer them.
const toWaypoint = (address, coords) =>
  coords ? { location: { latLng: { latitude: coords.lat, longitude: coords.lng } } } : { address }

async function fetchRouteMetrics(pickupAddress, dropAddress, pickupCoords, dropCoords, safeRoute) {
  await checkAndIncrementRoutesUsage()

  const result = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
    },
    body: JSON.stringify({
      origin:      toWaypoint(pickupAddress, pickupCoords),
      destination: toWaypoint(dropAddress, dropCoords),
      ...(safeRoute ? { intermediates: [{ location: { latLng: SAFE_WAYPOINT } }] } : {}),
      travelMode:  'DRIVE',
    }),
  })
  const data = await result.json()
  if (!data.routes?.[0]?.distanceMeters)
    throw new Error('No route found between the given addresses')

  const route = data.routes[0]
  return {
    distanceKm:  route.distanceMeters / 1000,
    durationMin: route.duration ? Math.round(parseInt(route.duration, 10) / 60) : null, // duration is "1234s"
    polyline:    route.polyline?.encodedPolyline ?? null, // encoded road path, for map display
  }
}

// Metrics are display-only when the fare is fixed, so Google failures must
// not break the estimate.
async function bestEffortMetrics(pickupAddress, dropAddress, pickupCoords, dropCoords, safeRoute) {
  try {
    return await fetchRouteMetrics(pickupAddress, dropAddress, pickupCoords, dropCoords, safeRoute)
  } catch (err) {
    console.error('route metrics unavailable for fixed fare:', err.message)
    return { distanceKm: null, durationMin: null, polyline: null }
  }
}

export async function getRideEstimate({ pickupAddress, dropAddress, vehicleType, pickupCoords, dropCoords, preferSafeRoute }) {
  const vehicleClass = VEHICLE_CLASS[vehicleType]

  // The waypoint only makes sense on the campus corridor — forcing it on a
  // Delhi→Delhi trip would be a detour, not a safer route. Without coords there's
  // nothing to test against, so the option is ignored rather than guessed at.
  const onCampusCorridor =
    (pickupCoords && isNearCampus(pickupCoords)) || (dropCoords && isNearCampus(dropCoords))
  const safeRoute = Boolean(preferSafeRoute && SAFE_WAYPOINT && onCampusCorridor)

  // The surcharge follows the rider's choice, not whether the detour applied —
  // charging only when the waypoint fires would make the fare unpredictable.
  const surcharge = preferSafeRoute ? SAFE_ROUTE_SURCHARGE : 0

  // Zones price the endpoint away from campus, so reverse trips (Delhi → SNU)
  // match on the pickup instead. Coords are optional pin-confirm refinements —
  // without them, zone matching is skipped.
  const zoneCoords =
    dropCoords && !isNearCampus(dropCoords) ? dropCoords :
    pickupCoords && !isNearCampus(pickupCoords) ? pickupCoords :
    null
  const zone = matchZone(zoneCoords)
  const zoneFare = zone?.fares?.[vehicleClass]

  if (zoneFare) {
    const metrics = await bestEffortMetrics(pickupAddress, dropAddress, pickupCoords, dropCoords, safeRoute)
    return { fare: zoneFare + surcharge, ...metrics, fareSource: 'zone', zoneName: zone.name }
  }

  const row = await prisma.fareTable.findFirst({
    where: { destinationName: dropAddress, vehicleType, isActive: true },
  })

  if (row) {
    const metrics = await bestEffortMetrics(pickupAddress, dropAddress, pickupCoords, dropCoords, safeRoute)
    return { fare: row.fixedFare + surcharge, ...metrics, fareSource: 'fixed_table' }
  }

  const metrics = await fetchRouteMetrics(pickupAddress, dropAddress, pickupCoords, dropCoords, safeRoute)
  // Per-km already prices the longer detour through distanceKm, so the flat
  // surcharge is charged on top of a fare that has itself gone up.
  const fare = formulaFare(metrics.distanceKm, vehicleClass) + surcharge

  return { fare, ...metrics, fareSource: 'formula' }
}
