import { prisma } from '../db/prisma.js'
import { decodePolyline, hasShadyZones } from './safeRoute.js'
import { projectOntoPath } from './geo.js'
import { systemClock } from '../lib/clock.js'

const GOOGLE_ROUTES_MONTHLY_LIMIT = 10_000
const LIVE_ETA_TTL_MS = 60_000
const LIVE_ROUTE_DEVIATION_KM = 0.08
const liveEtaCache = new Map()

const currentMonth = () => new Date().toISOString().slice(0, 7)

async function checkAndIncrementRoutesUsage(db = prisma) {
  const month = currentMonth()
  const usage = await db.apiUsage.findUnique({
    where: { service_month: { service: 'google_routes', month } },
  })
  if (usage && usage.count >= GOOGLE_ROUTES_MONTHLY_LIMIT) {
    throw new Error('GOOGLE_ROUTES_LIMIT_EXCEEDED')
  }
  await db.apiUsage.upsert({
    where: { service_month: { service: 'google_routes', month } },
    update: { count: { increment: 1 } },
    create: { service: 'google_routes', month, count: 1 },
  })
}

const routeSeconds = (duration) => {
  const seconds = Number.parseFloat(String(duration ?? '').replace(/s$/, ''))
  return Number.isFinite(seconds) ? seconds : null
}

const point = ({ lat, lng }) => ({
  lat: Number.isFinite(lat) ? lat : null,
  lng: Number.isFinite(lng) ? lng : null,
})
const routeEndpoint = (address, coords) => coords ? point(coords) : { address: address ?? null }
const routeProvenance = ({ origin, destination, cacheKey = null, trafficMode = 'UNSPECIFIED', route, calculatedAt, receivedAt }) => {
  const durationSeconds = routeSeconds(route?.duration)
  const staticSeconds = routeSeconds(route?.staticDuration)
  return {
    origin,
    destination,
    provider: 'google_routes',
    trafficMode,
    providerRouteId: null,
    durationSeconds: staticSeconds ?? durationSeconds,
    trafficDurationSeconds: trafficMode === 'UNSPECIFIED' ? null : durationSeconds,
    distanceMeters: Number.isFinite(route?.distanceMeters) ? route.distanceMeters : null,
    calculatedAt,
    receivedAt,
    cache: { identity: cacheKey, hit: false, ageMs: 0 },
  }
}
const withCacheProvenance = (route, cacheKey, hit, now) => route && ({
  ...route,
  provenance: {
    ...route.provenance,
    cache: {
      identity: cacheKey,
      hit,
      ageMs: Math.max(0, now - new Date(route.provenance.calculatedAt).getTime()),
    },
  },
})

const toWaypoint = (address, coords) => coords
  ? { location: { latLng: { latitude: coords.lat, longitude: coords.lng } } }
  : { address }

export function navigationRouteNeedsRefresh(route, origin, deviationKm = LIVE_ROUTE_DEVIATION_KM) {
  if (!route?.polyline || origin?.lat == null || origin?.lng == null) return false
  try {
    const path = decodePolyline(route.polyline)
    return projectOntoPath(origin, path).offRouteKm > deviationKm
  } catch {
    return true
  }
}

const hasNavigationEndpoints = (cacheKey, origin, destination) => Boolean(cacheKey
  && origin?.lat != null && origin?.lng != null && destination?.lat != null && destination?.lng != null)

export async function getNavigationRoute({ cacheKey, origin, destination }, {
  db = prisma, clock = systemClock, request = fetch, cache = liveEtaCache, apiKey = process.env.GOOGLE_MAPS_API_KEY,
} = {}) {
  if (!hasNavigationEndpoints(cacheKey, origin, destination)) return null

  const now = clock.now().getTime()
  const cached = cache.get(cacheKey)
  if (cached && cached.expiresAt > now) {
    const pending = typeof cached.value?.then === 'function'
    if (pending) return cached.value
    if (!navigationRouteNeedsRefresh(cached.value, origin)) return withCacheProvenance(cached.value, cacheKey, true, now)
  }

  const value = (async () => {
    await checkAndIncrementRoutesUsage(db)
    const response = await request('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.staticDuration,routes.polyline.encodedPolyline',
      },
      body: JSON.stringify({
        origin: toWaypoint(null, origin),
        destination: toWaypoint(null, destination),
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE_OPTIMAL',
        polylineQuality: 'HIGH_QUALITY',
      }),
    })
    if (!response.ok) throw new Error(`GOOGLE_ROUTES_${response.status}`)
    const data = await response.json()
    const receivedAt = clock.now()
    const route = data.routes?.[0]
    const seconds = routeSeconds(route?.duration)
    const polyline = typeof route?.polyline?.encodedPolyline === 'string'
      ? route.polyline.encodedPolyline
      : null
    if (seconds == null && !polyline) return null
    return {
      minutes: seconds == null ? null : Math.max(1, Math.ceil(seconds / 60)),
      polyline,
      provenance: routeProvenance({
        origin: point(origin), destination: point(destination), cacheKey,
        trafficMode: 'TRAFFIC_AWARE_OPTIMAL', route, calculatedAt: new Date(now), receivedAt,
      }),
    }
  })()

  cache.set(cacheKey, { value, expiresAt: now + LIVE_ETA_TTL_MS })
  try {
    const route = await value
    cache.set(cacheKey, { value: route, expiresAt: now + LIVE_ETA_TTL_MS })
    return route
  } catch (error) {
    cache.delete(cacheKey)
    throw error
  }
}

