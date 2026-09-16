import { Prisma } from '@prisma/client'
import { prisma } from '../db/prisma.js'
import { LOCATION_STALE_AFTER_MS } from '../constants/dispatch.js'
import { HOST_ACTIVE_STATUSES } from './ridePooling.js'
import { sendPush } from './notification.js'

const GROUP_RANK = { admin: 0, rcs: 1, partner: 2 }
const rankOf = (group) => GROUP_RANK[group] ?? GROUP_RANK.partner

export const FAIRNESS_TIER_KM = 3
const tierOf = (km) => Math.floor(km / FAIRNESS_TIER_KM)
const turnKey = (driver) => (driver.lastOfferedAt ? new Date(driver.lastOfferedAt).getTime() : 0)

const geographyOf = (lat, lng) =>
  Prisma.sql`extensions.ST_SetSRID(extensions.ST_MakePoint(${lng}::float8, ${lat}::float8), 4326)::extensions.geography`

/**
 * Load eligible captains in one geographic query, then hydrate only the
 * relations pooling needs. Drivers already tried for this booking are excluded.
 */
export async function candidatesWithin(row, radiusKm, triedDriverIds) {
  const origin = geographyOf(row.pickupLat, row.pickupLng)
  const near = await prisma.$queryRaw`
    SELECT dl."driver_id" AS "driverId",
           dl."latitude" AS "latitude",
           dl."longitude" AS "longitude",
           extensions.ST_Distance(dl."geog", ${origin}, false) / 1000 AS "distanceKm"
    FROM "driver_locations" dl
    JOIN "drivers" d ON d."id" = dl."driver_id"
    WHERE extensions.ST_DWithin(dl."geog", ${origin}, ${radiusKm * 1000}::float8, false)
      AND dl."updated_at" > ${new Date(Date.now() - LOCATION_STALE_AFTER_MS)}
      AND d."is_online"
      AND d."is_active"
      AND d."suspended_at" IS NULL
      AND d."verification_status" = 'approved'
      AND d."vehicle_class" = ${row.vehicleClass}::"VehicleClass"
      AND NOT (dl."driver_id" = ANY(${[...triedDriverIds]}::text[]))
  `

  if (near.length === 0) return []

  const drivers = await prisma.driver.findMany({
    where: { id: { in: near.map((candidate) => candidate.driverId) } },
    include: {
      bookings: {
        where: { status: { in: HOST_ACTIVE_STATUSES } },
        select: {
          id: true,
          status: true,
          sharing: true,
          pickupLat: true,
          pickupLng: true,
          dropLat: true,
          dropLng: true,
          routePolyline: true,
        },
      },
    },
  })
  const byId = new Map(drivers.map((driver) => [driver.id, driver]))

  return near
    .map((candidate) => ({ ...candidate, driver: byId.get(candidate.driverId) }))
    .filter((candidate) => candidate.driver)
}

/** Group priority, then 3 km distance band, then least recently offered. */
export function rankCandidates(candidates) {
  return candidates.sort((a, b) => {
    const byGroup = rankOf(a.driver.group) - rankOf(b.driver.group)
    if (byGroup !== 0) return byGroup

    const byTier = tierOf(a.distanceKm) - tierOf(b.distanceKm)
    if (byTier !== 0) return byTier

    const byTurn = turnKey(a.driver) - turnKey(b.driver)
    if (byTurn !== 0) return byTurn

    return a.distanceKm !== b.distanceKm
      ? a.distanceKm - b.distanceKm
      : new Date(a.driver.createdAt) - new Date(b.driver.createdAt)
  })
}

/** Mark the fairness turn before sending the offer so concurrent searches see it. */
export async function markOffered(driverId, at = new Date()) {
  try {
    await prisma.driver.update({ where: { id: driverId }, data: { lastOfferedAt: at } })
  } catch (error) {
    console.error(`could not mark driver ${driverId} as offered:`, error)
  }
}

/** Create the durable offer row first; the push is only a best-effort nudge. */
export async function offerRideNow(row, candidate, poolHostBookingId = null) {
  try {
    await prisma.rideOffer.create({
      data: {
        bookingId: row.id,
        driverId: candidate.driverId,
        group: candidate.driver.group,
        poolHostBookingId,
      },
    })
  } catch {
    return
  }

  await sendPush(candidate.driver, {
    title: poolHostBookingId ? 'New shared pickup on your route' : row.sharing ? 'New sharing ride' : 'New ride',
    body: `${row.pickupAddress} → ${row.dropAddress} · ₹${row.fare}`,
    data: { screen: 'notifications', bookingId: row.id },
  }).catch(() => {})
}
