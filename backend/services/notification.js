import { prisma } from '../db/prisma.js'
import { messaging, isPushConfigured } from '../lib/firebase.js'

// sendFCM and sendWhatsApp are STUBS — sendFCM fakes a driver's answer with a coin
// flip and sendWhatsApp only logs. Their real integrations land in Phase 6, and the
// free-text sendWhatsApp callers will each need an approved utility template by then
// (WhatsApp only allows free text inside a 24h reply window). sendOtpWhatsApp is
// real: it delivers via the Cloud API using the approved verification_otp template.
//
// `sendPush` below is real and is NOT a replacement for sendFCM. See the comment
// on it for why the two cannot be the same function.
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// The 30s wait imitates a driver deciding; true means ACCEPTED, not delivered.
async function sendFCM(driverFcmToken, payload){
    console.log('FCM →', driverFcmToken, payload)
    // Skips the wait and the coin flip so the first eligible driver is assigned
    // deterministically. Dev only — set FCM_ALWAYS_ACCEPT=0 before deploying.
    if (process.env.FCM_ALWAYS_ACCEPT === '1') return true
    await delay(30000)
    return Math.round(Math.random()) === 1 ? true : false
}

/**
 * Deliver one push notification to one driver. Resolves true if Firebase
 * accepted it for delivery.
 *
 * NOT THE SAME THING AS sendFCM ABOVE, AND DELIBERATELY A SEPARATE FUNCTION.
 * sendFCM's boolean means "the driver accepted this ride" — driverAssignment.js
 * reads it as the driver's ANSWER, waits 30 seconds for it, and assigns the ride
 * on the strength of it. A real push cannot return that: FCM tells you whether a
 * message was accepted for delivery, never what the person did about it.
 *
 * Making sendFCM real would therefore mean rewriting the assignment loop to be
 * event-driven — push out, return immediately, and let PATCH /rides/:id/accept
 * settle the booking. That is a real piece of work and it is not this one, so
 * the stub stays exactly as it is and anything that just needs to TELL a driver
 * something uses this instead.
 *
 * @param {{ id: string, fcmToken: string | null }} driver
 * @param {{ title: string, body: string, data?: Record<string, string> }} message
 */
async function sendPush(driver, { title, body, data = {} }) {
    if (!driver?.fcmToken) return false

    const fcm = messaging()
    if (!fcm) {
        // Configured out, or credentials missing. Logged at the level somebody
        // reading a dev console would want, and no louder — a project without
        // Firebase keys should not fill its log with failures on every write.
        console.log(`push → ${driver.id}: ${title} — ${body} (push not configured)`)
        return false
    }

    try {
        await fcm.send({
            token: driver.fcmToken,
            notification: { title, body },
            // Every value must be a string; the SDK rejects the message outright
            // if one is not, which would lose a notification over a number.
            data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
            android: {
                priority: 'high',
                notification: { channelId: 'default' },
            },
        })
        return true
    } catch (err) {
        // The token belongs to an app install that no longer exists — reinstalled,
        // uninstalled, or restored onto a new phone. Clearing it stops every
        // future send burning a round trip on a dead address, and the app writes
        // a fresh one through POST /driver/fcm-token the next time it opens.
        const dead = err.code === 'messaging/registration-token-not-registered'
            || err.code === 'messaging/invalid-registration-token'
            || err.errorInfo?.code === 'messaging/registration-token-not-registered'

        if (dead) {
            await prisma.driver
                .updateMany({ where: { id: driver.id, fcmToken: driver.fcmToken }, data: { fcmToken: null } })
                .catch(() => { })
            console.log(`push → ${driver.id}: token was dead, cleared`)
            return false
        }

        console.error(`push → ${driver.id} failed:`, err.message)
        return false
    }
}

async function sendWhatsApp(phone, message){
    if (!phone || !process.env.WHATSAPP_PHONE_NUMBER_ID || !process.env.WHATSAPP_ACCESS_TOKEN) {
        console.log(`Message to ${phone} : ${message} (WhatsApp not configured)`)
        return false
    }
    const digits = String(phone).replace(/\D/g, '')
    const to = digits.length === 10 ? `91${digits}` : digits
    try {
        const response = await fetch(
            `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION || 'v21.0'}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
            { method: 'POST', headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { preview_url: true, body: message } }) },
        )
        if (!response.ok) throw new Error(`${response.status} ${await response.text()}`)
        return true
    } catch (err) {
        console.error(`WhatsApp → ${to} failed:`, err.message)
        return false
    }
}

async function sendWhatsAppTemplate(phone, name, parameters) {
    if (!name) return false
    const digits = String(phone).replace(/\D/g, '')
    const to = digits.length === 10 ? `91${digits}` : digits
    try {
        const response = await fetch(`https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION || 'v21.0'}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
            method: 'POST', headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'template', template: {
                name, language: { code: 'en_US' }, components: [{ type: 'body', parameters: parameters.map(text => ({ type: 'text', text: String(text) })) }],
            } }),
        })
        if (!response.ok) throw new Error(`${response.status} ${await response.text()}`)
        return true
    } catch (err) {
        console.error(`WhatsApp template ${name} → ${to} failed:`, err.message)
        return false
    }
}

