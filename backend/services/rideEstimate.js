import { prisma } from '../db/prisma.js'
import { matchZone, isNearCampus, isAirportPickup } from './fareZones.js'

// Booking flow still selects by seats; sedan pricing activates once the
// frontend exposes vehicle classes.
const VEHICLE_CLASS = {
  4: 'hatchback',
  6: 'suv',
  1: 'hatchback', // ANY — price as the cheapest class
}

// ---------------------------------------------------------------------------
// Two distance formulas, because there are two different things to be fair to.
//
// A campus trip that lands in a gap between zones is still a trip the provider
// prices, so it gets the curve fitted to their own card (formulaFare, below).
// A trip that never touches campus is on nobody's card, and the rider pricing it
// has an aggregator open in the next tab — so it gets aggregator shape instead:
// a pickup fee, a rate per km, a rate for the minutes the car is tied up, and a
// floor for very short hops.
// ---------------------------------------------------------------------------

// Fitted (least squares) to 11 real quotes pulled from Uber and Rapido on six
// Delhi-NCR routes, July 2026: base ₹51 + ₹4.23/km + ₹4.70/min pooled across both
// apps, then set 12% above it. We can't surge and they can — at the 2× peak cap
// the rules allow them, this card is ~40% under the market, which is the pitch.
//
// The weighting looks odd until you check it against the data: the market is
// priced on TIME, not distance. A 5 km crawl to Chandni Chowk runs ~₹36/km while
// a 28 km expressway hop to Pari Chowk runs ~₹12/km. A per-km-heavy card would
// overcharge every expressway trip by nearly 40% and undercharge every city one.
//
// Sedan ×1.20 and Ertiga ×1.65 come from the same quotes (Uber 1.08/1.58,
// Rapido 1.35/1.80). Note the provider's own ×1.6 Ertiga rule is corroborated;
// their flat +₹100 sedan rule is not, and is far too steep on a ₹300 city fare.
//
// Re-fit these when the market moves. Nothing else in this file hardcodes a rate.
const MARKET_RATES = {
  hatchback: { pickup: 60,  perKm: 4.7, perMin: 5.3, minimum: 130 },
  sedan:     { pickup: 70,  perKm: 5.6, perMin: 6.4, minimum: 155 },
  suv:       { pickup: 100, perKm: 7.8, perMin: 8.7, minimum: 215 },
}

// Both apps charge to be picked up at IGI, and by almost the same amount —
// holding the airport rides out of each fit and then predicting them gave Uber
// +₹372 and Rapido +₹302. It is a real cost (airport access and parking are
// charged on entry), so it is not absorbed; ₹200 sits under both, which is where
// being visibly cheaper is worth most — at the arrivals kerb, next to two apps.
//
// Pickups only. Every observation behind this number was a pickup; a drop-off
// pulls up at departures and leaves, and there is no evidence either app charges
// for that. Off-corridor trips only, too: an IGI → campus run is quoted from the
// provider's own rate card, and their price is their price.
export const AIRPORT_PICKUP_SURCHARGE = 200

function marketFare(distanceKm, durationMin, vehicleClass) {
  const r = MARKET_RATES[vehicleClass] ?? MARKET_RATES.hatchback
  // Duration is best-effort from Routes. Without it the time component is
  // dropped rather than estimated — quoting a little low beats inventing traffic
  // that was never measured, and the quote is what the rider is held to.
  const time = durationMin != null ? r.perMin * durationMin : 0
  const fare = Math.max(r.minimum, r.pickup + r.perKm * distanceKm + time)
  // To 10, not 50: the campus card deals in four figures where a ₹50 step is
  // noise, but on a ₹300 city fare it is several percent.
  return Math.round(fare / 10) * 10
}

// Fitted to the provider's rate card: hatchback ≈ 36.7·km^0.897, sedan +100 flat,
// Ertiga ≈ 1.6x hatchback. The power law makes the effective per-km rate fall with
// distance; beyond 56 km a flat ₹16/km takes over, because long trips (Dwarka,
// Gurugram, Manesar) are priced softer. The far segment starts from the curve's own
// value at 56 km, so shorter fares are untouched.
const FAR_KM = 56
const FAR_RATE = 16
const FAR_BASE = 36.7 * Math.pow(FAR_KM, 0.897) // ≈1358, curve value at 56 km

// Bands the provider prices above the curve. 20-25 km is congested near-NCR (Gaur
// City, Ghaziabad); the flat ₹400 GN locals at that distance are zone-priced, so the
// formula can lean toward the congested side without overcharging them. 49-52 km is
// the central Delhi ring (Old Delhi, Kashmiri Gate, Karol Bagh, Hauz Khas).
const PREMIUM_BANDS = [
  { from: 20, to: 25, bump: 50 },
  { from: 49, to: 52, bump: 50 },
]

