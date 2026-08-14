import { Router } from 'express'
import { protect } from '../middleware/auth.js'
import { startAssignment, markNoDriver, ASSIGNMENT_DEADLINE_MS } from '../services/driverAssignment.js'
import { sendWhatsApp } from '../services/notification.js'
import { prisma } from '../db/prisma.js'
import { commissionOn, rideFareOf } from '../services/commission.js'
import { verifyQuote } from '../services/fareQuote.js'
import { myBookingsQuerySchema } from '../types.ts'
import { VEHICLE_CLASS_NAMES, isVehicleClass, seatsOf } from '../constants/vehicles.js'
import { createBooking, normalizeReference } from '../lib/bookingReference.js'
import { signedRiderPhotoUrl } from '../services/driverPhoto.js'
import { newShareToken, shareIsLive, shareUrlFor, SHARE_TTL_MS } from '../lib/shareLink.js'

const bookingsRouter = Router()

// Annotated so the .ts routes that import this get BookingStatus[] rather than the
// string[] TS would otherwise infer from a .js file — without it every
// `status: { in: ACTIVE_STATUSES }` in a typed route fails to compile.
/** @type {import('@prisma/client').BookingStatus[]} */
export const ACTIVE_STATUSES = ['pending', 'confirmed', 'assigned', 'en_route', 'reached', 'started']

// Cancelling once the driver is waiting at the pickup costs the rider 15% — that
// driver turned down other rides and has already spent the fuel. Anything earlier
// is free, including en_route: the driver is moving but hasn't committed the wait.
// A ride already underway can't be self-cancelled; that's a support conversation.
//
// 15 FROM 35, 14 Aug 2026, Raju's number. The old figure was never his — it came
// in with the cancellation rule itself and nobody had priced it since. Kept in
// step with the copy in frontend/src/constants/fares.js, which is what warns the
// rider before she taps: the two disagreeing means quoting one number and taking
// another.
// A ride worth following: one that is going to happen, or is happening. `pending`
// is out because the search may still end in no_driver, and a link that never
// resolves into anything is worse than no link. The terminal statuses are out
// because a share is a window onto a trip in progress — there is nothing left to
// watch, and the outcome is the rider's to tell.
const SHAREABLE_STATUSES = ['confirmed', 'assigned', 'en_route', 'reached', 'started']

const CANCELLABLE_STATUSES = ['pending', 'confirmed', 'assigned', 'en_route', 'reached']
const CHARGEABLE_STATUSES = ['reached']
export const CANCELLATION_CHARGE_PCT = 15

// What cancelling would cost right now. Exported so the status endpoint can warn
// the rider with the same number the cancel endpoint will actually charge.
export const cancellationChargeFor = (booking) =>
  CHARGEABLE_STATUSES.includes(booking.status)
    ? Math.round((booking.fare * CANCELLATION_CHARGE_PCT) / 100)
    : 0

// Two rides within this window are treated as the same time slot.
const OVERLAP_MS = 15 * 60 * 1000

const normAddress = (s) => s?.trim().toLowerCase()

// The quote is signed with the coordinates it was priced from, and the client
// echoes those same doubles back, so this only has to survive a JSON round trip
// — 1e-6° is about 10 cm, far tighter than any pin the rider can drag.
const sameCoords = (a, b) =>
    Boolean(a) && Number.isFinite(b?.lat) && Number.isFinite(b?.lng) &&
    Math.abs(a.lat - b.lat) < 1e-6 && Math.abs(a.lng - b.lng) < 1e-6

