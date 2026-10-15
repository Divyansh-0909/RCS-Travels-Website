import { prisma } from '../db/prisma.js'

const WHATSAPP_STATUS = new Set(['sent', 'delivered', 'read', 'failed'])
const PREDECESSORS = {
  sent: ['accepted'],
  delivered: ['accepted', 'sent'],
  read: ['accepted', 'sent', 'delivered'],
  failed: ['attempted', 'accepted', 'sent'],
}

const deliveryStore = db => db?.notificationDelivery

const providerEventTime = timestamp => {
  const seconds = Number(timestamp)
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : null
}

const errorDetails = errors => {
  const error = Array.isArray(errors) ? errors[0] : null
  if (!error || typeof error !== 'object') return {}
  return {
    providerFailureCode: error.code == null ? null : String(error.code),
    providerFailureMessage: error.title ?? error.message ?? null,
  }
}

/** Create one durable row before a provider call starts. */
export async function beginNotificationAttempt({
  provider,
  channel,
  recipient,
  bookingId = null,
  purpose = null,
  retryKey = null,
  retryCount = 0,
}, db = prisma, now = new Date()) {
  const store = deliveryStore(db)
  if (!store) return null
  // Scheduled reminders already retry after a failed claimed send. Count their
  // prior attempts so each durable row remains connected to that retry chain.
  const priorAttempts = retryKey && typeof store.count === 'function'
    ? await store.count({ where: { retryKey } })
    : null
  return store.create({ data: {
    provider,
    channel,
    recipient,
    bookingId,
    purpose,
    retryKey,
    retryCount: priorAttempts ?? retryCount,
    status: 'attempted',
    attemptedAt: now,
  } })
}

/** Provider acknowledgement proves acceptance, not end-device delivery. */
export async function recordNotificationAcceptance({ attemptId, providerMessageId }, db = prisma, now = new Date()) {
  const store = attemptId ? deliveryStore(db) : null
  if (!store) return null
  if (typeof providerMessageId !== 'string' || !providerMessageId) return null
  return store.update({
    where: { id: attemptId },
    data: {
      providerMessageId,
      status: 'accepted',
      providerAcceptedAt: now,
    },
  })
}

/** Provider/request failure is evidence on the same attempt row. */
export async function recordNotificationFailure({ attemptId, code = null, message = null }, db = prisma, now = new Date()) {
  if (!attemptId) return null
  const store = deliveryStore(db)
  if (!store) return null
  return store.update({
    where: { id: attemptId },
    data: {
      status: 'failed',
      failedAt: now,
      providerFailureCode: code == null ? null : String(code),
      providerFailureMessage: message == null ? null : String(message),
    },
  })
}

export const whatsappStatusCallbacksFromWebhook = (body, phoneNumberId) => (body?.entry ?? [])
  .flatMap(entry => entry?.changes ?? [])
  .filter(change => phoneNumberId && change?.value?.metadata?.phone_number_id === phoneNumberId)
  .flatMap(change => change.value.statuses ?? [])
  .filter(status => status && typeof status.id === 'string' && WHATSAPP_STATUS.has(status.status))

/**
 * Advance a known WhatsApp notification once. The provider timestamp and the
 * server receipt time are stored independently. Duplicate, late, malformed,
 * and unknown-message callbacks cannot regress the row.
 */
export async function applyWhatsAppDeliveryStatus(callback, db = prisma, receivedAt = new Date()) {
  if (!callback || typeof callback.id !== 'string' || !WHATSAPP_STATUS.has(callback.status)) return false
  const store = deliveryStore(db)
  if (!store) return false

  const at = providerEventTime(callback.timestamp)
  const timestampField = `${callback.status}At`
  const result = await store.updateMany({
    where: {
      provider: 'whatsapp',
      providerMessageId: callback.id,
      status: { in: PREDECESSORS[callback.status] },
    },
    data: {
      status: callback.status,
      providerStatusAt: at,
      providerStatusReceivedAt: receivedAt,
      [timestampField]: at,
      ...(callback.status === 'failed' ? errorDetails(callback.errors) : {}),
    },
  })
  return result.count === 1
}
