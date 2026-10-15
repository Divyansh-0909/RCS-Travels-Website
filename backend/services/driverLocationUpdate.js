import { normalizeLocationProvenance } from '../lib/locationProvenance.ts'
import { haversineDistanceKm } from './rideGeofence.js'

const radians = value => value * Math.PI / 180
function bearingBetween(from, lat, lng) {
  const phi1 = radians(from.latitude), phi2 = radians(lat), delta = radians(lng - from.longitude)
  const y = Math.sin(delta) * Math.cos(phi2)
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(delta)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

/** Called after the authenticated route validates the device payload.
 * @param {object} db
 * @param {string} driverId
 * @param {{lat: number, lng: number, observedAt?: number, accuracyMeters?: number | null}} fix
 */
export async function storeDriverLocation(db, driverId, { lat, lng, observedAt = undefined, accuracyMeters = null }, now = new Date()) {
  const previous = await db.driverLocation.findUnique({ where: { driverId } })
  const provenance = normalizeLocationProvenance({ observedAt, accuracyMeters }, now)
  let speedKmh = null, bearing = null
  if (previous) {
    const seconds = (now - previous.updatedAt) / 1000
    if (seconds > 0) speedKmh = haversineDistanceKm(previous.latitude, previous.longitude, lat, lng) / seconds * 3600
    bearing = bearingBetween(previous, lat, lng)
  }
  const data = { latitude: lat, longitude: lng, speedKmh, bearing, ...provenance }
  return db.driverLocation.upsert({ where: { driverId }, create: { driverId, ...data }, update: data })
}
