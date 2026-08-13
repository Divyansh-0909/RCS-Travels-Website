import { prisma } from '../db/prisma.js'
import { sendPush } from './notification.js'
import { seatsOf } from '../constants/vehicles.js'
import { eligibleGroup } from '../constants/dispatch.js'

// Offers for SCHEDULED rides. Ride-now keeps the synchronous path in
// driverAssignment.js — a rider watching a spinner needs an answer in seconds,
// and that path already gives one.
//
// A scheduled ride cannot work that way. It may be a day out, its drivers may be
// offline when it is offered, and the spec requires them to receive it anyway and
// accept once they come online. So the offer is a ROW: created here, answered
// later through the driver app, and left sitting `pending` on the notification
// page in between.

/** @type {import('@prisma/client').BookingStatus[]} */
const OFFERABLE_STATUSES = ['confirmed']

/**
 * Eligible drivers for a scheduled booking, in one priority group.
 *
 * ONLINE STATUS IS NOT CHECKED, and that is the point of this whole file: the
 * spec says offline drivers receive scheduled offers and simply cannot accept
 * until they come online. The accept endpoint enforces that, not the query.
 *
 * Suspension and approval ARE checked — a suspended driver receives nothing.
 */
async function candidatesIn(booking, group) {
  return prisma.driver.findMany({
    where: {
      group,
      isActive: true,
      verificationStatus: 'approved',
      suspendedAt: null,
      // Matched exactly, never widened — the rider was quoted for this car.
      vehicleClass: booking.vehicleClass,
      // Nobody who already holds an offer for this booking, whatever they did
      // with it. Re-offering a ride a driver already rejected is how a 5-minute
      // sweep turns into harassment.
      offers: { none: { bookingId: booking.id } },
    },
    select: {
      id: true,
      fcmToken: true,
      vehicleClass: true,
      vehicleCapacity: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  })
}

/** Room for this ride: a solo ride needs the whole vehicle, a shared one a seat. */
function hasRoom(driver, booking) {
  const seats = seatsOf(driver.vehicleClass)
  return booking.sharing ? driver.vehicleCapacity > 0 : seats !== null && driver.vehicleCapacity >= seats
}

/**
 * Create offers for whichever group this booking has reached, and push a
 * notification to each driver.
 *
 * Idempotent by construction: `@@unique([bookingId, driverId])` plus the
 * `offers: { none: ... }` filter above mean a re-run creates nothing. That
 * matters because the sweep runs every 5 minutes forever, and because two sweeps
 * can still overlap.
 *
 * @returns {Promise<number>} how many new offers went out
 */
export async function offerScheduledRide(bookingId) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } })
  if (!booking || !OFFERABLE_STATUSES.includes(booking.status) || booking.driverId) return 0
  if (!booking.scheduledAt) return 0

  const offers = await prisma.rideOffer.groupBy({
    by: ['status'],
    where: { bookingId, group: 'rcs' },
    _count: true,
  })
  const rcsOffered = offers.reduce((n, row) => n + row._count, 0)
  // Withdrawn counts with rejected: both are offers that can never turn into an
  // acceptance, which is the only question the escalation test is asking. See
  // eligibleGroup — treating a suspended captain's withdrawn row as outstanding
  // pins the booking to `rcs` permanently.
  const rcsResolved = offers
    .filter((row) => row.status === 'rejected' || row.status === 'withdrawn')
    .reduce((n, row) => n + row._count, 0)

  const group = eligibleGroup(booking, { rcsOffered, rcsResolved })

  const drivers = (await candidatesIn(booking, group)).filter((d) => hasRoom(d, booking))
  if (drivers.length === 0) return 0

  // createMany rather than a row at a time: the sweep is a background job and a
  // partial failure here would leave a booking half-offered.
  const { count } = await prisma.rideOffer.createMany({
    data: drivers.map((d) => ({ bookingId, driverId: d.id, group })),
    skipDuplicates: true,
  })

  // Scheduled offers count towards the same queue the ride-now sort reads, or a
  // driver who is being fed scheduled work all day would still rank as the
  // longest-waiting captain the moment somebody books on the spot. Every driver
  // in `drivers` is receiving a new offer — the query already excluded anyone
  // holding one for this booking — so they all move together.
  //
  // A broadcast marks the whole group at once, which is honest about what this
  // path does: it offers the ride to everybody and lets them race for it. The
  // fairness key can record that; it cannot fix it. See the note in
  // constants/dispatch.js on why the race exists.
  await prisma.driver.updateMany({
    where: { id: { in: drivers.map((d) => d.id) } },
    data: { lastOfferedAt: new Date() },
  })

  const pickupTimeLabel = new Date(booking.scheduledAt).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  // Fire and forget, deliberately. The row is the offer; the push is only a
  // nudge towards it. A driver with a dead FCM token still sees this on his
  // notification page, which is exactly what the persisted offer is for — so a
  // failed send must never block or fail the sweep.
  //
  // sendPush, NOT sendFCM. sendFCM is the stub whose boolean means "the driver
  // accepted", and it delivers nothing — every scheduled offer since this sweep
  // was written has gone out as a console.log. sendPush is the real one: it
  // takes the driver row rather than the token, puts title and body at the top
  // level, stringifies `data` itself, and clears the token when Firebase says
  // the install is gone. driverAssignment.js keeps sendFCM, because that path
  // still reads the answer out of the return value.
  for (const d of drivers) {
    sendPush(d, {
      title: `New scheduled ride — ${pickupTimeLabel}`,
      body: `${booking.pickupAddress} → ${booking.dropAddress} · ₹${booking.fare}`,
      // ROUTING ONLY, not a copy of the booking. The app refetches GET /offers
      // when this lands, so anything duplicated here is a second version of the
      // same ride that can disagree with the list — and `screen` is what
      // usePushRegistration reads to decide where a tap goes. Without it the
      // notification opens the app and drops him wherever he was.
      data: { screen: 'notifications', bookingId: booking.id },
      // Still no customerPhone. The rider's number is released on accept, by the
      // accept endpoint — an offer is not an assignment.
    }).catch(() => {})
  }

  return count
}

