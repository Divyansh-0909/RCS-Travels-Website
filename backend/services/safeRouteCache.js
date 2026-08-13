import { prisma } from '../db/prisma.js'
import { SHADY_ZONES_VERSION } from './safeRoute.js'

// ---------------------------------------------------------------------------
// Remembering which detours work.
//
// Confirming that a forced waypoint produces a clean route costs a Routes call.
// Predicting it instead costs nothing but can be wrong, and being wrong means
// offering a rider a safer route that turns out not to exist. This is the third
// option: pay once per route, then answer from memory.
//
// It works because the question splits in two, and only half of it is volatile:
//
//   "does this detour exist and is it clean?"  road topology + our polygons.
//                                              Stable for weeks. Cached here.
//   "how far and how long is it?"              traffic. Stale within the hour,
//                                              and the fare is computed from it.
//                                              Never cached — always re-fetched.
//
// So a rider who ticks the option always gets a fresh route. What the cache buys
// is the ability to SHOW the option, verified, without paying for it every time.
//
// This lives apart from safeRoute.js on purpose: that file is deliberately free
// of database imports so scripts/check-shady-zones.js can run without one.
// ---------------------------------------------------------------------------

// ~111 m buckets. Riders pin the same destination slightly differently on every
// booking and the verdict does not change across a street, so some rounding is
// what makes the cache hit at all. Kept deliberately fine rather than generous:
// the answer CAN change across a kilometre, and a wrong "clean" is worse than a
// miss. Loosen this only with evidence about the hit rate.
const KEY_DP = 3

// Road networks and Google's routing preferences move on a scale of months, so
// this is a backstop, not the main invalidation — a redrawn polygon changes
// SHADY_ZONES_VERSION and invalidates everything immediately.
const TTL_DAYS = 30

const pointKey = (p) => `${p.lat.toFixed(KEY_DP)},${p.lng.toFixed(KEY_DP)}`

/**
 * The cache key for "does forcing `waypoint` between these two points work?",
 * or null when either endpoint arrived without coordinates — a hand-typed
 * address is not precise enough to key a verdict on, so those trips skip the
 * cache rather than poison it.
 */
export function verdictKey(pickupCoords, dropCoords, waypoint) {
  if (!pickupCoords || !dropCoords || !waypoint) return null
  return `${pointKey(pickupCoords)}|${pointKey(dropCoords)}|${pointKey(waypoint)}`
}

/**
 * @returns {Promise<boolean|null>} the remembered verdict, or null for "never
 * checked, checked against different polygons, or checked too long ago" — all
 * of which mean the same thing to the caller: go and find out.
 */
export async function readVerdict(key) {
  if (!key) return null
  try {
    const row = await prisma.safeRouteVerdict.findUnique({ where: { routeKey: key } })
    if (!row) return null
    // A row written against a different set of polygons says nothing about the
    // current ones. Left in place rather than deleted: the next write for this
    // route overwrites it, so the table stays one row per route either way.
    if (row.zonesVersion !== SHADY_ZONES_VERSION) return null
    if (Date.now() - row.checkedAt.getTime() > TTL_DAYS * 24 * 60 * 60 * 1000) return null
    return row.clean
  } catch (err) {
    // A cache that cannot be read is a cache miss, never an error: the estimate
    // still has a Routes call it can make, and failing the fare over a memo
    // would be absurd.
    console.error('safe-route verdict unreadable:', err.message)
    return null
  }
}

/**
 * Records what a forced-waypoint call actually returned. Failures are swallowed
 * for the same reason reads are — the rider already has their answer by now.
 */
export async function writeVerdict(key, clean) {
  if (!key) return
  try {
    await prisma.safeRouteVerdict.upsert({
      where: { routeKey: key },
      update: { clean, zonesVersion: SHADY_ZONES_VERSION, checkedAt: new Date() },
      create: { routeKey: key, clean, zonesVersion: SHADY_ZONES_VERSION },
    })
  } catch (err) {
    console.error('safe-route verdict unwritable:', err.message)
  }
}