bookingsRouter.post('/', protect, async (req, res) => {
    const {
        pickupAddress, pickupLat, pickupLng,
        dropAddress, dropLat, dropLng,
        vehicleClass, sharing,
        scheduledAt, isOutstation,
        // The signed estimate this booking is being made against. Everything the
        // ride costs comes out of it — see the block below and fareQuote.js.
        fareQuote,
        // What the rider was looking at when they pressed the button. Advisory:
        // the quote decides the price, this only has to agree with it.
        fare: quotedToRider,
    } = req.body

    if (!pickupAddress || !dropAddress)
        return res.status(400).json({ error: 'pickupAddress and dropAddress are required' })

    if (pickupLat == null || pickupLng == null || dropLat == null || dropLng == null)
        return res.status(400).json({ error: 'pickupLat, pickupLng, dropLat and dropLng are required' })

    if (!vehicleClass || !isVehicleClass(vehicleClass))
        return res.status(400).json({ error: `vehicleClass must be one of: ${VEHICLE_CLASS_NAMES.join(', ')}` })

    // ---- Price the ride from the signed estimate, never from the request ----
    //
    // `fare` used to be taken straight off the body and stored, checked only for
    // being a positive number, so a crafted POST booked any ride for ₹1. Every
    // money-bearing field is now read out of a quote this server signed: the
    // fare, the pass-through charges the commission is taken off, the distance,
    // and the two options that move the total (the safer route and the carrier).
    // The client still chooses the class and solo-vs-sharing — but only among
    // the cards the quote already priced.
    //
    // Everything below is tagged FARE_QUOTE, because the client's answer to all
    // of them is the same one: re-price the route and show the rider the number
    // again. 400 is a request that was never going to work, 422 a price that has
    // simply gone stale.
    const staleQuote = (status, error) => res.status(status).json({ error, code: 'FARE_QUOTE' })

    const { quote, error: quoteError } = verifyQuote(fareQuote)
    if (quoteError === 'QUOTE_MISSING') return staleQuote(400, 'fareQuote is required')
    if (quoteError === 'QUOTE_INVALID') return staleQuote(400, 'Invalid fare quote')
    if (quoteError === 'QUOTE_EXPIRED') return staleQuote(422, 'This price has expired. Refresh and try again.')

    // A quote is for one route. Without this, the cheapest quote on the rate
    // card would book the most expensive trip on it.
    if (normAddress(quote.pickup?.address) !== normAddress(pickupAddress) ||
        normAddress(quote.drop?.address) !== normAddress(dropAddress))
        return staleQuote(422, 'This price was quoted for a different route. Refresh and try again.')

    // Coords are what unlock zone pricing, so a quote priced with them is only
    // valid for them. A quote priced without them (hand-typed addresses, no
    // pin) went down the per-km path, where the coords sent here are dispatch
    // detail rather than an input to the fare — nothing to bind.
    if ((quote.pickup.coords && !sameCoords(quote.pickup.coords, { lat: pickupLat, lng: pickupLng })) ||
        (quote.drop.coords   && !sameCoords(quote.drop.coords,   { lat: dropLat,   lng: dropLng })))
        return staleQuote(422, 'The pickup or drop point moved after this price was quoted. Refresh and try again.')

    const pricedClass = quote.fares?.[vehicleClass]
    const fare = pricedClass?.[sharing === true ? 'sharing' : 'solo']
    if (typeof fare !== 'number' || fare <= 0)
        return staleQuote(422, 'That vehicle could not be priced for this route')

    // The rider is held to the number they saw. If it disagrees with the quote
    // the screen is out of step with the price behind it, and charging either
    // one silently is worse than saying so.
    if (typeof quotedToRider === 'number' && quotedToRider !== fare)
        return staleQuote(422, 'The price for this ride has changed. Refresh and try again.')

    // Itemised inside `fare` by the estimate, so the commission comes off the
    // driving alone. `parking` has no source yet; when one exists it will be
    // quoted here like the rest rather than accepted from the client.
    const toll    = pricedClass.toll ?? 0
    const airport = pricedClass.airport ?? 0
    const carrier = pricedClass.carrier ?? 0

    // Both of these are already paid for inside `fare`, so neither can be a
    // request field any more: a booking claiming preferSafeRoute against a quote
    // priced without it would send the driver the long way round for free.
    const preferSafeRoute = quote.safeRoute?.applied === true
    const safeWaypoint = preferSafeRoute ? quote.safeRoute.waypoint : null
    const needsCarrier = quote.needsCarrier === true
    const distanceKm = quote.distanceKm
    // Out of the quote for the same reason as the distance: the client does not
    // get to describe the route. The polyline in particular is what the pooling
    // matcher measures a second rider's pickup against, so a client-supplied one
    // would let a rider draw the road their own match is judged on.
    const durationMin = quote.durationMin
    const routePolyline = quote.polyline

    if (scheduledAt) {
        const scheduled = new Date(scheduledAt)
        if (isNaN(scheduled.getTime()))
        return res.status(400).json({ error: 'scheduledAt is not a valid date' })

        const thirtyMinsFromNow = new Date(Date.now() + 30 * 60 * 1000)
        const sevenDaysFromNow  = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

        if (scheduled <= thirtyMinsFromNow)
        return res.status(422).json({ error: 'Ride must be scheduled at least 30 minutes in advance' })

        if (scheduled > sevenDaysFromNow)
        return res.status(422).json({ error: 'Ride can only be scheduled at most 7 days in advance' })
    }


    // No clamps here any more: every one of these came out of the quote this
    // server signed, so there is nothing to bound. The old flat() caps existed
    // because the client sent them, and they only ever protected the commission
    // — the fare they were subtracted from was itself unchecked.
    const rideFare = rideFareOf(fare, { toll, airport, carrier })
    const { pct: commissionPct, amt: commissionAmt } = commissionOn(rideFare)

    const user = await prisma.user.findUnique({ where: { clerkId: req.auth.userId } })
    if (!user) return res.status(401).json({ error: 'Complete signup before booking' })

    const bookingCode = user.bookingCode

    // Reject bookings colliding with a live one: same time slot or same pickup + drop route.
    const activeBookings = await prisma.booking.findMany({
        where: { userId: user.id, status: { in: ACTIVE_STATUSES } },
    })
    const newRideAt = scheduledAt ? new Date(scheduledAt).getTime() : Date.now()
    for (const b of activeBookings) {
        const activeRideAt = b.scheduledAt ? b.scheduledAt.getTime() : Date.now()
        if (Math.abs(newRideAt - activeRideAt) < OVERLAP_MS)
            return res.status(409).json({ error: 'You already have a ride around this time' })
        if (normAddress(b.pickupAddress) === normAddress(pickupAddress) &&
            normAddress(b.dropAddress) === normAddress(dropAddress))
            return res.status(409).json({ error: 'You already have an active booking for this route' })
    }

    const bookingData = {
        userId: user.id,
        customerPhone: user.phone, vehicleClass,
        pickupAddress, pickupLat, pickupLng,
        dropAddress, dropLat, dropLng,
        fare, rideFare, distanceKm: distanceKm ?? null,
        // Only on a shared booking: it is the price this ride reverts to if
        // nobody joins, and a solo ride has nothing to revert to. Taken from the
        // same priced card as `fare`, so both numbers came out of one quote and
        // the rider was shown both before booking.
        soloFare: sharing === true ? (pricedClass.solo ?? null) : null,
        // Both nullable and both genuinely absent sometimes: a Routes failure
        // still prices zone and fixed-table trips, and those quotes carry no
        // route at all. A booking without a polyline simply cannot host a pool.
        durationMin: durationMin != null ? Math.round(durationMin) : null,
        routePolyline: routePolyline ?? null,
        isOutstation: isOutstation ?? false,
        preferSafeRoute,
        // Only kept when the rider actually took the safer route — and it is the
        // quote's own waypoint, so the road stored here is provably the one the
        // ₹150 was charged for. A quote with the flag set but no point is still
        // dropped rather than stored: half a coordinate is worse than none.
        ...(preferSafeRoute && Number.isFinite(safeWaypoint?.lat) && Number.isFinite(safeWaypoint?.lng)
            ? { safeWaypointLat: safeWaypoint.lat, safeWaypointLng: safeWaypoint.lng }
            : { safeWaypointLat: null, safeWaypointLng: null }),
        // Stored because the driver has to actually turn up with a roof carrier
        // fitted — the charge is already inside `fare`, but the instruction isn't.
        needsCarrier,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        commissionPct, commissionAmt, sharing: sharing === true
    }

    if (scheduledAt) {
        const booking = await createBooking({ ...bookingData, status: 'confirmed', confirmedAt: new Date() })
        return res.json({ bookingId: booking.id, reference: booking.reference, bookingCode, status: 'confirmed' })
    }

    const booking = await createBooking({ ...bookingData, status: 'pending', confirmedAt: null })

    // Assignment runs detached — it can take minutes, and the client needs a
    // booking id now so it can show "Requesting a ride" and poll for the
    // outcome. A search that reaches nobody lands on `no_driver`, which is not
    // an ACTIVE_STATUS, so the rider can immediately try again.
    startAssignment(booking.id)

    return res.json({ bookingId: booking.id, reference: booking.reference, bookingCode, status: 'pending' })
})

