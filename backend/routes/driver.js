import { Router } from 'express'
import { protect } from '../middleware/auth.js'
import { prisma } from '../db/prisma.js'
import { ACTIVE_STATUSES } from './bookings.js'
import { includes } from 'zod'

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

function haversineDistance(lat1, lng1, lat2, lng2) {
    const toRad = (deg) => (deg * Math.PI) / 180

    const dLat = toRad(lat2 - lat1)
    const dLng = toRad(lng2 - lng1)

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2

    return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a))
}

function getBearing(lat1, lon1, lat2, lon2) {
    const toRad = deg => deg * Math.PI / 180;
    const toDeg = rad => rad * 180 / Math.PI;

    const φ1 = toRad(lat1);
    const φ2 = toRad(lat2);

    const λ1 = toRad(lon1);
    const λ2 = toRad(lon2);

    const y = Math.sin(λ2 - λ1) * Math.cos(φ2);

    const x =
        Math.cos(φ1) * Math.sin(φ2) -
        Math.sin(φ1) * Math.cos(φ2) *
        Math.cos(λ2 - λ1);

    const θ = Math.atan2(y, x);

    return (toDeg(θ) + 360) % 360;
}

const formatPickupTime = (scheduledAt) =>
    scheduledAt
        ? new Date(scheduledAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })
        : 'IMMEDIATE PICKUP'


driverRouter.get('/me', protect, async (req, res) => {
    const driver = await prisma.driver.findUnique({ where: { clerkId: req.auth.userId } })
    if (!driver) return res.status(403).json({ error: 'Not a registered driver' })

    const { id, pfpUrl, verificationStatus, rejectionReason, isOnline, vehicleClass, vehicleNumber, phone, name } = driver
    return res.json({ id, pfpUrl, verificationStatus, rejectionReason, isOnline, vehicleClass, vehicleNumber, phone, name })
})

driverRouter.patch('/online', protect, async (req, res) => {
    const driver = await prisma.driver.findUnique({ where: { clerkId: req.auth.userId } })
    if (!driver) return res.status(403).json({ error: 'Not a registered driver' })
    if (!driver.isActive) return res.status(403).json({ error: 'Driver account is inactive' })
    if (driver.verificationStatus !== 'approved') return res.status(403).json({ error: 'Driver not yet approved' })

    const { isOnline } = req.body;

    const bookings = await prisma.booking.findMany({
        where: {
            driverId: driver.id,
            status: { in: ACTIVE_STATUSES },
        }
    })

    if(isOnline && bookings !== null) return res.json({error: "Driver has a active ride"})

    await prisma.driver.update({
        where: { id: driver.id },
        data: { isOnline }
    })

    return res.json({ isOnline })
})

driverRouter.post('/location', protect, async (req, res) => {
    const driver = await prisma.driver.findUnique({ where: { clerkId: req.auth.userId } })
    if (!driver) return res.status(403).json({ error: 'Not a registered driver' })
    if (!driver.isActive) return res.status(403).json({ error: 'Driver account is inactive' })
    if (driver.verificationStatus !== 'approved') return res.status(403).json({ error: 'Driver not yet approved' })
    if (!driver.isOnline) return res.status(403).json({ error: "Driver is not online" })

    const { lat, lng } = req.body //From phone from expo helper fn

    const previous = await prisma.driverLocation.findUnique({
        where: {
            driverId: driver.id,
        },
    });

    let speedKmh = 0
    let bearing = 0

    if (previous) {
        const distance = haversineDistance(previous.latitude, previous.longitude, lat, lng)

        const seconds = (now.getTime() - previous.lastUpdatedAt.getTime()) / 1000

        if (seconds > 0) speedKmh = (distance / seconds) * 3.6

        bearing = getBearing(previous.latitude, previous.longitude, lat, lng)
    }

    await prisma.driverLocation.upsert({
        where: {
            driverId: driver.id,
        },
        create: {
            driverId: driver.id,
            latitude: lat,
            longitude: lng,
            speedKmh,
            bearing,
        },
        update: {
            latitude: lat,
            longitude: lng,
            speedKmh,
            bearing,
        },
    });

    return res.json({ ok: true });
});

