import { Prisma } from '@prisma/client'
import { prisma } from '../db/prisma.js'
import { normalizePhone } from '../lib/phone.js'
import { CARRIER_CHARGE, getRideEstimate } from './rideEstimate.js'
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

const labelledValue = (text, labels) => {
  const match = new RegExp(`^\\s*(?:${labels})\\s*(?::|=|-)\\s*(.+?)\\s*$`, 'im').exec(text)
  return match?.[1]?.trim() || null
}

const trimBookingDetails = value => {
  const markers = [
    /[,\s]+(?=(?:sharing|share\s+ride|(?:roof|luggage)\s+carrier|carrier)\s*[:=-])/i,
    /\s+(?=(?:with(?:out)?|using|taking|choose|prefer|want|need|add|require|no)\s+(?:(?:a|the)\s+)?(?:safe(?:r)?\s+route|sharing|shared?\s+ride|(?:(?:roof|luggage)\s+)?carrier)\b)/i,
    /,\s*(?=(?:now|today|tomorrow|scheduled?|on\s+\d|at\s+\d|(?:(?:prefer\s+)?safe(?:r)?\s+route|route\s+preference|vehicle|car|mode|ride\s*type|date|time)\s*[:=-]|premium\s+suv|hatchback|sedan|suv|solo|private|share|sharing|shared|pool(?:ing)?|safe(?:r)?\s+route|fastest\s+route|standard\s+route)\b)/i,
    /\s+(?=(?:now|today|tomorrow|scheduled?\b|on\s+\d{1,4}[/-]|at\s+\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?\b|(?:(?:prefer\s+)?safe(?:r)?\s+route|route\s+preference|vehicle|car|mode|ride\s*type|date|time)\s*[:=-]|premium\s+suv|hatchback|sedan|suv|solo|private|share|sharing|shared|pool(?:ing)?|safe(?:r)?\s+route|fastest\s+route|standard\s+route)\b)/i,
  ]
  let end = value.length
  for (const marker of markers) {
    const match = marker.exec(value)
    if (match && match.index < end) end = match.index
  }
  return value.slice(0, end).replace(/[,.\s]+$/, '').trim()
}