// Mint (or hand back) this ride's "follow my ride" link.
//
// IDEMPOTENT WHILE THE LINK IS LIVE, and that is a safety property rather than a
// nicety: a rider who taps Share twice, or shares to two people, must end up with
// ONE handle to revoke. Minting a fresh token per tap would leave the earlier ones
// answering with nobody able to name them.
//
// Only rides that are actually happening. Sharing a completed trip would create a
// live window onto a finished one, and sharing a `pending` search would hand
// someone a link that mostly shows nothing — and might never show anything, if the
// search ends in no_driver.
bookingsRouter.post('/:id/share', protect, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { clerkId: req.auth.userId } })
  if (!user) return res.status(401).json({ error: 'User not found' })

  const booking = await prisma.booking.findUnique({ where: { id: req.params.id } })
  if (!booking) return res.status(404).json({ error: 'Booking not found' })
  if (booking.userId !== user.id) return res.status(403).json({ error: 'Forbidden' })
  if (!SHAREABLE_STATUSES.includes(booking.status)) {
    return res.status(409).json({ error: `A ${booking.status} ride cannot be shared`, status: booking.status })
  }

  if (shareIsLive(booking)) {
    return res.json({
      url: shareUrlFor(booking.shareToken),
      expiresAt: booking.shareExpiresAt,
    })
  }

  const shareToken = newShareToken()
  const shareExpiresAt = new Date(Date.now() + SHARE_TTL_MS)
  await prisma.booking.update({
    where: { id: booking.id },
    data: { shareToken, shareExpiresAt },
  })

  return res.json({ url: shareUrlFor(shareToken), expiresAt: shareExpiresAt })
})

