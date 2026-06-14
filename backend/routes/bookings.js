import { Router } from 'express'
import { protect, protectAdmin } from '../middleware/auth.js'
import { getDriver } from '../services/driverAssignment.js'
import { prisma } from '../db/prisma.js'
import crypto from 'crypto'

const bookingsRouter = Router()

const VALID_VEHICLE_TYPES = [4, 6, 1]

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

    let bookingCode
    for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = String(crypto.randomInt(100000, 1000000))
        const exists = await prisma.booking.findUnique({ where: { bookingCode: candidate } })
        if (!exists) { bookingCode = candidate; break }
    }
    if (!bookingCode) return res.status(500).json({ error: 'Failed to generate booking code' })

    const user = await prisma.user.findUnique({ where: { clerkId: req.auth.userId } })
    if (!user) return res.status(401).json({ error: 'Complete signup before booking' })

    const bookingData = {
        bookingCode, userId: user.id,
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

  if (!booking.driverId) return res.json({ bookingId: booking.id, bookingCode: booking.bookingCode, status: booking.status, driver: null })

  return res.json({
    bookingId:   booking.id,
    bookingCode: booking.bookingCode,
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

bookingsRouter.get('/my-bookings', protect, async (req, res) => {
    const user = await prisma.user.findUnique({ where: { clerkId: req.auth.userId } })
    if (!user) return res.status(401).json({ error: 'User not found' })

    const bookings = await prisma.booking.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
    })

    return res.json({ bookings })
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

  res.json({ total, page: Number(page), limit: Number(limit), bookings })
})


export default bookingsRouter