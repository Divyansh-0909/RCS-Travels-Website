import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { messagesFromWebhook, parseIncoming, parseScheduleDate, parseScheduleTime } from '../services/whatsappBooking.js'
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

test('delivery receipts and malformed webhook branches contain no messages', () => {
  assert.deepEqual(messagesFromWebhook({ entry: [{ changes: [{ value: { statuses: [{ id: 'x' }] } }] }] }), [])
  assert.deepEqual(messagesFromWebhook({}), [])
})
