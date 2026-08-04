import { Router } from 'express'
import type { Request, Response } from 'express'
import type { BookingStatus, Driver } from '@prisma/client'
import { getAuth } from '@clerk/express'
import { protect } from '../middleware/auth.js'
import { prisma } from '../db/prisma.js'
import { ACTIVE_STATUSES } from './bookings.js'
import { ASSIGNABLE_STATUSES, claimBooking } from '../services/driverAssignment.js'
import { seatsOf } from '../constants/vehicles.js'
import { locationSchema, rideParamsSchema, driverOnlineSchema, fcmTokenSchema, rideStatusSchema } from '../types.ts'

// The driver-facing API. Nothing calls it yet — the driver app is Phase 5, and until
// it exists the assignment loop takes a driver's answer from sendFCM's return value
// instead (services/notification.js).
//
// accept now takes the same transition getDriver does, and takes it the same way:
// claimBooking's status-guarded updateMany, then the capacity write. It used to be a
// plain update guarded only against a booking that was already `assigned`, which let a
// cancelled, completed or expired ride be re-assigned, and left the accepting driver at
// full capacity. decline shares the same allowlist but still writes nothing — it only
// reports the booking's status back.
const driverRouter = Router()

const EARTH_RADIUS_KM = 6371

const RIDE_TRANSITIONS = {
    reached: ['assigned', 'en_route'],
    started: ['reached'],
    completed: ['started'],
} as const satisfies Record<string, readonly BookingStatus[]>

type RideTransition = keyof typeof RIDE_TRANSITIONS

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180

    const dLat = toRad(lat2 - lat1)
    const dLng = toRad(lng2 - lng1)

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2

    return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a))
}

function getBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const toRad = (deg: number): number => deg * Math.PI / 180;
    const toDeg = (rad: number): number => rad * 180 / Math.PI;

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

const formatPickupTime = (scheduledAt: Date | null): string =>
    scheduledAt
        ? new Date(scheduledAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })
        : 'IMMEDIATE PICKUP'

async function requireApprovedDriver(req: Request, res: Response): Promise<Driver | null> {
    const { userId } = getAuth(req)
    if (!userId) {
        res.status(401).json({ error: 'Not signed in' })
        return null
    }

    const driver = await prisma.driver.findUnique({ where: { clerkId: userId } })
    if (!driver) {
        res.status(403).json({ error: 'Not a registered driver' })
        return null
    }
    if (!driver.isActive) {
        res.status(403).json({ error: 'Driver account is inactive' })
        return null
    }
    if (driver.verificationStatus !== 'approved') {
        res.status(403).json({ error: 'Driver not yet approved' })
        return null
    }

    return driver
}

driverRouter.get('/me', protect, async (req, res) => {
    const { userId } = getAuth(req)
    if (!userId) return res.status(401).json({ error: 'Not signed in' })

    const driver = await prisma.driver.findUnique({ where: { clerkId: userId } })
    if (!driver) return res.status(403).json({ error: 'Not a registered driver' })

    const { id, pfpUrl, verificationStatus, rejectionReason, isOnline, vehicleClass, vehicleNumber, phone, name } = driver
    return res.json({ id, pfpUrl, verificationStatus, rejectionReason, isOnline, vehicleClass, vehicleNumber, phone, name })
})

driverRouter.patch('/online', protect, async (req, res) => {
    const driver = await requireApprovedDriver(req, res)
    if (!driver) return

    const parsed = driverOnlineSchema.safeParse(req.body)
    if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid request body', issues: parsed.error.issues })
    }
    const { isOnline } = parsed.data
    
    if (!isOnline) {
        const active = await prisma.booking.count({
            where: { driverId: driver.id, status: { in: ACTIVE_STATUSES } },
        })
        if (active > 0) return res.status(409).json({ error: 'Finish your active ride before going offline' })
    }

    await prisma.driver.update({
        where: { id: driver.id },
        data: { isOnline },
    })

    return res.json({ isOnline })
})