const timeFromText = text => {
  const labelled = labelledValue(text, 'time')
  const source = labelled || text
  let match = /\b([01]?\d|2[0-3]):([0-5]\d)(?:\s*(a\.?m\.?|p\.?m\.?))?\b/i.exec(source)
  if (!match) match = /\b(1[0-2]|0?[1-9])(?:[:.]([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)\b/i.exec(source)
  if (!match) return null
  let hour = Number(match[1])
  const minute = Number(match[2] || 0)
  const meridiem = match[3]?.toLowerCase().replace(/\./g, '')
  if (meridiem) {
    if (hour > 12) return null
    if (hour === 12) hour = 0
    if (meridiem === 'pm') hour += 12
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

const dateFromText = (text, now) => {
  const labelled = labelledValue(text, '(?:travel\\s*)?date')
  const explicit = labelled?.match(/\b(?:\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})\b/)?.[0] ??
    text.match(/\b(?:\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})\b/)?.[0]
  if (explicit) return parseScheduleDate(explicit, now)
  const lower = text.toLowerCase()
  if (!/\b(today|tomorrow)\b/.test(lower)) return null
  const offset = /\btomorrow\b/.test(lower) ? 1 : 0
  return { value: new Date(now.getTime() + (330 * 60000) + (offset * 86400000)).toISOString().slice(0, 10) }
}

const vehicleFromText = text => {
  if (/\bpremium\s+suv\b/i.test(text)) return 'suv_premium'
  if (/\b(?:hatchback|hatch|mini|economy)\b/i.test(text)) return 'hatchback'
  if (/\bsedan\b/i.test(text)) return 'sedan'
  if (/\bsuv\b/i.test(text)) return 'suv'
  return null
}

const sharingFromText = text => {
  const labels = 'mode|sharing|share\\s+ride'
  const labelled = labelledValue(text, labels) ||
    new RegExp('(?:' + labels + ')\\s*(?::|=|-)\\s*([^,.\\n]+)', 'i').exec(text)?.[1]?.trim()
  if (labelled) {
    if (/^(?:no|off|false|solo|private|not\s+shared?)$/i.test(labelled)) return false
    if (/^(?:yes|on|true|share|shared|sharing|pool|pooling)$/i.test(labelled)) return true
    return undefined
  }
  if (/\b(?:solo|private)(?:\s+ride)?\b/i.test(text) ||
      /\b(?:without|no)\s+(?:a\s+)?(?:shared?|sharing)(?:\s+ride)?\b/i.test(text) ||
      /\b(?:do\s+not|don['’]?t)\s+(?:want\s+to\s+)?share\b/i.test(text)) return false
  if (/\b(?:share|shared|sharing|pool|pooling)(?:\s+ride)?\b/i.test(text)) return true
  return undefined
}

const carrierFromText = text => {
  const labels = '(?:roof|luggage)\\s+carrier|carrier'
  const labelled = labelledValue(text, labels) ||
    new RegExp('(?:' + labels + ')\\s*(?::|=|-)\\s*([^,.\\n]+)', 'i').exec(text)?.[1]?.trim()
  if (labelled) {
    if (/^(?:no|off|false|none|not\s+needed|not\s+required)$/i.test(labelled)) return false
    if (/^(?:yes|on|true|needed|required|add)$/i.test(labelled)) return true
    return undefined
  }
  if (/\b(?:without|no)\s+(?:a\s+|the\s+)?(?:roof\s+|luggage\s+)?carrier\b/i.test(text) ||
      /\b(?:do\s+not|don['’]?t)\s+(?:(?:want|need|use|add|require)\s+)?(?:a\s+|the\s+)?(?:roof\s+|luggage\s+)?carrier\b/i.test(text)) return false
  if (/\b(?:need|want|use|add|require|with)\s+(?:a\s+|the\s+)?(?:(?:roof|luggage)\s+)?carrier\b/i.test(text) ||
      /\b(?:roof|luggage)\s+carrier\b/i.test(text)) return true
  return undefined
}

const safeRouteFromText = text => {
  const labels = '(?:prefer\\s+)?safe(?:r)?\\s+route|route\\s+preference'
  const labelled = labelledValue(text, labels) ||
    new RegExp('(?:' + labels + ')\\s*(?::|=|-)\\s*([^,.\\n]+)', 'i').exec(text)?.[1]?.trim()
  if (labelled) {
    if (/^(?:no|off|false|none|not\s+needed|fastest|quickest|standard|default)(?:\s+route)?$/i.test(labelled)) return false
    if (/^(?:yes|on|true|safe|safer|preferred?|required|needed|highway)(?:\s+route)?$/i.test(labelled)) return true
    return undefined
  }
  if (/\b(?:without|skip|no|not)\s+(?:a\s+|the\s+)?safe(?:r)?\s+route\b/i.test(text) ||
      /\b(?:do\s+not|don['’]?t)\s+(?:(?:want|need|use|take|choose|prefer)\s+)?(?:a\s+|the\s+)?safe(?:r)?\s+route\b/i.test(text) ||
      /\b(?:fastest|standard|default)\s+route\b/i.test(text)) return false
  if (/\b(?:use|take|choose|prefer|want|with|via)?\s*(?:the\s+)?safe(?:r)?\s+route\b/i.test(text)) return true
  return undefined
}

// Parses both a predictable labelled message and a natural sentence such as:
// "Book a sedan solo from Sector 18 Noida to IGI Airport tomorrow at 6:30 pm".
// It deliberately extracts only fields with strong signals; uncertain details
// stay missing and the normal conversation asks for them.
export function parseBookingMessage(value, now = new Date()) {
  const text = String(value || '').trim()
  let pickupText = labelledValue(text, 'pickup(?:\\s+location)?|pick\\s*up(?:\\s+location)?|from')
  let dropText = labelledValue(text, 'drop(?:-?off)?(?:\\s+location)?|destination(?:\\s+location)?|to')
  if (!pickupText || !dropText) {
    const route = /\bfrom\s+(.+?)\s+to\s+(.+)/i.exec(text.replace(/\s+/g, ' '))
    if (route) {
      pickupText ||= route[1].replace(/^[\s,:-]+|[\s,:-]+$/g, '')
      dropText ||= trimBookingDetails(route[2])
    }
  }

  const vehicleClass = vehicleFromText(text)
  const sharing = sharingFromText(text)
  const needsCarrier = carrierFromText(text)
  const preferSafeRoute = safeRouteFromText(text)
  const when = labelledValue(text, 'when|ride\s*type|trip\s*type')
  const explicitNow = /\b(?:now|right\s+now|asap|immediately)\b/i.test(text) ||
    /^\s*(?:now|ride\s+now)\s*$/i.test(when || text)
  const explicitScheduled = /\b(?:schedule|scheduled|today|tomorrow)\b/i.test(text) || /^\s*scheduled?\s*$/i.test(when || '') ||
    /\b(?:\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})\b/.test(text)
  const scheduleDate = dateFromText(text, now)
  const scheduleTime = timeFromText(text)
  const rideType = explicitNow ? 'now' : (explicitScheduled || scheduleDate || scheduleTime) ? 'scheduled' : undefined
  const data = { ...(rideType && { rideType }), ...(pickupText && { pickupText }), ...(dropText && { dropText }),
    ...(vehicleClass && { vehicleClass }), ...(sharing !== undefined && { sharing }),
    ...(needsCarrier !== undefined && { needsCarrier }),
    ...(preferSafeRoute !== undefined && { preferSafeRoute }) }
  const issues = {}
  if (scheduleDate?.value) data.scheduleDate = scheduleDate.value
  else if (scheduleDate?.error) issues.scheduleDate = scheduleDate.error
  if (scheduleTime) data.scheduleTime = scheduleTime
  if (data.scheduleDate && data.scheduleTime) {
    const parsed = parseScheduleTime(data.scheduleDate, data.scheduleTime, now)
    if (parsed?.value) Object.assign(data, { scheduledAt: parsed.value, scheduleLabel: parsed.label })
    else if (parsed?.error) issues.scheduleTime = parsed.error
  }

  const labelled = /^(?:\s*(?:pickup(?:\s+location)?|pick\s*up(?:\s+location)?|from|drop(?:-?off)?(?:\s+location)?|destination(?:\s+location)?|to|date|time|when|vehicle|car|cab|mode|ride\s*type|sharing|share\s+ride|(?:roof|luggage)\s+carrier|carrier|(?:prefer\s+)?safe(?:r)?\s+route|route\s+preference)\s*(?::|=|-))/im.test(text)
  const bookingWords = /\b(?:book|booking|cab|taxi|ride)\b/i.test(text)
  const hasDetails = Boolean(pickupText || dropText || vehicleClass || sharing !== undefined || needsCarrier !== undefined ||
    preferSafeRoute !== undefined || rideType)
  return { isBookingRequest: labelled || Boolean(pickupText && dropText) || (bookingWords && hasDetails), data, issues }
}

const estimate = data => getRideEstimate({ pickupAddress: data.pickup.address, dropAddress: data.drop.address,
  vehicleClass: 'hatchback', pickupCoords: { lat: data.pickup.lat, lng: data.pickup.lng },
  dropCoords: { lat: data.drop.lat, lng: data.drop.lng }, preferSafeRoute: data.preferSafeRoute === true,
  needsCarrier: data.needsCarrier === true, coupon: null })

const saferRoutePrompt = (to, fee) => sendButtons(to,
  `A safer route is available for this trip.\n\nIt adds ₹${fee}. For distance-priced rides, the longer drive may also increase the fare.\n\nThis is a route preference, not a security service. Which route would you like?`,
  [['safe_route_on', 'Safer route'], ['safe_route_off', 'Fastest route']])

const sharingPrompt = to => sendButtons(to,
  'Would you like a Solo or Share ride?\n\nWith Share, a compatible passenger may join. You pay the sharing fare if matched; otherwise the solo fare applies.',
  [['sharing_on', 'Share ride'], ['sharing_off', 'Solo ride']])

const carrierPrompt = to => sendButtons(to,
  `Do you need a roof carrier for luggage that won’t fit in the boot?\n\nIt adds up to ₹${CARRIER_CHARGE} and may be included on eligible high-fare rides.`,
  [['carrier_on', 'Add carrier'], ['carrier_off', 'No carrier']])

function showOptions(to, data, fares) {
  const vehicles = data.vehicleClass ? [data.vehicleClass] : VEHICLE_CLASS_NAMES
  const mode = data.sharing ? 'sharing' : 'solo'
  const rows = vehicles.map(vehicle => ({ id: `ride:${vehicle}:${mode}`,
    title: VEHICLE_CLASSES[vehicle].label,
    description: data.sharing
      ? `₹${fares[vehicle].sharing} if matched · ₹${fares[vehicle].solo} if not`
      : `₹${fares[vehicle].solo} · Solo ride` }))
  const choicePrompt = `Choose a vehicle for your ${data.sharing ? 'Share' : 'Solo'} ride:`
  return sendList(to, `🚕 Ride options${data.scheduleLabel ? `\n📅 ${data.scheduleLabel}` : ''}${data.preferSafeRoute ? `\n🛣️ Safer route (+₹${data.safeRouteFee})` : ''}${data.needsCarrier ? '\n🧳 Roof carrier requested' : ''}\n\n📍 ${data.pickup.address}\n📍 ${data.drop.address}\n\n${choicePrompt}`, rows)
}

const scheduleDatePrompt = (data = {}) => data.scheduleDateError === 'too_far'
  ? 'Choose a date within the next 7 days.'
  : data.scheduleDateError === 'past'
    ? 'Choose today or a future date within the next 7 days. Send DD/MM/YYYY.'
    : 'Schedule your ride\n\nYou can book 30 minutes to 7 days in advance.\n\nWhat date would you like to travel? Send DD/MM/YYYY.'

const scheduleTimePrompt = data => data.scheduleTimeError === 'too_far'
  ? 'That time is more than 7 days away. Choose an earlier time using HH:MM.'
  : data.scheduleTimeError === 'too_soon'
    ? 'Choose a time at least 30 minutes from now using HH:MM.'
    : `${new Date(`${data.scheduleDate}T12:00:00+05:30`).toLocaleDateString('en-IN', { dateStyle: 'long' })}\n\nWhat time should your ride be? Send 24-hour time, for example 18:30.`

const pickupMissingPrompt = data => data.pickupInvalid
  ? 'I couldn’t find the pickup location from your message. Share a location pin or type a more detailed pickup location.'
  : `${data.scheduleLabel ? `📅 Scheduled ride\n${data.scheduleLabel}\n\n` : ''}Where should we pick you up?\n\n📍 Share a location pin or type the pickup location.`

const destinationMissingPrompt = data => data.dropInvalid
  ? 'I couldn’t find the destination from your message. Share a location pin or type a more detailed destination.'
  : `📍 Pickup:\n${data.pickup.address}\n\nWhere are you going? Share a pin or type the destination.`

const confirmationMessage = data => `${data.rideType === 'scheduled' ? 'Confirm scheduled ride' : 'Confirm your ride'}${data.scheduleLabel ? `\n${data.scheduleLabel}` : ''}\n\n📍 Pickup:\n${data.pickup.address}\n\n📍 Drop:\n${data.drop.address}\n\n🚘 ${VEHICLE_CLASSES[data.vehicleClass].label}\n${data.sharing ? '👥 Share' : '👤 Solo'}${data.needsCarrier ? `\n🧳 Roof carrier (${data.carrierWaived ? 'included' : `+₹${data.carrierCharge}`})` : ''}${data.preferSafeRoute ? `\n🛣️ Safer route (+₹${data.safeRouteFee})` : ''}\n💰 Fare: ₹${data.fare}${data.sharing ? `\n\nSharing fare if matched. If nobody joins, the solo fare is ₹${data.fares[data.vehicleClass].solo}.` : ''}\n\nConfirm booking?`

async function showConfirmation(to, conversation, data) {
  await prisma.whatsappSession.update({ where: { phone: conversation.phone }, data: { step: 'CONFIRMATION', data } })
  return sendButtons(to, confirmationMessage(data), [['confirm', '✅ Confirm'], ['cancel', '❌ Cancel']])
}

async function advanceBooking(to, conversation, initialData, now = new Date()) {
  let data = { ...initialData }
  if (!data.rideType) {
    await prisma.whatsappSession.update({ where: { phone: conversation.phone }, data: { step: 'RIDE_TYPE_SELECTION', data } })
    return rideMenu(to)
  }
  if (data.rideType === 'scheduled') {
    if (!data.scheduleDate) {
      await prisma.whatsappSession.update({ where: { phone: conversation.phone }, data: { step: 'SCHEDULE_DATE', data } })
      return sendWhatsAppText(to, scheduleDatePrompt(data))
    }
    if (!data.scheduledAt && data.scheduleTime) {
      const parsed = parseScheduleTime(data.scheduleDate, data.scheduleTime, now)
      if (parsed?.value) {
        data = { ...data, scheduledAt: parsed.value, scheduleLabel: parsed.label }
        delete data.scheduleTimeError
        delete data.scheduleDateError
      } else {
        data = { ...data, scheduleTimeError: parsed?.error || 'invalid' }
        delete data.scheduleTime
      }
    }
    if (!data.scheduledAt) {
      await prisma.whatsappSession.update({ where: { phone: conversation.phone }, data: { step: 'SCHEDULE_TIME', data } })
      return sendWhatsAppText(to, scheduleTimePrompt(data))
    }
  }
  if (!data.pickup) {
    await prisma.whatsappSession.update({ where: { phone: conversation.phone }, data: { step: 'PICKUP', data } })
    return sendWhatsAppText(to, pickupMissingPrompt(data))
  }
  if (!data.drop) {
    await prisma.whatsappSession.update({ where: { phone: conversation.phone }, data: { step: 'DESTINATION', data } })
    return sendWhatsAppText(to, destinationMissingPrompt(data))
  }
  if (typeof data.sharing !== 'boolean') {
    await prisma.whatsappSession.update({ where: { phone: conversation.phone }, data: { step: 'SHARING_SELECTION', data } })
    return sharingPrompt(to)
  }
  if (typeof data.needsCarrier !== 'boolean') {
    await prisma.whatsappSession.update({ where: { phone: conversation.phone }, data: { step: 'CARRIER_SELECTION', data } })
    return carrierPrompt(to)
  }
  let quote
  try { quote = await estimate(data) }
  catch { return sendWhatsAppText(to, 'I couldn’t calculate a fare for that route. Type “cancel” and try again, or book on our website.') }
  if (quote.safeRoute?.available && typeof data.preferSafeRoute !== 'boolean') {
    data = { ...data, safeRouteFee: quote.safeRoute.fee }
    await prisma.whatsappSession.update({ where: { phone: conversation.phone }, data: { step: 'SAFE_ROUTE_SELECTION', data } })
    return saferRoutePrompt(to, quote.safeRoute.fee)
  }
  if (data.preferSafeRoute && quote.safeRoute?.applied !== true)
    await sendWhatsAppText(to, 'A safer alternative is not available for this trip, so I’ve kept the fastest route. Please review the fare before confirming.')
  data = { ...data, preferSafeRoute: quote.safeRoute?.applied === true,
    safeRouteFee: quote.safeRoute?.applied ? quote.safeRoute.fee : 0, fares: quote.fares }
  if (data.vehicleClass && typeof data.sharing === 'boolean') {
    const mode = data.sharing ? 'sharing' : 'solo'
    const selected = quote.fares?.[data.vehicleClass]
    const fare = selected?.[mode]
    if (fare > 0) return showConfirmation(to, conversation, { ...data, fare,
      carrierCharge: selected.carrier ?? 0, carrierWaived: selected.carrierWaived === true })
    data = { ...data }
    delete data.vehicleClass
    delete data.fare
  }
  await prisma.whatsappSession.update({ where: { phone: conversation.phone }, data: { step: 'RIDE_OPTIONS', data } })
  return showOptions(to, data, quote.fares)
}

async function bookingDataFromMessage(value, now = new Date()) {
  const parsed = parseBookingMessage(value, now)
  const data = { ...parsed.data, ...(parsed.issues.scheduleDate && { scheduleDateError: parsed.issues.scheduleDate }),
    ...(parsed.issues.scheduleTime && { scheduleTimeError: parsed.issues.scheduleTime }) }
  for (const [textKey, placeKey, invalidKey] of [['pickupText', 'pickup', 'pickupInvalid'], ['dropText', 'drop', 'dropInvalid']]) {
    if (!data[textKey]) continue
    try { data[placeKey] = await resolveLocation({ type: 'text', value: data[textKey] }) }
    catch { data[invalidKey] = true }
    delete data[textKey]
  }
  return { ...parsed, data }
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
  if (input.type === 'text' && !['book', 'book a ride'].includes(input.lower)) {
    const detected = parseBookingMessage(input.value)
    const canReplaceSession = ['MAIN_MENU', 'CANCELLED', 'COMPLETED'].includes(conversation.step) ||
      Boolean(detected.data.pickupText || detected.data.dropText) || /\b(?:book|booking)\b/i.test(input.value)
    if (detected.isBookingRequest && canReplaceSession) {
      const parsed = await bookingDataFromMessage(input.value)
      return advanceBooking(to, conversation, parsed.data)
    }
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
    if (input.value === 'schedule' || input.lower === 'schedule' || input.lower === 'scheduled')
      return advanceBooking(to, conversation, { ...data, rideType: 'scheduled' })
    if (input.value !== 'now' && input.lower !== 'now' && input.lower !== 'ride now') return rideMenu(to)
    return advanceBooking(to, conversation, { ...data, rideType: 'now' })
  }
  if (conversation.step === 'SCHEDULE_DATE') {
    const parsed = input.type === 'text' && dateFromText(input.value, new Date())
    if (!parsed || parsed.error) return sendWhatsAppText(to, parsed?.error === 'too_far' ? 'Choose a date within the next 7 days.' : 'Send a valid future date as DD/MM/YYYY.')
    data = { ...data, scheduleDate: parsed.value }
    delete data.scheduleDateError
    return advanceBooking(to, conversation, data)
  }
  if (conversation.step === 'SCHEDULE_TIME') {
    const scheduleTime = input.type === 'text' && timeFromText(input.value)
    const parsed = scheduleTime && parseScheduleTime(data.scheduleDate, scheduleTime)
    if (!parsed || parsed.error) return sendWhatsAppText(to, parsed?.error === 'too_far' ? 'That time is more than 7 days away.' : 'Choose a valid time at least 30 minutes from now using HH:MM.')
    data = { ...data, scheduleTime, scheduledAt: parsed.value, scheduleLabel: parsed.label }
    delete data.scheduleTimeError
    return advanceBooking(to, conversation, data)
  }
  if (conversation.step === 'SHARING_SELECTION') {
    const sharing = input.value === 'sharing_on' ? true
      : input.value === 'sharing_off' ? false
        : input.type === 'text' && /^(?:yes|on)$/i.test(input.value) ? true
          : input.type === 'text' && /^(?:no|off)$/i.test(input.value) ? false
            : input.type === 'text' ? sharingFromText(input.value) : undefined
    if (sharing === undefined) return sharingPrompt(to)
    return advanceBooking(to, conversation, { ...data, sharing })
  }
  if (conversation.step === 'CARRIER_SELECTION') {
    const needsCarrier = input.value === 'carrier_on' ? true
      : input.value === 'carrier_off' ? false
        : input.type === 'text' && /^(?:yes|on)$/i.test(input.value) ? true
          : input.type === 'text' && /^(?:no|off)$/i.test(input.value) ? false
            : input.type === 'text' ? carrierFromText(input.value) : undefined
    if (needsCarrier === undefined) return carrierPrompt(to)
    return advanceBooking(to, conversation, { ...data, needsCarrier })
  }
  if (conversation.step === 'SAFE_ROUTE_SELECTION') {
    const preference = input.value === 'safe_route_on' ? true
      : input.value === 'safe_route_off' ? false
        : input.type === 'text' && /^(?:yes|on)$/i.test(input.value) ? true
          : input.type === 'text' && /^(?:no|off)$/i.test(input.value) ? false
        : input.type === 'text' ? safeRouteFromText(input.value) : undefined
    if (preference === undefined) return saferRoutePrompt(to, data.safeRouteFee)
    return advanceBooking(to, conversation, { ...data, preferSafeRoute: preference })
  }
  if (['PICKUP', 'DESTINATION'].includes(conversation.step)) {
    if (!['text', 'location'].includes(input.type)) return sendWhatsAppText(to, 'Share a location pin or type a place name.')
    let locationInput = input
    if (input.type === 'text') {
      const labelled = parseBookingMessage(input.value).data
      const value = conversation.step === 'PICKUP' ? labelled.pickupText : labelled.dropText
      if (value) locationInput = { type: 'text', value }
    }
    let place
    try { place = await resolveLocation(locationInput) } catch { return sendWhatsAppText(to, 'I couldn’t find that location. Share a pin or add more detail to the place name.') }
    if (conversation.step === 'PICKUP') {
      data = { ...data, pickup: place }
      delete data.pickupInvalid
      return advanceBooking(to, conversation, data)
    }
    data = { ...data, drop: place }
    delete data.dropInvalid
    return advanceBooking(to, conversation, data)
  }
  if (conversation.step === 'RIDE_OPTIONS') {
    const match = input.value?.match(/^ride:([^:]+):(solo|sharing)$/)
    if ((!match || !VEHICLE_CLASS_NAMES.includes(match[1])) && input.type === 'text') {
      const partial = parseBookingMessage(input.value).data
      if (partial.vehicleClass || typeof partial.sharing === 'boolean' || typeof partial.needsCarrier === 'boolean' ||
          typeof partial.preferSafeRoute === 'boolean')
        return advanceBooking(to, conversation, { ...data, ...(partial.vehicleClass && { vehicleClass: partial.vehicleClass }),
          ...(typeof partial.sharing === 'boolean' && { sharing: partial.sharing }),
          ...(typeof partial.needsCarrier === 'boolean' && { needsCarrier: partial.needsCarrier }),
          ...(typeof partial.preferSafeRoute === 'boolean' && { preferSafeRoute: partial.preferSafeRoute }) })
    }
    if (!match || !VEHICLE_CLASS_NAMES.includes(match[1]))
      return typeof data.sharing !== 'boolean' || typeof data.needsCarrier !== 'boolean'
        ? advanceBooking(to, conversation, data) : showOptions(to, data, data.fares)
    const [, vehicleClass, mode] = match
    return advanceBooking(to, conversation, { ...data, vehicleClass, sharing: mode === 'sharing' })
  }
  if (conversation.step === 'CONFIRMATION') {
    if (input.value === 'cancel') { await prisma.whatsappSession.update({ where: { phone: conversation.phone }, data: { step: 'CANCELLED', data: {} } }); return mainMenu(to, user.name) }
    if (input.value !== 'confirm') return sendWhatsAppText(to, 'Please choose Confirm or Cancel above.')
    // Sessions created before these choices were added may already be sitting on
    // an old confirmation message. Do not let that stale message bypass the new
    // questions when the customer taps Confirm after deployment.
    if (typeof data.sharing !== 'boolean' || typeof data.needsCarrier !== 'boolean')
      return advanceBooking(to, conversation, data)
    try {
      const fresh = await estimate(data)
      if (data.preferSafeRoute && fresh.safeRoute?.applied !== true) {
        await sendWhatsAppText(to, 'The safer alternative is no longer available. I’ve recalculated the fastest route for you; please review it before confirming.')
        return advanceBooking(to, conversation, { ...data, preferSafeRoute: false })
      }
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
