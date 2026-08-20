import 'dotenv/config'
import { prisma } from '../db/prisma.js'
import { normalizePhone } from '../lib/phone.js'

// Rides on the test captain's board, so Home has something to render.
//
// seed-captain.js makes a captain who can sign in; it gives him no work. Home
// reads two endpoints and needs a different row for each:
//
//   GET /driver/upcoming-ride  → the earliest `assigned` booking  (upcoming card)
//   GET /driver/rides          → ACTIVE_STATUSES, of which the app keeps
//                                en_route / reached / started      (active card)
//
// So one in-progress row and at least one assigned row, or one of the two panels
// stays on its empty state no matter how the app behaves.
//
//   node prisma/seed-captain-rides.js
//   CAPTAIN_PHONE=9876500001 node prisma/seed-captain-rides.js
//
// Re-runnable: fixed ids, and every scheduledAt is computed from the moment of
// the run, so a second run pushes the future rides back out in front of now.
//
// The ids read as counters but they are real v4 uuids, and the 4 and the 8 in the
// middle are the reason: zod's z.uuid() checks the version nibble (1-8) and the
// variant nibble (8/9/a/b), so the all-zero form these used to use parsed as a string
// and failed as a uuid. Everything that only ever LISTED these rows worked; the first
// route to validate an id in its params — GET /driver/rides/:id, which the captain
// app's detail screen calls — answered "Invalid booking id" for every fixture ride.
// Postgres accepts either, so nothing upstream ever complained.
//
// Keep the 4000-8000 middle on any id added here, and keep prisma/clean-bookings.js
// in step or db:clean will delete the row you just seeded.

const PHONE = process.env.CAPTAIN_PHONE || '9800000001'

// The rider these rides belong to. seed.js's test rider if it is there, since
// reusing it keeps one person's name on both sides of the app; otherwise a
// fixture rider of our own — a booking cannot exist without a user row.
const RIDER_PHONE = '9876543210'
const FIXTURE_RIDER = {
  clerkId:     'user_fixture_captain_rides',
  phone:       RIDER_PHONE,
  name:        'Test Rider',
  bookingCode: '4243',
}

const minutes = (n) => new Date(Date.now() + n * 60 * 1000)

// The fixture's reference, derived from the tail of its fixed uuid rather than
// written out per ride — the two then cannot drift apart when a ride is added.
//
// Real bookings draw a random one (lib/bookingReference.js); a fixture must not,
// because a fresh reference on every run would upsert the same row under a new
// code and leave whatever support was quoting pointing at nothing. RCS9xxxxxx is
// reserved for seeds, so a fixture ride is recognisable as one on sight.
const referenceFor = (id) => `RCS9${id.slice(-6)}`

// Fares are quoted per class off the hatchback price, the way rideEstimate's
// CLASS_FROM_HATCHBACK does it, so the numbers stay plausible whichever class
// the captain was seeded with. Not imported — that constant is private, and a
// fixture copying four ratios is cheaper than widening its API.
const FROM_HATCHBACK = {
  hatchback:   (fare) => fare,
  sedan:       (fare) => fare + 100,
  suv:         (fare) => fare * 1.6,
  suv_premium: (fare) => fare * 2.75,
}

const fareFor = (vehicleClass, hatchbackFare) => {
  const derive = FROM_HATCHBACK[vehicleClass]
  if (!derive) throw new Error(`No fare rule for vehicle class "${vehicleClass}"`)
  return Math.round(derive(hatchbackFare) / 50) * 50
}

// Commission is 5% of the ride fare, and only once that fare reaches ₹800 —
// services/commission.js. Copied for the same reason the fare ratios above are: a
// fixture reproducing two constants is cheaper than exporting them to a seed.
const COMMISSION_PCT = 5
const COMMISSION_MIN_FARE = 800

const commissionOn = (rideFare) =>
  rideFare >= COMMISSION_MIN_FARE
    ? { pct: COMMISSION_PCT, amt: Math.round((rideFare * COMMISSION_PCT) / 100) }
    : { pct: 0, amt: 0 }

