import { prisma } from '../db/prisma.js'
import { decodePolyline, hasShadyZones } from './safeRoute.js'
import { projectOntoPath } from './geo.js'

const GOOGLE_ROUTES_MONTHLY_LIMIT = 10_000
const LIVE_ETA_TTL_MS = 60_000
const LIVE_ROUTE_DEVIATION_KM = 0.08
const liveEtaCache = new Map()

const currentMonth = () => new Date().toISOString().slice(0, 7)

async function checkAndIncrementRoutesUsage() {
  const month = currentMonth()
  const usage = await prisma.apiUsage.findUnique({
    where: { service_month: { service: 'google_routes', month } },
  })
  if (usage && usage.count >= GOOGLE_ROUTES_MONTHLY_LIMIT) {
    throw new Error('GOOGLE_ROUTES_LIMIT_EXCEEDED')
  }
  await prisma.apiUsage.upsert({
    where: { service_month: { service: 'google_routes', month } },
    update: { count: { increment: 1 } },
    create: { service: 'google_routes', month, count: 1 },
  })
}

const routeSeconds = (duration) => {
  const seconds = Number.parseFloat(String(duration ?? '').replace(/s$/, ''))
  return Number.isFinite(seconds) ? seconds : null
}

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

export async function getNavigationRoute({ cacheKey, origin, destination }) {
  if (!cacheKey || origin?.lat == null || origin?.lng == null || destination?.lat == null || destination?.lng == null) return null

  const now = Date.now()
  const cached = liveEtaCache.get(cacheKey)
  if (cached && cached.expiresAt > now) {
    const pending = typeof cached.value?.then === 'function'
    if (pending || !navigationRouteNeedsRefresh(cached.value, origin)) return cached.value
  }

  const value = (async () => {
    await checkAndIncrementRoutesUsage()
    const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY,
        'X-Goog-FieldMask': 'routes.duration,routes.polyline.encodedPolyline',
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
    const route = data.routes?.[0]
    const seconds = routeSeconds(route?.duration)
    const polyline = typeof route?.polyline?.encodedPolyline === 'string'
      ? route.polyline.encodedPolyline
      : null
    if (seconds == null && !polyline) return null
    return {
      minutes: seconds == null ? null : Math.max(1, Math.ceil(seconds / 60)),
      polyline,
    }
  })()

  liveEtaCache.set(cacheKey, { value, expiresAt: now + LIVE_ETA_TTL_MS })
  try {
    const route = await value
    liveEtaCache.set(cacheKey, { value: route, expiresAt: now + LIVE_ETA_TTL_MS })
    return route
  } catch (error) {
    liveEtaCache.delete(cacheKey)
    throw error
  }
}

export async function getNavigationEtaMinutes(args) {
  const route = await getNavigationRoute(args)
  return route?.minutes ?? null
}

export async function fetchRoutes(pickupAddress, dropAddress, pickupCoords, dropCoords, viaWaypoint) {
  await checkAndIncrementRoutesUsage()
  const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
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
  if (!data.routes?.[0]?.distanceMeters) throw new Error('No route found between the given addresses')
  return data.routes.map((route) => ({
    distanceKm: route.distanceMeters / 1000,
    durationMin: route.duration ? Math.round(Number.parseInt(route.duration, 10) / 60) : null,
    polyline: route.polyline?.encodedPolyline ?? null,
    points: route.polyline?.encodedPolyline ? decodePolyline(route.polyline.encodedPolyline) : [],
  }))
}

const minutesOf = (duration) => duration ? Number.parseInt(duration, 10) / 60 : null
const atLatLng = (point) => ({ location: { latLng: { latitude: point.lat, longitude: point.lng } } })

export async function routeSequence(stops) {
  if (!Array.isArray(stops) || stops.length < 2) {
    throw new Error('routeSequence needs at least an origin and a destination')
  }
  await checkAndIncrementRoutesUsage()
  const origin = stops[0]
  const destination = stops[stops.length - 1]
  const intermediates = stops.slice(1, -1)
  const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.legs.duration,routes.legs.distanceMeters',
    },
    body: JSON.stringify({
      origin: atLatLng(origin),
      destination: atLatLng(destination),
      ...(intermediates.length ? { intermediates: intermediates.map(atLatLng) } : {}),
      travelMode: 'DRIVE',
    }),
  })
  const data = await response.json()
  const route = data.routes?.[0]
  if (!route?.legs?.length) throw new Error('No route found for the given stop sequence')
  const legs = route.legs.map((leg) => ({
    min: minutesOf(leg.duration) ?? 0,
    km: (leg.distanceMeters ?? 0) / 1000,
  }))
  return { totalMin: legs.reduce((sum, leg) => sum + leg.min, 0), legs }
}
