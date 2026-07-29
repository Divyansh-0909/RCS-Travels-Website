import { Router } from 'express'
import { getAuth } from '@clerk/express'
import type { Prisma } from '@prisma/client'
import { protect, protectAdmin } from '../middleware/auth.js'
import { prisma } from '../db/prisma.js'
import { getFareZones, saveFareZones } from '../services/fareZones.js'
import { bookingListQuerySchema, driverListQuerySchema, userListQuerySchema, fareZoneCollectionSchema } from '../types.ts'

// Read-only, by omission rather than design: three list endpoints and no mutations.
// The dashboard can therefore show a driver's pending verification but not act on
// it, and approve/reject/deactivate plus manual booking re-assignment all still need
// building — they gate the driver app, since only `approved` drivers can go online.
//
// Every route is behind protectAdmin (metadata.role === 'admin' on the Clerk session).
const adminRouter = Router()

adminRouter.get('/booking', protect, protectAdmin, async (req, res) => {
    const parsed = bookingListQuerySchema.safeParse(req.query)
    if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid query parameters', issues: parsed.error.issues })
    }
    const { search, status, startDate, endDate, customerPhone, customerName, driverName, vehicleClass, source, isOutstation, cancelledBy, page, limit } = parsed.data

    const where: Prisma.BookingWhereInput = {}
    if (search) {
        // Digits → phone search; anything else → names, addresses, and ride-id prefix.
        const compact = search.replace(/[\s+\-()]/g, '')
        if (/^\d+$/.test(compact)) {
            where.OR = [
                { customerPhone: { contains: compact } },
                { driver: { phone: { contains: compact } } },
            ]
        } else {
            where.OR = [
                { id: { startsWith: search } },
                { user: { name: { contains: search, mode: 'insensitive' } } },
                { driver: { name: { contains: search, mode: 'insensitive' } } },
                { pickupAddress: { contains: search, mode: 'insensitive' } },
                { dropAddress: { contains: search, mode: 'insensitive' } },
            ]
        }
    }
    if (status) where.status = status
    if (customerPhone) where.customerPhone = { contains: customerPhone }
    if (customerName) where.user = {
        name: { contains: customerName, mode: "insensitive" },
    }
    if (driverName) where.driver = {
        name: { contains: driverName, mode: "insensitive" },
    }
    if (vehicleClass) where.vehicleClass = vehicleClass
    if (source) where.source = source
    if (isOutstation !== undefined) where.isOutstation = isOutstation
    if (cancelledBy) where.cancelledBy = cancelledBy
    if (startDate || endDate) {
        const scheduledAt: Prisma.DateTimeFilter = {}
        if (startDate) scheduledAt.gte = new Date(`${startDate}T00:00:00+05:30`)
        if (endDate) {
            const end = new Date(`${endDate}T00:00:00+05:30`)
            end.setDate(end.getDate() + 1)
            scheduledAt.lt = end
        }
        where.scheduledAt = scheduledAt
    }

    // Only the fields the dashboard renders; `shareGroupId` is kept for the co-rider grouping below.
    const bookingSelect = {
        id: true,
        customerPhone: true,
        pickupAddress: true,
        dropAddress: true,
        vehicleClass: true,
        scheduledAt: true,
        createdAt: true,
        isOutstation: true,
        fare: true,
        status: true,
        source: true,
        sharing: true,
        shareGroupId: true,
        user: { select: { name: true } },
        driver: { select: { name: true, phone: true } },
    } satisfies Prisma.BookingSelect

    const [bookings, total] = await Promise.all([
        prisma.booking.findMany({
            where,
            select: bookingSelect,
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { createdAt: 'desc' },
        }),
        prisma.booking.count({ where }),
    ])

    // Attach co-riders: each is a separate booking row with the same shareGroupId.
    type AdminBooking = Prisma.BookingGetPayload<{ select: typeof bookingSelect }>
    type GroupMember = { id: string; shareGroupId: string | null; customerPhone: string; user: { name: string | null } }
    const shareGroupIds = [...new Set(
        bookings.filter((b: AdminBooking) => b.sharing && b.shareGroupId).map((b: AdminBooking) => b.shareGroupId as string)
    )]
    let groupMembers: GroupMember[] = []
    if (shareGroupIds.length > 0) {
        groupMembers = await prisma.booking.findMany({
            where: { shareGroupId: { in: shareGroupIds } },
            select: { id: true, shareGroupId: true, customerPhone: true, user: { select: { name: true } } },
        })
    }
    const bookingsWithCoRiders = bookings.map((b: AdminBooking) => ({
        ...b,
        coRiders: b.sharing && b.shareGroupId
            ? groupMembers
                .filter(m => m.shareGroupId === b.shareGroupId && m.id !== b.id)
                .map(m => ({ name: m.user.name, phone: m.customerPhone }))
            : [],
    }))

    res.json({ total, page, limit, bookings: bookingsWithCoRiders })
})

