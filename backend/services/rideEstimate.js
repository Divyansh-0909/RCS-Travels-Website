import { prisma } from '../db/prisma.js'
import { matchZone, isNearCampus, isAirportPickup } from './fareZones.js'
import { classifyRoutes, hasShadyZones, isClean, decodePolyline } from './safeRoute.js'
import { VEHICLE_CLASS_NAMES } from '../constants/vehicles.js'

// ---------------------------------------------------------------------------
// Every fare on this route is one number with a multiplier on it.
//
// The one number is the HATCHBACK price, and there are exactly two ways to reach
// it. A trip with either end on campus is on the provider's own rate card, so it
// is priced by zone, or — when it lands in a gap between zones — by the curve
// fitted to that same card (formulaFare, below). A trip that never touches campus
// is on nobody's card, and the rider pricing it has an aggregator open in the next
// tab, so it gets aggregator shape instead: a pickup fee, a rate per km, a rate
// for the minutes the car is tied up, and a floor for very short hops.
//
// Nothing else prices anything. Sedan, SUV and premium SUV are modifiers on
// whichever of those two answered — see CLASS_FROM_HATCHBACK.
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
// Hatchback only, now. The fit also produced sedan and SUV columns (×1.20 and
// ×1.65 of this one, from Uber 1.08/1.58 and Rapido 1.35/1.80), but the provider's
// own class rules apply everywhere instead — see CLASS_FROM_HATCHBACK.
//
// Re-fit this when the market moves. Nothing else in this file hardcodes a rate.
const MARKET_RATE = { pickup: 60, perKm: 4.7, perMin: 5.3, minimum: 130 }

// The provider's class rules, and the only place a class other than hatchback is
// priced. Applied AT the source that answered, so a zone quote yields a zone-priced
// SUV and the per-km formula yields a market-priced SUV — never a fall-through to
// a weaker source just because the rider picked the nicer car.
//
// Sedan's flat +₹100 and the Ertiga's ×1.6 are the provider's own rules, quoted on
// their rate card. Note the +₹100 is worth watching on short city fares, where it
// lands as +30% rather than the ~+8% it means on a campus run.
//
// !! NEEDS PROVIDER CONFIRMATION — ×3.2 for the premium SUV is ours, not theirs.
// Nothing on the rate card prices one, so it is expressed against the hatchback
// like every other class. One constant reprices every premium fare on every route.
const CLASS_FROM_HATCHBACK = {
  hatchback:   (fare) => fare,
  sedan:       (fare) => fare + 100,
  suv:         (fare) => fare * 1.6,
  suv_premium: (fare) => fare * 3.2,
}

// Derived fares land back on the grid their source uses: the campus card deals
// in 50s, city fares in 10s (see the rounding note in marketFare).
const gridOf = (source) => (source === 'per_km' ? 10 : 50)
const roundTo = (value, step) => Math.round(value / step) * step

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

// The hatchback price for a trip that never touches campus.
function marketFare(distanceKm, durationMin) {
  const r = MARKET_RATE
  // Duration is best-effort from Routes. Without it the time component is
  // dropped rather than estimated — quoting a little low beats inventing traffic
  // that was never measured, and the quote is what the rider is held to.
  const time = durationMin != null ? r.perMin * durationMin : 0
  const fare = Math.max(r.minimum, r.pickup + r.perKm * distanceKm + time)
  // To 10, not 50: the campus card deals in four figures where a ₹50 step is
  // noise, but on a ₹300 city fare it is several percent.
  return Math.round(fare / 10) * 10
}

// Fitted to the provider's rate card: hatchback ≈ 36.7·km^0.897. The power law
// makes the effective per-km rate fall with distance; beyond 56 km a flat ₹16/km
// takes over, because long trips (Dwarka, Gurugram, Manesar) are priced softer. The
// far segment starts from the curve's own value at 56 km, so shorter fares are
// untouched. The card's sedan and Ertiga rules were fitted from here too, and now
// live in CLASS_FROM_HATCHBACK where every source shares them.
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

// The hatchback price for a campus trip that matched no zone.
function formulaFare(distanceKm) {
  // A band's +50 is a step, so leaving a band used to make the fare FALL: 25.0 km
  // quoted 700 and 25.1 km quoted 650, a longer trip for less money. Clamping the
  // curve to its own running maximum fixes that without touching any price at or
  // below a band — past the exit the fare simply holds until the curve catches up.
  let base = rawCurve(distanceKm)
  for (const b of PREMIUM_BANDS)
    if (distanceKm > b.to) base = Math.max(base, rawCurve(b.to))
  return Math.round(Math.max(400, base) / 50) * 50
}