const rawCurve = (km) => {
  let base = km <= FAR_KM ? 36.7 * Math.pow(km, 0.897) : FAR_BASE + FAR_RATE * (km - FAR_KM)
  for (const b of PREMIUM_BANDS) if (km >= b.from && km <= b.to) base += b.bump
  return base
}

function formulaFare(distanceKm, vehicleClass) {
  // A band's +50 is a step, so leaving a band used to make the fare FALL: 25.0 km
  // quoted 700 and 25.1 km quoted 650, a longer trip for less money. Clamping the
  // curve to its own running maximum fixes that without touching any price at or
  // below a band — past the exit the fare simply holds until the curve catches up.
  let base = rawCurve(distanceKm)
  for (const b of PREMIUM_BANDS)
    if (distanceKm > b.to) base = Math.max(base, rawCurve(b.to))
  const hatchback = Math.max(400, base)
  const fare =
    vehicleClass === 'sedan' ? hatchback + 100 :
    vehicleClass === 'suv'   ? hatchback * 1.6 :
    hatchback
  return Math.round(fare / 50) * 50
}

// Google has no notion of a "safe" route — that knowledge is local. So instead of
// asking for one we force the path through a point on the lit highway, making it
// compute pickup → waypoint → drop, which excludes the unlit shortcut.
//
// !! STILL null. Until a real lat/lng on the safe stretch goes here, the safer-route
// option charges the surcharge and changes nothing about the road. See ROADMAP.
const SAFE_WAYPOINT = null // { latitude: __, longitude: __ }

// Flat add-on, mirrored in frontend VehicleSelect (SAFE_ROUTE_SURCHARGE).
export const SAFE_ROUTE_SURCHARGE = 150

// Roof carrier for luggage that won't fit inside — a rider option, not a
// property of the route. Mirrored in frontend constants/fares.js.
export const CARRIER_CHARGE = 200

// The provider throws the carrier in once a run is expensive enough ("if the
// total reaches about 2000"). The test is on the undiscounted ride plus its
// toll: sharing must not decide whether the carrier is free, and neither should
// the safer-route add-on, or picking the lit highway could tip a fare over the
// line and hand back 200.
const CARRIER_WAIVED_AT = 2000

// !! NEEDS PROVIDER CONFIRMATION — this number is ours, not theirs. The rate card
// quotes solo fares only, so it was backed out of the placeholder the UI used to
// hardcode (400 solo / 300 sharing). One constant reprices every sharing fare.
const SHARING_DISCOUNT_PCT = 25

const GOOGLE_ROUTES_MONTHLY_LIMIT = 10_000

const currentMonth = () => new Date().toISOString().slice(0, 7) // "YYYY-MM"

// Counts every Routes call for the month and refuses past the cap, keeping the bill
// inside Google's free tier. Covers Routes only — the autocomplete/details/geocode
// proxies in routes/googleAPI.js are bounded by the Console quota instead.
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

// Distance is display-only for zone and fixed-table fares but mandatory for the
// per-km formula, so a Routes failure drops the types that need it rather than
// failing the whole estimate. getRideEstimate throws only if nothing can be priced.
async function bestEffortMetrics(pickupAddress, dropAddress, pickupCoords, dropCoords, safeRoute) {
  try {
    return await fetchRouteMetrics(pickupAddress, dropAddress, pickupCoords, dropCoords, safeRoute)
  } catch (err) {
    console.error('route metrics unavailable:', err.message)
    return { distanceKm: null, durationMin: null, polyline: null }
  }
}

