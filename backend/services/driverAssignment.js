import { prisma } from '../db/prisma.js'
import { Prisma } from '@prisma/client'
import {sendFCM, sendWhatsApp} from './notification.js'
import { seatsOf } from '../constants/vehicles.js'

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

// THE ONE PLACE A { lat, lng } PAIR BECOMES A POSTGIS VALUE.
//
// ST_MakePoint takes (x, y) — LONGITUDE FIRST. That is the same disagreement
// services/geo.js has a header comment about, and it is silent when written
// backwards: a pickup in NCR is lat 28, lng 77, and both are legal latitudes, so
// a reversed pair does not error. It searches empty ocean off Somalia and every
// booking comes back `no_driver`. Building the value here, once, is that file's
// defence applied to SQL — no query below states an order, so none can state it
// wrong.
//
// Every PostGIS name is schema-qualified because that is where Supabase installs
// the extension. Unqualified calls would resolve in production, where Supabase
// puts `extensions` on the role's search_path, and then fail on a plain local
// Postgres where it is not.
const geographyOf = (lat, lng) =>
  Prisma.sql`extensions.ST_SetSRID(extensions.ST_MakePoint(${lng}::float8, ${lat}::float8), 4326)::extensions.geography`

/**
 * Every dispatchable driver within `radiusKm` of the booking's pickup, each
 * carrying the distance that ranks him and the active bookings the sharing pass
 * reads. Drivers already offered this ride are excluded.
 *
 * WHY THIS IS TWO QUERIES. The first is the geography one and has to be raw:
 * `geog` is `Unsupported` in the Prisma schema, so ST_DWithin — the whole point
 * of the GiST index — is unreachable through the query builder. It returns ids
 * and distances only. The second is an ordinary Prisma read that hydrates those
 * ids with their relations, which keeps the nested `bookings` include typed and
 * keeps a hand-written join out of a function that would otherwise have to
 * reassemble one driver's rows from many.
 *
 * The radius filter is now the DATABASE's. It used to be a bounding box here
 * plus a haversine re-measure in JS, which had to over-fetch: a square around a
 * circle is ~27% larger than the circle, and every row in the corners was loaded
 * with all its relations only to be dropped. ST_DWithin asks for the circle.
 */
async function candidatesWithin(row, radiusKm, triedDriverIds) {
  const origin = geographyOf(row.pickupLat, row.pickupLng)

  // `use_spheroid = false` on both calls, and not only because the sphere is the
  // cheaper of the two. It is what the haversine this replaced computed, so the
  // numbers below land in the same FAIRNESS_TIER_KM bands they used to — a
  // switch to spheroid distances would silently re-rank every driver sitting
  // near a 3 km boundary.
  const near = await prisma.$queryRaw`
    SELECT dl."driver_id" AS "driverId",
           dl."latitude"  AS "latitude",
           dl."longitude" AS "longitude",
           extensions.ST_Distance(dl."geog", ${origin}, false) / 1000 AS "distanceKm"
    FROM "driver_locations" dl
    JOIN "drivers" d ON d."id" = dl."driver_id"
    WHERE extensions.ST_DWithin(dl."geog", ${origin}, ${radiusKm * 1000}::float8, false)
      AND d."is_online"
      AND d."is_active"
      AND d."suspended_at" IS NULL
      AND d."verification_status" = 'approved'
      AND d."vehicle_class" = ${row.vehicleClass}::"VehicleClass"
      AND NOT (dl."driver_id" = ANY(${[...triedDriverIds]}::text[]))
  `

  if (near.length === 0) return []

  const drivers = await prisma.driver.findMany({
    where: { id: { in: near.map((n) => n.driverId) } },
    include: {
      bookings: {
        where: { status: { in: ['assigned', 'en_route', 'reached', 'started'] } },
        select: { id: true, dropLat: true, dropLng: true },
      },
    },
  })
  const byId = new Map(drivers.map((d) => [d.id, d]))

  // No ordering here: the comparator in getDriver ranks by group, then distance
  // band, then whose turn it is, and would only have to undo one imposed by SQL.
  // The filter is for the driver deleted between the two queries — a row that
  // cannot be offered anything and would blow up the sort on `driver.group`.
  return near
    .map((n) => ({ ...n, driver: byId.get(n.driverId) }))
    .filter((c) => c.driver)
}

/** @type {import('@prisma/client').BookingStatus[]} */
export const ASSIGNABLE_STATUSES = ['pending', 'confirmed']
const GROUP_RANK = { admin: 0, rcs: 1, partner: 2 }
const rankOf = (group) => GROUP_RANK[group] ?? GROUP_RANK.partner

/**
 * How close two drivers have to be before the fairness key outranks distance.
 *
 * Sorting on raw distance concentrates every ride on one driver — see the
 * comment on Driver.lastOfferedAt. Sorting on fairness alone is the opposite
 * mistake: it would send a rider the driver 18 km away because it was his turn.
 * The tier is the compromise. Inside one 3 km band the difference is a couple of
 * minutes of approach and the queue decides; across bands distance still wins
 * outright, so a driver at 2 km always beats one at 9 km however long he has
 * been waiting.
 *
 * 3 km is roughly campus-and-its-immediate-surroundings, which is the radius the
 * whole fleet actually sits in. Widen it and genuinely distant drivers start
 * winning rides; narrow it and the bands stop containing more than one driver,
 * which is just the old behaviour with extra arithmetic.
 */
export const FAIRNESS_TIER_KM = 3
const tierOf = (km) => Math.floor(km / FAIRNESS_TIER_KM)