// Between them these cover every branch the card draws: the active chip, a null
// scheduledAt ("Immediate pickup"), a dated one, `Sharing`, and `Outstation`.
// Base fares are the hatchback column of seed.js's fare table.
const rides = [
  {
    id: '00000000-0000-4000-8000-000000000011',
    label: 'active card — on the way to pickup',
    status: 'en_route',
    // Null on purpose: this is a ride booked for now, and it is the only fixture
    // that renders the card's "Immediate pickup" line.
    scheduledIn: null,
    baseFare: 550, distanceKm: 24.8,
    pickupAddress: 'Shiv Nadar University, Dadri, Greater Noida',
    pickupLat: 28.5240, pickupLng: 77.5750,
    dropAddress: 'Sector 18, Noida, Uttar Pradesh',
    dropLat: 28.5708, dropLng: 77.3260,
    confirmedAtOffset: -70,
  },
  {
    id: '00000000-0000-4000-8000-000000000012',
    label: 'upcoming card — the earliest assigned, so this is the one Home shows',
    status: 'assigned',
    scheduledIn: 150,
    baseFare: 550, distanceKm: 62.3,
    pickupAddress: 'Shiv Nadar University, Dadri, Greater Noida',
    pickupLat: 28.5240, pickupLng: 77.5750,
    dropAddress: 'IGI Airport Terminal 3, New Delhi',
    dropLat: 28.5562, dropLng: 77.1000,
    confirmedAtOffset: -30,
  },
  {
    id: '00000000-0000-4000-8000-000000000013',
    label: 'queued behind it — shared ride, for the "Sharing" chip',
    status: 'assigned',
    scheduledIn: 430,
    baseFare: 625, distanceKm: 38.1,
    sharing: true,
    pickupAddress: 'Pari Chowk, Greater Noida',
    pickupLat: 28.4650, pickupLng: 77.5030,
    dropAddress: 'Botanical Garden Metro, Noida',
    dropLat: 28.5644, dropLng: 77.3340,
    confirmedAtOffset: -25,
  },
  {
    id: '00000000-0000-4000-8000-000000000014',
    label: 'queued behind it — outstation + carrier, for the "Outstation" chip',
    status: 'assigned',
    scheduledIn: 1140,
    baseFare: 3750, distanceKm: 210.5,
    isOutstation: true,
    needsCarrier: true,
    pickupAddress: 'Shiv Nadar University, Dadri, Greater Noida',
    pickupLat: 28.5240, pickupLng: 77.5750,
    dropAddress: 'Taj Mahal East Gate, Agra',
    dropLat: 27.1751, dropLng: 78.0421,
    confirmedAtOffset: -20,
  },

  // Below here is the Rides page's History tab, which the four above leave empty —
  // they are all live, and history is the two terminal statuses. Between them these
  // four cover every branch of the expanded row: a real measured duration, a fare
  // over the commission threshold and one under it, pass-through add-ons, and both
  // cancellation outcomes (charged and not).
  {
    id: '00000000-0000-4000-8000-000000000015',
    label: 'history — completed, over the commission floor, add-ons on top',
    status: 'completed',
    scheduledIn: -1440,          // yesterday
    baseFare: 900, distanceKm: 58.2,
    needsCarrier: true,
    // Priced above the ride fare, so `fare - rideFare` has something to recover and
    // the breakdown draws its "Tolls & extras" line.
    addOns: 260,
    // 71 minutes of driving, so the row shows a measured "1h 11m" rather than the
    // app's own distance estimate.
    startedOffset: -1435, completedOffset: -1364,
    pickupAddress: 'Shiv Nadar University, Dadri, Greater Noida',
    pickupLat: 28.5240, pickupLng: 77.5750,
    dropAddress: 'IGI Airport Terminal 3, New Delhi',
    dropLat: 28.5562, dropLng: 77.1000,
    confirmedAtOffset: -1500,
    // A rating, so the Account screen's star pill has an average to draw. Only a
    // COMPLETED ride may carry one — DriverReview.bookingId is unique and a review
    // belongs to a trip that happened.
    rating: 5, comment: 'Very smooth drive, helped with the bags.',
  },
  {
    id: '00000000-0000-4000-8000-000000000016',
    label: 'history — completed, under the commission floor, so the captain keeps it all',
    status: 'completed',
    scheduledIn: -300,
    baseFare: 400, distanceKm: 12.4,
    startedOffset: -295, completedOffset: -267,
    pickupAddress: 'Sector 62, Noida',
    pickupLat: 28.6270, pickupLng: 77.3720,
    dropAddress: 'Connaught Place, New Delhi',
    dropLat: 28.6315, dropLng: 77.2167,
    confirmedAtOffset: -340,
    // Deliberately not another 5. Two identical scores average to a whole number and
    // would hide whether the screen formats its decimals at all.
    rating: 4, comment: 'Good trip, arrived a few minutes late.',
  },
  {
    id: '00000000-0000-4000-8000-000000000017',
    label: 'history — cancelled within 500 m of pickup, so the 15% advance is retained',
    status: 'cancelled',
    scheduledIn: -2880,
    baseFare: 625, distanceKm: 38.1,
    cancelledBy: 'user',
    // The scheduled advance retained once the driver is within the pickup
    // geofence (routes/bookings.js). Computed at run, off the fare.
    cancellationPct: 15,
    pickupAddress: 'Pari Chowk, Greater Noida',
    pickupLat: 28.4650, pickupLng: 77.5030,
    dropAddress: 'Kashmere Gate ISBT, Delhi',
    dropLat: 28.6670, dropLng: 77.2280,
    confirmedAtOffset: -2940,
  },
  {
    id: '00000000-0000-4000-8000-000000000018',
    label: 'history — cancelled early, nothing owed either way',
    status: 'cancelled',
    scheduledIn: -4320,
    baseFare: 550, distanceKm: 24.8,
    cancelledBy: 'user',
    pickupAddress: 'Shiv Nadar University, Dadri, Greater Noida',
    pickupLat: 28.5240, pickupLng: 77.5750,
    dropAddress: 'Botanical Garden Metro, Noida',
    dropLat: 28.5644, dropLng: 77.3340,
    confirmedAtOffset: -4380,
  },
]

