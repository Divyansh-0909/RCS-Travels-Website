import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyWhatsAppDeliveryStatus,
  beginNotificationAttempt,
  recordNotificationAcceptance,
  recordNotificationFailure,
  whatsappStatusCallbacksFromWebhook,
} from '../services/notificationProvenance.js'

test('notification attempt and provider acceptance remain distinct facts', async () => {
  const rows = new Map()
  const db = { notificationDelivery: {
    create: async ({ data }) => { const row = { id: 'attempt-1', ...data }; rows.set(row.id, row); return row },
    update: async ({ where, data }) => { const row = rows.get(where.id); Object.assign(row, data); return row },
  } }
  const attemptedAt = new Date('2026-09-25T12:00:00.000Z')
  const acceptedAt = new Date('2026-09-25T12:00:01.000Z')

  const attempt = await beginNotificationAttempt({ provider: 'fcm', channel: 'push', recipient: 'token-1',
    bookingId: 'booking-1', purpose: 'scheduled_driver_reminder' }, db, attemptedAt)
  await recordNotificationAcceptance({ attemptId: attempt.id, providerMessageId: 'projects/rcs/messages/1' }, db, acceptedAt)

  const row = rows.get('attempt-1')
  assert.equal(row.status, 'accepted')
  assert.equal(row.attemptedAt, attemptedAt)
  assert.equal(row.providerAcceptedAt, acceptedAt)
  assert.equal(row.providerMessageId, 'projects/rcs/messages/1')
  assert.equal(row.bookingId, 'booking-1')
  assert.equal('deliveredAt' in row, false)
})

test('a newly created notification row starts as attempted evidence', async () => {
  let created
  const db = { notificationDelivery: {
    create: async ({ data }) => { created = data; return { id: 'attempt-new', ...data } },
  } }

  await beginNotificationAttempt({ provider: 'fcm', channel: 'push', recipient: 'token-new' }, db)

  assert.equal(created.status, 'attempted')
})

test('retry key links the existing reminder retry path and counts prior attempts', async () => {
  let countWhere
  let created
  const db = { notificationDelivery: {
    count: async ({ where }) => { countWhere = where; return 2 },
    create: async ({ data }) => { created = data; return { id: 'attempt-3', ...data } },
  } }

  await beginNotificationAttempt({ provider: 'whatsapp', channel: 'whatsapp', recipient: '919876543210',
    retryKey: 'scheduled_customer_reminder:booking-1' }, db)

  assert.deepEqual(countWhere, { retryKey: 'scheduled_customer_reminder:booking-1' })
  assert.equal(created.retryCount, 2)
})

test('provider acceptance cannot be recorded without a provider message ID', async () => {
  let updated = false
  const db = { notificationDelivery: { update: async () => { updated = true } } }

  assert.equal(await recordNotificationAcceptance({ attemptId: 'attempt-4', providerMessageId: null }, db), null)
  assert.equal(await recordNotificationAcceptance({ attemptId: 'attempt-4', providerMessageId: 123 }, db), null)
  assert.equal(updated, false)
})

test('provider failure is observable on the original attempt', async () => {
  let update
  const db = { notificationDelivery: { update: async args => { update = args; return args.data } } }
  const failedAt = new Date('2026-09-25T12:00:02.000Z')

  await recordNotificationFailure({ attemptId: 'attempt-2', code: 'provider/down', message: 'provider unavailable' }, db, failedAt)

  assert.deepEqual(update.where, { id: 'attempt-2' })
  assert.equal(update.data.status, 'failed')
  assert.equal(update.data.failedAt, failedAt)
  assert.equal(update.data.providerFailureCode, 'provider/down')
  assert.equal(update.data.providerFailureMessage, 'provider unavailable')
})

test('WhatsApp callback keeps provider event time separate from server receipt time', async () => {
  let update
  const db = { notificationDelivery: { updateMany: async args => { update = args; return { count: 1 } } } }
  const receivedAt = new Date('2026-09-25T12:05:00.000Z')

  assert.equal(await applyWhatsAppDeliveryStatus(
    { id: 'wamid.1', status: 'delivered', timestamp: '100' }, db, receivedAt,
  ), true)
  assert.equal(update.data.providerStatusAt.toISOString(), '1970-01-01T00:01:40.000Z')
  assert.equal(update.data.providerStatusReceivedAt, receivedAt)
  assert.equal(update.data.deliveredAt.toISOString(), '1970-01-01T00:01:40.000Z')
})

test('malformed WhatsApp provider time stays unknown while receipt time remains known', async () => {
  let update
  const db = { notificationDelivery: { updateMany: async args => { update = args; return { count: 1 } } } }
  const receivedAt = new Date('2026-09-25T12:05:00.000Z')

  await applyWhatsAppDeliveryStatus({ id: 'wamid.2', status: 'sent', timestamp: 'bad' }, db, receivedAt)

  assert.equal(update.data.providerStatusAt, null)
  assert.equal(update.data.sentAt, null)
  assert.equal(update.data.providerStatusReceivedAt, receivedAt)
})