// How the safer route is chosen lives in safeRoute.js. The short version: we ask
// Google for its alternatives, throw away the ones crossing a shady zone, and
// offer the best of what's left. The single hardcoded waypoint that used to sit
// here could only ever be right for one corridor.

// Flat add-on, mirrored in frontend constants/fares.js (SAFE_ROUTE_SURCHARGE).
// Charged ONLY when a safer route was actually found and taken — see the
// `applied` flag below. The old code charged it on the rider's checkbox alone,
// so a trip with no safer route to take was still billed for one.
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

// One Routes call. `via` forces a pass-through point rather than a stop: without
// it Google splits the trip into two legs, quotes an arrival at a random spot on
// a highway, and the driver's navigation announces it as a destination.
//
// Alternatives and intermediates are mutually exclusive at the API — a request
// carrying a waypoint returns exactly one route — which is why the two modes here
// are either/or rather than combined.
async function fetchRoutes(pickupAddress, dropAddress, pickupCoords, dropCoords, viaWaypoint) {
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
      ...(viaWaypoint
        ? { intermediates: [{ location: { latLng: { latitude: viaWaypoint.lat, longitude: viaWaypoint.lng } }, via: true }] }
        // Nothing to classify against without zones drawn, so don't pay the
        // larger response — the feature stays completely dormant.
        : hasShadyZones() ? { computeAlternativeRoutes: true } : {}),
      travelMode:  'DRIVE',
    }),
  })
  const data = await result.json()
  if (!data.routes?.[0]?.distanceMeters)
    throw new Error('No route found between the given addresses')

  return data.routes.map((route) => ({
    distanceKm:  route.distanceMeters / 1000,
    durationMin: route.duration ? Math.round(parseInt(route.duration, 10) / 60) : null, // duration is "1234s"
    polyline:    route.polyline?.encodedPolyline ?? null, // encoded road path, for map display
    points:      route.polyline?.encodedPolyline ? decodePolyline(route.polyline.encodedPolyline) : [],
  }))
}

// Resolve what this trip can be driven on: the route the driver takes by default,
// and a safer one if any exists.
//
// The second call is deliberately rare. It only fires when the default crosses a
// shady zone AND none of Google's own alternatives miss it AND that zone names a
// fallback highway point — the case where we have to state a road rather than
// choose between the ones offered.
async function fetchRouteOptions(pickupAddress, dropAddress, pickupCoords, dropCoords) {
  const routes = await fetchRoutes(pickupAddress, dropAddress, pickupCoords, dropCoords, null)
  const { primary, safe, waypoint, fallback } = classifyRoutes(routes)

  if (safe) return { primary, safe, waypoint }
  if (!fallback) return { primary, safe: null, waypoint: null }

  try {
    const [forced] = await fetchRoutes(pickupAddress, dropAddress, pickupCoords, dropCoords, fallback)
    // The forced point is not a promise that the result is clean — Google may
    // route back through the zone on either side of it. Verify before offering.
    if (forced && isClean(forced.points)) return { primary, safe: forced, waypoint: fallback }
  } catch (err) {
    console.error('safe-route fallback unavailable:', err.message)
  }
  return { primary, safe: null, waypoint: null }
}

// Distance is display-only for zone and fixed-table fares but mandatory for the
// per-km formula, so a Routes failure drops the types that need it rather than
// failing the whole estimate. getRideEstimate throws only if nothing can be priced.
async function bestEffortRouteOptions(pickupAddress, dropAddress, pickupCoords, dropCoords) {
  try {
    return await fetchRouteOptions(pickupAddress, dropAddress, pickupCoords, dropCoords)
  } catch (err) {
    console.error('route metrics unavailable:', err.message)
    return { primary: null, safe: null, waypoint: null }
  }
}

const EMPTY_METRICS = { distanceKm: null, durationMin: null, polyline: null }

// Strip the classifier's working data — decoded vertices are large and no caller
// past this point needs them.
const metricsOf = (route) =>
  route ? { distanceKm: route.distanceKm, durationMin: route.durationMin, polyline: route.polyline } : EMPTY_METRICS

