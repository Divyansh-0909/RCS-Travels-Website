import { Prisma } from '@prisma/client'
import { prisma } from '../db/prisma.js'
import { normalizePhone } from '../lib/phone.js'
import { getRideEstimate } from './rideEstimate.js'
import { verifyQuote } from './fareQuote.js'
import { createBookingFromQuote, BookingCreationError } from './bookingCreation.js'
import { VEHICLE_CLASSES, VEHICLE_CLASS_NAMES } from '../constants/vehicles.js'

const API_VERSION = process.env.WHATSAPP_API_VERSION || 'v26.0'
const APP_ORIGIN = (process.env.APP_ORIGIN || 'http://localhost:1574').replace(/\/$/, '')
const ACTIVE_TTL = 24 * 60 * 60 * 1000

async function send(to, payload) {
  if (!process.env.WHATSAPP_PHONE_NUMBER_ID || !process.env.WHATSAPP_ACCESS_TOKEN) throw new Error('WhatsApp is not configured')
  const response = await fetch(`https://graph.facebook.com/${API_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, ...payload }),
  })
  if (!response.ok) throw new Error(`WhatsApp send failed: ${response.status} ${await response.text()}`)
}
export const sendWhatsAppText = (to, body) => send(to, { type: 'text', text: { preview_url: true, body } })
const sendButtons = (to, body, choices) => send(to, { type: 'interactive', interactive: { type: 'button', body: { text: body },
  action: { buttons: choices.map(([id, title]) => ({ type: 'reply', reply: { id, title } })) } } })
const sendList = (to, body, rows) => send(to, { type: 'interactive', interactive: { type: 'list', body: { text: body },
  action: { button: 'Choose ride', sections: [{ title: 'RCS Travels', rows }] } } })

const mainMenu = (to, name) => sendButtons(to, `Welcome back${name ? `, ${name.split(' ')[0]}` : ''} to RCS Travels 🚕\n\nWhat would you like to do?`,
  [['book', '🚕 Book a ride'], ['my_rides', '📋 My rides']])
const rideMenu = to => sendButtons(to, 'Would you like to:', [['now', '🚕 Ride now'], ['schedule', '📅 Schedule ride']])
const pickupPrompt = (to, label) => sendWhatsAppText(to, `${label ? `📅 Scheduled ride\n${label}\n\n` : ''}Where should we pick you up?\n\n📍 Share a location pin or type the pickup location.`)

export function parseIncoming(message) {
  if (message.type === 'location') return { type: 'location', lat: Number(message.location?.latitude), lng: Number(message.location?.longitude) }
  if (message.type === 'interactive') return { type: 'choice', value: (message.interactive.button_reply ?? message.interactive.list_reply)?.id }
  if (message.type === 'text') {
    const value = message.text?.body?.trim() ?? ''
    return { type: 'text', value, lower: value.toLowerCase() }
  }
  return { type: 'unsupported' }
}

export async function resolveLocation(input) {
  const query = input.type === 'location' ? `${input.lat},${input.lng}` : input.value
  const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&language=en&region=in&key=${process.env.GOOGLE_MAPS_API_KEY}`)
  const body = await response.json()
  const row = body.results?.[0]
  if (!response.ok || body.status !== 'OK' || !row) throw new Error('LOCATION_NOT_FOUND')
  return { address: row.formatted_address, lat: row.geometry.location.lat, lng: row.geometry.location.lng }
}

export function parseScheduleDate(value, now = new Date()) {
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) { const local = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value); if (local) match = [local[0], local[3], local[2], local[1]] }
  if (!match) return null
  const [year, month, day] = match.slice(1).map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  const chosen = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const today = new Date(now.getTime() + 330 * 60000).toISOString().slice(0, 10)
  const max = new Date(now.getTime() + 7 * 86400000 + 330 * 60000).toISOString().slice(0, 10)
  if (chosen < today) return { error: 'past' }
  if (chosen > max) return { error: 'too_far' }
  return { value: chosen }
}