/** Read only a still-valid, on-route navigation fact. It never calls Google. */
export function getCachedNavigationRoute({ cacheKey, origin }, { cache = liveEtaCache, clock = systemClock } = {}) {
  const now = clock.now().getTime()
  const cached = cache.get(cacheKey)
  if (!cached || cached.expiresAt <= now || typeof cached.value?.then === 'function') return null
  if (navigationRouteNeedsRefresh(cached.value, origin)) return null
  return withCacheProvenance(cached.value, cacheKey, true, now)
}

export function clearNavigationRouteCacheForTests() {
  liveEtaCache.clear()
}

export async function getNavigationEtaMinutes(args, options) {
  const route = await getNavigationRoute(args, options)
  return route?.minutes ?? null
}

export async function fetchRoutes(pickupAddress, dropAddress, pickupCoords, dropCoords, viaWaypoint, { db = prisma, clock = systemClock, request = fetch, apiKey = process.env.GOOGLE_MAPS_API_KEY } = {}) {
  const calculatedAt = clock.now()
  await checkAndIncrementRoutesUsage(db)
  const response = await request('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
    'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.staticDuration,routes.polyline.encodedPolyline',
    },
    body: JSON.stringify({
      origin: toWaypoint(pickupAddress, pickupCoords),
      destination: toWaypoint(dropAddress, dropCoords),
      ...(viaWaypoint
        ? { intermediates: [{ location: { latLng: { latitude: viaWaypoint.lat, longitude: viaWaypoint.lng } }, via: true }] }
        : hasShadyZones() ? { computeAlternativeRoutes: true } : {}),
      travelMode: 'DRIVE',
    }),
  })
  const data = await response.json()
  const receivedAt = clock.now()
  if (!data.routes?.[0]?.distanceMeters) throw new Error('No route found between the given addresses')
  return data.routes.map((route) => ({
    distanceKm: route.distanceMeters / 1000,
    durationMin: route.duration ? Math.round(Number.parseInt(route.duration, 10) / 60) : null,
    polyline: route.polyline?.encodedPolyline ?? null,
    points: route.polyline?.encodedPolyline ? decodePolyline(route.polyline.encodedPolyline) : [],
    provenance: routeProvenance({
      origin: routeEndpoint(pickupAddress, pickupCoords),
      destination: routeEndpoint(dropAddress, dropCoords),
      route, calculatedAt, receivedAt,
    }),
  }))
}

const minutesOf = (duration) => duration ? Number.parseInt(duration, 10) / 60 : null
const atLatLng = (point) => ({ location: { latLng: { latitude: point.lat, longitude: point.lng } } })

export async function routeSequence(stops, { db = prisma, clock = systemClock, request = fetch, apiKey = process.env.GOOGLE_MAPS_API_KEY } = {}) {
  if (!Array.isArray(stops) || stops.length < 2) {
    throw new Error('routeSequence needs at least an origin and a destination')
  }
  const calculatedAt = clock.now()
  await checkAndIncrementRoutesUsage(db)
  const origin = stops[0]
  const destination = stops[stops.length - 1]
  const intermediates = stops.slice(1, -1)
  const response = await request('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'routes.duration,routes.staticDuration,routes.distanceMeters,routes.legs.duration,routes.legs.distanceMeters',
    },
    body: JSON.stringify({
      origin: atLatLng(origin),
      destination: atLatLng(destination),
      ...(intermediates.length ? { intermediates: intermediates.map(atLatLng) } : {}),
      travelMode: 'DRIVE',
    }),
  })
  const data = await response.json()
  const receivedAt = clock.now()
  const route = data.routes?.[0]
  if (!route?.legs?.length) throw new Error('No route found for the given stop sequence')
  const legs = route.legs.map((leg) => ({
    min: minutesOf(leg.duration) ?? 0,
    km: (leg.distanceMeters ?? 0) / 1000,
  }))
  return {
    totalMin: legs.reduce((sum, leg) => sum + leg.min, 0),
    legs,
    provenance: routeProvenance({
      origin: point(origin), destination: point(destination), route, calculatedAt, receivedAt,
    }),
  }
}
