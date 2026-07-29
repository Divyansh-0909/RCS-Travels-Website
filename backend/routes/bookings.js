import { Router } from 'express'
import { protect, protectAdmin } from '../middleware/auth.js'
import { startAssignment, markNoDriver, ASSIGNMENT_DEADLINE_MS } from '../services/driverAssignment.js'
import { sendWhatsApp } from '../services/notification.js'
import { prisma } from '../db/prisma.js'
import { commissionOn, rideFareOf } from '../services/commission.js'
import { AIRPORT_PICKUP_SURCHARGE, CARRIER_CHARGE } from '../services/rideEstimate.js'
import { myBookingsQuerySchema } from '../types.ts'
import { VEHICLE_CLASS_NAMES, isVehicleClass, seatsOf } from '../constants/vehicles.js'

const bookingsRouter = Router()

export const ACTIVE_STATUSES = ['pending', 'confirmed', 'assigned', 'en_route', 'reached', 'started']

// Cancelling once the driver is waiting at the pickup costs the rider 35% — that
// driver turned down other rides and has already spent the fuel. Anything earlier
// is free, including en_route: the driver is moving but hasn't committed the wait.
// A ride already underway can't be self-cancelled; that's a support conversation.
const CANCELLABLE_STATUSES = ['pending', 'confirmed', 'assigned', 'en_route', 'reached']
const CHARGEABLE_STATUSES = ['reached']
export const CANCELLATION_CHARGE_PCT = 35

// What cancelling would cost right now. Exported so the status endpoint can warn
// the rider with the same number the cancel endpoint will actually charge.
export const cancellationChargeFor = (booking) =>
  CHARGEABLE_STATUSES.includes(booking.status)
    ? Math.round((booking.fare * CANCELLATION_CHARGE_PCT) / 100)
    : 0

// Two rides within this window are treated as the same time slot.
const OVERLAP_MS = 15 * 60 * 1000

const normAddress = (s) => s?.trim().toLowerCase()

// Same shape check the fare route applies to pickup/drop coords. It bounds the
// value but cannot prove the point came from an estimate — see the server-side
// recomputation item in ROADMAP, which covers every client-sent number here.
const validWaypoint = (w) =>
    Boolean(w) && Number.isFinite(w.lat) && Number.isFinite(w.lng) &&
    Math.abs(w.lat) <= 90 && Math.abs(w.lng) <= 180

