import { createHmac } from 'node:crypto'
import { systemClock } from '../../lib/clock.js'
import { createRazorpayXWebhookVerifier } from '../../services/razorpayX.js'
import {
  createProviderPlan,
  failAfterCommit,
  failBeforeCommit,
  providerFailure,
} from './providerPlan.js'

export const payoutProviderState = Object.freeze({
  PENDING: 'pending',
  PROCESSING: 'processing',
  SUCCEEDED: 'processed',
  FAILED: 'failed',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
  REVERSED: 'reversed',
})

const clone = (value) => structuredClone(value)
const identifier = value => `pout_${String(value).padStart(4, '0')}`

const payoutEventType = (status) => status === payoutProviderState.SUCCEEDED
  ? 'payout.processed'
  : `payout.${status}`

export function createRazorpayXFake({
  clock = systemClock,
  webhookSecret = 'verification-payout-webhook-secret',
} = {}) {
  const payouts = new Map()
  const payoutByKey = new Map()
  const callbacks = new Map()
  const invalidDestinations = new Set()
  const plan = createProviderPlan()
  const history = { creates: [], fetches: [], callbackDeliveries: [] }
  let payoutSequence = 0
  let callbackSequence = 0

  const requirePayout = (payoutId) => {
    const payout = payouts.get(payoutId)
    if (!payout) throw providerFailure('PAYOUT_NOT_FOUND', `Payout ${payoutId} was not found`, 404)
    return payout
  }

  const createPayout = async (request) => {
    history.creates.push({ request: clone(request), at: clock.now() })
    const operation = plan.take('payout')
    failBeforeCommit(operation, 'PAYOUT_GATEWAY_ERROR')
    const previousId = payoutByKey.get(request.idempotencyKey)
    if (previousId) return clone(requirePayout(previousId))
    if (!request.upiId?.includes('@') || invalidDestinations.has(request.upiId)) {
      throw providerFailure('BAD_REQUEST_ERROR', 'Invalid payout destination', 400)
    }
    const payout = {
      id: identifier(++payoutSequence),
      amount: request.amount,
      currency: request.currency ?? 'INR',
      status: payoutProviderState.PENDING,
      destination: request.upiId,
      reference_id: String(request.reference),
      idempotency_key: request.idempotencyKey,
      created_at: Math.floor(clock.now().getTime() / 1000),
    }
    payouts.set(payout.id, payout)
    payoutByKey.set(request.idempotencyKey, payout.id)
    failAfterCommit(operation)
    return clone(payout)
  }

  const fetchPayout = async (payoutId) => {
    history.fetches.push({ payoutId, at: clock.now() })
    failBeforeCommit(plan.take('payoutFetch'), 'PAYOUT_FETCH_ERROR')
    return clone(requirePayout(payoutId))
  }

  return {
    gateway: { createPayout, fetchPayout },
    history,
    planNext: (operation, outcome, error = null) => plan.enqueue(operation, outcome, error),
    setState(payoutId, status, details = {}) {
      const payout = requirePayout(payoutId)
      Object.assign(payout, details, { status })
      return clone(payout)
    },
    invalidateDestination(upiId) {
      invalidDestinations.add(upiId)
    },
    webhookGateway: createRazorpayXWebhookVerifier({ secret: webhookSecret }),
    queueCallback(payoutId, eventId = `payout_event_${String(++callbackSequence).padStart(4, '0')}`) {
      const payout = clone(requirePayout(payoutId))
      const rawBody = Buffer.from(JSON.stringify({
        event: payoutEventType(payout.status),
        payload: { payout: { entity: payout } },
      }))
      callbacks.set(eventId, { eventId, payout, rawBody })
      return eventId
    },
    async deliverCallback(eventId, deliver, { validSignature = true } = {}) {
      const callback = callbacks.get(eventId)
      if (!callback) throw providerFailure('CALLBACK_NOT_FOUND', `Payout callback ${eventId} was not found`, 404)
      const signature = validSignature
        ? createHmac('sha256', webhookSecret).update(callback.rawBody).digest('hex')
        : '0'.repeat(64)
      history.callbackDeliveries.push({ eventId, validSignature, at: clock.now() })
      return deliver({
        eventId,
        payout: clone(callback.payout),
        rawBody: Buffer.from(callback.rawBody),
        signature,
      })
    },
    snapshot: () => ({
      payouts: clone([...payouts.values()]),
      queuedCallbackIds: [...callbacks.keys()],
    }),
    payout: payoutId => clone(requirePayout(payoutId)),
    reset() {
      payouts.clear(); payoutByKey.clear(); callbacks.clear(); invalidDestinations.clear(); plan.reset()
      history.creates.length = 0; history.fetches.length = 0; history.callbackDeliveries.length = 0
      payoutSequence = 0; callbackSequence = 0
    },
  }
}
