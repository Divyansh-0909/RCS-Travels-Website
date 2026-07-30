import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { kmBetween, pointInRing, decodePolyline, kmPointToPath } from './geo.js'

// ---------------------------------------------------------------------------
// Google has no notion of a "safe" route — that knowledge is local. The earlier
// design forced every campus trip through ONE hardcoded highway waypoint, which
// could only ever be right for a single corridor: the shortcut riders avoid is
// on the way to some destinations and nowhere near the others, so the same
// waypoint that fixes a Noida run turns a Dadri run into a detour.
//
// So we do not tell Google where to go. We ask it for the alternatives it would
// offer anyway, decode each one, and reject the ones that cross ground we have
// marked. Whatever clean route survives wins — the Eastern Peripheral when that
// is genuinely the best way around, something else when it isn't. Nothing here
// names a highway.
// ---------------------------------------------------------------------------

const SHADY_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '../data/shady-zones.geojson')

// Missing or malformed file is not fatal: an estimate that cannot classify a
// route should still quote a fare. It just never offers the option.
function loadShadyZones() {
  try {
    const parsed = JSON.parse(readFileSync(SHADY_PATH, 'utf8'))
    return (parsed.features ?? []).map((f) => ({
      name: f.properties?.name ?? 'unnamed',
      fallback: f.properties?.fallback ?? null,
      ring: f.geometry.coordinates[0], // outer ring only; corridors have no holes
    }))
  } catch (err) {
    console.error('shady zones unavailable, safer-route option disabled:', err.message)
    return []
  }
}

const shadyZones = loadShadyZones()

// Every caller checks this before spending anything. With no polygons drawn there
// is nothing to classify against, so we skip requesting alternatives at all and
// the estimate behaves exactly as it did before this file existed.
export const hasShadyZones = () => shadyZones.length > 0

// Index of the first zone containing this point, or -1. Overlapping corridors
// attribute to the first drawn — they describe the same avoided ground, so the
// only thing the choice affects is which zone's fallback point is offered.
const shadyZoneAt = (p) => shadyZones.findIndex((z) => pointInRing(p, z.ring))

const inAnyShadyZone = (p) => shadyZoneAt(p) !== -1

// Polyline vertices follow road curvature, so they cluster in towns and thin out
// on straight motorway runs where consecutive points can be kilometres apart. A
// route can therefore cross a small polygon with no vertex inside it and test
// perfectly clean. Sampling along each segment instead of at its ends is what
// closes that hole; 50 m is comfortably finer than the narrowest corridor anyone
// should be drawing.
const SAMPLE_M = 50

// "Any point inside" is too strict — a route that clips 150 m of a corridor's
// corner is not the thing riders are afraid of, and flagging it would offer a
// paid detour around nothing. Measure how far the route actually runs inside.
const SHADY_MIN_METRES = 400

// Metres of this route spent inside each zone, positionally matching shadyZones.
// Everything else here is a reduction of this: the total decides whether a route
// is usable, and the per-zone breakdown decides whose fallback point to force.
function metresPerZone(points) {
  const totals = shadyZones.map(() => 0)
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const segM = kmBetween(a, b) * 1000
    if (segM === 0) continue

    const steps = Math.max(1, Math.ceil(segM / SAMPLE_M))
    const stepM = segM / steps
    for (let s = 0; s < steps; s++) {
      // Midpoint of each sub-segment, so a sample stands for the length around
      // it rather than for one of its ends.
      const t = (s + 0.5) / steps
      const mid = { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t }
      const zone = shadyZoneAt(mid)
      if (zone !== -1) totals[zone] += stepM
    }
  }
  return totals
}

export const metresInsideShadyZones = (points) =>
  metresPerZone(points).reduce((sum, m) => sum + m, 0)

// Endpoints of the two routes are identical by definition, and the roads either
// side of them usually are too. Scoring the whole path would keep returning a
// point on shared road near the origin, which forces nothing. Ignoring the outer
// tenth at each end confines the search to where the paths can actually differ.
const DIVERGENCE_MARGIN = 0.1

