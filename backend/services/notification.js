import { prisma } from '../db/prisma.js'
import { messaging, isPushConfigured } from '../lib/firebase.js'

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

// Assignment simulator: true means the driver accepted, not merely delivered.
async function sendFCM(driverFcmToken, payload) {
    console.log('FCM ->', driverFcmToken, payload)
    if (process.env.FCM_ALWAYS_ACCEPT === '1') return true
    await delay(30000)
    return Math.round(Math.random()) === 1
}

async function sendPush(driver, { title, body, data = {} }) {
    if (!driver?.fcmToken) return false
    const fcm = messaging()
    if (!fcm) {
        console.log(`push -> ${driver.id}: ${title} - ${body} (push not configured)`)
        return false
    }
    try {
        await fcm.send({ token: driver.fcmToken, notification: { title, body },
            data: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, String(value)])),
            android: { priority: 'high', notification: { channelId: 'default' } } })
        return true
    } catch (err) {
        const dead = err.code === 'messaging/registration-token-not-registered'
            || err.code === 'messaging/invalid-registration-token'
            || err.errorInfo?.code === 'messaging/registration-token-not-registered'
        if (dead) {
            await prisma.driver.updateMany({ where: { id: driver.id, fcmToken: driver.fcmToken },
                data: { fcmToken: null } }).catch(() => {})
            console.log(`push -> ${driver.id}: token was dead, cleared`)
            return false
        }
        console.error(`push -> ${driver.id} failed:`, err.message)
        return false
    }
}

const recipient = phone => {
    const digits = String(phone ?? '').replace(/\D/g, '')
    return digits.length === 10 ? `91${digits}` : digits
}
const graphVersion = () => process.env.WHATSAPP_API_VERSION || 'v26.0'

async function sendWhatsApp(phone, message) {
    if (!phone || !process.env.WHATSAPP_PHONE_NUMBER_ID || !process.env.WHATSAPP_ACCESS_TOKEN) {
        console.log(`Message to ${phone}: ${message} (WhatsApp not configured)`)
        return false
    }
    const to = recipient(phone)
    try {
        const response = await fetch(`https://graph.facebook.com/${graphVersion()}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
            method: 'POST', headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
                'Content-Type': 'application/json' },
            body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text',
                text: { preview_url: true, body: message } }),
        })
        if (!response.ok) throw new Error(`${response.status} ${await response.text()}`)
        return true
    } catch (err) {
        console.error(`WhatsApp -> ${to} failed:`, err.message)
        return false
    }
}

export function whatsappTemplateComponents({ body = [], buttons = [] } = {}) {
    const components = []
    if (body.length) components.push({ type: 'body',
        parameters: body.map(text => ({ type: 'text', text: String(text) })) })
    for (const button of buttons) components.push({ type: 'button', sub_type: 'url',
        index: String(button.index), parameters: [{ type: 'text', text: String(button.text) }] })
    return components
}

export async function sendWhatsAppTemplate(phone, name, parameters = {}) {
    if (!phone || !name || !process.env.WHATSAPP_PHONE_NUMBER_ID || !process.env.WHATSAPP_ACCESS_TOKEN) {
        console.log(`WhatsApp template ${name || '(missing)'} to ${phone || '(missing)'} (not configured)`)
        return false
    }
    const to = recipient(phone)
    try {
        const response = await fetch(`https://graph.facebook.com/${graphVersion()}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
            method: 'POST', headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
                'Content-Type': 'application/json' },
            body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'template', template: {
                name, language: { code: 'en_US' }, components: whatsappTemplateComponents(
                    Array.isArray(parameters) ? { body: parameters } : parameters),
            } }),
        })
        if (!response.ok) throw new Error(`${response.status} ${await response.text()}`)
        return true
    } catch (err) {
        console.error(`WhatsApp template ${name} -> ${to} failed:`, err.message)
        return false
    }
}

const bookingButton = id => ({ index: 0, text: id })
const isWhatsAppBooking = booking => booking?.source === 'whatsapp'
const formatPickup = value => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata',
    day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
}).format(new Date(value))
const bookingInclude = { user: { select: { name: true, phone: true } },
    driver: { select: { id: true, name: true, phone: true, fcmToken: true,
        vehicleNumber: true, vehicleModel: true } } }

export async function notifyWhatsAppRideStatus(bookingId, event) {
    const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: bookingInclude })
    if (!isWhatsAppBooking(booking)) return false
    if (event === 'assigned') {
        const driver = booking.driver
        return sendWhatsAppTemplate(booking.customerPhone, process.env.WHATSAPP_TEMPLATE_DRIVER_ASSIGNED, {
            body: [booking.reference, driver?.name ?? 'Your driver', driver?.phone ?? 'Not available',
                booking.vehicleModel ?? driver?.vehicleModel ?? booking.vehicleClass,
                booking.vehicleNumber ?? driver?.vehicleNumber ?? 'Not available'],
            buttons: [bookingButton(booking.id)],
        })
    }
    if (event === 'completed') return sendWhatsAppTemplate(booking.customerPhone,
        process.env.WHATSAPP_TEMPLATE_RIDE_COMPLETED, {
            body: [booking.reference, booking.fare], buttons: [bookingButton(booking.id)],
        })
    return false
}

