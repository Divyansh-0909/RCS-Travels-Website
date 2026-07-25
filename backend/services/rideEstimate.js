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

// !! NEEDS PROVIDER CONFIRMATION. The rate card quotes solo fares only, so this
// number is ours, not theirs. It was reverse-engineered from the placeholder the
// UI used to hardcode (400 solo / 300 sharing). Change this one constant to
// reprice every sharing fare in the app.
const SHARING_DISCOUNT_PCT = 25

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

// Metrics are display-only for zone and fixed-table fares, so a Google failure
// must not break those. Types that fall through to the per-km formula have no
// price without a distance and are simply omitted from the response.
async function bestEffortMetrics(pickupAddress, dropAddress, pickupCoords, dropCoords, safeRoute) {
  try {
    return await fetchRouteMetrics(pickupAddress, dropAddress, pickupCoords, dropCoords, safeRoute)
  } catch (err) {
    console.error('route metrics unavailable:', err.message)
    return { distanceKm: null, durationMin: null, polyline: null }
  }
}

export async function getRideEstimate({ pickupAddress, dropAddress, vehicleType, pickupCoords, dropCoords, preferSafeRoute }) {

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

  // One lookup covering every seat type at this destination, instead of one
  // query per type — the caller prices all three cards from a single request.
  const rows = await prisma.fareTable.findMany({
    where: { destinationName: dropAddress, isActive: true },
  })

  // Best-effort on purpose. Metrics are display-only for zone and fixed-table
  // fares but mandatory for the formula, so a Routes failure should drop the
  // types that need it rather than fail the whole estimate. If nothing can be
  // priced we throw below, which is what the pure-formula path used to do.
  const metrics = await bestEffortMetrics(pickupAddress, dropAddress, pickupCoords, dropCoords, safeRoute)

  // Resolve one seat type: zone fare, then the fixed table, then per-km. Each
  // source is checked per CLASS, so a zone that prices hatchbacks but not SUVs
  // still yields a formula price for Cab XL instead of no price at all — the
  // old code fell through to the formula for the whole request in that case.
  function priceFor(type) {
    const cls = VEHICLE_CLASS[type]
    const zoneFare = zone?.fares?.[cls]
    if (zoneFare != null) return { base: zoneFare, source: 'zone' }

    const row = rows.find(r => r.vehicleType === type)
    if (row) return { base: row.fixedFare, source: 'fixed_table' }

    if (metrics.distanceKm == null) return null
    return { base: formulaFare(metrics.distanceKm, cls), source: 'formula' }
  }

  // Sharing splits the car. The safer-route surcharge is a flat road cost, so it
  // is added AFTER the discount rather than being discounted along with the fare.
  const priced = ({ base, source }) => ({
    solo: base + surcharge,
    sharing: Math.round((base * (100 - SHARING_DISCOUNT_PCT)) / 100 / 10) * 10 + surcharge,
    source,
  })

  const hatchback = priceFor(4)
  const suv = priceFor(6)
  if (!hatchback && !suv) throw new Error('No route found between the given addresses')

  const fares = {}
  if (hatchback) {
    fares[4] = priced(hatchback)
    fares[1] = priced(hatchback) // "Book any" bills the cheaper class
  }
  if (suv) fares[6] = priced(suv)

  // Single-fare fields answer for the vehicleType that was asked about, so
  // existing callers keep working unchanged.
  const selected = fares[vehicleType] ?? fares[4] ?? fares[6]

  return {
    fares,
    fare: selected?.solo ?? null,
    fareSource: selected?.source ?? null,
    zoneName: zone?.name ?? null,
    ...metrics,
  }
}
