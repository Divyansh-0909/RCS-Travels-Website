import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { messagesFromWebhook, parseBookingMessage, parseIncoming, parseScheduleDate, parseScheduleTime } from '../services/whatsappBooking.js'
import { validWhatsAppChallenge, validWhatsAppSignature } from '../routes/whatsapp.js'
import { normalizePhone } from '../lib/phone.js'

test('WhatsApp webhook extraction keeps message order across entries', () => {
  const first = { id: 'wamid.1', from: '919999999999', type: 'text' }
  const second = { id: 'wamid.2', from: '919999999999', type: 'location' }
  assert.deepEqual(messagesFromWebhook({ entry: [
    { changes: [{ value: { messages: [first] } }] },
    { changes: [{ value: { statuses: [{}] } }, { value: { messages: [second] } }] },
  ] }), [first, second])
})

test('Meta webhook signature is checked against the unparsed bytes', () => {
  const raw = Buffer.from('{"entry":[]}')
  const signature = `sha256=${crypto.createHmac('sha256', 'secret').update(raw).digest('hex')}`
  assert.equal(validWhatsAppSignature(raw, signature, 'secret'), true)
  assert.equal(validWhatsAppSignature(Buffer.from('{"entry":[1]}'), signature, 'secret'), false)
  assert.equal(validWhatsAppSignature(raw, 'sha256=nope', 'secret'), false)
})

test('Meta verification challenge requires mode and configured token', () => {
  const query = { 'hub.mode': 'subscribe', 'hub.verify_token': 'ours' }
  assert.equal(validWhatsAppChallenge(query, 'ours'), true)
  assert.equal(validWhatsAppChallenge(query, 'other'), false)
  assert.equal(validWhatsAppChallenge(query, ''), false)
})

test('WhatsApp and stored Indian phones normalize to the same identity', () => {
  assert.equal(normalizePhone('919876543210'), '9876543210')
  assert.equal(normalizePhone('+91 98765 43210'), '9876543210')
  assert.equal(normalizePhone('9876543210'), '9876543210')
  assert.equal(normalizePhone('123'), null)
})

test('text, pin, buttons and unsupported messages parse deterministically', () => {
  assert.deepEqual(parseIncoming({ type: 'text', text: { body: ' Sector 18 ' } }), { type: 'text', value: 'Sector 18', lower: 'sector 18' })
  assert.deepEqual(parseIncoming({ type: 'location', location: { latitude: 28.5, longitude: 77.3 } }), { type: 'location', lat: 28.5, lng: 77.3 })
  assert.deepEqual(parseIncoming({ type: 'interactive', interactive: { button_reply: { id: 'now' } } }), { type: 'choice', value: 'now' })
  assert.deepEqual(parseIncoming({ type: 'image' }), { type: 'unsupported' })
})

test('scheduled date accepts today through seven days and rejects bad bounds', () => {
  const now = new Date('2026-08-20T06:30:00.000Z') // noon IST
  assert.deepEqual(parseScheduleDate('20/08/2026', now), { value: '2026-08-20' })
  assert.deepEqual(parseScheduleDate('2026-08-27', now), { value: '2026-08-27' })
  assert.deepEqual(parseScheduleDate('19/08/2026', now), { error: 'past' })
  assert.deepEqual(parseScheduleDate('28/08/2026', now), { error: 'too_far' })
  assert.equal(parseScheduleDate('31/02/2026', now), null)
})

test('scheduled time observes format, 30-minute lead and seven-day limit', () => {
  const now = new Date('2026-08-20T06:30:00.000Z') // noon IST
  assert.equal(parseScheduleTime('2026-08-20', '12:20', now).error, 'too_soon')
  assert.equal(parseScheduleTime('2026-08-20', '13:00', now).value, '2026-08-20T07:30:00.000Z')
  assert.equal(parseScheduleTime('2026-08-27', '13:00', now).error, 'too_far')
  assert.equal(parseScheduleTime('2026-08-20', '25:00', now), null)
})

test('a natural full booking message extracts route, schedule, vehicle and mode', () => {
  const now = new Date('2026-08-22T06:30:00.000Z')
  const parsed = parseBookingMessage('Book a sedan solo from Sector 18 Noida to IGI Airport tomorrow at 6:30 pm', now)
  assert.equal(parsed.isBookingRequest, true)
  assert.deepEqual(parsed.issues, {})
  assert.deepEqual({ ...parsed.data, scheduleLabel: undefined }, {
    rideType: 'scheduled', pickupText: 'Sector 18 Noida', dropText: 'IGI Airport',
    vehicleClass: 'sedan', sharing: false, scheduleDate: '2026-08-23', scheduleTime: '18:30',
    scheduledAt: '2026-08-23T13:00:00.000Z', scheduleLabel: undefined,
  })
})

test('a labelled full booking message supports ride now and sharing', () => {
  const parsed = parseBookingMessage(`Pickup: Connaught Place, Delhi
Destination: Gurgaon Cyber Hub
When: now
Vehicle: SUV
Mode: sharing
Roof carrier: yes
Safer route: yes`)
  assert.equal(parsed.isBookingRequest, true)
  assert.deepEqual(parsed.data, {
    rideType: 'now', pickupText: 'Connaught Place, Delhi', dropText: 'Gurgaon Cyber Hub',
    vehicleClass: 'suv', sharing: true, needsCarrier: true, preferSafeRoute: true,
  })
})

