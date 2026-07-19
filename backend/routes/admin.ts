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
    const { status, date, phone, customerName, driverName, vehicleType, source, isOutstation, cancelledBy, page, limit } = parsed.data

    const where: Prisma.BookingWhereInput = {}
    if (status) where.status = status
    if (phone) where.customerPhone = { contains: phone }
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
    if (date) {
        const start = new Date(`${date}T00:00:00+05:30`)
        const end = new Date(`${date}T00:00:00+05:30`)
        end.setDate(end.getDate() + 1)
        where.scheduledAt = { gte: start, lt: end }
    }

    const [bookings, total] = await Promise.all([
        prisma.booking.findMany({
            where,
            include: { driver: true, user: true },
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { scheduledAt: 'desc' },
        }),
        prisma.booking.count({ where }),
    ])

    res.json({ total, page, limit, bookings })
})

adminRouter.get('/driver', protect, protectAdmin, async (req, res) => {
    const parsed = driverListQuerySchema.safeParse(req.query)
    if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid query parameters', issues: parsed.error.issues })
    }
    const { name, phone, vehicleType, vehicleNumber, verificationStatus, isOnline, date, page, limit } = parsed.data

    const where: Prisma.DriverWhereInput = {}
    if (name) where.name = {
        contains: name,
        mode: "insensitive",
    }
    if (phone) where.phone = phone
    if (isOnline !== undefined) where.isOnline = isOnline
    if (vehicleType) where.vehicleType = vehicleType
    if (vehicleNumber) where.vehicleNumber = {
        contains: vehicleNumber ,
        mode: "insensitive",
    }
    if (verificationStatus) where.verificationStatus = verificationStatus
    if (date) {
        const start = new Date(`${date}T00:00:00+05:30`)
        const end = new Date(`${date}T00:00:00+05:30`)
        end.setDate(end.getDate() + 1)
        where.createdAt = { gte: start, lt: end }
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