/**
 * Take every other pending offer off the board once a booking is settled.
 *
 * This is the spec's "if another driver receives the ride, the notification
 * automatically disappears". Also the cancellation path: a cancelled ride must
 * not leave live offers on anyone's page.
 *
 * @param {string} bookingId
 * @param {string | null} [keepDriverId] the driver who won it, left untouched;
 *        omit to withdraw every offer, which is the cancellation case.
 * @param {typeof prisma | import('@prisma/client').Prisma.TransactionClient} [client]
 *        the accept path passes its transaction: the winner's assignment and
 *        everyone else's card disappearing have to land together, or a crash in
 *        between leaves an assigned ride still tappable on four other phones.
 */
export async function withdrawOtherOffers(bookingId, keepDriverId = null, client = prisma) {
  const { count } = await client.rideOffer.updateMany({
    where: {
      bookingId,
      status: 'pending',
      ...(keepDriverId ? { driverId: { not: keepDriverId } } : {}),
    },
    data: { status: 'withdrawn', respondedAt: new Date() },
  })
  return count
}

/**
 * Drop a suspended driver's live offers and push those bookings back into the
 * pool. His spec is explicit: a suspended driver loses all pending scheduled
 * offers and those rides immediately restart assignment.
 *
 * Restarting is implicit rather than a call — the next sweep finds the booking
 * still `confirmed` and unassigned, and offerScheduledRide re-reads the board.
 * What makes that actually reach somebody is that a `withdrawn` offer counts as
 * RESOLVED in the escalation test above: left as an unanswered `pending` row it
 * would hold the booking at `rcs` forever, because an unanswered offer is
 * deliberately not a rejection. A suspended captain is not still deciding.
 *
 * NOT UNDONE when the suspension is lifted, and it must not be: by then the ride
 * has been offered to other drivers, and restoring his row would put a second
 * live claim on a booking somebody else may already hold. He is eligible again
 * from the next sweep, which is the right amount of "back on the road".
 *
 * ONLY `pending` OFFERS. An offer he already ACCEPTED is an assignment, and
 * unpicking that means restoring vehicle capacity and re-dispatching a booking
 * that has a driver — see the note in routes/admin.ts.
 *
 * @param {string} driverId
 * @param {typeof prisma | import('@prisma/client').Prisma.TransactionClient} [client]
 *        the suspension path passes its transaction, so a captain is never
 *        suspended in a commit that leaves his offers live.
 */
export async function withdrawOffersForDriver(driverId, client = prisma) {
  const { count } = await client.rideOffer.updateMany({
    where: { driverId, status: 'pending' },
    data: { status: 'withdrawn', respondedAt: new Date() },
  })
  return count
}