test('natural and labelled booking messages understand sharing and carrier preferences', () => {
  const carrier = parseBookingMessage('Book a sedan solo from Hauz Khas to India Gate now with a roof carrier')
  assert.equal(carrier.data.dropText, 'India Gate')
  assert.equal(carrier.data.sharing, false)
  assert.equal(carrier.data.needsCarrier, true)

  const noCarrier = parseBookingMessage('Book a shared ride from Hauz Khas to India Gate now without a roof carrier')
  assert.equal(noCarrier.data.dropText, 'India Gate')
  assert.equal(noCarrier.data.sharing, true)
  assert.equal(noCarrier.data.needsCarrier, false)

  const genericCarrier = parseBookingMessage('Book a ride from Hauz Khas to India Gate now with carrier')
  assert.equal(genericCarrier.data.dropText, 'India Gate')
  assert.equal(genericCarrier.data.needsCarrier, true)

  assert.equal(parseBookingMessage('Book a ride\nSharing: no').data.sharing, false)
  assert.equal(parseBookingMessage('Book a ride\nRoof carrier: not needed').data.needsCarrier, false)
  assert.equal(parseBookingMessage('Book a ride\nCarrier: maybe').data.needsCarrier, undefined)
})

test('natural and labelled booking messages understand safer-route preferences', () => {
  const safer = parseBookingMessage('Book a sedan solo from Hauz Khas to India Gate now using the safer route')
  assert.equal(safer.data.pickupText, 'Hauz Khas')
  assert.equal(safer.data.dropText, 'India Gate')
  assert.equal(safer.data.preferSafeRoute, true)

  assert.equal(parseBookingMessage('Book a ride with route preference: fastest').data.preferSafeRoute, false)
  assert.equal(parseBookingMessage('Book a ride without the safer route').data.preferSafeRoute, false)
  assert.equal(parseBookingMessage("Book a ride but I don't want the safer route").data.preferSafeRoute, false)
  assert.equal(parseBookingMessage('Book a ride\nSafer route: not needed').data.preferSafeRoute, false)
  assert.equal(parseBookingMessage('Book a ride\nSafer route: maybe').data.preferSafeRoute, undefined)
  assert.equal(parseBookingMessage('Book a ride from Hauz Khas to India Gate now').data.preferSafeRoute, undefined)
})

test('partial booking messages retain known details and leave uncertain fields missing', () => {
  const now = new Date('2026-08-22T06:30:00.000Z')
  const parsed = parseBookingMessage('Book a premium SUV private from Hauz Khas to Noida Sector 62', now)
  assert.equal(parsed.isBookingRequest, true)
  assert.deepEqual(parsed.data, {
    pickupText: 'Hauz Khas', dropText: 'Noida Sector 62', vehicleClass: 'suv_premium', sharing: false,
  })
  assert.equal(parsed.data.rideType, undefined)
})

test('an obvious from-to route can start booking without special command words', () => {
  const parsed = parseBookingMessage('from Hauz Khas to India Gate now')
  assert.equal(parsed.isBookingRequest, true)
  assert.equal(parsed.data.rideType, 'now')
  assert.equal(parsed.data.pickupText, 'Hauz Khas')
  assert.equal(parsed.data.dropText, 'India Gate')
})

test('invalid supplied schedule details remain missing and carry a useful issue', () => {
  const now = new Date('2026-08-22T06:30:00.000Z')
  const parsed = parseBookingMessage(`Pickup location: Noida Sector 18
Drop location: India Gate
Date: 21/08/2026
Time: 18:30`, now)
  assert.equal(parsed.isBookingRequest, true)
  assert.equal(parsed.data.rideType, 'scheduled')
  assert.equal(parsed.data.scheduleDate, undefined)
  assert.equal(parsed.data.scheduleTime, '18:30')
  assert.equal(parsed.issues.scheduleDate, 'past')
})

test('time-only booking messages preserve the time so the flow only asks for a date', () => {
  const now = new Date('2026-08-22T06:30:00.000Z')
  const parsed = parseBookingMessage('Please book a cab at 6 pm', now)
  assert.equal(parsed.isBookingRequest, true)
  assert.equal(parsed.data.rideType, 'scheduled')
  assert.equal(parsed.data.scheduleTime, '18:00')
  assert.equal(parsed.data.scheduleDate, undefined)
})

test('greetings and the existing short book command stay out of full-message parsing', () => {
  assert.equal(parseBookingMessage('Hi').isBookingRequest, false)
  assert.equal(parseBookingMessage('Book a ride').isBookingRequest, false)
})

test('delivery receipts and malformed webhook branches contain no messages', () => {
  assert.deepEqual(messagesFromWebhook({ entry: [{ changes: [{ value: { statuses: [{ id: 'x' }] } }] }] }), [])
  assert.deepEqual(messagesFromWebhook({}), [])
})
