import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import { protect, protectAdmin } from '../middleware/auth.js'
import { prisma } from '../db/prisma.js'
import { bookingListQuerySchema, driverListQuerySchema } from '../types.ts'

const adminRouter = Router()

adminRouter.get('/booking', protect, protectAdmin, async (req, res) => {
    const parsed = bookingListQuerySchema.safeParse(req.query)
    if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid query parameters', issues: parsed.error.issues })
    }
    const { search, status, startDate, endDate, customerPhone, customerName, driverName, vehicleType, source, isOutstation, cancelledBy, page, limit } = parsed.data

    const where: Prisma.BookingWhereInput = {}
    if (search) {
        // Digits (with optional +, spaces, dashes) → phone search; anything else →
        // names, addresses, and ride-id prefix. ORed so one box covers all fields.
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
    if (vehicleType) where.vehicleType = vehicleType
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

    const [bookings, total] = await Promise.all([
        prisma.booking.findMany({
            where,
            include: { driver: true, user: true },
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { createdAt: 'desc' },
        }),
        prisma.booking.count({ where }),
    ])

    // For sharing rides, attach the other riders in the same share group
    // (each co-rider is a separate booking row with the same shareGroupId).
    type AdminBooking = Prisma.BookingGetPayload<{ include: { driver: true, user: true } }>
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
    const { search, driverName, driverPhone, vehicleType, vehicleNumber, verificationStatus, isOnline, startDate, endDate, page, limit } = parsed.data

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
    if (vehicleType) where.vehicleType = vehicleType
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
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { createdAt: 'desc' },
        }),
        prisma.driver.count({ where }),
    ])

    res.json({ total, page, limit, drivers })
})

export default adminRouter