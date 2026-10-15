import { createHash } from 'node:crypto'
import { prisma } from '../db/prisma.js'
import { notifyWhatsAppScheduledPaymentConfirmed } from './notification.js'
import { followCapturedPaymentEffect } from './paymentEffects.js'
import { PaymentError } from './paymentErrors.js'
import { statusAfterGatewayPayment, canApplyGatewayFailure } from './paymentStatus.js'
import { createRazorpayWebhookVerifier } from './razorpay.js'
import { applyCapturedPaymentEffect } from './scheduledPayments.js'
import { applyRefundProviderState } from './refundProviderState.js'

const matchingPaymentFor = (tx, { orderId, externalPaymentId }) => tx.payment.findFirst({
  where: {
    OR: [
      ...(orderId ? [{ razorpayOrderId: orderId }] : []),
      ...(externalPaymentId ? [{ razorpayPaymentId: externalPaymentId }] : []),
    ],
  },
})

const finishEvent = (tx, eventId, status, result, paymentId = null) => tx.razorpayWebhookEvent.update({
  where: { eventId },
  data: { status, result, paymentId, processedAt: new Date() },
})

async function handleDuplicateCapture(tx, event, paymentEntity) {
  if (event.event !== 'payment.captured') return { duplicate: true }
  const payment = await matchingPaymentFor(tx, {
    orderId: paymentEntity?.order_id,
    externalPaymentId: paymentEntity?.id,
  })
  if (!payment || paymentEntity?.amount !== payment.amount || paymentEntity?.currency !== payment.currency) {
    return { duplicate: true }
  }
  const effect = await applyCapturedPaymentEffect(tx, payment)
  return { duplicate: true, effect }
}

async function handlePaymentEvent(tx, { event, eventId, payment, paymentEntity }) {
  if (paymentEntity.amount !== payment.amount || paymentEntity.currency !== payment.currency) {
    await finishEvent(tx, eventId, 'failed', 'amount_or_currency_mismatch', payment.id)
    return { ignored: true }
  }

  const captured = event.event === 'payment.captured'
  const updatedPayment = await tx.payment.update({
    where: { id: payment.id },
    data: {
      status: statusAfterGatewayPayment(payment.status, captured ? 'captured' : 'authorized'),
      razorpayPaymentId: paymentEntity.id,
      ...(captured ? { capturedAt: new Date() } : {}),
    },
  })
  const effect = captured ? await applyCapturedPaymentEffect(tx, updatedPayment) : null
  await finishEvent(tx, eventId, 'processed', event.event, payment.id)
  return {
    processed: true,
    effect,
    notificationBookingId: effect?.type === 'scheduled_ride_advance' ? effect.bookingId : null,
  }
}

async function handleRefundEvent(tx, { eventId, payment, refundEntity, status }) {
  const outcome = await applyRefundProviderState(tx, payment, { ...refundEntity, status })
  await finishEvent(tx, eventId, outcome.ignored ? 'ignored' : 'processed', outcome.result, payment.id)
  return outcome.ignored ? { ignored: true } : { processed: true }
}

async function processEventTransaction(tx, { event, eventId }) {
  const paymentEntity = event.payload?.payment?.entity
  const refundEntity = event.payload?.refund?.entity
  const identity = {
    orderId: paymentEntity?.order_id,
    externalPaymentId: paymentEntity?.id ?? refundEntity?.payment_id,
  }

  const inserted = await tx.razorpayWebhookEvent.createMany({
    data: [{ eventId, eventType: event.event }],
    skipDuplicates: true,
  })
  if (!inserted.count) return handleDuplicateCapture(tx, event, paymentEntity)

  const payment = await matchingPaymentFor(tx, identity)
  if (!payment) {
    await finishEvent(tx, eventId, 'ignored', 'payment_not_found')
    return { ignored: true }
  }

  if (event.event === 'payment.authorized' || event.event === 'payment.captured') {
    return handlePaymentEvent(tx, { event, eventId, payment, paymentEntity })
  }
  if (event.event === 'payment.failed') {
    if (canApplyGatewayFailure(payment.status)) {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: 'failed',
          razorpayPaymentId: paymentEntity.id,
          failureCode: paymentEntity.error_code ?? null,
          failureDescription: paymentEntity.error_description ?? null,
        },
      })
    }
    await finishEvent(tx, eventId, 'processed', event.event, payment.id)
    return { processed: true }
  }
  const refundStatus = {
    'refund.processed': 'processed',
    'refund.failed': 'failed',
  }[event.event]
  if (refundStatus) {
    return handleRefundEvent(tx, { eventId, payment, refundEntity, status: refundStatus })
  }

  await finishEvent(tx, eventId, 'ignored', 'unsupported_event', payment.id)
  return { ignored: true }
}

export async function processRazorpayWebhookEvent({
  rawBody,
  signature,
  eventId,
  gateway = createRazorpayWebhookVerifier(),
  db = prisma,
  notifyPayment = null,
  refundPaymentFn,
  refundDebtExcessFn,
}) {
  if (!gateway.verifyWebhookSignature(rawBody, signature)) {
    throw new PaymentError('INVALID_WEBHOOK_SIGNATURE', 'Invalid webhook signature', 400)
  }

  let event
  try {
    event = JSON.parse(rawBody.toString('utf8'))
  } catch {
    throw new PaymentError('MALFORMED_WEBHOOK', 'Malformed webhook payload', 400)
  }
  if (!event || typeof event.event !== 'string') {
    throw new PaymentError('MALFORMED_WEBHOOK', 'Webhook event type is missing', 400)
  }

  const stableEventId = eventId || createHash('sha256').update(rawBody).digest('hex')
  const outcome = await db.$transaction((tx) => processEventTransaction(tx, { event, eventId: stableEventId }))

  await followCapturedPaymentEffect(outcome.effect, { db, refundPaymentFn, refundDebtExcessFn })
  const notify = notifyPayment ?? (db === prisma ? notifyWhatsAppScheduledPaymentConfirmed : null)
  if (outcome.notificationBookingId && notify) await notify(outcome.notificationBookingId).catch(() => {})

  const result = { ...outcome }
  delete result.notificationBookingId
  delete result.effect
  return result
}
