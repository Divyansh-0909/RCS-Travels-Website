import { Router } from 'express'
import { protect } from '../middleware/auth.js'
import { getDriver } from '../services/driverAssignment.js'
import { prisma } from '../db/prisma.js'

const bookingsRouter = Router()

const VALID_VEHICLE_TYPES = ['SEDAN', 'SUV', 'HATCHBACK', 'INNOVA']

bookingsRouter.post('/', protect, async (req, res) => {
  const {
    pickupAddress, pickupLat, pickupLng,
    dropAddress, dropLat, dropLng,
    vehicleType, fare, distanceKm,
    scheduledAt, isOutstation, customerPhone,
  } = req.body

  // ── Validation ────────────────────────────────────────────────────────────

  if (!pickupAddress || !dropAddress)
    return res.status(400).json({ error: 'pickupAddress and dropAddress are required' })

  if (pickupLat == null || pickupLng == null || dropLat == null || dropLng == null)
    return res.status(400).json({ error: 'pickupLat, pickupLng, dropLat and dropLng are required' })

  if (!vehicleType || !VALID_VEHICLE_TYPES.includes(vehicleType))
    return res.status(400).json({ error: `vehicleType must be one of: ${VALID_VEHICLE_TYPES.join(', ')}` })

  if (!fare || typeof fare !== 'number' || fare <= 0)
    return res.status(400).json({ error: 'fare must be a positive number' })

  if (!customerPhone || !/^\d{10}$/.test(customerPhone))
    return res.status(400).json({ error: 'customerPhone must be a 10-digit number' })

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
    const candidate = String(Math.floor(100000 + Math.random() * 900000))
    const exists = await prisma.booking.findUnique({ where: { bookingCode: candidate } })
    if (!exists) { bookingCode = candidate; break }
  }
  if (!bookingCode) return res.status(500).json({ error: 'Failed to generate booking code' })

  //userId from JWT (never trust client)
  const user = await prisma.user.findUnique({ where: { clerkId: req.auth.userId } })
  if (!user) return res.status(401).json({ error: 'User not found' })

  const bookingData = {
    bookingCode, userId: user.id,
    customerPhone, vehicleType,
    pickupAddress, pickupLat, pickupLng,
    dropAddress, dropLat, dropLng,
    fare, distanceKm: distanceKm ?? null,
    isOutstation: isOutstation ?? false,
    scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
    commissionPct, commissionAmt,
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

export default bookingsRouter