async function resolveRider() {
  const existing = await prisma.user.findUnique({ where: { phone: RIDER_PHONE } })
  if (existing) return existing

  return prisma.user.upsert({
    where:  { clerkId: FIXTURE_RIDER.clerkId },
    update: {},
    create: FIXTURE_RIDER,
  })
}

async function main() {
  const phone = normalizePhone(PHONE)
  if (!phone) throw new Error(`CAPTAIN_PHONE must be a 10-digit number — got "${PHONE}"`)

  const driver = await prisma.driver.findUnique({ where: { phone } })
  if (!driver) {
    throw new Error(
      `No driver on ${phone}. Run prisma/seed-captain.js first — these rides ` +
      'have to hang off a captain you can sign in as.'
    )
  }

  const rider = await resolveRider()
  console.log(`Rider  ${rider.name} (${rider.phone}) @ ${rider.id}`)
  console.log(`Captain ${driver.name} (${driver.vehicleClass}) @ ${driver.id}\n`)

  for (const r of rides) {
    const {
      id, label, status, scheduledIn, baseFare, distanceKm, confirmedAtOffset,
      sharing = false, isOutstation = false, needsCarrier = false,
      pickupAddress, pickupLat, pickupLng, dropAddress, dropLat, dropLng,
      addOns = 0, startedOffset, completedOffset, cancelledBy, cancellationPct,
      rating, comment,
    } = r

    // The ride's own share of the money, before the pass-through charges are added
    // on top. Commission is a percentage of THIS, never of the total — a toll the
    // captain hands over at the barrier is not revenue anyone takes a cut of.
    const rideFare = fareFor(driver.vehicleClass, baseFare)
    const fare = rideFare + addOns
    const scheduledAt = scheduledIn === null ? null : minutes(scheduledIn)
    const commission = commissionOn({ rideFare, couponAmount: 0 })

    const data = {
      id,
      reference:     referenceFor(id),
      userId:        rider.id,
      driverId:      driver.id,
      customerPhone: rider.phone,
      vehicleClass:  driver.vehicleClass,
      pickupAddress, pickupLat, pickupLng,
      dropAddress,   dropLat,   dropLng,
      scheduledAt,
      isOutstation,
      needsCarrier,
      sharing,
      distanceKm,
      fare,
      rideFare,
      commissionPct: commission.pct,
      commissionAmt: commission.amt,
      status,
      confirmedAt: minutes(confirmedAtOffset),
      createdAt:   minutes(confirmedAtOffset - 5),
      // Only the finished rides carry these. startedAt + completedAt together are
      // what give the Rides page a measured duration instead of an estimate, so a
      // completed fixture missing either would quietly test the wrong branch.
      startedAt:   startedOffset   === undefined ? null : minutes(startedOffset),
      completedAt: completedOffset === undefined ? null : minutes(completedOffset),
      cancelledBy: cancelledBy ?? null,
      cancellationCharge: cancellationPct ? Math.round((fare * cancellationPct) / 100) : null,
    }

    await prisma.booking.upsert({ where: { id }, update: data, create: data })

    // Upserted on the booking's unique key, so a re-run updates the one review that
    // ride is allowed rather than failing on it. Guarded on `completed` as well as on
    // `rating` being set: a rating on a cancelled fixture would create a review for a
    // trip that never happened, which the app would then average into the captain's
    // score.
    if (rating !== undefined && status === 'completed') {
      const review = {
        bookingId: id,
        driverId:  driver.id,
        userId:    rider.id,
        rating,
        comment:   comment ?? null,
      }
      await prisma.driverReview.upsert({
        where:  { bookingId: id },
        update: review,
        create: review,
      })
    }

    // Relative, not a clock time: every scheduledAt is measured from the run, so
    // "+2h30m" stays true whenever the script is run and "8pm" would not. The sign
    // is taken off the magnitude rather than out of the number — the history rides
    // are in the past, and % on a negative yields a negative remainder, so the
    // straightforward version printed them as "+-24h00m".
    const when = scheduledIn === null
      ? 'now'
      : `${scheduledIn < 0 ? '-' : '+'}${Math.floor(Math.abs(scheduledIn) / 60)}h` +
        `${String(Math.abs(scheduledIn) % 60).padStart(2, '0')}m`

    console.log(`  ${status.padEnd(9)} ${when.padEnd(8)} ₹${String(fare).padEnd(5)} ${label}`)
  }

  console.log('\nDone. Open Home in the driver app — the active card is the en_route')
  console.log('ride, the card under it is the earliest assigned one. Rides > Upcoming')
  console.log('lists the four live ones; Rides > History lists the four terminal ones.')
  console.log('\nNote: an active ride blocks PATCH /driver/online from going offline')
  console.log('(routes/driver.ts), so the toggle will 409 until this ride is cleared.')
  console.log('npm run db:clean keeps these eight; it deletes everything else.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
