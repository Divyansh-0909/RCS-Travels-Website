import { kmBetween } from './geo.js'
import * as defaultNavigation from './rideEstimate.js'
import { prisma } from '../db/prisma.js'
import { systemClock } from '../lib/clock.js'

export const DRIVER_PICKUP_GRACE_MS = 10 * 60 * 1000

const FALLBACK_SPEED_KMH = 20
const FALLBACK_BUFFER_MIN = 3
const MIN_PICKUP_ETA_MIN = 3
const MAX_PICKUP_ETA_MIN = 90

const fallbackEtaMinutes = (location, booking) => {
  if (!location) return 10
  const distanceKm = kmBetween(
    { lat: location.latitude, lng: location.longitude },
    { lat: booking.pickupLat, lng: booking.pickupLng },
  )
  return Math.min(
    MAX_PICKUP_ETA_MIN,
    Math.max(MIN_PICKUP_ETA_MIN, Math.ceil((distanceKm / FALLBACK_SPEED_KMH) * 60) + FALLBACK_BUFFER_MIN),
  )
}

/** Freeze the pickup promise when a captain accepts so later live ETA changes cannot move it. */
export async function expectedPickupAtForAssignment(booking, driverId, now, clock = systemClock) {
  return (await pickupPromiseForAssignment(booking, driverId, now, clock)).expectedPickupAt
}

/** Obtain the one route fact used to freeze the pickup promise at acceptance. */
export async function pickupPromiseForAssignment(booking, driverId, now, clock = systemClock, { db, navigation } = {}) {
  if (now === undefined) now = clock.now()
  const scheduledAt = booking.scheduledAt ? new Date(booking.scheduledAt) : null
  if (scheduledAt && scheduledAt.getTime() > now.getTime()) return { expectedPickupAt: scheduledAt, route: null }

  const location = await bookingLocation(driverId, db)
  let route = null
  let etaMinutes = null
  if (location) {
    try {
      const args = {
        cacheKey: `${booking.id}:assignment-pickup`,
        origin: { lat: location.latitude, lng: location.longitude },
        destination: { lat: booking.pickupLat, lng: booking.pickupLng },
      }
      // Keep the existing ETA seam for the clock/fallback contract. The richer
      // route is available in production, while older test adapters only expose
      // the established ETA method.
      const routing = navigation ?? defaultNavigation
      if (typeof routing.getNavigationRoute === 'function') route = await routing.getNavigationRoute(args)
      else etaMinutes = await routing.getNavigationEtaMinutes(args)
    } catch (error) {
      console.warn(`Could not freeze pickup ETA for ${booking.id}:`, error?.message)
    }
  }

  const minutes = route?.minutes ?? etaMinutes ?? fallbackEtaMinutes(location, booking)
  return { expectedPickupAt: new Date(now.getTime() + minutes * 60 * 1000), route }
}

async function bookingLocation(driverId, db) {
  return (db ?? prisma).driverLocation.findUnique({ where: { driverId } })
}

export const driverDelayEligibleAt = (booking) => booking.expectedPickupAt
  ? new Date(new Date(booking.expectedPickupAt).getTime() + DRIVER_PICKUP_GRACE_MS)
  : null

export const isDriverDelayed = (booking, now, clock = systemClock) => {
  if (now === undefined) now = clock.now().getTime()
  if (!['assigned', 'en_route'].includes(booking.status)) return false
  const eligibleAt = driverDelayEligibleAt(booking)
  return Boolean(eligibleAt && now >= eligibleAt.getTime())
}
