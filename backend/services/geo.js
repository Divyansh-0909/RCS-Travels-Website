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

// Ray casting. GeoJSON positions are [lng, lat].
export function pointInRing(lng, lat, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)
      inside = !inside
  }
  return inside
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
export function kmPointToSegment(p, a, b) {
  const kx = kmPerDegLng(a.lat)
  const px = (p.lng - a.lng) * kx
  const py = (p.lat - a.lat) * KM_PER_DEG_LAT
  const bx = (b.lng - a.lng) * kx
  const by = (b.lat - a.lat) * KM_PER_DEG_LAT

  const len2 = bx * bx + by * by
  if (len2 === 0) return Math.hypot(px, py)

  // Clamped so the projection can't run off either end of the segment.
  const t = Math.max(0, Math.min(1, (px * bx + py * by) / len2))
  return Math.hypot(px - t * bx, py - t * by)
}

// How far a point sits from a path, as the shortest distance to any of its
// segments. Used to score how much a candidate route actually departs from the
// one the driver would otherwise take.
export function kmPointToPath(p, path) {
  let best = Infinity
  for (let i = 1; i < path.length; i++) {
    const d = kmPointToSegment(p, path[i - 1], path[i])
    if (d < best) best = d
  }
  return best
}
