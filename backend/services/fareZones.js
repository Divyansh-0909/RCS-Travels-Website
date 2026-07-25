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

const SNU = { lat: 28.526, lng: 77.575 }
const SNU_RADIUS_KM = 3

// The rate card is anchored at campus, so trips are priced by the far endpoint.
export function isNearCampus({ lat, lng }) {
  const dLat = (lat - SNU.lat) * 111.32
  const dLng = (lng - SNU.lng) * 111.32 * Math.cos((SNU.lat * Math.PI) / 180)
  return Math.sqrt(dLat * dLat + dLng * dLng) <= SNU_RADIUS_KM
}

// Highest priority wins so exception zones (IIT, Pari Chowk, Sarai Kale Khan)
// override the broad areas they sit inside. But when the top two zones are
// siblings (priority within 1) with different prices, the point is in an
// accidental border overlap — neither zone is "more right" there, so charge
// the midpoint (e.g. the Ashram/Lajpat strip: 1100/1200 → 1150).
const FARE_CLASSES = ['hatchback', 'sedan', 'suv']

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
  return { name: `${top.name} / ${second.name} border`, priority: top.priority, fares, blended: true }
}