test('zero and non-finite WhatsApp provider timestamps stay unknown', async () => {
  const updates = []
  const db = { notificationDelivery: { updateMany: async args => { updates.push(args); return { count: 1 } } } }

  await applyWhatsAppDeliveryStatus({ id: 'wamid.zero', status: 'sent', timestamp: '0' }, db)
  await applyWhatsAppDeliveryStatus({ id: 'wamid.infinity', status: 'sent', timestamp: 'Infinity' }, db)

  assert.equal(updates[0].data.providerStatusAt, null)
  assert.equal(updates[1].data.providerStatusAt, null)
})

test('each WhatsApp lifecycle status uses its exact predecessor states and provider identity', async () => {
  const updates = []
  const db = { notificationDelivery: { updateMany: async args => { updates.push(args); return { count: 1 } } } }
  const expected = [
    ['sent', ['accepted']],
    ['delivered', ['accepted', 'sent']],
    ['read', ['accepted', 'sent', 'delivered']],
    ['failed', ['attempted', 'accepted', 'sent']],
  ]

  for (const [status] of expected) {
    await applyWhatsAppDeliveryStatus({ id: `wamid.${status}`, status, timestamp: '100' }, db)
  }

  for (let index = 0; index < expected.length; index += 1) {
    const [status, predecessors] = expected[index]
    assert.equal(updates[index].where.provider, 'whatsapp')
    assert.equal(updates[index].where.providerMessageId, `wamid.${status}`)
    assert.deepEqual(updates[index].where.status.in, predecessors)
    assert.equal(updates[index].data.status, status)
  }
})

test('WhatsApp duplicate, regression, and unknown callbacks are safe no-ops', async () => {
  const row = { provider: 'whatsapp', status: 'accepted' }
  const db = { notificationDelivery: { updateMany: async ({ where, data }) => {
    if (where.providerMessageId !== 'wamid.3' || !where.status.in.includes(row.status)) return { count: 0 }
    Object.assign(row, data)
    return { count: 1 }
  } } }

  assert.equal(await applyWhatsAppDeliveryStatus({ id: 'missing', status: 'delivered', timestamp: '100' }, db), false)
  assert.equal(await applyWhatsAppDeliveryStatus({ id: 'wamid.3', status: 'delivered', timestamp: '100' }, db), true)
  assert.equal(await applyWhatsAppDeliveryStatus({ id: 'wamid.3', status: 'sent', timestamp: '101' }, db), false)
  assert.equal(await applyWhatsAppDeliveryStatus({ id: 'wamid.3', status: 'delivered', timestamp: '102' }, db), false)
  assert.equal(await applyWhatsAppDeliveryStatus({ id: 'wamid.3', status: 'read', timestamp: '103' }, db), true)
  assert.equal(await applyWhatsAppDeliveryStatus({ id: 'wamid.3', status: 'failed', timestamp: '104' }, db), false)
  assert.equal(row.status, 'read')
})

test('notification provenance keeps missing stores and identifiers as no-ops', async () => {
  const createOnly = { notificationDelivery: { create: async ({ data }) => data } }

  assert.equal(await beginNotificationAttempt({ provider: 'fcm', channel: 'push', recipient: 'token' }, {}), null)
  assert.equal(await beginNotificationAttempt({ provider: 'fcm', channel: 'push', recipient: 'token' }, null), null)
  const fallbackRetry = await beginNotificationAttempt({
    provider: 'fcm',
    channel: 'push',
    recipient: 'token',
    retryKey: 'retry-without-count',
    retryCount: 4,
  }, createOnly)
  assert.equal(fallbackRetry.retryCount, 4)

  assert.equal(await recordNotificationAcceptance({ attemptId: null, providerMessageId: 'message' }, createOnly), null)
  assert.equal(await recordNotificationAcceptance({ attemptId: 'attempt', providerMessageId: 'message' }, {}), null)
  assert.equal(await recordNotificationAcceptance({ attemptId: 'attempt', providerMessageId: '' }, createOnly), null)

  assert.equal(await recordNotificationFailure({ attemptId: null }, createOnly), null)
  assert.equal(await recordNotificationFailure({ attemptId: 'attempt' }, {}), null)
})

test('provider failure defaults preserve unknown code and message', async () => {
  let updated
  const db = { notificationDelivery: { update: async ({ data }) => { updated = data; return data } } }

  await recordNotificationFailure({ attemptId: 'attempt-defaults' }, db)

  assert.equal(updated.providerFailureCode, null)
  assert.equal(updated.providerFailureMessage, null)
})

