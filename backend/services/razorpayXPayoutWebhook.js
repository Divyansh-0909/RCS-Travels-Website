import { createHash } from 'node:crypto'
import { prisma } from '../db/prisma.js'
import { PaymentError } from './paymentErrors.js'
import { applyPayoutProviderState, recomputePayoutBatchStatus } from './driverPayouts.js'
import { createRazorpayXWebhookVerifier } from './razorpayX.js'

const PAYOUT_EVENTS = new Set([
  'payout.pending', 'payout.queued', 'payout.initiated', 'payout.processed',
  'payout.updated', 'payout.reversed', 'payout.failed', 'payout.rejected',
])

const finishEvent = (tx, eventId, status, result, payoutId = null) => tx.razorpayWebhookEvent.update({
  where: { eventId },
  data: { status, result, driverPayoutId: payoutId, processedAt: new Date() },
})

function parseEvent(rawBody) {
  try { return JSON.parse(rawBody.toString('utf8')) }
  catch { throw new PaymentError('MALFORMED_WEBHOOK', 'Malformed RazorpayX webhook', 400) }
}

function providerPayout(event) {
  const payout = event?.payload?.payout?.entity
  if (!PAYOUT_EVENTS.has(event?.event) || !payout || typeof payout.id !== 'string') return null
  return payout
}

function matchesLocalPayout(local, provider) {
  return (!provider.reference_id || provider.reference_id === local.id)
    && (!Number.isInteger(provider.amount) || provider.amount === local.amount)
    && (!provider.currency || provider.currency === local.currency)
    && (!local.externalPayoutId || local.externalPayoutId === provider.id)
}

async function processTransaction(tx, event, eventId) {
  const inserted = await tx.razorpayWebhookEvent.createMany({
    data: [{ eventId, eventType: event?.event ?? 'unknown' }],
    skipDuplicates: true,
  })
  if (!inserted.count) return { duplicate: true }
  const provider = providerPayout(event)
  if (!provider) {
    await finishEvent(tx, eventId, 'ignored', 'unsupported_or_malformed_payout')
    return { ignored: true }
  }
  const payout = await tx.driverPayout.findFirst({
    where: { OR: [{ externalPayoutId: provider.id }, { id: provider.reference_id ?? '' }] },
  })
  if (!payout) {
    await finishEvent(tx, eventId, 'ignored', 'payout_not_found')
    return { ignored: true }
  }
  if (!matchesLocalPayout(payout, provider)) {
    await finishEvent(tx, eventId, 'ignored', 'payout_mismatch', payout.id)
    return { ignored: true }
  }
  const previousStatus = payout.status
  const updated = await applyPayoutProviderState(payout.id, provider, { db: tx })
  await recomputePayoutBatchStatus(payout.batchId, tx)
  const result = updated.status === previousStatus ? 'terminal_or_duplicate_state' : `payout.${updated.status}`
  await finishEvent(tx, eventId, 'processed', result, payout.id)
  return { processed: true, payoutId: payout.id, status: updated.status }
}

export async function processRazorpayXPayoutWebhook({
  rawBody,
  signature,
  eventId,
  gateway = createRazorpayXWebhookVerifier(),
  db = prisma,
}) {
  if (!Buffer.isBuffer(rawBody) || !gateway.verifyWebhookSignature(rawBody, signature)) {
    throw new PaymentError('INVALID_WEBHOOK_SIGNATURE', 'Invalid RazorpayX webhook signature', 400)
  }
  const event = parseEvent(rawBody)
  const stableEventId = eventId || createHash('sha256').update(rawBody).digest('hex')
  return db.$transaction
    ? db.$transaction(tx => processTransaction(tx, event, stableEventId), { isolationLevel: 'Serializable' })
    : processTransaction(db, event, stableEventId)
}