// Kill the link. Clears the token rather than only the expiry, so the handle
// itself stops existing — an expiry alone would leave a row that a later bug, or
// a careless "extend the share" feature, could bring back to life.
bookingsRouter.delete('/:id/share', protect, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { clerkId: req.auth.userId } })
  if (!user) return res.status(401).json({ error: 'User not found' })

  const booking = await prisma.booking.findUnique({ where: { id: req.params.id } })
  if (!booking) return res.status(404).json({ error: 'Booking not found' })
  if (booking.userId !== user.id) return res.status(403).json({ error: 'Forbidden' })

  await prisma.booking.update({
    where: { id: booking.id },
    data: { shareToken: null, shareExpiresAt: null },
  })

  return res.json({ ok: true })
})

bookingsRouter.get('/:id/status', protect, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { clerkId: req.auth.userId } })
  if (!user) return res.status(401).json({ error: 'User not found' })

  const booking = await prisma.booking.findUnique({
    where: { id: req.params.id },
    include: { driver: { include: { location: true } } },
  })

  if (!booking) return res.status(404).json({ error: 'Booking not found' })
  if (booking.userId !== user.id) return res.status(403).json({ error: 'Forbidden' })

  // Crash guard: startAssignment normally writes the terminal status itself,
  // but a restart mid-search would leave the row pending forever and the client
  // polling it forever. Expiring lazily here needs no scheduler — the only
  // thing waiting on the answer is the poll that just arrived.
  let status = booking.status
  if (status === 'pending' && Date.now() - booking.createdAt.getTime() > ASSIGNMENT_DEADLINE_MS) {
    if (await markNoDriver(booking.id)) status = 'no_driver'
  }

  const cancellationCharge = cancellationChargeFor({ ...booking, status })

  if (!booking.driverId) return res.json({ bookingId: booking.id, reference: booking.reference, bookingCode: user.bookingCode, status, cancellationCharge, driver: null })

  return res.json({
    bookingId:   booking.id,
    reference:   booking.reference,
    bookingCode: user.bookingCode,
    status,
    cancellationCharge,
    driver: {
      name:          booking.driver.name,
      phone:         booking.driver.phone,
      // THE CAR SNAPSHOTTED ON THIS BOOKING, not the one on the driver row.
      // A captain may own several cars and switch between them, so reading it
      // through the relation makes every past ride show whichever car he is in
      // today — and a rider disputing "the car that picked me up was DL01AB1234"
      // would be arguing against a value that had quietly changed under him.
      //
      // Both halves or neither: the rider's screen prints "DL01AB1234 · Swift
      // Dzire" as one line, so a snapshotted plate beside a live model would
      // eventually describe two different cars.
      //
      // The plate's fallback covers rides assigned before its column existed. It
      // is the old, wrong behaviour by construction, which is exactly why it is a
      // fallback and not the first choice.
      //
      // THE MODEL GETS NO SUCH FALLBACK, and the reason is that the two columns
      // landed a day apart: the plate on 2026-08-12, the model on 2026-08-13. So
      // there is a band of bookings carrying a CORRECT snapshotted plate and no
      // model at all, and for exactly those a fallback would pair the right
      // historic plate with today's car — "UP16AB1234 · Innova Crysta" about a
      // ride done in the Dzire. That is the one output worse than either column
      // being empty, and it is what the snapshot was added to prevent.
      //
      // Their nulls will never line up, so they cannot share a fallback. Null
      // goes to the client and the rider app shows the booked class beside the
      // plate instead — a fact of this booking, and one that cannot go stale.
      vehicleNumber: booking.vehicleNumber ?? booking.driver.vehicleNumber,
      vehicleModel:  booking.vehicleModel,
      // The captain's face, so a rider standing on a road at night can tell
      // whether the man who pulled up is the man the app sent. A signed URL
      // minted for this response and dead in fifteen minutes — never the stored
      // path, and never a public one. Null until his photo is approved, which is
      // the only thing that writes Driver.pfpUrl.
      photoUrl:      await signedRiderPhotoUrl(booking.driver),
      latitude:      booking.driver.location?.latitude,
      longitude:     booking.driver.location?.longitude,
      bearing:       booking.driver.location?.bearing,
      speedKmh:      booking.driver.location?.speedKmh,
    },
  })
})

