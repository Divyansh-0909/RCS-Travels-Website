import { createHash } from 'node:crypto'
import { prisma } from '../db/prisma.js'
import { notifyWhatsAppScheduledPaymentConfirmed } from './notification.js'
import { followCapturedPaymentEffect } from './paymentEffects.js'
import { PaymentError } from './paymentErrors.js'
import { statusAfterGatewayPayment } from './paymentStatus.js'
import { createRazorpayWebhookVerifier } from './razorpay.js'
import { applyCapturedPaymentEffect, applyRefundedPaymentEffect } from './scheduledPayments.js'

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

async function handleRefundProcessed(tx, { eventId, payment, refundEntity }) {
  if (
    payment.purpose === 'driver_debt_settlement'
    && payment.driverDebtRefundAmount
    && typeof refundEntity?.id === 'string'
    && refundEntity.amount === payment.driverDebtRefundAmount
    && refundEntity?.currency === payment.currency
  ) {
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        razorpayRefundId: refundEntity.id,
        refundedAt: new Date(),
        ...(refundEntity.amount === payment.amount ? { status: 'refunded' } : {}),
      },
    })
    await finishEvent(tx, eventId, 'processed', 'driver_debt_excess_refund.processed', payment.id)
    return { processed: true }
  }
  if (
    payment.status !== 'refund_pending'
    || typeof refundEntity?.id !== 'string'
    || refundEntity.amount !== payment.amount
    || refundEntity?.currency !== payment.currency
  ) {
    await finishEvent(tx, eventId, 'ignored', 'unexpected_or_partial_refund', payment.id)
    return { ignored: true }
  }

  const refundedPayment = await tx.payment.update({
    where: { id: payment.id },
    data: { status: 'refunded', razorpayRefundId: refundEntity.id, refundedAt: new Date() },
  })
  await applyRefundedPaymentEffect(tx, refundedPayment)
  await finishEvent(tx, eventId, 'processed', 'refund.processed', payment.id)
  return { processed: true }
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
    if (payment.status !== 'captured' && payment.status !== 'refunded') {
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
  if (event.event === 'refund.processed') {
    return handleRefundProcessed(tx, { eventId, payment, refundEntity })
  }
  if (event.event === 'refund.failed') {
    await tx.payment.updateMany({
      where: { id: payment.id, status: 'refund_pending' },
      data: {
        status: 'captured',
        failureCode: 'REFUND_FAILED',
        failureDescription: refundEntity.error_description ?? null,
      },
    })
    await finishEvent(tx, eventId, 'processed', event.event, payment.id)
    return { processed: true }
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

  const { notificationBookingId: _notificationBookingId, effect: _effect, ...result } = outcome
  return result
}