driverRouter.post('/location', protect, async (req, res) => {
    const driver = await requireApprovedDriver(req, res)
    if (!driver) return
    if (!driver.isOnline) return res.status(403).json({ error: 'Driver is not online' })

    const parsed = locationSchema.safeParse(req.body)
    if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid request body', issues: parsed.error.issues })
    }
    const { lat, lng } = parsed.data //From phone from expo helper fn

    const previous = await prisma.driverLocation.findUnique({
        where: { driverId: driver.id },
    })

    let speedKmh: number | null = null
    let bearing: number | null = null

    const now = new Date()

    if (previous) {
        const distance = haversineDistance(previous.latitude, previous.longitude, lat, lng)
        const seconds = (now.getTime() - previous.updatedAt.getTime()) / 1000

        if (seconds > 0) speedKmh = (distance / seconds) * 3600
        bearing = getBearing(previous.latitude, previous.longitude, lat, lng)
    }

    await prisma.driverLocation.upsert({
        where: { driverId: driver.id },
        create: { driverId: driver.id, latitude: lat, longitude: lng, speedKmh, bearing },
        update: { latitude: lat, longitude: lng, speedKmh, bearing },
    })

    return res.json({ ok: true })
})

driverRouter.post('/fcm-token', protect, async (req, res) => {
    const driver = await requireApprovedDriver(req, res)
    if (!driver) return

    const parsed = fcmTokenSchema.safeParse(req.body)
    if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid request body', issues: parsed.error.issues })
    }
    const { fcmToken } = parsed.data

    await prisma.driver.update({
        where: { id: driver.id },
        data: { fcmToken },
    })

    return res.json({ ok: true })
})

driverRouter.get('/upcoming-ride', protect, async (req, res) => {
    const driver = await requireApprovedDriver(req, res)
    if (!driver) return

    const booking = await prisma.booking.findFirst({
        where: {
            driverId: driver.id,
            status: "assigned",
        },
        select: {
            id: true,
            status: true,
            pickupAddress: true,
            dropAddress: true,
            scheduledAt: true,
            fare: true,
            vehicleClass: true,
            sharing: true,
            isOutstation: true,
        },
        orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }],
    })

    return res.json({ booking })
})

driverRouter.get('/rides', protect, async (req, res) => {
    const driver = await requireApprovedDriver(req, res)
    if (!driver) return

    const bookings = await prisma.booking.findMany({
        where: {
            driverId: driver.id,
            status: { in: ACTIVE_STATUSES },
        },
        select: {
            id: true,
            status: true,
            pickupAddress: true,
            dropAddress: true,
            scheduledAt: true,
            fare: true,
            vehicleClass: true,
            sharing: true,
            isOutstation: true,
        },
        orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }],
    })

    return res.json({ bookings })
})

