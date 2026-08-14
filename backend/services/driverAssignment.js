import { prisma } from '../db/prisma.js'
import { Prisma } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import {sendFCM, sendPush, sendWhatsApp} from './notification.js'

/**
 * getDriver's answer when the ride has gone OUT to captains but nobody has taken
 * it yet — which, for ride-now, is now the ordinary outcome rather than an edge.
 *
 * Distinct from null, and that distinction is load-bearing: startAssignment
 * writes `no_driver` on null, so returning it here would kill a booking the
 * moment its offers were sent. A booking nobody answers is written off by the
 * lazy expiry in GET /bookings/:id instead, on ASSIGNMENT_DEADLINE_MS.
 */
export const OFFERED = 'offered'
import { seatsOf } from '../constants/vehicles.js'
import { LOCATION_STALE_AFTER_MS } from '../constants/dispatch.js'
import {
  evaluatePool, hostBookingOf, HOST_ACTIVE_STATUSES, POOLABLE_HOST_STATUSES, POOL_RADIUS_KM,
} from './ridePooling.js'

// `bearingDeg` and `inSameDirectionCorridor` were removed here. They were the
// old pooling test — do two drops leave the pickup within 45° of each other —
// and they only ever fed the pass that never ran. Two drops can share a bearing
// with a divided carriageway, a river or a one-way system between them, so the
// test is replaced rather than repaired: services/ridePooling.js projects points
// onto the road the driver is actually on (geo.js `projectOntoPath`) and then
// prices the detour in minutes against the routing API.

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
 *
 * `updated_at` is checked alongside `is_online` because the two make different
 * claims. Online is a switch he flipped; the timestamp is the last time his
 * phone actually said where it was. A captain whose battery died, who parked
 * under a building, or whose app the OS killed stays online forever and stays
 * frozen at his last fix — near the pickup, ranked first, and unable to answer.
 * See LOCATION_STALE_AFTER_MS: the cutoff is tied to the app's idle heartbeat
 * and neither number can move on its own.
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
    where: { id: { in: near.map((n) => n.driverId) } },
    include: {
      bookings: {
        where: { status: { in: HOST_ACTIVE_STATUSES } },
        // Everything services/ridePooling.js needs to judge a host, loaded here
        // because the alternative is a query per candidate inside the ranking
        // loop. `sharing` and `status` decide whether he can host at all;
        // `routePolyline` is the road a joiner's pickup is measured against; the
        // four coordinates build the stop sequence.
        select: {
          id: true, status: true, sharing: true,
          pickupLat: true, pickupLng: true,
          dropLat: true, dropLng: true,
          routePolyline: true,
        },
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
 * @returns {Promise<'claimed' | 'booking_taken' | 'no_room' | 'host_moved_on'>}
 *
 * `host_moved_on` can only come back when `onClaimed` is the pooling hook — it
 * is that hook's ClaimFailure surfacing through the same catch as the other two.
 * Callers that pass no hook, or a hook that never throws, will never see it.
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

/**
 * Bind a joiner to its host: one share group, and the stop order on both rows.
 *
 * RUNS INSIDE claimBookingForDriver'S TRANSACTION, via its onClaimed hook, so
 * the assignment and the sequence land together or not at all. A booking
 * assigned to a pooling driver but carrying no orders would be a rider the
 * driver app cannot place in the trip.
 *
 * THE RACE THIS EXISTS FOR. Between evaluatePool routing the sequence and this
 * running, the host can finish, be cancelled, or be joined by a different rider
 * — several seconds pass, most of them waiting on Google and on a push. The
 * sequence computed upstream describes a car that may no longer be in that
 * state, so every assumption it rested on is re-asserted here against live rows,
 * as conditional writes rather than as reads followed by decisions.
 *
 * The group is minted ON JOIN, not at booking time. A shared ride nobody joins
 * never gets an id, which is what keeps `shareGroupId IS NOT NULL` meaning
 * "actually pooled" rather than "asked to be".
 */
async function joinPool(tx, { host, joiner, orders }) {
  const live = await tx.booking.findUnique({
    where: { id: host.id },
    select: { status: true, shareGroupId: true },
  })

  // He finished, was cancelled, or reached the kerb while we were deciding.
  if (!live || !POOLABLE_HOST_STATUSES.includes(live.status)) throw new ClaimFailure('host_moved_on')

  // Already carrying a group id means somebody else got there first — the seat
  // arithmetic would also catch that, but only after this row had been written.
  //
  // KNOWN LIMITATION, and it is this branch: a host whose earlier co-rider has
  // since been dropped still carries that group id, so a third rider cannot join
  // him even though the car has room. Fixing it means either re-using a group
  // that contains a completed stranger — who would then show up as a co-rider on
  // the admin panel — or moving to a Trip entity. Refusing is the honest
  // behaviour until MAX_BOOKINGS_PER_VEHICLE moves off 2.
  if (live.shareGroupId) throw new ClaimFailure('host_moved_on')

  const groupId = randomUUID()

  // Guarded on the id still being null rather than trusting the read above: two
  // joiners reaching this line concurrently must not mint two groups for one car.
  const { count } = await tx.booking.updateMany({
    where: { id: host.id, shareGroupId: null },
    data: {
      shareGroupId: groupId,
      pickupOrder: orders.host.pickupOrder,
      dropOrder: orders.host.dropOrder,
    },
  })
  if (count === 0) throw new ClaimFailure('host_moved_on')

  await tx.booking.update({
    where: { id: joiner.id },
    data: {
      shareGroupId: groupId,
      pickupOrder: orders.joiner.pickupOrder,
      dropOrder: orders.joiner.dropOrder,
    },
  })
}

export async function getDriver(bookingId) {
  let assignedDriver = null

  const row = await prisma.booking.findFirst({ where: { id: bookingId } })
  if (!row) return null

  const triedDriverIds = new Set()
  // How many captains have been sent this ride in the ring being walked. Non-zero
  // means the search is over as far as this function is concerned: the answer is
  // theirs to give, not ours to invent.
  let offered = 0

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
    

    // PASS 1 — join a trip somebody is already on.
    //
    // The two passes iterate DISJOINT sets: a driver either holds a poolable
    // active booking (hostBookingOf returns it) or he does not (he is fresh).
    // That is what guarantees the property the old code could not — no driver is
    // ever pushed the same booking twice — and it holds by construction rather
    // than by remembering to filter, which is why the partition is worth more
    // than sorting a pool flag to the front of one list.
    //
    // This replaces a pass that never ran: it filtered on `loc.sharing`, a column
    // DriverLocation does not have, so it read `undefined === true` on every row
    // and matched nobody. Every sharing rider fell through to pass 2 and started
    // a fresh shared trip, which is why no two riders have ever pooled.
    const hosts = row.sharing
      ? sorted
          .filter((x) => x.distanceKm <= POOL_RADIUS_KM)
          .map((x) => ({ x, host: hostBookingOf(x.driver) }))
          .filter((c) => c.host)
      : []

    for (const { x, host } of hosts) {
      // Deliberately NOT marked as tried here. Pass 2 iterates the complement of
      // this set, so it cannot reach him anyway, and a candidate rejected by the
      // geometry below was never offered anything — spending his turn on an
      // offer that was never sent would push him down the queue for nothing.
      if (x.driver.vehicleCapacity <= 0) continue

      // The expensive half: baseline plus one routing call per legal stop order,
      // constraints applied before any optimisation. Sharing-Design.md §4.
      let match
      try {
        match = await evaluatePool({
          driverPos: { lat: x.latitude, lng: x.longitude },
          host,
          joiner: row,
        })
      } catch (err) {
        // Routing is a network call to somebody else's service. A pool that
        // cannot be evaluated is simply not offered; the rider still gets a car
        // from pass 2.
        console.error(`pool evaluation failed for driver ${x.driverId}:`, err.message)
        continue
      }
      if (!match.ok) continue

      triedDriverIds.add(x.driverId)

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
          const claim = await claimBookingForDriver(
            row, x.driver, row.confirmedAt ?? new Date(),
            (tx) => joinPool(tx, { host, joiner: row, orders: match.orders }),
          )

          // The booking moved on while this ring was pinging — cancelled,
          // expired, or taken through the driver app. Nothing left to search for.
          if (claim === 'booking_taken') return null
          // His last seat went to another ride between the offer and the answer.
          // Only this candidate is out; the next one may still fit.
          if (claim === 'no_room') continue
          // The trip he was going to join ended, or was itself joined by
          // somebody else, between the routing call and the claim. The sequence
          // computed above describes a car that no longer exists.
          if (claim === 'host_moved_on') continue

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
    
     
    // PASS 2 — seed a new trip on an idle vehicle.
    //
    // Idle means carrying NOTHING, which is stricter than "has a free seat" and
    // deliberately so. A driver already carrying a shared rider can only take
    // this booking through pass 1, where a stop sequence is computed for him;
    // reaching him here would hand him a second rider with no sequence at all,
    // which is precisely the bug the dead pass left behind. It also correctly
    // excludes a host whose geometry failed above, and one sitting at `reached`.
    //
    // Nothing changes for solo bookings: those already required a fully free
    // vehicle, and a fully free vehicle is one with no active bookings.
    //
    // This is also what makes the two passes disjoint, so no driver is pushed
    // the same booking twice.
    for (const x of sorted.filter((c) => (c.driver.bookings ?? []).length === 0)) {
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

      // AN OFFER HE ANSWERS, not an answer invented for him.
      //
      // This used to call sendFCM and assign the ride on its return value.
      // sendFCM is a stub that waits 30 seconds and returns a coin flip — with
      // FCM_ALWAYS_ACCEPT it does not even wait — so a ride-now booking landed on
      // a captain fully assigned, with no notification and nothing to accept or
      // decline. He found out he had a ride by noticing one.
      //
      // A row and a push instead. Everything that answers it already exists and
      // is the same machinery the scheduled path uses: GET /driver/offers reads
      // these rows, the card and the notification page render them, and PATCH
      // /driver/offers/:id/accept settles the race through claimBookingForDriver.
      //
      // WHY THE WHOLE RING RATHER THAN ONE DRIVER AT A TIME. The old loop offered
      // to one captain and waited 30 seconds before trying the next, which a
      // rider watching a spinner pays for. Broadcasting hands the ride to whoever
      // answers first — the same trade scheduledOffers already makes, for the
      // same reason, and claimBookingForDriver is what makes the race safe.
      await offerRideNow(row, x)
      offered += 1
    }

    // Somebody has been asked. Stop widening — a wider ring would offer the same
    // ride to drivers further away while the near ones are still deciding.
    if (offered > 0) return OFFERED
  }

  return null
}

/**
 * Put a ride-now booking on one captain's notification page and nudge his phone.
 *
 * Neither half is allowed to fail the search. The ROW is the offer — a captain
 * with a dead FCM token still finds the ride when he next opens the app — so a
 * push that does not send costs immediacy and nothing else. And the unique on
 * (bookingId, driverId) means a re-run of the ring quietly does nothing rather
 * than offering the same ride twice.
 */
async function offerRideNow(row, x) {
  try {
    await prisma.rideOffer.create({
      data: { bookingId: row.id, driverId: x.driverId, group: x.driver.group },
    })
  } catch {
    // Already offered to him. Nothing to do and nothing to report.
    return
  }

  // sendPush, not sendFCM: the real one. It takes the driver row, puts title and
  // body at the top level, and clears the token when Firebase says the install
  // is gone. `screen` is what usePushRegistration reads to route the tap.
  await sendPush(x.driver, {
    title: row.sharing ? 'New sharing ride' : 'New ride',
    body: `${row.pickupAddress} → ${row.dropAddress} · ₹${row.fare}`,
    data: { screen: 'notifications', bookingId: row.id },
  }).catch(() => {})
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
    // OFFERED is not a failure and must not be written off. The ride is sitting
    // on captains' phones waiting to be accepted; the booking stays `pending`
    // until one of them takes it, or until the lazy expiry in GET /bookings/:id
    // gives up on it at ASSIGNMENT_DEADLINE_MS. Treating it as null here would
    // mark `no_driver` in the same tick the notifications went out.
    .then(result => (result ? null : markNoDriver(bookingId)))
    .catch(async err => {
      console.error(`driver assignment failed for booking ${bookingId}:`, err)
      await markNoDriver(bookingId).catch(() => {})
    })
}