export async function getRideEstimate({ pickupAddress, dropAddress, vehicleClass, pickupCoords, dropCoords, preferSafeRoute, needsCarrier }) {

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

  // Zones price the endpoint away from campus, so reverse trips (Delhi → SNU)
  // match on the pickup instead. Coords are optional pin-confirm refinements —
  // without them, zone matching is skipped.
  const zoneCoords = !campusAnchored ? null :
    dropCoords && !isNearCampus(dropCoords) ? dropCoords :
    pickupCoords && !isNearCampus(pickupCoords) ? pickupCoords :
    null
  const zone = matchZone(zoneCoords)

  const options = await bestEffortRouteOptions(pickupAddress, dropAddress, pickupCoords, dropCoords)

  // Whether the road actually changes and whether the rider pays are now the same
  // question, deliberately. Previously they were two: `safeRoute` gated the routing
  // and `preferSafeRoute` gated the charge, so a trip with no safer route to take
  // was still billed ₹150 for taking it.
  const applied = Boolean(preferSafeRoute && options.safe)
  const surcharge = applied ? SAFE_ROUTE_SURCHARGE : 0

  // Every price below reads distance and duration from here, so choosing the route
  // and choosing what to charge for it cannot drift apart: the longer highway is
  // priced as the longer drive it is, on top of the flat add-on.
  const metrics = metricsOf(applied ? options.safe : options.primary)

  // What the booking screen needs to decide whether to show the option at all.
  // `available: false` means no toggle is rendered — the rider is never offered a
  // detour around a road their trip doesn't use.
  const safeRouteInfo = options.safe
    ? {
        available: true,
        applied,
        fee: SAFE_ROUTE_SURCHARGE,
        extraKm:  Math.round((options.safe.distanceKm - options.primary.distanceKm) * 10) / 10,
        extraMin: options.safe.durationMin != null && options.primary.durationMin != null
          ? options.safe.durationMin - options.primary.durationMin
          : null,
        // Stored on the booking and handed to the driver's navigation later. The
        // fare and the road must come from ONE decision — recomputing at pickup
        // time could route him differently than the rider was quoted.
        waypoint: options.waypoint,
      }
    : { available: false, applied: false, fee: 0, extraKm: 0, extraMin: null, waypoint: null }

  // Only off-corridor fares carry it — see the constant. Resolved once, not per
  // class, because it is a property of where the car starts.
  const airport = !campusAnchored && isAirportPickup(pickupCoords)
    ? AIRPORT_PICKUP_SURCHARGE
    : 0

  // One source's hatchback price, or null if that source can't answer.
  //
  // Neither distance source carries a toll: they pay for the drive, and whatever
  // barriers the route crosses settle with the driver. That is exactly what the
  // "tolls payable to driver separately" notice on the booking screen promises.
  function hatchbackFrom(source) {
    switch (source) {
      case 'zone': {
        const fare = zone?.fares?.hatchback
        return fare != null ? { base: fare, source: 'zone', toll: zone.toll, airport: 0 } : null
      }
      case 'formula': {
        const fare = formulaFare(metrics.distanceKm)
        return fare != null ? { base: fare, source: 'formula', toll: 0, airport: 0 } : null
      }
      case 'per_km': {
        const fare = marketFare(metrics.distanceKm, metrics.durationMin)
        return fare != null ? { base: fare, source: 'per_km', toll: 0, airport } : null
      }
      default: return null
    }
  }

  // Campus routes read the provider's own zone quote first and fall to the curve
  // fitted to the same card; a trip that never touches campus is on nobody's card
  // and goes straight to the market rate. Distance-priced sources drop out
  // entirely when Routes couldn't measure the trip.
  const SOURCES = campusAnchored
    ? ['zone', ...(metrics.distanceKm != null ? ['formula'] : [])]
    : (metrics.distanceKm != null ? ['per_km'] : [])

  // First source that can answer prices the whole route. Every class comes off
  // this one number, so the rider can never be quoted a sedan from one source and
  // an SUV from another on the same trip.
  let hatchback = null
  for (const source of SOURCES) {
    hatchback = hatchbackFrom(source)
    if (hatchback) break
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

  // Every class, keyed by class name — one card each on the booking screen. They
  // now stand or fall together: either a source priced the hatchback and all four
  // cards are quoted off it, or nothing could be priced at all.
  if (!hatchback) throw new Error('No route found between the given addresses')

  const fares = {}
  const grid = gridOf(hatchback.source)
  for (const cls of VEHICLE_CLASS_NAMES) {
    const modify = CLASS_FROM_HATCHBACK[cls]
    if (!modify) continue
    fares[cls] = priced({ ...hatchback, base: roundTo(modify(hatchback.base), grid) })
  }

  // `fares` prices every card; the flat fare/fareSource fields answer for the one
  // class that was asked about.
  const selected = fares[vehicleClass] ?? Object.values(fares)[0]

  return {
    fares,
    fare: selected?.solo ?? null,
    fareSource: selected?.source ?? null,
    toll: selected?.toll ?? 0,
    airport: selected?.airport ?? 0,
    carrier: selected?.carrier ?? 0,
    carrierWaived: selected?.carrierWaived ?? false,
    zoneName: zone?.name ?? null,
    safeRoute: safeRouteInfo,
    ...metrics,
  }
}
