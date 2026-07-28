import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// Zones are geometry + provider rate card, versioned in git and loaded once at
// boot. Move to a DB table only when the admin dashboard needs to edit fares.
const ZONES_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '../data/zones.geojson')

const zones = JSON.parse(readFileSync(ZONES_PATH, 'utf8')).features.map((f) => ({
  name: f.properties.name,
  priority: f.properties.priority ?? 0,
  fares: f.properties.fares,
  // Mandatory road toll on the way to this zone, quoted separately by the
  // provider and so not inside `fares`. Most zones have none.
  toll: f.properties.toll ?? 0,
  ring: f.geometry.coordinates[0], // outer ring only; zones have no holes
}))

// Ray casting. GeoJSON positions are [lng, lat].
function pointInRing(lng, lat, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)
      inside = !inside
  }
  return inside
}

// Surveyed campus centre, to ~10 cm. Everything about pricing hangs off this
// point: it decides whether a trip is on the rate card at all.
const SNU = { lat: 28.527202, lng: 77.575486 }

// Big enough to cover the campus and its gates whichever end of it a rider pins,
// and no bigger. The nearest priced zone (Dadri / Tilapta, ₹400) comes within
// 1.92 km, and anything a radius reaches is treated as campus — so at the old
// 3 km a drop in that strip had BOTH endpoints "near campus", matched no zone,
// and lost its ₹400 quote to the distance curve. 1.5 km keeps a 400 m buffer.
const SNU_RADIUS_KM = 1.5

// Flat-earth approximation. Every distance it is asked for here is a few km, so
// the error against a great circle is centimetres.
function kmBetween(a, b) {
  const dLat = (a.lat - b.lat) * 111.32
  const dLng = (a.lng - b.lng) * 111.32 * Math.cos((b.lat * Math.PI) / 180)
  return Math.sqrt(dLat * dLat + dLng * dLng)
}

// The rate card is anchored at campus, so trips are priced by the far endpoint.
export function isNearCampus(coords) {
  return kmBetween(coords, SNU) <= SNU_RADIUS_KM
}

// The terminal kerb, and deliberately NOT the IGI fare zone. That zone is a
// generous rectangle out to Aerocity and Mahipalpur — right for quoting a campus
// run, where the provider charges 1400 to all of them, and far too loose for
// deciding who paid to drive into an airport. Its south edge sits 1.8 km from
// DLF Cyber City, so reusing it would bill Gurugram commuters an airport fee.
//
// !! T3 ONLY. A T1/T2 entry belongs here too, but a guessed coordinate is worse
// than a missing one — the first attempt put T1 next to Cyber City and charged
// exactly the people it shouldn't have. Add it as a second { lat, lng } once
// someone has read it off a map; nothing else needs to change.
//
// 2.5 km covers T3's approach roads and stops 700 m short of Aerocity.
const IGI_TERMINALS = [
  { lat: 28.5562, lng: 77.0869 }, // T3
]
const IGI_RADIUS_KM = 2.5

export function isAirportPickup(coords) {
  if (!coords) return false
  return IGI_TERMINALS.some((t) => kmBetween(coords, t) <= IGI_RADIUS_KM)
}

const FARE_CLASSES = ['hatchback', 'sedan', 'suv']

// Zones overlap, so pick one. Highest priority wins, which lets exception zones
// (IIT, Pari Chowk, Sarai Kale Khan) override the broad areas they sit inside.
//
// The exception: when the top two are siblings — priority within 1 — and disagree
// on price, the point is in an accidental border overlap rather than a deliberate
// carve-out. Neither zone is more right there, so charge the midpoint (the
// Ashram/Lajpat strip, 1100/1200 → 1150).
export function matchZone(coords) {
  if (!coords) return null
  const hits = zones.filter((z) => pointInRing(coords.lng, coords.lat, z.ring))
  if (hits.length === 0) return null
  hits.sort((a, b) => b.priority - a.priority)

  const [top, second] = hits
  const isBorder =
    second &&
    top.priority - second.priority <= 1 &&
    second.fares.hatchback != null &&
    second.fares.hatchback !== top.fares.hatchback

  if (!isBorder) return top

  const fares = {}
  for (const cls of FARE_CLASSES) {
    if (top.fares[cls] != null && second.fares[cls] != null)
      fares[cls] = Math.round((top.fares[cls] + second.fares[cls]) / 2 / 50) * 50
    else if (top.fares[cls] != null) fares[cls] = top.fares[cls]
  }
  // A toll is a road that either is or isn't on the way — averaging it would
  // invent a half-toll nobody pays. The higher of the two stands: charging the
  // toll and not driving it is a refund, the reverse is the driver out of pocket.
  const toll = Math.max(top.toll, second.toll)
  return { name: `${top.name} / ${second.name} border`, priority: top.priority, fares, toll, blended: true }
}
