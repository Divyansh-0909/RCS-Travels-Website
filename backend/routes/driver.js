import { Router } from 'express'
import { protect } from '../middleware/auth.js'
import { prisma } from '../db/prisma.js'

const driverRouter = Router()

const formatPickupTime = (scheduledAt) =>
  scheduledAt
    ? new Date(scheduledAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })
    : 'IMMEDIATE PICKUP'

driverRouter.patch('/rides/:id/accept', protect , async (req,res) => {
    const driver = await prisma.driver.findUnique({ where: { clerkId: req.auth.userId } })
    if (!driver) return res.status(403).json({ error: 'Not a registered driver' })
    if (!driver.isActive) return res.status(403).json({ error: 'Driver account is inactive' })
    if (driver.verificationStatus !== 'approved') return res.status(403).json({ error: 'Driver not yet approved' })

    const booking = await prisma.booking.findUnique({
        where: { id: req.params.id }
    })

    if (!booking) return res.status(404).json({ error: 'Booking not found' })

    if (booking.status === 'assigned') return res.status(409).json({ error: 'Booking already assigned' })

    await prisma.booking.update({
        where: {id: req.params.id},
        data: { status: 'assigned', driverId: driver.id, confirmedAt: booking.confirmedAt ?? new Date()}
    })
    
    return res.json({
        bookingId:      booking.id,
        status:         'assigned',
        pickup: {
            address:        booking.pickupAddress,
            lat:            booking.pickupLat,
            lng:            booking.pickupLng,
        },
        drop: {
            address:        booking.dropAddress,
            lat:            booking.dropLat,
            lng:            booking.dropLng,
        },
        fare:           booking.fare,
        vehicleType:    booking.vehicleType,
        pickupTime:     formatPickupTime(booking.scheduledAt),
        customerPhone:  booking.customerPhone

    })
})


driverRouter.patch('/rides/:id/decline', protect , async (req,res) => {
    const driver = await prisma.driver.findUnique({ where: { clerkId: req.auth.userId } })
    if (!driver) return res.status(403).json({ error: 'Not a registered driver' })
    if (!driver.isActive) return res.status(403).json({ error: 'Driver account is inactive' })
    if (driver.verificationStatus !== 'approved') return res.status(403).json({ error: 'Driver not yet approved' })

    const booking = await prisma.booking.findUnique({
        where: { id: req.params.id }
    })

    if (!booking) return res.status(404).json({ error: 'Booking not found' })

    if (booking.status === 'assigned') return res.status(409).json({ error: 'Booking already assigned' })
    
    return res.json({
        bookingId:      booking.id,
        status:         booking.status
    })
})


export default driverRouter 