import { systemClock } from '../../lib/clock.js'

const routeKey = (origin, destination) => JSON.stringify([origin, destination])
const copy = value => structuredClone(value)

/** A test provider: observations are facts, and failures never classify a driver. */
export function createRoutingEvidence({ clock = systemClock } = {}) {
  const routes = new Map()
  const failures = new Map()
  const history = []

  const setRoute = ({ origin, destination, distanceKm, normalMinutes, trafficMinutes,
    calculatedAt = clock.now(), receivedAt = clock.now(), provider = 'google_routes',
    trafficMode = 'TRAFFIC_AWARE_OPTIMAL', routeId = null, polyline = null }) => {
    const observation = { origin: copy(origin), destination: copy(destination), distanceKm,
      normalMinutes, trafficMinutes, calculatedAt: new Date(calculatedAt),
      receivedAt: new Date(receivedAt), provider, trafficMode, routeId, polyline }
    routes.set(routeKey(origin, destination), observation)
    return copy(observation)
  }

  const failNext = (origin, destination, category) => {
    const key = routeKey(origin, destination)
    const queue = failures.get(key) ?? []
    queue.push(category)
    failures.set(key, queue)
  }

  const query = ({ origin, destination }) => {
    const key = routeKey(origin, destination)
    const failure = failures.get(key)?.shift() ?? null
    const cached = routes.get(key)
    const result = {
      observation: failure ? null : cached ? copy(cached) : null,
      failure: failure ?? (cached ? null : 'NO_ROUTE'),
      cached: failure && cached ? copy(cached) : null,
      queriedAt: clock.now(),
      cacheAgeMs: cached ? clock.now().getTime() - cached.calculatedAt.getTime() : null,
    }
    history.push(copy({ origin, destination, ...result }))
    return result
  }

  // Match the existing navigation service's return shape for callers that
  // only need ETA; query() retains the richer provenance and failure evidence.
  const getNavigationRoute = async (args) => {
    const result = query(args)
    if (result.failure === 'NO_ROUTE') return null
    if (result.failure) throw new Error(result.failure)
    return { minutes: result.observation.trafficMinutes,
      polyline: result.observation.polyline }
  }

  const getNavigationEtaMinutes = async (args) => {
    const route = await getNavigationRoute(args)
    return route?.minutes ?? null
  }

  return { setRoute, failNext, query, getNavigationRoute, getNavigationEtaMinutes, history,
    reset: () => { routes.clear(); failures.clear(); history.length = 0 } }
}
