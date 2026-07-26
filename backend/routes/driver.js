import { Router } from 'express'
import { protect } from '../middleware/auth.js'
import { prisma } from '../db/prisma.js'

// The entire driver-facing API today: accept and decline. No client calls either
// yet — the driver app is Phase 5, and until it exists the assignment loop takes a
// driver's answer from sendFCM's return value instead (services/notification.js).
//
// Two gaps to close when that app arrives, both flagged in ROADMAP:
//   - accept writes `assigned` with a plain update, guarded only against a booking
//     that is already assigned. getDriver uses a status-guarded updateMany for the
//     same write (claimBooking), so a booking cancelled or expired mid-offer is safe
//     there and clobberable here.
//   - accept doesn't touch vehicleCapacity. getDriver decrements it on the same
//     transition, so a driver accepting through this route stays at full capacity
//     and can be offered more rides than the vehicle holds.
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
    
    console.log("Ride declined by the driver")
    
    return res.json({
        bookingId:      booking.id,
        status:         booking.status
    })
})


export default driverRouter 