driverRouter.get('/rides/:id', protect, async (req, res) => {
    const driver = await requireApprovedDriver(req, res)
    if (!driver) return

    const parsed = rideParamsSchema.safeParse(req.params)
    if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid booking id', issues: parsed.error.issues })
    }
    const { id } = parsed.data

    const booking = await prisma.booking.findUnique({
        where: { id },
        include: { user: { select: { name: true, phone: true } } },
    })
    if (!booking) return res.status(404).json({ error: 'Booking not found' })
    if (booking.driverId !== driver.id) return res.status(403).json({ error: 'Forbidden' })

    return res.json({
        bookingId: booking.id,
        status: booking.status,
        isOutstation: booking.isOutstation,
        pickupAddress: booking.pickupAddress,
        pickupLat: booking.pickupLat,
        pickupLng: booking.pickupLng,
        dropAddress: booking.dropAddress,
        dropLat: booking.dropLat,
        dropLng: booking.dropLng,
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

driverRouter.patch('/rides/:id/status', protect, async (req, res) => {
    const driver = await requireApprovedDriver(req, res)
    if (!driver) return

    const parsedParams = rideParamsSchema.safeParse(req.params)
    if (!parsedParams.success) {
        return res.status(400).json({ error: 'Invalid booking id', issues: parsedParams.error.issues })
    }
    const { id } = parsedParams.data

    const parsedBody = rideStatusSchema.safeParse(req.body)
    if (!parsedBody.success) {
        return res.status(400).json({ error: 'Invalid request body', issues: parsedBody.error.issues })
    }
    const { to, otp, lat, lng } = parsedBody.data

    const booking = await prisma.booking.findUnique({
        where: { id },
        select: {
            id: true,
            status: true,
            driverId: true,
            sharing: true,
            pickupLat: true,
            pickupLng: true,
            dropLat: true,
            dropLng: true,
            user: { select: { bookingCode: true } },
        },
    })
    if (!booking) return res.status(404).json({ error: 'Booking not found' })
    if (booking.driverId !== driver.id) return res.status(403).json({ error: 'Forbidden' })

    if (booking.status === to) {
        return res.json({ bookingId: booking.id, status: to, alreadyApplied: true })
    }

    const from: BookingStatus = booking.status
    const legalFrom: readonly BookingStatus[] = RIDE_TRANSITIONS[to as RideTransition]
    if (!legalFrom.includes(from)) {
        return res.status(409).json({ error: `Cannot move a ${from} ride to ${to}`, status: from })
    }

    const hasFix = lat !== undefined && lng !== undefined
    let distanceKm: number | null = null
    if (hasFix) {
        distanceKm = to === 'completed'
            ? haversineDistance(lat, lng, booking.dropLat, booking.dropLng)
            : haversineDistance(lat, lng, booking.pickupLat, booking.pickupLng)
    }

    if (to === 'started') {
        if (!otp || otp !== booking.user.bookingCode) {
            return res.status(403).json({ error: 'Wrong OTP' })
        }
    }

    const now = new Date()
    const data =
        to === 'reached' ? { status: to, reachedAt: now, reachedDistanceKm: distanceKm } :
        to === 'started' ? { status: to, startedAt: now } :
        { status: to, completedAt: now, completedDistanceKm: distanceKm }

    const { count } = await prisma.booking.updateMany({
        where: { id: booking.id, status: from },
        data,
    })
    if (count === 0) {
        return res.status(409).json({ error: 'Ride changed while the request was in flight' })
    }

    if (to === 'completed') {
        const seats = seatsOf(driver.vehicleClass)
        if (seats !== null) {
            await prisma.driver.update({
                where: { id: driver.id },
                data: booking.sharing
                    ? { vehicleCapacity: { increment: driver.vehicleCapacity < seats ? 1 : 0 } }
                    : { vehicleCapacity: seats },
            })
        }
    }

    return res.json({ bookingId: booking.id, status: to, distanceKm })
})

driverRouter.patch('/rides/:id/accept', protect, async (req, res) => {
    const driver = await requireApprovedDriver(req, res)
    if (!driver) return

    const parsed = rideParamsSchema.safeParse(req.params)
    if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid booking id', issues: parsed.error.issues })
    }
    const { id } = parsed.data

    const booking = await prisma.booking.findUnique({ where: { id } })

    if (!booking) return res.status(404).json({ error: 'Booking not found' })

    if (!ASSIGNABLE_STATUSES.includes(booking.status)) {
        return res.status(409).json({ error: `A ${booking.status} ride cannot be accepted`, status: booking.status })
    }

    const seats = seatsOf(driver.vehicleClass)
    const hasRoom = booking.sharing
        ? driver.vehicleCapacity > 0
        : seats !== null && driver.vehicleCapacity >= seats
    if (!hasRoom) return res.status(409).json({ error: 'Vehicle has no room for this ride' })

    if (!await claimBooking(id, driver.id, booking.confirmedAt ?? new Date())) {
        return res.status(409).json({ error: 'Ride was taken while the request was in flight' })
    }

    await prisma.driver.update({
        where: { id: driver.id },
        data: { vehicleCapacity: booking.sharing ? { decrement: 1 } : 0 },
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
        customerPhone: booking.customerPhone,
    })
})


driverRouter.patch('/rides/:id/decline', protect, async (req, res) => {
    const driver = await requireApprovedDriver(req, res)
    if (!driver) return

    const parsed = rideParamsSchema.safeParse(req.params)
    if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid booking id', issues: parsed.error.issues })
    }
    const { id } = parsed.data

    const booking = await prisma.booking.findUnique({
        where: { id },
        select: { id: true, status: true },
    })

    if (!booking) return res.status(404).json({ error: 'Booking not found' })

    if (!ASSIGNABLE_STATUSES.includes(booking.status)) {
        return res.status(409).json({ error: `A ${booking.status} ride cannot be declined`, status: booking.status })
    }

    console.log(`Ride ${booking.id} declined by driver ${driver.id}`)

    return res.json({
        bookingId: booking.id,
        status: booking.status,
    })
})


export default driverRouter
