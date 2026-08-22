import { Prisma } from '@prisma/client'
import { prisma } from '../db/prisma.js'
import { LOCATION_STALE_AFTER_MS } from '../constants/dispatch.js'
import { seatsOf } from '../constants/vehicles.js'

// The customer-facing availability radius. Dispatch may widen further after a
// request is created, but the pre-booking map and ETA only make the stronger
// claim that a matching vehicle is nearby inside five kilometres.
export const NEARBY_DRIVER_RADIUS_KM = 5
export const NEARBY_DRIVER_LIMIT = 12

const geographyOf = (lat, lng) =>
  Prisma.sql`extensions.ST_SetSRID(extensions.ST_MakePoint(${lng}::float8, ${lat}::float8), 4326)::extensions.geography`

/**
 * Anonymous, dispatchable idle vehicles for the pre-booking Ride Now map.
 *
 * The public `vehicles` list contains no driver id, name, plate or model.
 * Coordinates are rounded to roughly 11 metres: precise enough to place the car
 * on the correct road at this zoom, without turning a pre-booking availability
 * preview into a source of exact captain-location data. `nearest` is private
 * server context for the traffic-aware ETA and must be stripped by the route.
 */
export async function nearbyDriverAvailability({ lat, lng, vehicleClass }, db = prisma) {
  const origin = geographyOf(lat, lng)
  const fullCapacity = seatsOf(vehicleClass)

  const rows = await db.$queryRaw`
    SELECT dl."driver_id" AS "driverId",
           dl."latitude" AS "driverLat",
           dl."longitude" AS "driverLng",
           round(dl."latitude"::numeric, 4)::float8 AS "lat",
           round(dl."longitude"::numeric, 4)::float8 AS "lng"
    FROM "driver_locations" dl
    JOIN "drivers" d ON d."id" = dl."driver_id"
    WHERE extensions.ST_DWithin(dl."geog", ${origin}, ${NEARBY_DRIVER_RADIUS_KM * 1000}::float8, false)
      AND dl."updated_at" > ${new Date(Date.now() - LOCATION_STALE_AFTER_MS)}
      AND d."is_online"
      AND d."is_active"
      AND d."active_vehicle_id" IS NOT NULL
      AND d."suspended_at" IS NULL
      AND d."verification_status" = 'approved'
      AND d."vehicle_class" = ${vehicleClass}::"VehicleClass"
      AND d."vehicle_capacity" >= ${fullCapacity}
      AND NOT EXISTS (
        SELECT 1
        FROM "bookings" b
        WHERE b."driver_id" = d."id"
          AND b."status" IN (
            'assigned'::"BookingStatus", 'en_route'::"BookingStatus",
            'reached'::"BookingStatus", 'started'::"BookingStatus"
          )
      )
    ORDER BY extensions.ST_Distance(dl."geog", ${origin}, false)
    LIMIT ${NEARBY_DRIVER_LIMIT}
  `

  const vehicles = rows.map(({ lat: rowLat, lng: rowLng }) => ({
    lat: Number(rowLat),
    lng: Number(rowLng),
  }))

  // Kept server-side: the stable id lets the Routes ETA cache follow the same
  // nearest driver, while the exact coordinates produce the route calculation.
  // Neither value is included in the customer response.
  const first = rows[0]
  const nearest = first ? {
    driverId: first.driverId,
    lat: Number(first.driverLat),
    lng: Number(first.driverLng),
  } : null

  return { vehicles, nearest }
}

// Purely wired here so the actual origin/destination contract is unit-testable
// without spending a Google Routes call. The caller owns failure handling.
export function nearbyDriverEta({ nearest, pickup, vehicleClass }, getEta) {
  if (!nearest) return Promise.resolve(null)
  const pickupKey = `${pickup.lat.toFixed(3)}:${pickup.lng.toFixed(3)}`
  return getEta({
    cacheKey: `nearby:${nearest.driverId}:${vehicleClass}:${pickupKey}`,
    origin: { lat: nearest.lat, lng: nearest.lng },
    destination: pickup,
  })
}
