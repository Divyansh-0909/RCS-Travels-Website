// Answers the question the whole safer-route feature rests on: WHICH destinations
// actually take the shady road, and is there a clean way round for them?
//
// You cannot know this by looking at a map. The shortcut is on the way to some
// zones and irrelevant to the rest, and only Google knows which route it hands a
// driver today. So ask it once, per zone, and read the answer off a table.
//
//   node backend/scripts/check-shady-zones.js
//
// Costs one Routes request per zone (~40), one time. It does NOT touch the
// ApiUsage counter that guards the monthly free tier — this is your own
// diagnostic, not rider traffic, and billing it there would eat the estimate
// budget. Keep that in mind if you run it in a loop.
//
// Re-run it when you redraw a polygon, and every few months regardless: Google
// changes its routing, and a corridor that had a clean alternative in July may
// not in November.

import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { metresInsideShadyZones, hasShadyZones, SHADY_MIN_METRES } from '../services/safeRoute.js'
import { decodePolyline, ringCentroid } from '../services/geo.js'

// The git seed, not the live card in fare_zone_set — this only needs somewhere
// to aim probes, and reading the file keeps the script runnable without a
// database. If the admin has since drawn a NEW zone, add it here or accept that
// this pass won't test it.
const here = path.dirname(fileURLToPath(import.meta.url))
const zones = JSON.parse(readFileSync(path.join(here, '../data/zones.geojson'), 'utf8')).features

// Same surveyed campus centre the fare zones hang off. Every route tested here
// starts where a real campus ride starts.
const SNU = { lat: 28.527202, lng: 77.575486 }

// ringCentroid can sit outside a concave zone and is a poor stand-in for a big
// one anyway — a zone spanning half of Delhi routes differently at its two ends.
// Averaging the ring is enough to place a probe inside the typical zone; widen
// this to several samples if a large zone reports surprising results.

async function routesFor(dest) {
  const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
    },
    body: JSON.stringify({
      origin:      { location: { latLng: { latitude: SNU.lat, longitude: SNU.lng } } },
      destination: { location: { latLng: { latitude: dest.lat, longitude: dest.lng } } },
      computeAlternativeRoutes: true,
      travelMode: 'DRIVE',
    }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return (data.routes ?? []).map((r) => decodePolyline(r.polyline?.encodedPolyline ?? ''))
}

async function main() {
  if (!process.env.GOOGLE_MAPS_API_KEY) {
    console.error('GOOGLE_MAPS_API_KEY is not set — run this from backend/ so .env loads.')
    process.exit(1)
  }
  if (!hasShadyZones()) {
    console.error('No shady zones drawn yet. Add a polygon to backend/data/shady-zones.geojson first.')
    process.exit(1)
  }

  const affected = []
  const stranded = []

  for (const zone of zones) {
    const name = zone.properties.name
    const dest = ringCentroid(zone.geometry.coordinates[0])

    let paths
    try {
      paths = await routesFor(dest)
    } catch (err) {
      console.log(`  ??  ${name.padEnd(28)} route failed: ${err.message}`)
      continue
    }
    if (paths.length === 0) {
      console.log(`  ??  ${name.padEnd(28)} no route returned`)
      continue
    }

    const scores = paths.map(metresInsideShadyZones)
    const primaryM = scores[0]
    const cleanAlts = scores.slice(1).filter((m) => m < SHADY_MIN_METRES).length

    if (primaryM < SHADY_MIN_METRES) {
      console.log(`  ok  ${name.padEnd(28)} default route is clean`)
      continue
    }

    affected.push(name)
    if (cleanAlts > 0) {
      console.log(`  !!  ${name.padEnd(28)} ${Math.round(primaryM)} m inside — ${cleanAlts} clean alternative(s)`)
    } else {
      stranded.push(name)
      console.log(`  XX  ${name.padEnd(28)} ${Math.round(primaryM)} m inside — NO clean alternative`)
    }
  }

  console.log(`\n${affected.length} of ${zones.length} zones route through a shady area.`)
  if (affected.length === 0) {
    console.log('Nothing is affected. Either the polygon is in the wrong place, or it is too narrow')
    console.log('for any route to register 400 m inside it. Widen it and re-run before concluding.')
  }
  if (stranded.length > 0) {
    console.log(`\nGoogle offers no clean alternative for: ${stranded.join(', ')}.`)
    console.log('These need a `fallback` highway point on the shady zone in shady-zones.geojson,')
    console.log('or the toggle simply will not appear for them.')
  }
}

main()
