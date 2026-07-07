import { Router } from 'express'
import { protect, protectAdmin } from '../middleware/auth.js'
import { getDriver } from '../services/driverAssignment.js'
import { sendWhatsApp } from '../services/notification.js'
import { prisma } from '../db/prisma.js'

const bookingsRouter = Router()

const VALID_VEHICLE_TYPES = [4, 6, 1]

export const ACTIVE_STATUSES = ['pending', 'confirmed', 'assigned', 'en_route', 'reached', 'started']

// Two rides within this window are treated as the same time slot.
const OVERLAP_MS = 15 * 60 * 1000

const normAddress = (s) => s?.trim().toLowerCase()

bookingsRouter.post('/', protect, async (req, res) => {
    const {
        pickupAddress, pickupLat, pickupLng,
        dropAddress, dropLat, dropLng,
        vehicleType, fare, distanceKm,
        scheduledAt, isOutstation, sharing
    } = req.body

    if (!pickupAddress || !dropAddress)
        return res.status(400).json({ error: 'pickupAddress and dropAddress are required' })

    if (pickupLat == null || pickupLng == null || dropLat == null || dropLng == null)
        return res.status(400).json({ error: 'pickupLat, pickupLng, dropLat and dropLng are required' })

    if (!vehicleType || !VALID_VEHICLE_TYPES.includes(vehicleType))
        return res.status(400).json({ error: `vehicleType must be one of: ${VALID_VEHICLE_TYPES.join(', ')}` })

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


    const commissionPct = fare >= 1000 ? 10 : 0
    const commissionAmt = (fare * commissionPct) / 100

    const user = await prisma.user.findUnique({ where: { clerkId: req.auth.userId } })
    if (!user) return res.status(401).json({ error: 'Complete signup before booking' })

    const bookingCode = user.bookingCode

    // Reject bookings that collide with one the user already has live: either at
    // the same time slot, or an exact duplicate of the pickup + drop route.
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
        customerPhone: user.phone, vehicleType,
        pickupAddress, pickupLat, pickupLng,
        dropAddress, dropLat, dropLng,
        fare, distanceKm: distanceKm ?? null,
        isOutstation: isOutstation ?? false,
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

    const driverId = await getDriver(booking.id)

    if (driverId) {
        return res.json({ bookingId: booking.id, bookingCode, status: 'assigned' })
    }

    await prisma.booking.delete({ where: { id: booking.id } })
    return res.status(503).json({ error: 'No drivers available. Please try again shortly.' })
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

  if (!booking.driverId) return res.json({ bookingId: booking.id, bookingCode: user.bookingCode, status: booking.status, driver: null })

  return res.json({
    bookingId:   booking.id,
    bookingCode: user.bookingCode,
    status:      booking.status,
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
    if (!['pending', 'confirmed', 'assigned'].includes(booking.status))
        return res.status(409).json({ error: `Cannot cancel a ${booking.status} booking` })

    await prisma.$transaction(async (tx) => {
        await tx.booking.update({
            where: { id: booking.id },
            data: {
                status: 'cancelled',
                cancelledBy: 'user',
            },
        })

        if (booking.driver) {
            if (booking.sharing) {
                // Sharing ride freed a single seat — give it back (capped at full).
                if (booking.driver.vehicleCapacity < booking.driver.vehicleType) {
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
                        vehicleCapacity: booking.driver.vehicleType,
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

    return res.json({ ok: true })
})

bookingsRouter.get('/my-bookings', protect, async (req, res) => {
    const user = await prisma.user.findUnique({ where: { clerkId: req.auth.userId } })
    if (!user) return res.status(401).json({ error: 'User not found' })

    const bookings = await prisma.booking.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        include: {driver: true}
    })

    // The code lives on the user now; surface it on each booking so callers that
    // read booking.bookingCode keep working.
    const withCode = bookings.map(b => ({ ...b, bookingCode: user.bookingCode }))

    return res.json({ bookings: withCode })
})

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