/**
 * Position in the queue: least-recently-offered first. A driver who has never
 * been offered anything goes to the very front, which is what makes a new
 * captain's first ride arrive quickly instead of after the incumbents have had
 * their turn.
 */
const turnKey = (driver) => (driver.lastOfferedAt ? new Date(driver.lastOfferedAt).getTime() : 0)

/**
 * Record that this driver has had his turn, whatever he does with it.
 *
 * CALLED BEFORE THE PUSH, NOT AFTER. sendFCM waits 30 seconds for an answer, and
 * two bookings created inside that window run their searches concurrently: if the
 * mark landed after the answer, both would sort the same driver to the front and
 * offer him both rides while the queue still showed him as waiting. Writing it
 * first costs nothing and closes that window.
 *
 * A rejection and a silence both count as a turn taken. They are the same event
 * from here — sendFCM's boolean cannot tell "no thanks" from "phone in a pocket"
 * — and treating silence as no turn at all would let an unresponsive driver sit
 * at the head of the queue forever, delaying every ride by one dead offer.
 */
async function markOffered(driverId, at = new Date()) {
  try {
    await prisma.driver.update({ where: { id: driverId }, data: { lastOfferedAt: at } })
  } catch (err) {
    // Never fail a dispatch over bookkeeping — a rider waiting on a spinner
    // cares more about getting a car than about the queue staying tidy.
    console.error(`could not mark driver ${driverId} as offered:`, err)
  }
}

class ClaimFailure extends Error {
  constructor(reason) {
    super(reason)
    this.reason = reason
  }
}

/**
 * @param {{ id: string, sharing: boolean }} booking
 * @param {{ id: string, vehicleClass: string, vehicleNumber?: string, vehicleModel?: string | null }} driver
 * @param {Date} confirmedAt
 * @param {(tx: import('@prisma/client').Prisma.TransactionClient) => Promise<void>} [onClaimed]
 * @returns {Promise<'claimed' | 'booking_taken' | 'no_room'>}
 */
export async function claimBookingForDriver(booking, driver, confirmedAt, onClaimed) {
  const seats = seatsOf(driver.vehicleClass)
  if (!booking.sharing && seats === null) return 'no_room'

  const now = new Date()

  try {
    return await prisma.$transaction(async (tx) => {
      const claimed = await tx.booking.updateMany({
        where: { id: booking.id, status: { in: ASSIGNABLE_STATUSES } },
        // THE CAR IS SNAPSHOTTED HERE, in the same statement that assigns the
        // ride. A captain owns several cars and switches between them, so reading
        // it back through the `driver` relation later would show every past ride
        // as having been done in whichever car he is sitting in today — and a
        // rider disputing "the car that picked me up was DL01AB1234" would be
        // arguing against a column that had quietly changed under him.
        //
        // Plate AND model together, never one without the other: they are printed
        // as one line on the rider's receipt, and a pair where only half is frozen
        // would eventually read "DL01AB1234 · Innova Crysta" about a Dzire.
        data: {
          status: 'assigned',
          driverId: driver.id,
          vehicleNumber: driver.vehicleNumber ?? null,
          vehicleModel: driver.vehicleModel ?? null,
          confirmedAt,
        },
      })
      if (claimed.count === 0) throw new ClaimFailure('booking_taken')

      const seated = await tx.driver.updateMany({
        where: {
          id: driver.id,
          vehicleCapacity: booking.sharing ? { gt: 0 } : { gte: seats },
        },
        data: {
          vehicleCapacity: booking.sharing ? { decrement: 1 } : 0,
          // The fairness stamps ride along in the same statement that takes the
          // seats, because this function is the ONLY way a booking is ever
          // assigned — ride-now and the scheduled accept endpoint both come
          // through here. Anywhere else and one of the two paths would quietly
          // stop counting.
          //
          // `now` rather than `confirmedAt`: a scheduled ride carries a
          // confirmation stamped when the RIDER booked it, possibly a day ago,
          // and dating the driver's turn from that would rank him as though he
          // had been waiting since then.
          lastAssignedAt: now,
          // An assignment implies the offer that produced it. The ride-now path
          // has already stamped this, but the accept endpoint has not — its
          // offer was written by the scheduled sweep, and a driver who takes a
          // ride has unquestionably had his turn.
          lastOfferedAt: now,
        },
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

    const candidates = await candidatesWithin(row, 20 + i, triedDriverIds)

    const sorted = candidates
      .sort((a, b) => {
        // Group first — see GROUP_RANK. Both passes below iterate this array, so
        // sorting here is what makes the sharing pass respect priority too.
        const byGroup = rankOf(a.driver.group) - rankOf(b.driver.group)
        if (byGroup !== 0) return byGroup

        // Then distance, but in 3 km bands rather than metre by metre, and then
        // whose turn it is within the band. Raw distance was the whole problem:
        // it is a stable ranking over a fleet that parks in fixed spots, so the
        // nearest driver to the gate won every booking forever. See
        // FAIRNESS_TIER_KM.
        const byTier = tierOf(a.distanceKm) - tierOf(b.distanceKm)
        if (byTier !== 0) return byTier

        const byTurn = turnKey(a.driver) - turnKey(b.driver)
        if (byTurn !== 0) return byTurn

        // Both waiting exactly as long — two drivers who have never been offered
        // anything, in practice. Distance and seniority settle it as before.
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

        // His turn is spent here, before the push rather than after the answer.
        await markOffered(x.driverId)

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

      // Same as pass 1: the turn is spent when the offer goes out, not when it
      // is answered. See markOffered.
      await markOffered(x.driverId)

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