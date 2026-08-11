import { prisma } from '../db/prisma.js'
import {sendFCM, sendWhatsApp} from './notification.js'
import { seatsOf } from '../constants/vehicles.js'

const EARTH_RADIUS_KM = 6371

function bearingDeg(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180
  const φ1 = toRad(lat1), φ2 = toRad(lat2), Δλ = toRad(lng2 - lng1)
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

// Whether two drops sit in the same direction from a shared pickup, within a
// tolerance. Cheap stand-in for "is this detour acceptable" when pooling rides.
export function inSameDirectionCorridor(pickupLat, pickupLng, drop1Lat, drop1Lng, drop2Lat, drop2Lng, thresholdDeg = 45) {
  const b1 = bearingDeg(pickupLat, pickupLng, drop1Lat, drop1Lng)
  const b2 = bearingDeg(pickupLat, pickupLng, drop2Lat, drop2Lng)
  const diff = Math.abs(b1 - b2)
  return (diff > 180 ? 360 - diff : diff) <= thresholdDeg
}

function haversineDistance(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180

  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a))
}


function getBoundingBox(lat, lng, radiusKm) {
  const latDelta = radiusKm / 111                          // 1 deg lat = 111 km
  const lngDelta = radiusKm / (111 * Math.cos(lat * Math.PI / 180))  // shrinks near poles

  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLng: lng - lngDelta,
    maxLng: lng + lngDelta,
  }
}

/** @type {import('@prisma/client').BookingStatus[]} */
export const ASSIGNABLE_STATUSES = ['pending', 'confirmed']
const GROUP_RANK = { admin: 0, rcs: 1, partner: 2 }
const rankOf = (group) => GROUP_RANK[group] ?? GROUP_RANK.partner

class ClaimFailure extends Error {
  constructor(reason) {
    super(reason)
    this.reason = reason
  }
}

/**
 * @param {{ id: string, sharing: boolean }} booking
 * @param {{ id: string, vehicleClass: string, vehicleNumber?: string }} driver
 * @param {Date} confirmedAt
 * @param {(tx: import('@prisma/client').Prisma.TransactionClient) => Promise<void>} [onClaimed]
 * @returns {Promise<'claimed' | 'booking_taken' | 'no_room'>}
 */
export async function claimBookingForDriver(booking, driver, confirmedAt, onClaimed) {
  const seats = seatsOf(driver.vehicleClass)
  if (!booking.sharing && seats === null) return 'no_room'

  try {
    return await prisma.$transaction(async (tx) => {
      const claimed = await tx.booking.updateMany({
        where: { id: booking.id, status: { in: ASSIGNABLE_STATUSES } },
        // THE PLATE IS SNAPSHOTTED HERE, in the same statement that assigns the
        // ride. A captain owns several cars and switches between them, so reading
        // it back through the `driver` relation later would show every past ride
        // as having been done in whichever car he is sitting in today — and a
        // rider disputing "the car that picked me up was DL01AB1234" would be
        // arguing against a column that had quietly changed under him.
        data: {
          status: 'assigned',
          driverId: driver.id,
          vehicleNumber: driver.vehicleNumber ?? null,
          confirmedAt,
        },
      })
      if (claimed.count === 0) throw new ClaimFailure('booking_taken')

      const seated = await tx.driver.updateMany({
        where: {
          id: driver.id,
          vehicleCapacity: booking.sharing ? { gt: 0 } : { gte: seats },
        },
        data: { vehicleCapacity: booking.sharing ? { decrement: 1 } : 0 },
      })
      if (seated.count === 0) throw new ClaimFailure('no_room')

      if (onClaimed) await onClaimed(tx)

      return 'claimed'
    })
  } catch (err) {
    if (err instanceof ClaimFailure) return err.reason
    throw err
  }
}