bookingsRouter.post('/', protect, async (req, res) => {
    const {
        pickupAddress, pickupLat, pickupLng,
        dropAddress, dropLat, dropLng,
        vehicleClass, fare, distanceKm,
        scheduledAt, isOutstation, sharing, preferSafeRoute, needsCarrier,
        // The via-point the estimate resolved for this trip. Echoed back by the
        // client rather than recomputed here so the stored route is provably the
        // one the rider saw priced; validated below, never trusted as sent.
        safeWaypoint,
        // Pass-through charges inside `fare`, itemised by the estimate so the
        // commission can be taken off the driving alone. `parking` has no source
        // yet — it is accepted now so that the day it exists it is already exempt.
        toll, airport, carrier, parking
    } = req.body

    if (!pickupAddress || !dropAddress)
        return res.status(400).json({ error: 'pickupAddress and dropAddress are required' })

    if (pickupLat == null || pickupLng == null || dropLat == null || dropLng == null)
        return res.status(400).json({ error: 'pickupLat, pickupLng, dropLat and dropLng are required' })

    if (!vehicleClass || !isVehicleClass(vehicleClass))
        return res.status(400).json({ error: `vehicleClass must be one of: ${VEHICLE_CLASS_NAMES.join(', ')}` })

    if (!fare || typeof fare !== 'number' || fare <= 0)
        return res.status(400).json({ error: 'fare must be a positive number' })

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


    // A number the client sends must never be able to shrink the commission
    // below what the ride actually earns, so each add-on is clamped to something
    // sane before it is deducted.
    const flat = (v, cap) => (Number.isFinite(v) && v > 0 ? Math.min(v, cap) : 0)
    const rideFare = rideFareOf(fare, {
        toll:    flat(toll, 500),
        parking: flat(parking, 500),
        airport: flat(airport, AIRPORT_PICKUP_SURCHARGE),
        carrier: flat(carrier, CARRIER_CHARGE),
    })
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
        isOutstation: isOutstation ?? false,
        preferSafeRoute: preferSafeRoute === true,
        // Only kept when the rider actually took the safer route. A waypoint on a
        // booking that didn't ask for one would put the driver on a detour nobody
        // was charged for; a malformed pair is dropped rather than stored, since a
        // half-valid coordinate is worse than none.
        ...(preferSafeRoute === true && validWaypoint(safeWaypoint)
            ? { safeWaypointLat: safeWaypoint.lat, safeWaypointLng: safeWaypoint.lng }
            : { safeWaypointLat: null, safeWaypointLng: null }),
        // Stored because the driver has to actually turn up with a roof carrier
        // fitted — the charge is already inside `fare`, but the instruction isn't.
        needsCarrier: needsCarrier === true,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        commissionPct, commissionAmt, sharing
    }

    if (scheduledAt) {
        const booking = await prisma.booking.create({
        data: { ...bookingData, status: 'confirmed', confirmedAt: new Date() },
        })
        return res.json({ bookingId: booking.id, bookingCode, status: 'confirmed' })
    }

    const booking = await prisma.booking.create({
        data: { ...bookingData, status: 'pending', confirmedAt: null },
    })

    // Assignment runs detached — it can take minutes, and the client needs a
    // booking id now so it can show "Requesting a ride" and poll for the
    // outcome. A search that reaches nobody lands on `no_driver`, which is not
    // an ACTIVE_STATUS, so the rider can immediately try again.
    startAssignment(booking.id)

    return res.json({ bookingId: booking.id, bookingCode, status: 'pending' })
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

  if (!booking.driverId) return res.json({ bookingId: booking.id, bookingCode: user.bookingCode, status, cancellationCharge, driver: null })

  return res.json({
    bookingId:   booking.id,
    bookingCode: user.bookingCode,
    status,
    cancellationCharge,
    driver: {
      name:          booking.driver.name,
      phone:         booking.driver.phone,
      vehicleNumber: booking.driver.vehicleNumber,
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

        if (booking.driver) {
            if (booking.sharing) {
                // Sharing ride freed a single seat — give it back (capped at full).
                if (booking.driver.vehicleCapacity < seatsOf(booking.driver.vehicleClass)) {
                    await tx.driver.update({
                        where: { id: booking.driver.id },
                        data: {
                            vehicleCapacity: {
                                increment: 1,
                            },
                        },
                    })
                }
            } else {
                // Solo ride had the whole vehicle — restore it to full capacity.
                await tx.driver.update({
                    where: { id: booking.driver.id },
                    data: {
                        vehicleCapacity: seatsOf(booking.driver.vehicleClass),
                    },
                })
            }
        }
    })

    if (booking.driver) {
        sendWhatsApp(booking.driver.phone,
            `A ride you were assigned has been cancelled by the customer.
            \nBooking Code: ${user.bookingCode}
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
        if (/^\d+$/.test(compact)) {
            where.driver = { phone: { contains: compact } }
        } else {
            where.OR = [
                { id: { startsWith: search } },
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

// !! UNUSED. The dashboard reads GET /api/admin/booking (routes/admin.ts), which
// supersedes this with the full filter set. Kept only until something confirms
// nothing else calls it.
bookingsRouter.get('/admin/all', protect, protectAdmin, async (req, res) => {
  const { status, date, page = 1, limit = 20 } = req.query

  const where = {}
  if (status) where.status = status
  if (date) {
    const start = new Date(date)
    const end   = new Date(date)
    end.setDate(end.getDate() + 1)
    where.createdAt = { gte: start, lt: end }
  }

  const [bookings, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      include: { driver: true, user: true },
      skip:  (page - 1) * limit,
      take:  Number(limit),
      orderBy: { createdAt: 'desc' },
    }),
    prisma.booking.count({ where }),
  ])

  const withCode = bookings.map(b => ({ ...b, bookingCode: b.user?.bookingCode ?? null }))

  res.json({ total, page: Number(page), limit: Number(limit), bookings: withCode })
})


export default bookingsRouter