export function parseScheduleTime(date, value, now = new Date()) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (!match || +match[1] > 23 || +match[2] > 59) return null
  const scheduled = new Date(`${date}T${match[1].padStart(2, '0')}:${match[2]}:00+05:30`)
  if (scheduled.getTime() <= now.getTime() + 30 * 60000) return { error: 'too_soon' }
  if (scheduled.getTime() > now.getTime() + 7 * 86400000) return { error: 'too_far' }
  return { value: scheduled.toISOString(), label: scheduled.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) }
}

const estimate = data => getRideEstimate({ pickupAddress: data.pickup.address, dropAddress: data.drop.address,
  vehicleClass: 'hatchback', pickupCoords: { lat: data.pickup.lat, lng: data.pickup.lng },
  dropCoords: { lat: data.drop.lat, lng: data.drop.lng }, preferSafeRoute: false, needsCarrier: false, coupon: null })

function showOptions(to, data, fares) {
  const rows = VEHICLE_CLASS_NAMES.flatMap(vehicle => ['solo', 'sharing'].map(mode => ({ id: `ride:${vehicle}:${mode}`,
    title: `${VEHICLE_CLASSES[vehicle].label} · ${mode === 'solo' ? 'Solo' : 'Share'}`,
    description: `₹${fares[vehicle][mode]}${mode === 'sharing' ? ' · Save 25%' : ''}` })))
  return sendList(to, `🚕 Ride options${data.scheduleLabel ? `\n📅 ${data.scheduleLabel}` : ''}\n\n📍 ${data.pickup.address}\n📍 ${data.drop.address}\n\nChoose vehicle and ride type:`, rows)
}