export async function notifyWhatsAppPoolJoined(bookingId) {
    const joined = await prisma.booking.findUnique({ where: { id: bookingId }, select: { shareGroupId: true } })
    if (!joined?.shareGroupId) return false
    const others = await prisma.booking.findMany({ where: { shareGroupId: joined.shareGroupId,
        id: { not: bookingId }, source: 'whatsapp' },
    select: { id: true, reference: true, customerPhone: true } })
    await Promise.all(others.map(row => sendWhatsAppTemplate(row.customerPhone,
        process.env.WHATSAPP_TEMPLATE_POOL_JOINED,
        { body: [row.reference], buttons: [bookingButton(row.id)] })))
    return others.length > 0
}

export async function notifyWhatsAppDriverCancelled(bookingId) {
    const booking = await prisma.booking.findUnique({ where: { id: bookingId },
        select: { id: true, reference: true, source: true, customerPhone: true } })
    if (!isWhatsAppBooking(booking)) return false
    return sendWhatsAppTemplate(booking.customerPhone, process.env.WHATSAPP_TEMPLATE_DRIVER_CANCELLED_RIDE,
        { body: [booking.reference], buttons: [bookingButton(booking.id)] })
}

export async function notifyWhatsAppNoDriver(bookingId) {
    const booking = await prisma.booking.findUnique({ where: { id: bookingId },
        select: { reference: true, source: true, customerPhone: true } })
    if (!isWhatsAppBooking(booking)) return false
    return sendWhatsAppTemplate(booking.customerPhone, process.env.WHATSAPP_TEMPLATE_NO_DRIVER_FOUND,
        { body: [booking.reference] })
}

export async function notifyWhatsAppScheduledPaymentConfirmed(bookingId) {
    const booking = await prisma.booking.findUnique({ where: { id: bookingId }, select: { id: true,
        reference: true, source: true, customerPhone: true, scheduledAt: true,
        scheduledAdvancePaidAmount: true } })
    if (!isWhatsAppBooking(booking) || !booking.scheduledAt) return false
    return sendWhatsAppTemplate(booking.customerPhone,
        process.env.WHATSAPP_TEMPLATE_SCHEDULED_PAYMENT_CONFIRMED, {
            body: [booking.reference, formatPickup(booking.scheduledAt),
                (booking.scheduledAdvancePaidAmount / 100).toFixed(2), booking.customerPhone],
            buttons: [bookingButton(booking.id)],
        })
}

export async function notifyWhatsAppAdminUnassigned(booking) {
    if (!booking) return false
    return sendWhatsAppTemplate(process.env.ADMIN_PHONE,
        process.env.WHATSAPP_TEMPLATE_ADMIN_UNASSIGNED_RIDE, { body: [booking.reference,
            formatPickup(booking.scheduledAt), booking.user?.name ?? 'Customer', booking.customerPhone,
            booking.pickupAddress, booking.dropAddress] })
}

async function claimReminder(bookingId, field, send) {
    const claimedAt = new Date()
    const { count } = await prisma.booking.updateMany({ where: { id: bookingId, [field]: null },
        data: { [field]: claimedAt } })
    if (!count) return false
    const sent = await send().catch(() => false)
    if (!sent) await prisma.booking.updateMany({ where: { id: bookingId, [field]: claimedAt },
        data: { [field]: null } }).catch(() => {})
    return sent
}

export async function sendScheduledRideReminders(now = new Date()) {
    const until = new Date(now.getTime() + 30 * 60 * 1000)
    const bookings = await prisma.booking.findMany({ where: { scheduledAt: { gt: now, lte: until },
        status: { in: ['assigned', 'en_route'] }, driverId: { not: null },
        OR: [{ customerReminderSentAt: null }, { driverReminderSentAt: null }] }, include: bookingInclude })
    let customer = 0
    let driver = 0
    for (const booking of bookings) {
        if (booking.source === 'whatsapp' && !booking.customerReminderSentAt) {
            const sent = await claimReminder(booking.id, 'customerReminderSentAt', () =>
                sendWhatsAppTemplate(booking.customerPhone,
                    process.env.WHATSAPP_TEMPLATE_CUSTOMER_SCHEDULED_REMINDER, {
                        body: [booking.reference, formatPickup(booking.scheduledAt), booking.pickupAddress,
                            booking.dropAddress, booking.driver?.name ?? 'Your driver',
                            booking.driver?.phone ?? 'Not available'],
                        buttons: [bookingButton(booking.id)],
                    }))
            if (sent) customer++
        }
        if (!booking.driverReminderSentAt && booking.driver) {
            const sent = await claimReminder(booking.id, 'driverReminderSentAt', () =>
                sendWhatsAppTemplate(booking.driver.phone,
                    process.env.WHATSAPP_TEMPLATE_DRIVER_SCHEDULED_REMINDER, {
                        body: [booking.reference, formatPickup(booking.scheduledAt),
                            booking.user?.name ?? 'Customer', booking.customerPhone,
                            booking.pickupAddress, booking.dropAddress],
                        buttons: [bookingButton(booking.id)],
                    }))
            if (sent) driver++
        }
    }
    return { customer, driver }
}

async function sendOtpWhatsApp(phone, code) {
    const response = await fetch(`https://graph.facebook.com/${graphVersion()}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
        method: 'POST', headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
            'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: recipient(phone), type: 'template',
            template: { name: 'verification_otp', language: { code: 'en_US' }, components: [
                { type: 'body', parameters: [{ type: 'text', text: code }] },
                { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] },
            ] } }),
    })
    if (!response.ok) throw new Error(`WhatsApp send failed: ${response.status} ${await response.text()}`)
}

export { sendFCM, sendPush, sendWhatsApp, sendOtpWhatsApp, isPushConfigured }
