import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { kmBetween, pointInRing } from './geo.js'
import { prisma } from '../db/prisma.js'

// Zones are geometry + provider rate card. The file in git is the seed and the
// cold-start fallback; the fare_zone_set table is the source of truth once the
// Edit Fares tab has saved to it. Both hold the same GeoJSON FeatureCollection.
const ZONES_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '../data/zones.geojson')

// The shape matchZone wants: rate card lifted out of GeoJSON properties and the
// polygon flattened to its outer ring.
const toZone = (f) => ({
  name: f.properties.name,
  priority: f.properties.priority ?? 0,
  fares: f.properties.fares ?? {},
  // Mandatory road toll on the way to this zone, quoted separately by the
  // provider and so not inside `fares`. Most zones have none.
  toll: f.properties.toll ?? 0,
  ring: f.geometry.coordinates[0], // outer ring only; zones have no holes
})

const SEED = JSON.parse(readFileSync(ZONES_PATH, 'utf8'))

// Read synchronously at import so matchZone is never called against an empty
// list — initFareZones() replaces this from the database a moment later, and a
// database that is down or empty leaves the file's rates standing rather than
// dropping every ride onto the distance curve.
let collection = SEED
let zones = SEED.features.map(toZone)
let meta = { updatedAt: null, updatedBy: null }

// Swaps both representations together. Nothing reads one without the other, and
// a half-applied save would price rides off a rate card no one can see.
function apply(fc, next = meta) {
  collection = fc
  zones = fc.features.map(toZone)
  meta = next
}

/** The collection as the editor wants it back, plus who last saved it. */
export const getFareZones = () => ({ ...collection, meta })

// Marks a row this function wrote from the git file rather than a person. The
// dashboard stamps a Clerk user id, so the two can never collide.
const SEED_MARKER = 'seed:zones.geojson'

// jsonb is not text: Postgres reorders object keys on the way in (`{hatchback,
// sedan, suv}` comes back `{suv, sedan, hatchback}`) and drops whitespace, so a
// row written from this very file does not survive a JSON.stringify comparison
// against it. Sorting keys at every level is what makes "same collection" mean
// the same thing on both sides of the driver.
const canonical = (v) =>
  Array.isArray(v)
    ? `[${v.map(canonical).join(',')}]`
    : v && typeof v === 'object'
      ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`
      : JSON.stringify(v)

/**
 * Loads the live rate card at boot.
 *
 * zones.geojson stays authoritative until a HUMAN overrides it. A row still
 * marked with the seed came out of an earlier version of that file — nothing in
 * it is anyone's hand-edit — so an edited file is simply a newer seed and is
 * written straight through on the next boot. Previously the first seed won
 * forever and every later edit to the file was silently ignored: the polygons
 * would be redrawn, the server restarted, and rides carried on being priced by
 * the shapes from the day the table was created.
 *
 * The moment Edit Fares saves, updatedBy becomes that admin's id and the
 * database takes over for good — a rate card someone set by hand is not
 * something a stale file in a deploy gets to undo. To hand control back to the
 * file, delete the row (or set updatedBy back to the marker) and restart.
 *
 * Failure is survivable by design: the file is already loaded, so a database
 * outage costs the latest edits, not the ability to quote a fare.
 */
export async function initFareZones() {
  try {
    const row = await prisma.fareZoneSet.findUnique({ where: { id: 1 } })

    if (row && row.updatedBy !== SEED_MARKER) {
      apply(row.zones, { updatedAt: row.updatedAt, updatedBy: row.updatedBy })
      console.log(`Fare zones: ${zones.length} loaded from the database (last saved by ${row.updatedBy}; zones.geojson is ignored until that row is removed)`)
      return
    }

    // Same file as last boot — skip the write. Restarts are frequent in dev and
    // an identical UPDATE every time would just churn updatedAt, making the
    // dashboard's "last saved" read as though someone had touched the rates.
    if (row && canonical(row.zones) === canonical(SEED)) {
      apply(row.zones, { updatedAt: row.updatedAt, updatedBy: row.updatedBy })
      console.log(`Fare zones: ${zones.length} loaded from zones.geojson (database already matches)`)
      return
    }

    const seeded = await prisma.fareZoneSet.upsert({
      where: { id: 1 },
      create: { id: 1, zones: SEED, updatedBy: SEED_MARKER },
      update: { zones: SEED, updatedBy: SEED_MARKER },
    })
    apply(seeded.zones, { updatedAt: seeded.updatedAt, updatedBy: seeded.updatedBy })
    console.log(`Fare zones: ${zones.length} zones written from zones.geojson${row ? ' (file changed since the last boot)' : ' (first seed)'}`)
  } catch (err) {
    console.error('Fare zones: database load failed, using zones.geojson —', err.message)
  }
}

/**
 * Persists an edited collection and swaps it in for the next request. The write
 * comes first: if it throws, the in-memory card is untouched and the admin gets
 * an error, rather than a dashboard that shows a saved rate the database lost.
 */
export async function saveFareZones(fc, updatedBy) {
  const row = await prisma.fareZoneSet.upsert({
    where: { id: 1 },
    create: { id: 1, zones: fc, updatedBy },
    update: { zones: fc, updatedBy },
  })
  apply(row.zones, { updatedAt: row.updatedAt, updatedBy: row.updatedBy })
  return { count: zones.length, updatedAt: row.updatedAt, updatedBy: row.updatedBy }
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
  const hits = zones.filter((z) => pointInRing(coords, z.ring))
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
