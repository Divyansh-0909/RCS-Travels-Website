import {
  anyEndpointInShadyZone,
  campusGateFor,
  classifyRoutes,
  inAnyShadyZone,
  isClean,
} from './safeRoute.js'
import { readVerdict, verdictKey, writeVerdict } from './safeRouteCache.js'
import { fetchRoutes } from './googleRoutes.js'

async function fetchRouteOptions({ pickupAddress, dropAddress, pickupCoords, dropCoords, pickupOnCampus, dropOnCampus, preferSafeRoute }) {
  const routes = await fetchRoutes(pickupAddress, dropAddress, pickupCoords, dropCoords, null)
  if (anyEndpointInShadyZone(pickupCoords, dropCoords)) {
    return { primary: routes[0], safe: null, waypoint: null, candidate: null }
  }

  const { primary, primaryShady, safe, waypoint, fallback } = classifyRoutes(routes)
  if (safe) return { primary, safe, waypoint, candidate: null }
  if (!primaryShady) return { primary, safe: null, waypoint: null, candidate: null }

  const forcedPoint = campusGateFor(pickupOnCampus, dropOnCampus) ?? fallback
  if (!forcedPoint || inAnyShadyZone(forcedPoint)) {
    return { primary, safe: null, waypoint: null, candidate: null }
  }

  const key = verdictKey(pickupCoords, dropCoords, forcedPoint)
  if (!preferSafeRoute) {
    const known = await readVerdict(key)
    if (known === true) return { primary, safe: null, waypoint: null, candidate: forcedPoint }
    if (known === false) return { primary, safe: null, waypoint: null, candidate: null }
  }

  try {
    const [forced] = await fetchRoutes(pickupAddress, dropAddress, pickupCoords, dropCoords, forcedPoint)
    const clean = Boolean(forced && isClean(forced.points))
    await writeVerdict(key, clean)
    if (clean) return { primary, safe: forced, waypoint: forcedPoint, candidate: null }
  } catch (error) {
    console.error('safe-route detour unavailable:', error.message)
  }
  return { primary, safe: null, waypoint: null, candidate: null }
}

export async function bestEffortRouteOptions(args) {
  try {
    return await fetchRouteOptions(args)
  } catch (error) {
    console.error('route metrics unavailable:', error.message)
    return { primary: null, safe: null, waypoint: null, candidate: null }
  }
}

const EMPTY_METRICS = { distanceKm: null, durationMin: null, polyline: null }

export const routeMetrics = (route) => route
  ? { distanceKm: route.distanceKm, durationMin: route.durationMin, polyline: route.polyline }
  : EMPTY_METRICS