const appOrigin = () => (process.env.APP_ORIGIN || 'http://localhost:1574').replace(/\/$/, '')

export async function notifyWhatsAppRideStatus(bookingId, event) {
    const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: {
        user: { select: { phone: true } }, driver: { select: { name: true, vehicleNumber: true, vehicleModel: true } },
    } })
    if (!booking || booking.source !== 'whatsapp') return false
    const track = `${appOrigin()}/booking/${booking.id}`
    if (event === 'assigned') {
        const driver = booking.driver
        const template = process.env.WHATSAPP_TEMPLATE_DRIVER_ASSIGNED
        if (template) return sendWhatsAppTemplate(booking.user.phone, template,
            [driver?.name ?? 'Your driver', booking.vehicleModel ?? driver?.vehicleModel ?? booking.vehicleClass,
             booking.vehicleNumber ?? driver?.vehicleNumber ?? '—', track])
        return sendWhatsApp(booking.user.phone, `🚕 Driver assigned!\n\n${driver?.name ?? 'Your driver'}\n${booking.vehicleModel ?? driver?.vehicleModel ?? booking.vehicleClass} · ${booking.vehicleNumber ?? driver?.vehicleNumber ?? ''}\n\nTrack ride:\n${track}`)
    }
    if (event === 'reached') return process.env.WHATSAPP_TEMPLATE_DRIVER_ARRIVED
        ? sendWhatsAppTemplate(booking.user.phone, process.env.WHATSAPP_TEMPLATE_DRIVER_ARRIVED, [track])
        : sendWhatsApp(booking.user.phone, `🚕 Your driver has arrived at the pickup.\n\nTrack ride:\n${track}`)
    if (event === 'completed') return process.env.WHATSAPP_TEMPLATE_RIDE_COMPLETED
        ? sendWhatsAppTemplate(booking.user.phone, process.env.WHATSAPP_TEMPLATE_RIDE_COMPLETED, [booking.reference, booking.fare])
        : sendWhatsApp(booking.user.phone, `✅ Ride completed.\nBooking: ${booking.reference}\nFare: ₹${booking.fare}`)
    return false
}

export async function notifyWhatsAppPoolJoined(bookingId) {
    const joined = await prisma.booking.findUnique({ where: { id: bookingId }, select: { shareGroupId: true } })
    if (!joined?.shareGroupId) return false
    const others = await prisma.booking.findMany({ where: { shareGroupId: joined.shareGroupId, id: { not: bookingId }, source: 'whatsapp' },
        select: { id: true, customerPhone: true } })
    await Promise.all(others.map(row => {
        const track = `${appOrigin()}/booking/${row.id}`
        return process.env.WHATSAPP_TEMPLATE_POOL_JOINED
            ? sendWhatsAppTemplate(row.customerPhone, process.env.WHATSAPP_TEMPLATE_POOL_JOINED, [track])
            : sendWhatsApp(row.customerPhone, `👥 Another passenger has joined your shared ride.\n\nThe driver will make an additional pickup before continuing your trip.\n\nTrack ride:\n${track}`)
    }))
    return others.length > 0
}

// Authentication templates require the code twice: once for the body text and once
// for the copy-code button's url parameter. `phone` is the bare 10-digit number the
// routes validate; the 91 prefix matches the convention used for Clerk emails.
async function sendOtpWhatsApp(phone, code){
    const res = await fetch(
        `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: `91${phone}`,
                type: 'template',
                template: {
                    name: 'verification_otp',
                    language: { code: 'en_US' },
                    components: [
                        { type: 'body', parameters: [{ type: 'text', text: code }] },
                        { type: 'button', sub_type: 'url', index: '0',
                          parameters: [{ type: 'text', text: code }] },
                    ],
                },
            }),
        }
    )
    if (!res.ok) throw new Error(`WhatsApp send failed: ${res.status} ${await res.text()}`)
}

export {sendFCM, sendPush, sendWhatsApp, sendOtpWhatsApp, isPushConfigured}