async function handleConversation(message, user, conversation) {
  const to = message.from
  const input = parseIncoming(message)
  let data = conversation.data ?? {}
  if (Date.now() - conversation.updatedAt.getTime() > ACTIVE_TTL) {
    conversation = await prisma.whatsappSession.update({ where: { phone: conversation.phone }, data: { step: 'MAIN_MENU', data: {} } })
    data = {}
  }
  if (input.type === 'text' && ['cancel', 'stop'].includes(input.lower)) {
    await prisma.whatsappSession.update({ where: { phone: conversation.phone }, data: { step: 'CANCELLED', data: {} } })
    return sendButtons(to, 'Booking cancelled. What would you like to do?', [['book', 'Book a ride'], ['menu', 'Main menu']])
  }
  if (input.type === 'text' && ['hi', 'hello','hey','menu', 'start'].includes(input.lower)) {
    await prisma.whatsappSession.update({ where: { phone: conversation.phone }, data: { step: 'MAIN_MENU', data: {} } })
    return mainMenu(to, user.name)
  }
  if (['MAIN_MENU', 'CANCELLED', 'COMPLETED'].includes(conversation.step)) {
    if (input.value === 'my_rides' || input.lower === 'my rides') {
      const rides = await prisma.booking.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 5,
        select: { reference: true, status: true, pickupAddress: true, dropAddress: true } })
      const summary = rides.length ? rides.map(r => `${r.reference} · ${r.status}\n${r.pickupAddress} → ${r.dropAddress}`).join('\n\n') : 'You have no rides yet.'
      return sendButtons(to, `My rides\n\n${summary}`, [['book', 'Book a ride'], ['menu', 'Main menu']])
    }
    if (input.value !== 'book' && !['book', 'book a ride'].includes(input.lower)) return mainMenu(to, user.name)
    await prisma.whatsappSession.update({ where: { phone: conversation.phone }, data: { step: 'RIDE_TYPE_SELECTION', data: {} } })
    return rideMenu(to)
  }
  if (conversation.step === 'RIDE_TYPE_SELECTION') {
    if (input.value === 'schedule') {
      await prisma.whatsappSession.update({ where: { phone: conversation.phone }, data: { step: 'SCHEDULE_DATE', data: { rideType: 'scheduled' } } })
      return sendWhatsAppText(to, 'Schedule your ride\n\nYou can book 30 minutes to 7 days in advance.\n\nWhat date would you like to travel? Send DD/MM/YYYY.')
    }
    if (input.value !== 'now') return rideMenu(to)
    await prisma.whatsappSession.update({ where: { phone: conversation.phone }, data: { step: 'PICKUP', data: { rideType: 'now' } } })
    return pickupPrompt(to)
  }
  if (conversation.step === 'SCHEDULE_DATE') {
    const parsed = input.type === 'text' && parseScheduleDate(input.value)
    if (!parsed || parsed.error) return sendWhatsAppText(to, parsed?.error === 'too_far' ? 'Choose a date within the next 7 days.' : 'Send a valid future date as DD/MM/YYYY.')
    data = { ...data, scheduleDate: parsed.value }
    await prisma.whatsappSession.update({ where: { phone: conversation.phone }, data: { step: 'SCHEDULE_TIME', data } })
    return sendWhatsAppText(to, `${new Date(`${parsed.value}T12:00:00+05:30`).toLocaleDateString('en-IN', { dateStyle: 'long' })}\n\nWhat time should your ride be? Send 24-hour time, for example 18:30.`)
  }
  if (conversation.step === 'SCHEDULE_TIME') {
    const parsed = input.type === 'text' && parseScheduleTime(data.scheduleDate, input.value)
    if (!parsed || parsed.error) return sendWhatsAppText(to, parsed?.error === 'too_far' ? 'That time is more than 7 days away.' : 'Choose a valid time at least 30 minutes from now using HH:MM.')
    data = { ...data, scheduledAt: parsed.value, scheduleLabel: parsed.label }
    await prisma.whatsappSession.update({ where: { phone: conversation.phone }, data: { step: 'PICKUP', data } })
    return pickupPrompt(to, parsed.label)
  }
  if (['PICKUP', 'DESTINATION'].includes(conversation.step)) {
    if (!['text', 'location'].includes(input.type)) return sendWhatsAppText(to, 'Share a location pin or type a place name.')
    let place
    try { place = await resolveLocation(input) } catch { return sendWhatsAppText(to, 'I couldn’t find that location. Share a pin or add more detail to the place name.') }
    if (conversation.step === 'PICKUP') {
      data = { ...data, pickup: place }
      await prisma.whatsappSession.update({ where: { phone: conversation.phone }, data: { step: 'DESTINATION', data } })
      return sendWhatsAppText(to, `📍 Pickup:\n${place.address}\n\nWhere are you going? Share a pin or type the destination.`)
    }
    data = { ...data, drop: place }
    try {
      const quote = await estimate(data)
      await prisma.whatsappSession.update({ where: { phone: conversation.phone }, data: { step: 'RIDE_OPTIONS', data: { ...data, fares: quote.fares } } })
      return showOptions(to, data, quote.fares)
    } catch { return sendWhatsAppText(to, 'I couldn’t calculate a fare for that route. Type “cancel” and try again, or book on our website.') }
  }
  if (conversation.step === 'RIDE_OPTIONS') {
    const match = input.value?.match(/^ride:([^:]+):(solo|sharing)$/)
    if (!match || !VEHICLE_CLASS_NAMES.includes(match[1])) return showOptions(to, data, data.fares)
    const [, vehicleClass, mode] = match
    data = { ...data, vehicleClass, sharing: mode === 'sharing', fare: data.fares[vehicleClass][mode] }
    await prisma.whatsappSession.update({ where: { phone: conversation.phone }, data: { step: 'CONFIRMATION', data } })
    return sendButtons(to, `${data.rideType === 'scheduled' ? 'Confirm scheduled ride' : 'Confirm your ride'}${data.scheduleLabel ? `\n${data.scheduleLabel}` : ''}\n\n📍 Pickup:\n${data.pickup.address}\n\n📍 Drop:\n${data.drop.address}\n\n🚘 ${VEHICLE_CLASSES[vehicleClass].label}\n${data.sharing ? '👥 Share' : '👤 Solo'}\n💰 Fare: ₹${data.fare}${data.sharing ? '\n\nA compatible passenger may join your trip.' : ''}\n\nConfirm booking?`, [['confirm', '✅ Confirm'], ['cancel', '❌ Cancel']])
  }
  if (conversation.step === 'CONFIRMATION') {
    if (input.value === 'cancel') { await prisma.whatsappSession.update({ where: { phone: conversation.phone }, data: { step: 'CANCELLED', data: {} } }); return mainMenu(to, user.name) }
    if (input.value !== 'confirm') return sendWhatsAppText(to, 'Please choose Confirm or Cancel above.')
    try {
      const fresh = await estimate(data)
      const { quote, error } = verifyQuote(fresh.quote)
      if (error) throw new Error(error)
      const result = await createBookingFromQuote({ user, quote, pickupAddress: data.pickup.address, pickupLat: data.pickup.lat,
        pickupLng: data.pickup.lng, dropAddress: data.drop.address, dropLat: data.drop.lat, dropLng: data.drop.lng,
        vehicleClass: data.vehicleClass, sharing: data.sharing, scheduledAt: data.scheduledAt ?? null, source: 'whatsapp' })
      await prisma.whatsappSession.update({ where: { phone: conversation.phone }, data: { step: 'COMPLETED', data: { bookingId: result.bookingId } } })
      if (result.status === 'payment_pending') return sendWhatsAppText(to, `Scheduled ride created ✅\nBooking: ${result.reference}\nFare: ₹${result.fare}\n\nPay the ${result.financials.advancePercentage}% advance to confirm it:\n${APP_ORIGIN}/booking/${result.bookingId}`)
      return sendWhatsAppText(to, `Looking for a driver...\nBooking: ${result.reference}\n\nWe’ll notify you when your driver is assigned.\n${APP_ORIGIN}/booking/${result.bookingId}`)
    } catch (error) {
      return sendWhatsAppText(to, error instanceof BookingCreationError ? error.message : 'We couldn’t create the booking. Please try again.')
    }
  }
  return sendWhatsAppText(to, 'I didn’t understand that. Type “menu” to start again or “cancel” to stop.')
}