adminRouter.get('/driver', protect, protectAdmin, async (req, res) => {
    const parsed = driverListQuerySchema.safeParse(req.query)
    if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid query parameters', issues: parsed.error.issues })
    }
    const { search, driverName, driverPhone, vehicleClass, vehicleNumber, verificationStatus, isOnline, startDate, endDate, page, limit } = parsed.data

    const where: Prisma.DriverWhereInput = {}
    if (search) {
        const compact = search.replace(/[\s+\-()]/g, '')
        if (/^\d+$/.test(compact)) {
            where.OR = [
                { phone: { contains: compact } },
                { vehicleNumber: { contains: compact, mode: 'insensitive' } },
            ]
        } else {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { vehicleNumber: { contains: search, mode: 'insensitive' } },
            ]
        }
    }
    if (driverName) where.name = {
        contains: driverName,
        mode: "insensitive",
    }
    if (driverPhone) where.phone = driverPhone
    if (isOnline !== undefined) where.isOnline = isOnline
    if (vehicleClass) where.vehicleClass = vehicleClass
    if (vehicleNumber) where.vehicleNumber = {
        contains: vehicleNumber ,
        mode: "insensitive",
    }
    if (verificationStatus) where.verificationStatus = verificationStatus
    if (startDate || endDate) {
        const createdAt: Prisma.DateTimeFilter = {}
        if (startDate) createdAt.gte = new Date(`${startDate}T00:00:00+05:30`)
        if (endDate) {
            const end = new Date(`${endDate}T00:00:00+05:30`)
            end.setDate(end.getDate() + 1)
            createdAt.lt = end
        }
        where.createdAt = createdAt
    }

    const [drivers, total] = await Promise.all([
        prisma.driver.findMany({
            where,
            select: {
                id: true,
                name: true,
                phone: true,
                vehicleClass: true,
                vehicleNumber: true,
                isOnline: true,
                verificationStatus: true,
                createdAt: true,
            },
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { createdAt: 'desc' },
        }),
        prisma.driver.count({ where }),
    ])

    res.json({ total, page, limit, drivers })
})

adminRouter.get('/user', protect, protectAdmin, async (req, res) => {
    const parsed = userListQuerySchema.safeParse(req.query)
    if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid query parameters', issues: parsed.error.issues })
    }
    const { search, userName, userPhone, gender, startDate, endDate, page, limit } = parsed.data

    const where: Prisma.UserWhereInput = {}
    if (search) {
        const compact = search.replace(/[\s+\-()]/g, '')
        if (/^\d+$/.test(compact)) {
            where.OR = [
                { phone: { contains: compact } },
                { bookingCode: { contains: compact } },
            ]
        } else {
            where.OR = [
                { id: { startsWith: search } },
                { name: { contains: search, mode: 'insensitive' } },
            ]
        }
    }
    if (userName) where.name = {
        contains: userName,
        mode: "insensitive",
    }
    if (userPhone) where.phone = { contains: userPhone }
    if (gender) where.gender = { equals: gender, mode: "insensitive" }
    if (startDate || endDate) {
        const createdAt: Prisma.DateTimeFilter = {}
        if (startDate) createdAt.gte = new Date(`${startDate}T00:00:00+05:30`)
        if (endDate) {
            const end = new Date(`${endDate}T00:00:00+05:30`)
            end.setDate(end.getDate() + 1)
            createdAt.lt = end
        }
        where.createdAt = createdAt
    }

    const [users, total] = await Promise.all([
        prisma.user.findMany({
            where,
            select: {
                id: true,
                name: true,
                phone: true,
                gender: true,
                bookingCode: true,
                createdAt: true,
                deletedAt: true,
                _count: { select: { bookings: true } },
            },
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { createdAt: 'desc' },
        }),
        prisma.user.count({ where }),
    ])

    res.json({ total, page, limit, users })
})

// ─── Fare zones ──────────────────────────────────────────────────────────────
// The Edit Fares tab. The first mutation on this router, and the one with the
// widest blast radius: a save here changes what every rider is quoted on the
// next request, with no deploy in between.

adminRouter.get('/zones', protect, protectAdmin, (_req, res) => {
    res.json(getFareZones())
})

adminRouter.put('/zones', protect, protectAdmin, async (req, res) => {
    const parsed = fareZoneCollectionSchema.safeParse(req.body)
    if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid fare zones', issues: parsed.error.issues })
    }

    // Two zones sharing a name make the change summary ambiguous and any later
    // "which zone priced this ride" question unanswerable.
    const names = parsed.data.features.map(f => f.properties.name)
    const duplicate = names.find((n, i) => names.indexOf(n) !== i)
    if (duplicate) {
        return res.status(400).json({ error: `Do area ka naam ek jaisa hai: “${duplicate}”. Dono ke naam alag rakhein.` })
    }

    try {
        const saved = await saveFareZones(parsed.data, getAuth(req).userId)
        res.json(saved)
    } catch (err) {
        console.error('saveFareZones failed:', err)
        res.status(500).json({ error: 'Fare zones save nahi ho paaye. Dobara koshish karein.' })
    }
})

export default adminRouter