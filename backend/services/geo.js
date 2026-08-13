// Geometry primitives shared by the fare zones (which ask "is this point in a
// priced area?") and the safe-route classifier (which asks "does this road pass
// through one?"). They lived in fareZones.js until the second caller appeared;
// duplicating ray casting into two files would mean a fix to one never reaching
// the other.
//
// Everything here works in a flat-earth approximation. The largest distance any
// caller measures is a Delhi-NCR ride, so the error against a great circle is
// centimetres — and both callers compare distances rather than reporting them.

const KM_PER_DEG_LAT = 111.32

// Longitude degrees shrink toward the poles; at ~28.5°N a degree of longitude is
// about 88% of a degree of latitude, which matters over the ~80 km these routes
// can span.
const kmPerDegLng = (lat) => KM_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180)

export function kmBetween(a, b) {
  const dLat = (a.lat - b.lat) * KM_PER_DEG_LAT
  const dLng = (a.lng - b.lng) * kmPerDegLng(b.lat)
  return Math.sqrt(dLat * dLat + dLng * dLng)
}

// ---------------------------------------------------------------------------
// THE ONE PLACE THE TWO COORDINATE ORDERS MEET.
//
// GeoJSON positions are [lng, lat]; every point in this codebase is { lat, lng }.
// Both are right, and neither is going to change: the first is the spec that
// geojson.io writes, the second is what Google, Prisma and Leaflet all hand us.
//
// What used to be wrong is that the disagreement was spread out. pointInRing
// took (lng, lat) as bare numbers, so every caller re-stated the swap by hand,
// three copies of the ray casting each had their own, and any one of them could
// be written backwards without a symptom — a point in NCR is lat 28, lng 77, and
// BOTH are legal latitudes, so nothing rejects a swapped pair. It just tests
// outside every polygon forever.
//
// So the functions below are the only ones that index a position. Everything
// downstream of them speaks { lat, lng } exclusively, and a call site cannot
// carry an order to get wrong.
// ---------------------------------------------------------------------------

/** Ray casting: is this { lat, lng } inside this GeoJSON linear ring? */
export function pointInRing(point, ring) {
  const { lat, lng } = point
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)
      inside = !inside
  }
  return inside
}

// Mean of a ring's vertices, as a point. NOT the true centroid of the polygon,
// and for a concave or very large zone it can fall outside it — callers use it
// only to ask "roughly where is this shape", never to price anything.
export function ringCentroid(ring) {
  const sum = ring.reduce((acc, [lng, lat]) => ({ lat: acc.lat + lat, lng: acc.lng + lng }), { lat: 0, lng: 0 })
  return { lat: sum.lat / ring.length, lng: sum.lng / ring.length }
}

// Google's encoded polyline algorithm. Routes returns the road path this way,
// and every question the safe-route code asks — does this cross a zone, how far
// does it run from the other route — needs the vertices back.
export function decodePolyline(encoded) {
  const points = []
  let index = 0
  let lat = 0
  let lng = 0

  while (index < encoded.length) {
    let shift = 0
    let result = 0
    let byte
    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    lat += result & 1 ? ~(result >> 1) : result >> 1

    shift = 0
    result = 0
    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    lng += result & 1 ? ~(result >> 1) : result >> 1

    points.push({ lat: lat / 1e5, lng: lng / 1e5 })
  }
  return points
}

// Perpendicular distance from a point to a segment, projected onto a local plane
// anchored at `a`. Point-to-ENDPOINT distance would have done for short hops, but
// motorway polylines put their vertices kilometres apart on straight runs — the
// nearest vertex to a point beside the middle of such a run can be far away even
// though the road is right there. That overestimate is exactly what picks the
// wrong divergence waypoint, so the projection is worth the ten lines.
// Where a point lands on one segment: how far off it sits, how far along it
// projects (`t`, 0..1), and how long the segment is. The two public functions
// below are both this one plus bookkeeping, so there is a single projection in
// this file rather than two that can drift apart.
function projectOntoSegment(p, a, b) {
  const kx = kmPerDegLng(a.lat)
  const px = (p.lng - a.lng) * kx
  const py = (p.lat - a.lat) * KM_PER_DEG_LAT
  const bx = (b.lng - a.lng) * kx
  const by = (b.lat - a.lat) * KM_PER_DEG_LAT

  const len2 = bx * bx + by * by
  if (len2 === 0) return { offRouteKm: Math.hypot(px, py), t: 0, segmentKm: 0 }

  // Clamped so the projection can't run off either end of the segment.
  const t = Math.max(0, Math.min(1, (px * bx + py * by) / len2))
  return { offRouteKm: Math.hypot(px - t * bx, py - t * by), t, segmentKm: Math.sqrt(len2) }
}

export function kmPointToSegment(p, a, b) {
  return projectOntoSegment(p, a, b).offRouteKm
}

/**
 * Where a point sits relative to a whole path: its perpendicular distance from
 * the nearest segment, and how far along the path that nearest point lies.
 *
 * `alongKm` is what makes "is this pickup AHEAD of the car" answerable. Project
 * both the car and the pickup onto the driver's route and compare: the larger
 * `alongKm` is further down the road. That is a stronger test than comparing
 * compass bearings, because it is measured against the road actually being
 * driven — a point on the far carriageway of a divided highway bears correctly
 * and is still a U-turn away, and only the projection can tell.
 *
 * A path of fewer than two points has nothing to project onto: `offRouteKm` is
 * Infinity, which fails every tolerance a caller might apply, and `alongKm` is
 * 0. Callers should treat a missing polyline as "cannot answer", never as "at
 * the start of the route".
 *
 * @returns {{ offRouteKm: number, alongKm: number }}
 */
export function projectOntoPath(p, path) {
  let best = { offRouteKm: Infinity, alongKm: 0 }
  let travelled = 0

  for (let i = 1; i < path.length; i++) {
    const seg = projectOntoSegment(p, path[i - 1], path[i])
    if (seg.offRouteKm < best.offRouteKm)
      best = { offRouteKm: seg.offRouteKm, alongKm: travelled + seg.t * seg.segmentKm }
    travelled += seg.segmentKm
  }

  return best
}

// How far a point sits from a path, as the shortest distance to any of its
// segments. Used to score how much a candidate route actually departs from the
// one the driver would otherwise take.
export function kmPointToPath(p, path) {
  return projectOntoPath(p, path).offRouteKm
}