async function claim(message) {
  try { await prisma.whatsAppInboundMessage.create({ data: { id: message.id, phone: message.from } }); return true }
  catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error
    const retry = await prisma.whatsAppInboundMessage.updateMany({ where: { id: message.id,
      OR: [{ status: 'failed' }, { status: 'processing', receivedAt: { lt: new Date(Date.now() - 60000) } }] },
      data: { status: 'processing', error: null, receivedAt: new Date(), processedAt: null } })
    return retry.count === 1
  }
}

export async function processWhatsAppMessage(message) {
  if (!message?.id || !message?.from || !(await claim(message))) return { duplicate: true }
  try {
    const phone = normalizePhone(message.from)
    const user = phone && await prisma.user.findFirst({ where: { phone, deletedAt: null } })
    if (!user) await sendWhatsAppText(message.from, `We couldn’t find an account linked to this WhatsApp number.\n\nCreate your account on our website first. \n\n${APP_ORIGIN}/signup \n\nOnce it’s created, come back here and we’ll help you book your ride.`)
    else {
      const conversation = await prisma.whatsappSession.upsert({ where: { phone: message.from }, update: {},
        create: { phone: message.from, step: 'MAIN_MENU', data: {} } })
      await handleConversation(message, user, conversation)
    }
    await prisma.whatsAppInboundMessage.update({ where: { id: message.id }, data: { status: 'processed', processedAt: new Date() } })
    return { duplicate: false }
  } catch (error) {
    await prisma.whatsAppInboundMessage.update({ where: { id: message.id }, data: { status: 'failed', error: String(error.message).slice(0, 500) } }).catch(() => {})
    throw error
  }
}

export const messagesFromWebhook = body => (body.entry ?? []).flatMap(e => e.changes ?? []).flatMap(c => c.value?.messages ?? [])
