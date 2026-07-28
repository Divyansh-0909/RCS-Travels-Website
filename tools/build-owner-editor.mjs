// Bakes the live rate card into the zone editor so the result is one file that
// opens on a double-click — no repo, no local server, no "now open this other
// file first" step. That last part is the whole reason this script exists: the
// editor is for someone who should never have to see a .geojson.
//
//   node tools/build-owner-editor.mjs
//
// Writes tools/rcs-fare-zones.html. Send that; he edits, presses "Save & send
// back", and returns a plain zones.geojson that drops straight into
// backend/data/. Re-run this whenever the zones change, or the copy you send
// will quietly be out of date.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const SOURCE = path.join(here, 'zone-editor.html')
const ZONES = path.join(here, '../backend/data/zones.geojson')
const OUT = path.join(here, 'rcs-fare-zones.html')

const zones = JSON.parse(readFileSync(ZONES, 'utf8'))
if (zones.type !== 'FeatureCollection' || !Array.isArray(zones.features))
  throw new Error('zones.geojson is not a FeatureCollection')

const polygons = zones.features.filter((f) => f.geometry?.type === 'Polygon')
if (polygons.length !== zones.features.length)
  console.warn(`! ${zones.features.length - polygons.length} non-polygon feature(s) will be dropped by the editor`)

// Names are the only handle he has on a zone, and two zones sharing one would
// make the change list ambiguous on the way back.
const names = polygons.map((f) => f.properties.name)
const dupes = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))]
if (dupes.length) throw new Error(`duplicate zone names: ${dupes.join(', ')}`)

const html = readFileSync(SOURCE, 'utf8')
const marker = 'const EMBEDDED_ZONES = null; /*__ZONES__*/'
if (!html.includes(marker)) throw new Error(`injection point missing from zone-editor.html: ${marker}`)

// </script> inside the data would close the tag early and break the page.
const literal = JSON.stringify(zones).replace(/<\//g, '<\\/')

writeFileSync(OUT, html.replace(marker, `const EMBEDDED_ZONES = ${literal};`), 'utf8')

const kb = (n) => `${Math.round(n / 1024)} KB`
console.log(`✓ ${path.relative(process.cwd(), OUT)} — ${polygons.length} zones, ${kb(Buffer.byteLength(readFileSync(OUT)))}`)
console.log('  Send that one file. It needs internet for the map tiles, nothing else.')