export async function getRideEstimate({ pickupAddress, dropAddress, vehicleType, pickupCoords, dropCoords, preferSafeRoute, needsCarrier }) {

  // Every price on the rate card is a price FROM CAMPUS: the zones are drawn
  // around the far endpoint and fare_table keys on the destination alone, so
  // neither source carries an origin to check. Left ungated they answered for
  // trips that never touch campus anyway — IGI → Connaught Place, 16 km, came
  // back at 1150, the campus-to-CP price for a 55 km run. Off-corridor trips get
  // the per-km formula instead, the one source that reads the actual distance.
  //
  // Coords are what prove it, so a route with no coords on either end is priced
  // by the formula too. In practice both ends come from Places or the pin-confirm
  // screen; hand-typed addresses lose zone pricing rather than guess at it.
  const campusAnchored = Boolean(
    (pickupCoords && isNearCampus(pickupCoords)) || (dropCoords && isNearCampus(dropCoords))
  )

  // The waypoint only makes sense on the campus corridor — forcing it on a
  // Delhi→Delhi trip would be a detour, not a safer route. Without coords there's
  // nothing to test against, so the option is ignored rather than guessed at.
  const safeRoute = Boolean(preferSafeRoute && SAFE_WAYPOINT && campusAnchored)

  // The surcharge follows the rider's choice, not whether the detour applied —
  // charging only when the waypoint fires would make the fare unpredictable.
  const surcharge = preferSafeRoute ? SAFE_ROUTE_SURCHARGE : 0

  // Zones price the endpoint away from campus, so reverse trips (Delhi → SNU)
  // match on the pickup instead. Coords are optional pin-confirm refinements —
  // without them, zone matching is skipped.
  const zoneCoords = !campusAnchored ? null :
    dropCoords && !isNearCampus(dropCoords) ? dropCoords :
    pickupCoords && !isNearCampus(pickupCoords) ? pickupCoords :
    null
  const zone = matchZone(zoneCoords)

  // One lookup covering every seat type at this destination, instead of one
  // query per type — the caller prices all three cards from a single request.
  // Skipped entirely off-corridor, where its answer wouldn't be used.
  const rows = campusAnchored
    ? await prisma.fareTable.findMany({
        where: { destinationName: dropAddress, isActive: true },
      })
    : []

  const metrics = await bestEffortMetrics(pickupAddress, dropAddress, pickupCoords, dropCoords, safeRoute)

  // Resolve one seat type: zone fare, then the fixed table, then per-km. Each source
  // is checked per CLASS, so a zone that prices hatchbacks but not SUVs still yields
  // a formula price for Cab XL instead of no price at all.
  // Only off-corridor fares carry it — see the constant. Resolved once, not per
  // seat type, because it is a property of where the car starts.
  const airport = !campusAnchored && isAirportPickup(pickupCoords)
    ? AIRPORT_PICKUP_SURCHARGE
    : 0

  function priceFor(type) {
    const cls = VEHICLE_CLASS[type]

    if (campusAnchored) {
      const zoneFare = zone?.fares?.[cls]
      if (zoneFare != null) return { base: zoneFare, source: 'zone', toll: zone.toll, airport: 0 }

      const row = rows.find(r => r.vehicleType === type)
      if (row) return { base: row.fixedFare, source: 'fixed_table', toll: 0, airport: 0 }
    }

    if (metrics.distanceKm == null) return null

    // Neither distance price carries a toll: they pay for the drive, and whatever
    // barriers the route crosses settle with the driver. That is exactly what the
    // "tolls payable to driver separately" notice on the booking screen promises.
    return campusAnchored
      ? { base: formulaFare(metrics.distanceKm, cls), source: 'formula', toll: 0, airport: 0 }
      : { base: marketFare(metrics.distanceKm, metrics.durationMin, cls), source: 'per_km', toll: 0, airport }
  }

  // Sharing splits the car. Everything else here is a flat cost of the trip
  // rather than of the seat — the toll is one barrier however many riders are
  // behind it, the carrier goes on the roof once, the safer route is a longer
  // road — so all three are added AFTER the discount instead of being split.
  const priced = ({ base, source, toll, airport }) => {
    // Tested on ride + toll only. The waiver is the provider's concession on
    // their own big-ticket runs, and those are never the trips that carry an
    // airport pickup fee — folding it in would just blur what "reaches 2000" means.
    const carrier = needsCarrier && base + toll < CARRIER_WAIVED_AT ? CARRIER_CHARGE : 0
    const extras = surcharge + toll + airport + carrier
    return {
      solo: base + extras,
      sharing: Math.round((base * (100 - SHARING_DISCOUNT_PCT)) / 100 / 10) * 10 + extras,
      source,
      // Itemised so the ride-details breakdown can show what the total is made
      // of instead of re-deriving it from a copy of the rate card.
      toll,
      airport,
      carrier,
      carrierWaived: Boolean(needsCarrier) && carrier === 0,
    }
  }

  const hatchback = priceFor(4)
  const suv = priceFor(6)
  if (!hatchback && !suv) throw new Error('No route found between the given addresses')

  const fares = {}
  if (hatchback) {
    fares[4] = priced(hatchback)
    fares[1] = priced(hatchback) // "Book any" bills the cheaper class
  }
  if (suv) fares[6] = priced(suv)

  // `fares` prices every card; the flat fare/fareSource fields answer for the one
  // vehicleType that was asked about.
  const selected = fares[vehicleType] ?? fares[4] ?? fares[6]

  return {
    fares,
    fare: selected?.solo ?? null,
    fareSource: selected?.source ?? null,
    toll: selected?.toll ?? 0,
    airport: selected?.airport ?? 0,
    carrier: selected?.carrier ?? 0,
    carrierWaived: selected?.carrierWaived ?? false,
    zoneName: zone?.name ?? null,
    ...metrics,
  }
}