driverRouter.post('/fcm-token', protect, async (req, res) => {
    const driver = await prisma.driver.findUnique({ where: { clerkId: req.auth.userId } })
    if (!driver) return res.status(403).json({ error: 'Not a registered driver' })
    if (!driver.isActive) return res.status(403).json({ error: 'Driver account is inactive' })
    if (driver.verificationStatus !== 'approved') return res.status(403).json({ error: 'Driver not yet approved' })

})

driverRouter.get('/rides', protect, async (req, res) => {
    const driver = await prisma.driver.findUnique({ where: { clerkId: req.auth.userId } })
    if (!driver) return res.status(403).json({ error: 'Not a registered driver' })
    if (!driver.isActive) return res.status(403).json({ error: 'Driver account is inactive' })
    if (driver.verificationStatus !== 'approved') return res.status(403).json({ error: 'Driver not yet approved' })

    const bookings = await prisma.booking.findUnique({
        where: {
            driverId: driver.id,
            status: {not: cancelled},
            OR: [{ scheduledAt: { gt: new Date() } }, { status: { in: ACTIVE_STATUSES } }]
        }
    })

    return res.json({ bookings })
})

driverRouter.get('/rides/:id', protect, async (req, res) => {
    const driver = await prisma.driver.findUnique({ where: { clerkId: req.auth.userId } })
    if (!driver) return res.status(403).json({ error: 'Not a registered driver' })
    if (!driver.isActive) return res.status(403).json({ error: 'Driver account is inactive' })
    if (driver.verificationStatus !== 'approved') return res.status(403).json({ error: 'Driver not yet approved' })

    const booking = await prisma.bookings.findMany({ where: { id: req.query.id }, include: {user: true} })
    if (!booking) return res.status(404).json({ error: 'Booking not found' })
    if (booking.driverId !== driver.id) return res.status(403).json({ error: "Forbidden" })

    return res.json({
        bookingId: booking.id,
        isOutstation: booking.isOutstation,
        pickupAddress: booking.pickupAddress,
        dropAddress: booking.dropAddress,
        vehicleClass: booking.vehicleClass,
        needsCarrier: booking.needsCarrier,
        rideFare: booking.rideFare,
        distanceKm: booking.distanceKm,
        scheduledAt: booking.scheduledAt,
        preferSafeRoute: booking.preferSafeRoute,
        safeWaypointLat: booking.safeWaypointLat,
        safeWaypointLng: booking.safeWaypointLng,
        sharing: booking.sharing,
        shareGroupId: booking.shareGroupId,
        pickupOrder: booking.pickupOrder,
        commissionAmt: booking.commissionAmt,
        user: {
            name: booking.user.name,
            phone: booking.user.phone,
        },
    })
})

driverRouter.patch('/rides/:id/accept', protect, async (req, res) => {
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
        where: { id: req.params.id },
        data: { status: 'assigned', driverId: driver.id, confirmedAt: booking.confirmedAt ?? new Date() }
    })

    return res.json({
        bookingId: booking.id,
        status: 'assigned',
        pickup: {
            address: booking.pickupAddress,
            lat: booking.pickupLat,
            lng: booking.pickupLng,
        },
        drop: {
            address: booking.dropAddress,
            lat: booking.dropLat,
            lng: booking.dropLng,
        },
        fare: booking.fare,
        vehicleClass: booking.vehicleClass,
        pickupTime: formatPickupTime(booking.scheduledAt),
        customerPhone: booking.customerPhone

    })
})


driverRouter.patch('/rides/:id/decline', protect, async (req, res) => {
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
        bookingId: booking.id,
        status: booking.status
    })
})


export default driverRouter 