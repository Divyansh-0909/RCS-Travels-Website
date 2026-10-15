import assert from 'node:assert/strict'
import { readFile, writeFile, unlink } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import * as original from '../../services/googleRoutes.js'

const sourceUrl = new URL('../../services/googleRoutes.js', import.meta.url)
const source = await readFile(sourceUrl, 'utf8')
const hash = value => createHash('sha256').update(value).digest('hex')
const variants = [
  ["duration ?? ''", "duration ?? 'Stryker was here!'", 'A nullish duration remains nonnumeric and returns null.'],
  [".replace(/s$/, '')", ".replace(/s$/, 'Stryker was here!')", 'Replacing the final s with a nonnumeric suffix leaves parseFloat unchanged.'],
  ['const durationSeconds = routeSeconds(route?.duration)', 'const durationSeconds = routeSeconds(route.duration)', 'All three private provenance call sites establish a nonnull route before calling.'],
  ['route?.staticDuration', 'route.staticDuration', 'The same private caller invariant establishes a nonnull route.'],
  ['route?.distanceMeters', 'route.distanceMeters', 'The same private caller invariant establishes a nonnull route.'],
  ['origin?.lng == null', 'origin.lng == null', 'The preceding lat guard already rejects a nullish origin.'],
  ['origin?.lng != null', 'origin.lng != null', 'The preceding lat guard already establishes a nonnull origin.'],
  ['destination?.lng != null', 'destination.lng != null', 'The preceding lat guard already establishes a nonnull destination.'],
]
async function probe(api) {
  const results = [], origin = { lat: 28.6, lng: 77.2 }, destination = { lat: 28.61, lng: 77.21 }
  const attempt = async work => { try { return await work() } catch (error) { return { error: error.message } } }
  for (const duration of [undefined, null, '', 's', '360s', '0s', '-1.5s', '1e2s', 'Infinitys', 's360s', 'NaN', {}, 42,
    'Stryker was here!360s']) {
    const options = { apiKey: 'offline', cache: new Map(), clock: { now: () => new Date('2026-10-09T08:00:00Z') },
      db: { apiUsage: { findUnique: async () => null, upsert: async () => ({}) } }, request: async () => ({ ok: true,
        json: async () => ({ routes: [{ duration, staticDuration: '45s', distanceMeters: 1200,
          polyline: { encodedPolyline: 'x' }, legs: [{ duration, distanceMeters: 1200 }] }] }) }) }
    results.push(await attempt(() => api.getNavigationRoute({ cacheKey: 'case', origin, destination }, options)))
    results.push(await attempt(() => api.fetchRoutes('pickup', 'drop', origin, destination, null, options)))
    results.push(await attempt(() => api.routeSequence([origin, destination], options)))
    options.request = async () => ({ ok: true, json: async () => ({}) })
    results.push(await attempt(() => api.getNavigationRoute({ cacheKey: 'missing', origin, destination }, options)))
  }
  for (const point of [undefined, null, {}, { lat: 0 }, { lng: 0 }, { lat: 0, lng: 0 }]) {
    for (const route of [undefined, null, {}, { polyline: 'x' }]) results.push(api.navigationRouteNeedsRefresh(route, point))
    results.push(await api.getNavigationRoute({ cacheKey: 'absent', origin: point, destination: null }))
    results.push(await api.getNavigationRoute({ cacheKey: 'absent', origin: null, destination: point }))
  }
  return results
}
const expected = await probe(original), reviewed = []
for (const [before, after, rationale] of variants) {
  assert.equal(source.split(before).length - 1, 1, `unambiguous mutation: ${before}`)
  const target = resolve(dirname(fileURLToPath(sourceUrl)), `.phase9-equivalence-${randomUUID()}.js`)
  assert.equal(dirname(target), dirname(fileURLToPath(sourceUrl)))
  try {
    await writeFile(target, source.replace(before, after))
    const actual = await probe(await import(pathToFileURL(target)))
    assert.deepEqual(actual, expected)
    reviewed.push({ before, after, rationale, witnesses: actual.length, result: 'EQUIVALENT_UNDER_DOCUMENTED_CALLER_CONTRACT' })
  } finally { await unlink(target) }
}
assert.equal(hash(await readFile(sourceUrl)), hash(source))
await writeFile(new URL('../../../output/phase9-final-integration-2026-10-09/routing-reviewed-equivalences.json', import.meta.url),
  JSON.stringify({ sourceHash: hash(source), rawStatusesPreserved: true, reviewed }, null, 2))
console.log(`Reviewed routing equivalents: ${reviewed.length}; ${expected.length} executable observations each`)
