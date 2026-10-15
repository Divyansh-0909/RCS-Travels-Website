import { storeDriverLocation } from '../../services/driverLocationUpdate.js'
import { getNavigationRoute } from '../../services/googleRoutes.js'
import { persistRouteObservation } from '../../services/routeProvenance.js'
import { beginNotificationAttempt, recordNotificationAcceptance, recordNotificationFailure,
  applyWhatsAppDeliveryStatus } from '../../services/notificationProvenance.js'

export function createPhase9RouteProvider(s) {
  const cache = new Map(), history = []
  let duration = 360
  return {
    setDuration: seconds => { duration = seconds }, history,
    getNavigationRoute: args => getNavigationRoute(args, { db: s.db, clock: s.clock, cache, apiKey: 'offline-no-credential',
      request: async (url, options) => {
        history.push({ url, body: JSON.parse(options.body), at: s.clock.now().toISOString(), duration })
        return { ok: true, json: async () => ({ routes: [{ duration: `${duration}s`, staticDuration: '360s', distanceMeters: 1200 }] }) }
      } }),
  }
}

export async function executePhase9DeviceEvent(s, event) {
  const driver = s.actors.driversByGroup[event.driver ?? 'rcs']
  const now = s.clock.now()
  if (event.type === 'gps') {
    if (event.missing) return s.db.driverLocation.deleteMany({ where: { driverId: driver.id } })
    const booking = await s.booking()
    return storeDriverLocation(s.db, driver.id, { lat: event.lat ?? booking.pickupLat,
      lng: event.lng ?? booking.pickupLng, accuracyMeters: event.accuracy ?? 5,
      observedAt: event.unknownTime ? undefined : now.getTime() - (event.ageMs ?? 0) }, now)
  }
  if (event.type === 'online') return s.db.driver.update({ where: { id: driver.id }, data: { isOnline: event.value } })
  if (event.type === 'capacity') return s.db.driver.update({ where: { id: driver.id },
    data: { vehicleCapacity: event.value, ...(event.group ? { group: event.group } : {}) } })
  if (event.type === 'commitment') {
    const data = { ...s.actors.bookingStates.next, driverId: driver.id,
      scheduledAt: new Date(event.scheduledAt), status: 'assigned' }
    return s.db.booking.create({ data })
  }
  if (event.type === 'route') {
    s.navigation.setDuration(event.seconds)
    const booking = await s.booking()
    const location = await s.db.driverLocation.findUniqueOrThrow({ where: { driverId: driver.id } })
    const route = await s.navigation.getNavigationRoute({ cacheKey: `${booking.id}:pickup`,
      origin: { lat: location.latitude, lng: location.longitude }, destination: { lat: booking.pickupLat, lng: booking.pickupLng } })
    await persistRouteObservation(s.db, { bookingId: booking.id, event: 'live_pickup_observed', route })
    return route
  }
  if (event.type === 'notification') {
    const attempt = await beginNotificationAttempt({ provider: 'whatsapp', channel: 'whatsapp',
      recipient: driver.phone, bookingId: s.bookingId, purpose: 'scheduled_reminder', retryKey: `phase9:${s.bookingId}` }, s.db, now)
    s.notificationId = attempt.id
    if (event.failed) return recordNotificationFailure({ attemptId: attempt.id, code: 'OFFLINE_PROVIDER_FAILURE', message: 'Synthetic failure' }, s.db, now)
    return recordNotificationAcceptance({ attemptId: attempt.id, providerMessageId: 'offline-message-1' }, s.db, now)
  }
  if (event.type === 'delivery') return applyWhatsAppDeliveryStatus({ id: 'offline-message-1',
    status: event.status, timestamp: String(Math.floor(new Date(event.observedAt ?? event.at).getTime() / 1000)) }, s.db, now)
  return undefined
}