export async function getDriver(bookingId) {
  let assignedDriver = null

  const row = await prisma.booking.findFirst({ where: { id: bookingId } })
  if (!row) return null

  const triedDriverIds = new Set()

  for(let i=0; i<70; i+=10){
    // A ring of FCM sends can take a while; re-check before starting the next
    // one so an expired or cancelled booking stops pinging drivers.
    if (i > 0) {
      const current = await prisma.booking.findUnique({
        where: { id: bookingId },
        select: { status: true },
      })
      if (!current || !ASSIGNABLE_STATUSES.includes(current.status)) return null
    }

    const box = getBoundingBox(row.pickupLat, row.pickupLng, 20+i)

    const locations = await prisma.driverLocation.findMany({
      where: {
        latitude:  { gte: box.minLat, lte: box.maxLat },
        longitude: { gte: box.minLng, lte: box.maxLng },
        driver: {
          isActive:           true,
          isOnline:           true,
          verificationStatus: 'approved',
          suspendedAt:        null,
          vehicleClass: row.vehicleClass,
        },
      },
      include: {
        driver: {
          include: {
            bookings: {
              where: { status: { in: ['assigned', 'en_route', 'reached', 'started'] } },
              select: { id: true, dropLat: true, dropLng: true },
            },
          },
        },
      },
    })

    const sorted = locations
      .filter(loc => !triedDriverIds.has(loc.driverId))
      .map((loc) => ({ ...loc, distanceKm: haversineDistance(row.pickupLat, row.pickupLng, loc.latitude, loc.longitude) }))
      .filter((loc) => loc.distanceKm <= 20 + i)
      .sort((a, b) => {
        // Group first — see GROUP_RANK. Both passes below iterate this array, so
        // sorting here is what makes the sharing pass respect priority too.
        const byGroup = rankOf(a.driver.group) - rankOf(b.driver.group)
        if (byGroup !== 0) return byGroup

        return a.distanceKm !== b.distanceKm
          ? a.distanceKm - b.distanceKm
          : new Date(a.driver.createdAt) - new Date(b.driver.createdAt)
      })
    
    const pickupTimeLabel = row.scheduledAt
      ? new Date(row.scheduledAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })
      : 'IMMEDIATE PICKUP'
    

    // Pass 1 — join an existing shared trip: a driver already carrying a ride whose
    // drop lies in the same 45° bearing corridor, so the detour stays small.
    //
    // !! THIS PASS IS DEAD. DriverLocation has no `sharing` column, so the filter
    // below reads `undefined === true` on every row and sortedSharing is always
    // empty — the corridor check never runs. Sharing riders fall through to pass 2
    // and each start a fresh shared trip instead of pooling. The flag lives on
    // Booking, so the test likely belongs on the driver's active booking.
    if(row.sharing){
      const sortedSharing = sorted
        .filter((loc) => loc.sharing === true)
        .filter((loc) => {
          const activeBooking = loc.driver.bookings?.[0]
          if (!activeBooking) return true
          return inSameDirectionCorridor(
            row.pickupLat, row.pickupLng,
            activeBooking.dropLat, activeBooking.dropLng,
            row.dropLat, row.dropLng,
          )
        })
      
      for (const x of sortedSharing) {
        triedDriverIds.add(x.driverId)

        // Cheap early-out on a read that is already stale — skip the 30s offer to
        // a van we can see is full. claimBookingForDriver re-checks this against
        // the live row and is the check that actually decides.
        if(x.driver.vehicleCapacity <= 0) continue;

        const response =
          await sendFCM(x.driver.fcmToken, {
            notification: {
              title: row.scheduledAt ? `New Scheduled Sharing Ride, Pick up at ${row.scheduledAt}` : 'Immediate Sharing Pickup',
              body: `\n${row.pickupAddress} → ${row.dropAddress} \n₹${row.fare}`,
            },
            data: {
              bookingId:      row.id,
              pickupAddress:  row.pickupAddress,
              pickupLat:      String(row.pickupLat),
              pickupLng:      String(row.pickupLng),
              dropAddress:    row.dropAddress,
              dropLat:        String(row.dropLat),
              dropLng:        String(row.dropLng),
              fare:           String(row.fare),
              vehicleClass:   row.vehicleClass,
              pickupTime:     pickupTimeLabel,
              customerPhone:  row.customerPhone,
            },
          })

        if (response === true ) {
          // on-spot rides have no confirmedAt yet
          const claim = await claimBookingForDriver(row, x.driver, row.confirmedAt ?? new Date())

          // The booking moved on while this ring was pinging — cancelled,
          // expired, or taken through the driver app. Nothing left to search for.
          if (claim === 'booking_taken') return null
          // His last seat went to another ride between the offer and the answer.
          // Only this candidate is out; the next one may still fit.
          if (claim === 'no_room') continue

          assignedDriver = x.driverId

          sendWhatsApp(x.driver.phone,
            `You have been assigned a sharing ride.
            \nPickup Time: ${pickupTimeLabel}
            \nPickup Location: ${row.pickupAddress}
            \nDrop Location: ${row.dropAddress}
            \nCustomer Phone Number: ${row.customerPhone}`
          )
          return assignedDriver
        }
      }
    }
    
     
    // Pass 2 — start a new trip on an idle-enough vehicle.
    for (const x of sorted) {
      triedDriverIds.add(x.driverId)

      // Solo rides need a fully-free vehicle; a sharing ride falling through here
      // starts a fresh shared trip and needs just one free seat. "Fully free" is
      // measured against the vehicle's own seat count, which now comes from its
      // class rather than from the column that used to hold both.
      //
      // Same early-out as pass 1: worth skipping a 30s offer over, not trusted to
      // still be true by the time he answers. claimBookingForDriver decides.
      if (row.sharing ? x.driver.vehicleCapacity <= 0 : x.driver.vehicleCapacity < seatsOf(x.driver.vehicleClass)) continue

      const response =
        await sendFCM(x.driver.fcmToken, {
          notification: {
            title: row.scheduledAt ? `New Scheduled Ride, Pick up at ${row.scheduledAt}` : 'Immediate Pickup',
            body: `\n${row.pickupAddress} → ${row.dropAddress} \n₹${row.fare}`,
          },
          data: {
            bookingId:      row.id,
            pickupAddress:  row.pickupAddress,
            pickupLat:      String(row.pickupLat),
            pickupLng:      String(row.pickupLng),
            dropAddress:    row.dropAddress,
            dropLat:        String(row.dropLat),
            dropLng:        String(row.dropLng),
            fare:           String(row.fare),
            vehicleClass:   row.vehicleClass,
            pickupTime:     pickupTimeLabel,
            customerPhone:  row.customerPhone,
          },
        })

      if (response === true ) {
        // on-spot rides have no confirmedAt yet. The claim also takes the seats:
        // a solo ride the whole vehicle, a fresh sharing ride one seat.
        const claim = await claimBookingForDriver(row, x.driver, row.confirmedAt ?? new Date())

        if (claim === 'booking_taken') return null
        if (claim === 'no_room') continue

        assignedDriver = x.driverId

        sendWhatsApp(x.driver.phone,
          `You have been assigned a ride.
          \nPickup Time: ${pickupTimeLabel}
          \nPickup Location: ${row.pickupAddress}
          \nDrop Location: ${row.dropAddress}
          \nCustomer Phone Number: ${row.customerPhone}`
        )
        return assignedDriver
      }
    }
  }

  return null
}

// How long a booking may sit in `pending` before it's written off. Only a crash
// guard — a process that dies mid-search would otherwise strand the booking
// forever and the client would poll it indefinitely.
export const ASSIGNMENT_DEADLINE_MS = 5 * 60 * 1000

// Guarded on `pending` so a booking that already moved on — driver found, user
// cancelled, or the lazy expiry got here first — is never overwritten.
export async function markNoDriver(bookingId) {
  const { count } = await prisma.booking.updateMany({
    where: { id: bookingId, status: 'pending' },
    data: { status: 'no_driver' },
  })
  return count > 0
}

// The search outlives an HTTP request: getDriver walks 20→80 km rings with a
// sequential FCM call per candidate. Bookings are created as `pending` and this
// runs detached, so the response returns immediately and the client polls
// /bookings/:id/status until the status moves. getDriver writes `assigned`
// itself, so this only has to record the failure case.
export function startAssignment(bookingId) {
  getDriver(bookingId)
    .then(driverId => (driverId ? null : markNoDriver(bookingId)))
    .catch(async err => {
      console.error(`driver assignment failed for booking ${bookingId}:`, err)
      await markNoDriver(bookingId).catch(() => {})
    })
}