// A rider's chosen alternative cannot be handed to a driver as "Google's second
// suggestion" — a Maps navigation link takes coordinates, nothing else. So the
// route has to be reduced back to ONE point that reproduces it, and the point
// that does that is the one furthest from the route the driver would otherwise
// have taken. A naive midpoint usually lands on road the two share.
export function divergenceWaypoint(safePoints, primaryPoints) {
  const from = Math.floor(safePoints.length * DIVERGENCE_MARGIN)
  const to = Math.ceil(safePoints.length * (1 - DIVERGENCE_MARGIN))

  let best = null
  let bestKm = -1
  for (let i = from; i < to; i++) {
    const p = safePoints[i]
    // A waypoint inside a shady zone would force the driver into the exact
    // stretch this is meant to avoid. Cannot happen on a route that tested
    // clean, but the check is cheap and the failure would be silent.
    if (inAnyShadyZone(p)) continue
    const km = kmPointToPath(p, primaryPoints)
    if (km > bestKm) {
      bestKm = km
      best = p
    }
  }
  return best
}

// Each zone may name its own fallback highway point, used only when Google
// offered nothing clean — see the readme in shady-zones.geojson.
//
// When a route crosses two zones it detours around whichever it is most deeply
// inside: that is the stretch doing the damage, and one forced waypoint cannot
// serve both. Zones the route only clips are ignored for the same reason the
// classifier ignores them.
export function fallbackWaypointFor(points) {
  const totals = metresPerZone(points)
  let best = null
  let bestM = SHADY_MIN_METRES
  totals.forEach((m, i) => {
    if (m >= bestM && shadyZones[i].fallback) {
      bestM = m
      best = shadyZones[i].fallback
    }
  })
  return best
}

/**
 * Classify a set of Routes alternatives.
 *
 * `routes` are in Google's own order, so routes[0] is the primary — the one the
 * driver takes unprompted, and therefore the one the default fare must be quoted
 * on. Never reorder it: making the safer route the default silently would change
 * every price on the page.
 *
 * Returns { primary, safe, waypoint, fallback }.
 *   safe     null when the primary is already clean (nothing to offer, nothing to
 *            charge) or when every alternative is shady (nothing we can offer yet).
 *   fallback set only in that second case, for the caller to decide whether to
 *            spend a second Routes call forcing it.
 */
export function classifyRoutes(routes) {
  const primary = routes[0]
  if (!primary) return { primary: null, safe: null, waypoint: null, fallback: null }
  if (!hasShadyZones()) return { primary, safe: null, waypoint: null, fallback: null }

  const scored = routes.map((r) => ({ ...r, shadyM: metresInsideShadyZones(r.points) }))
  const scoredPrimary = scored[0]

  // The road the driver would take is already fine. This is the common case for
  // most destinations, and it is why the option must be conditional rather than
  // a permanent row on the booking screen.
  if (scoredPrimary.shadyM < SHADY_MIN_METRES)
    return { primary: scoredPrimary, safe: null, waypoint: null, fallback: null }

  // Fastest clean alternative, not shortest: the rider is trading time for the
  // detour either way, and duration is what they feel. Distance breaks ties so
  // the choice is deterministic when two alternatives are minutes apart.
  const clean = scored
    .slice(1)
    .filter((r) => r.shadyM < SHADY_MIN_METRES)
    .sort((a, b) => (a.durationMin ?? Infinity) - (b.durationMin ?? Infinity) || a.distanceKm - b.distanceKm)

  if (clean.length === 0)
    return {
      primary: scoredPrimary,
      safe: null,
      waypoint: null,
      fallback: fallbackWaypointFor(scoredPrimary.points),
    }

  const safe = clean[0]
  return { primary: scoredPrimary, safe, waypoint: divergenceWaypoint(safe.points, scoredPrimary.points), fallback: null }
}

// Shared by the estimate and by the verification script, so both agree on what
// "clean" means without either owning the threshold.
export const isClean = (points) => metresInsideShadyZones(points) < SHADY_MIN_METRES

export { SHADY_MIN_METRES, decodePolyline }
