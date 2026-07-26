import { prisma } from '../db/prisma.js'
import {sendFCM, sendWhatsApp} from './notification.js'

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

// Assignment is only legal from these. A booking expired to `no_driver`,
// cancelled, or already assigned must never be claimed by a search still in
// flight — see claimBooking.
const ASSIGNABLE_STATUSES = ['pending', 'confirmed']

// Atomically take the booking for this driver. Returns false if it moved on
// while we were notifying, in which case the caller abandons the search. Done
// before the capacity decrement so a lost claim can't strand a seat.
async function claimBooking(bookingId, driverId, confirmedAt) {
  const { count } = await prisma.booking.updateMany({
    where: { id: bookingId, status: { in: ASSIGNABLE_STATUSES } },
    data: { status: 'assigned', driverId, confirmedAt },
  })
  return count > 0
}

// Finds a driver and assigns the booking, or returns null if nobody takes it.
//
// Widens a bounding box around the pickup in 10 km steps from 20 to 80 km, and
// inside each ring offers the ride to candidates one at a time, nearest first,
// ties broken by driver seniority. Each offer blocks on the driver's answer, so a
// ring of ten candidates can take minutes — which is why callers run this detached
// (see startAssignment) rather than inside a request.
//
// Sharing rides get a first pass that tries to join them to a driver already
// carrying a compatible trip; everything else takes the second pass.
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
          ...(row.vehicleType === 1
          ? {
              OR: [
                { vehicleType: 4 },
                { vehicleType: 6 },
              ],
            }
          : {
              vehicleType: row.vehicleType,
            }),
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
      .sort((a, b) =>
        a.distanceKm !== b.distanceKm
          ? a.distanceKm - b.distanceKm
          : new Date(a.driver.createdAt) - new Date(b.driver.createdAt)
      )
    
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
              vehicleType:    row.vehicleType,
              pickupTime:     pickupTimeLabel,
              customerPhone:  row.customerPhone,
            },
          })

        if (response === true ) {
          // on-spot rides have no confirmedAt yet
          if (!await claimBooking(bookingId, x.driverId, row.confirmedAt ?? new Date())) return null

          assignedDriver = x.driverId

          await prisma.driver.update({
            where: {id: assignedDriver},
            data: {
              vehicleCapacity: x.driver.vehicleCapacity - 1
            }
          })

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
      // starts a fresh shared trip and needs just one free seat.
      if (row.sharing ? x.driver.vehicleCapacity <= 0 : x.driver.vehicleCapacity < x.driver.vehicleType) continue

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
            vehicleType:    row.vehicleType,
            pickupTime:     pickupTimeLabel,
            customerPhone:  row.customerPhone,
          },
        })

      if (response === true ) {
        // on-spot rides have no confirmedAt yet
        if (!await claimBooking(bookingId, x.driverId, row.confirmedAt ?? new Date())) return null

        assignedDriver = x.driverId

          await prisma.driver.update({
            where: {id: assignedDriver},
            data: {
              // Solo ride takes the whole vehicle; a fresh sharing ride consumes one seat.
              vehicleCapacity: row.sharing ? x.driver.vehicleCapacity - 1 : 0
            }
          })

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