bookingsRouter.post('/cancel', protect, async (req, res) => {
    const { bookingId } = req.body
    if (!bookingId) return res.status(400).json({ error: 'bookingId is required' })

    const user = await prisma.user.findUnique({ where: { clerkId: req.auth.userId } })
    if (!user) return res.status(401).json({ error: 'User not found' })

    const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: {driver: true} })
    if (!booking) return res.status(404).json({ error: 'Booking not found' })
    if (booking.userId !== user.id) return res.status(403).json({ error: 'Forbidden' })
    if (!CANCELLABLE_STATUSES.includes(booking.status))
        return res.status(409).json({ error: `Cannot cancel a ${booking.status} booking` })

    const cancellationCharge = cancellationChargeFor(booking)

    await prisma.$transaction(async (tx) => {
        await tx.booking.update({
            where: { id: booking.id },
            data: {
                status: 'cancelled',
                cancelledBy: 'user',
                cancellationCharge,
            },
        })

        // Take the ride off every driver's notification page. Inside the same
        // transaction as the cancel: a scheduled ride that is cancelled but still
        // showing as a live offer is one a driver can tap accept on, and the
        // status guard would then reject him for a ride he was still being shown.
        await tx.rideOffer.updateMany({
            where: { bookingId: booking.id, status: 'pending' },
            data: { status: 'withdrawn', respondedAt: new Date() },
        })

        const seats = booking.driver ? seatsOf(booking.driver.vehicleClass) : null

        // seats === null means an unrecognised class, and there is no full mark to
        // restore to — leave the counter alone rather than write a null into it.
        if (booking.driver && seats !== null) {
            if (booking.sharing) {
                // Sharing ride freed a single seat — give it back, capped at full.
                // The cap is a WHERE rather than an `if` over the row we read
                // before the transaction: two rides ending on the same vehicle at
                // once would both read the same capacity, both find it under the
                // cap, and both increment past it. Re-checked against the live row
                // here, the second one simply matches nothing.
                await tx.driver.updateMany({
                    where: { id: booking.driver.id, vehicleCapacity: { lt: seats } },
                    data: {
                        vehicleCapacity: {
                            increment: 1,
                        },
                    },
                })
            } else {
                // Solo ride had the whole vehicle — restore it to full capacity.
                // Absolute, so it needs no guard and cannot overshoot.
                await tx.driver.update({
                    where: { id: booking.driver.id },
                    data: {
                        vehicleCapacity: seats,
                    },
                })
            }
        }
    })

    if (booking.driver) {
        // The ride's reference, not the rider's bookingCode. This line is trying to
        // say WHICH ride was cancelled, and bookingCode cannot: it is per-account and
        // constant, so a driver holding two rides for the same rider got the same
        // value for both. It is also that rider's start-ride OTP (routes/driver.ts),
        // which a cancellation notice has no reason to put on a driver's phone.
        sendWhatsApp(booking.driver.phone,
            `A ride you were assigned has been cancelled by the customer.
            \nRide ID: ${booking.reference}
            \nPickup Location: ${booking.pickupAddress}
            \nDrop Location: ${booking.dropAddress}`
        )
    }

    return res.json({ ok: true, cancellationCharge })
})

