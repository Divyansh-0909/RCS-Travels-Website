import { systemClock } from '../../lib/clock.js'

const copy = value => structuredClone(value)

/** Provider acceptance and actual delivery are deliberately separate. */
export function createNotificationSink({ clock = systemClock } = {}) {
  const attempts = []
  const plans = []
  let sequence = 0

  const next = (state, failureCategory = null) => { plans.push({ state, failureCategory }) }

  const send = async ({ channel, recipient, type, idempotencyKey = null, payload = null }) => {
    const plan = plans.shift() ?? { state: 'pending', failureCategory: null }
    const previous = attempts.filter(item => item.idempotencyKey === idempotencyKey && idempotencyKey !== null)
    const entry = { channel, recipient, type, idempotencyKey, payload: copy(payload),
      attemptedAt: clock.now(), deliveredAt: null, providerMessageId: null,
      state: plan.state, failureCategory: plan.failureCategory,
      retryCount: previous.length }
    if (plan.state !== 'failed' && plan.state !== 'timeout') {
      entry.providerMessageId = `msg_${String(++sequence).padStart(4, '0')}`
    }
    attempts.push(entry)
    if (plan.state === 'timeout') throw new Error('NOTIFICATION_TIMEOUT')
    return copy(entry)
  }

  const deliver = (messageId, at = clock.now()) => {
    const entry = attempts.find(item => item.providerMessageId === messageId)
    if (!entry) throw new Error(`Unknown notification ${messageId}`)
    entry.state = 'delivered'
    entry.deliveredAt = new Date(at)
    return copy(entry)
  }

  const messaging = () => ({ send: async request => {
    const result = await send({ channel: 'push', recipient: request.token,
      type: request.notification?.title ?? 'push', payload: request })
    if (result.state === 'failed') throw new Error(result.failureCategory ?? 'PUSH_REJECTED')
    return result.providerMessageId
  } })

  const whatsappRequest = async (_url, options) => {
    const body = JSON.parse(options.body)
    const result = await send({ channel: 'whatsapp', recipient: body.to,
      type: body.template?.name ?? body.type, payload: body })
    return { ok: result.state !== 'failed', status: result.state === 'failed' ? 503 : 200,
      text: async () => result.failureCategory ?? '',
      json: async () => ({ messages: [{ id: result.providerMessageId }] }) }
  }

  return { next, send, deliver, messaging, whatsappRequest,
    history: () => copy(attempts), reset: () => { attempts.length = 0; plans.length = 0; sequence = 0 } }
}
