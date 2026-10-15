import { evaluatePool, hostBookingOf, POOL_RADIUS_KM } from './ridePooling.js'
import { seatsOf } from '../constants/vehicles.js'
import { markOffered, offerRideNow } from './driverDispatchCandidates.js'

export async function offerPoolCandidates(row, sorted, triedDriverIds, { db, clock, push, route }) {
  let offered = 0
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
        }, { route })
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
        await markOffered(x.driverId, clock.now(), { db })

        await offerRideNow(row, x, host.id, { db, push })
        offered += 1
      }

  return offered
}

export async function offerIdleCandidates(row, sorted, triedDriverIds, { db, clock, push }) {
  let offered = 0
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
      await markOffered(x.driverId, clock.now(), { db })

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
      await offerRideNow(row, x, null, { db, push })
      offered += 1
    }

  return offered
}