bookingsRouter.get('/my-bookings', protect, async (req, res) => {
    const parsed = myBookingsQuerySchema.safeParse(req.query)
    if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid query parameters', issues: parsed.error.issues })
    }
    const { search, status, vehicleClass, startDate, endDate, page, limit } = parsed.data

    const user = await prisma.user.findUnique({ where: { clerkId: req.auth.userId } })
    if (!user) return res.status(401).json({ error: 'User not found' })

    const where = { userId: user.id }
    if (search) {
        const compact = search.replace(/[\s+\-()]/g, '')
        const reference = normalizeReference(search)
        if (reference) {
            // Exact, not a prefix: a whole reference was typed, and equality is
            // what the unique index can actually answer.
            where.reference = reference
        } else if (/^\d+$/.test(compact)) {
            where.driver = { phone: { contains: compact } }
        } else {
            where.OR = [
                { id: { startsWith: search } },
                { reference: { startsWith: compact.toUpperCase() } },
                { driver: { name: { contains: search, mode: 'insensitive' } } },
                { pickupAddress: { contains: search, mode: 'insensitive' } },
                { dropAddress: { contains: search, mode: 'insensitive' } },
            ]
        }
    }
    if (status) where.status = status
    if (vehicleClass) where.vehicleClass = vehicleClass
    if (startDate || endDate) {
        const scheduledAt = {}
        if (startDate) scheduledAt.gte = new Date(`${startDate}T00:00:00+05:30`)
        if (endDate) {
            const end = new Date(`${endDate}T00:00:00+05:30`)
            end.setDate(end.getDate() + 1)
            scheduledAt.lt = end
        }
        where.scheduledAt = scheduledAt
    }

    const [bookings, total] = await Promise.all([
        prisma.booking.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            include: { driver: true },
            skip: (page - 1) * limit,
            take: limit,
        }),
        prisma.booking.count({ where }),
    ])

    // The code belongs to the user, not the ride; flattened onto each row because
    // that's the shape the client reads.
    const withCode = bookings.map(b => ({ ...b, bookingCode: user.bookingCode }))

    return res.json({ total, page, limit, bookings: withCode })
})

export default bookingsRouter