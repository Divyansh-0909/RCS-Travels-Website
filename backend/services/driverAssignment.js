import { prisma } from '../db/prisma.js'
import { randomUUID } from 'node:crypto'
import { notifyWhatsAppNoDriver, notifyWhatsAppRideStatus, notifyWhatsAppPoolJoined } from './notification.js'

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
import {
  evaluatePool, hostBookingOf, POOLABLE_HOST_STATUSES, POOL_RADIUS_KM,
} from './ridePooling.js'
import {
  candidatesWithin,
  markOffered,
  offerRideNow,
  rankCandidates,
} from './driverDispatchCandidates.js'
export { FAIRNESS_TIER_KM } from './driverDispatchCandidates.js'

/** @type {import('@prisma/client').BookingStatus[]} */
export const ASSIGNABLE_STATUSES = ['pending', 'confirmed']

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
    const result = await prisma.$transaction(async (tx) => {
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
    if (result === 'claimed') {
      // The guarded assignment above is the idempotency boundary. Notifications
      // happen only for the caller that actually moved the row to assigned.
      try {
        await notifyWhatsAppRideStatus(booking.id, 'assigned')
        if (booking.sharing) await notifyWhatsAppPoolJoined(booking.id)
      } catch (err) {
        console.error(`WhatsApp assignment notification failed for ${booking.id}:`, err.message)
      }
    }
    return result
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
export async function joinPool(tx, { host, joiner, orders }) {
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

    const sorted = rankCandidates(candidates)
    
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

        await offerRideNow(row, x, host.id)
        offered += 1
      }

    // Prefer filling an existing car. Do not also offer the same rider to idle
    // captains while the compatible host is deciding.
    if (offered > 0) return OFFERED
    
     
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
  if (count > 0) await notifyWhatsAppNoDriver(bookingId).catch(() => {})
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