test('WhatsApp webhook callback extraction rejects malformed and foreign status records', () => {
  assert.deepEqual(whatsappStatusCallbacksFromWebhook(null, 'phone-1'), [])
  assert.deepEqual(whatsappStatusCallbacksFromWebhook({ entry: [null, {}] }, 'phone-1'), [])
  assert.deepEqual(whatsappStatusCallbacksFromWebhook({ entry: [{ changes: [null, {}, { value: null }] }] }, 'phone-1'), [])
  assert.deepEqual(whatsappStatusCallbacksFromWebhook({ entry: [{ changes: [{ value: {} }] }] }, 'phone-1'), [])
  assert.deepEqual(whatsappStatusCallbacksFromWebhook({
    entry: [{ changes: [{ value: { metadata: { phone_number_id: 'phone-1' } } }] }],
  }, 'phone-1'), [])
  assert.deepEqual(whatsappStatusCallbacksFromWebhook({
    entry: [{ changes: [{ value: {
      metadata: { phone_number_id: 'phone-1' },
      statuses: [null, { id: 1, status: 'sent' }, { id: 'wamid.bad', status: 'queued' }],
    } }] }],
  }, 'phone-1'), [])
  assert.deepEqual(whatsappStatusCallbacksFromWebhook({
    entry: [{ changes: [{ value: {
      metadata: { phone_number_id: 'phone-1' },
      statuses: [{ id: 'wamid.good', status: 'sent' }],
    } }] }],
  }, null), [])
})

test('WhatsApp webhook extraction returns only valid statuses for the configured phone number', () => {
  const sent = { id: 'wamid.sent', status: 'sent', timestamp: '100' }
  const delivered = { id: 'wamid.delivered', status: 'delivered', timestamp: '101' }
  const body = { entry: [
    { changes: [{ value: {
      metadata: { phone_number_id: 'phone-1' },
      statuses: [sent, null, { id: 123, status: 'sent' }, { id: 'wamid.queued', status: 'queued' }],
    } }] },
    { changes: [{ value: {
      metadata: { phone_number_id: 'phone-2' },
      statuses: [delivered],
    } }] },
  ] }

  assert.deepEqual(whatsappStatusCallbacksFromWebhook(body, 'phone-1'), [sent])
})

test('invalid WhatsApp delivery callbacks and missing stores are safe no-ops', async () => {
  const db = { notificationDelivery: { updateMany: async () => ({ count: 1 }) } }

  assert.equal(await applyWhatsAppDeliveryStatus(null, db), false)
  assert.equal(await applyWhatsAppDeliveryStatus({ id: 1, status: 'sent' }, db), false)
  assert.equal(await applyWhatsAppDeliveryStatus({ id: 'wamid.invalid', status: 'queued' }, db), false)
  assert.equal(await applyWhatsAppDeliveryStatus({ id: 'wamid.valid', status: 'sent' }, {}), false)
})

test('failed WhatsApp delivery stores provider error details without inventing missing fields', async () => {
  const updates = []
  const db = { notificationDelivery: { updateMany: async args => { updates.push(args); return { count: 1 } } } }

  assert.equal(await applyWhatsAppDeliveryStatus({
    id: 'wamid.failed-message',
    status: 'failed',
    timestamp: '200',
    errors: [{ code: 131026, message: 'Message undeliverable' }],
  }, db), true)
  assert.equal(updates[0].data.providerFailureCode, '131026')
  assert.equal(updates[0].data.providerFailureMessage, 'Message undeliverable')

  assert.equal(await applyWhatsAppDeliveryStatus({
    id: 'wamid.failed-title',
    status: 'failed',
    timestamp: '201',
    errors: [{ code: null, title: 'Provider title' }],
  }, db), true)
  assert.equal(updates[1].data.providerFailureCode, null)
  assert.equal(updates[1].data.providerFailureMessage, 'Provider title')

  assert.equal(await applyWhatsAppDeliveryStatus({
    id: 'wamid.failed-unknown-message',
    status: 'failed',
    timestamp: '202',
    errors: [{ code: 'unknown' }],
  }, db), true)
  assert.equal(updates[2].data.providerFailureCode, 'unknown')
  assert.equal(updates[2].data.providerFailureMessage, null)
})

test('non-object provider errors add no invented failure fields and non-failed statuses ignore errors', async () => {
  const updates = []
  const db = { notificationDelivery: { updateMany: async args => { updates.push(args); return { count: 1 } } } }

  await applyWhatsAppDeliveryStatus({
    id: 'wamid.failed-primitive', status: 'failed', timestamp: '203', errors: ['provider-string'],
  }, db)
  await applyWhatsAppDeliveryStatus({
    id: 'wamid.sent-with-error', status: 'sent', timestamp: '204', errors: [{ code: 999, title: 'ignore me' }],
  }, db)

  assert.equal('providerFailureCode' in updates[0].data, false)
  assert.equal('providerFailureMessage' in updates[0].data, false)
  assert.equal('providerFailureCode' in updates[1].data, false)
  assert.equal('providerFailureMessage' in updates[1].data, false)
})
