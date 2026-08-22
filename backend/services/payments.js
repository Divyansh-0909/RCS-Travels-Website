import { createHash } from 'node:crypto'
import { prisma } from '../db/prisma.js'
import { createRazorpayGateway } from './razorpay.js'
import { PaymentError } from './paymentErrors.js'
import { createPaymentIntent, toSubunits } from './paymentIntents.js'
import { applyCapturedPaymentEffect, applyRefundedPaymentEffect } from './scheduledPayments.js'
import { notifyWhatsAppScheduledPaymentConfirmed } from './notification.js'

export { PaymentError, createPaymentIntent, toSubunits }

const TERMINAL_OR_REFUNDING = new Set(['refund_pending', 'refunded'])
export function statusAfterGatewayPayment(current, gatewayStatus) {
  if (TERMINAL_OR_REFUNDING.has(current) || current === 'captured') return current
  if (gatewayStatus === 'captured') return 'captured'
  if (gatewayStatus === 'authorized' && ['order_created', 'authorized'].includes(current)) return 'authorized'
  return current
}

const checkoutOf = (payment, keyId) => ({
  paymentId: payment.id, keyId, orderId: payment.razorpayOrderId,
  amount: payment.amount, currency: payment.currency, status: payment.status,
})

export async function createOrderForPayment({ paymentId, userId, gateway = createRazorpayGateway(), db = prisma }) {
  const payment = await db.payment.findFirst({ where: { id: paymentId, userId } })
  if (!payment) throw new PaymentError('PAYMENT_NOT_FOUND', 'Payment not found', 404)
  if (payment.razorpayOrderId) return checkoutOf(payment, gateway.keyId)
  const claimed = await db.payment.updateMany({ where: { id: payment.id, status: 'created', razorpayOrderId: null },
    data: { status: 'order_creating', failureCode: null, failureDescription: null } })
  if (!claimed.count) throw new PaymentError('PAYMENT_BUSY', 'Payment order is already being created')
  try {
    const order = await gateway.createOrder({ amount: payment.amount, currency: payment.currency,
      receipt: payment.id.slice(0, 40), notes: { internal_payment_id: payment.id } })
    if (order.amount !== payment.amount || order.currency !== payment.currency)
      throw new PaymentError('GATEWAY_ORDER_MISMATCH', 'Gateway returned mismatched order values')
    const saved = await db.payment.update({ where: { id: payment.id }, data: {
      status: 'order_created', razorpayOrderId: order.id,
    } })
    return checkoutOf(saved, gateway.keyId)
  } catch (error) {
    await db.payment.updateMany({ where: { id: payment.id, status: 'order_creating' }, data: {
      status: 'created', failureCode: error.code ?? 'ORDER_CREATION_FAILED', failureDescription: String(error.message).slice(0, 500),
    } })
    throw error
  }
}

export async function verifyCheckoutPayment({ paymentId, userId, razorpayPaymentId, razorpayOrderId, signature,
  gateway = createRazorpayGateway(), db = prisma, notifyPayment = null }) {
  const payment = await db.payment.findFirst({ where: { id: paymentId, userId } })
  if (!payment) throw new PaymentError('PAYMENT_NOT_FOUND', 'Payment not found', 404)
  if (!payment.razorpayOrderId || payment.razorpayOrderId !== razorpayOrderId)
    throw new PaymentError('ORDER_MISMATCH', 'Payment order does not match', 400)
  if (!gateway.verifyPaymentSignature({ orderId: payment.razorpayOrderId, paymentId: razorpayPaymentId, signature }))
    throw new PaymentError('INVALID_SIGNATURE', 'Invalid payment signature', 400)
  const external = await gateway.fetchPayment(razorpayPaymentId)
  if (external.order_id !== payment.razorpayOrderId || external.amount !== payment.amount || external.currency !== payment.currency)
    throw new PaymentError('PAYMENT_MISMATCH', 'Gateway payment does not match the internal payment', 400)
  if (!['captured', 'authorized'].includes(external.status)) throw new PaymentError('PAYMENT_NOT_VERIFIED', `Gateway payment is ${external.status}`)
  const next = statusAfterGatewayPayment(payment.status, external.status)
  const write = async (tx) => {
    const updated = await tx.payment.update({ where: { id: payment.id }, data: {
      status: next, razorpayPaymentId, razorpaySignature: signature, ...(next === 'captured' ? { capturedAt: new Date() } : {}),
    } })
    const effect = next === 'captured' ? await applyCapturedPaymentEffect(tx, updated) : null
    return { updated, effect }
  }
  const { updated, effect } = db.$transaction ? await db.$transaction(write) : await write(db)
  const notify = notifyPayment ?? (db === prisma ? notifyWhatsAppScheduledPaymentConfirmed : null)
  if (effect?.type === 'scheduled_ride_advance' && notify) await notify(effect.bookingId).catch(() => {})
  return { paymentId: updated.id, status: updated.status }
}

export async function processRazorpayWebhook({ rawBody, signature, eventId, gateway = createRazorpayGateway(),
  db = prisma, notifyPayment = null }) {
  if (!gateway.verifyWebhookSignature(rawBody, signature)) throw new PaymentError('INVALID_WEBHOOK_SIGNATURE', 'Invalid webhook signature', 400)
  let event
  try { event = JSON.parse(rawBody.toString('utf8')) } catch { throw new PaymentError('MALFORMED_WEBHOOK', 'Malformed webhook payload', 400) }
  if (!event || typeof event.event !== 'string') throw new PaymentError('MALFORMED_WEBHOOK', 'Webhook event type is missing', 400)
  const stableEventId = eventId || createHash('sha256').update(rawBody).digest('hex')
  const outcome = await db.$transaction(async (tx) => {
    const inserted = await tx.razorpayWebhookEvent.createMany({ data: [{ eventId: stableEventId, eventType: event.event }], skipDuplicates: true })
    if (!inserted.count) return { duplicate: true }
    const paymentEntity = event.payload?.payment?.entity
    const refundEntity = event.payload?.refund?.entity
    const orderId = paymentEntity?.order_id
    const externalPaymentId = paymentEntity?.id ?? refundEntity?.payment_id
    const payment = await tx.payment.findFirst({ where: { OR: [
      ...(orderId ? [{ razorpayOrderId: orderId }] : []), ...(externalPaymentId ? [{ razorpayPaymentId: externalPaymentId }] : []),
    ] } })
    const finishEvent = (status, result, paymentId = null) => tx.razorpayWebhookEvent.update({ where: { eventId: stableEventId },
      data: { status, result, paymentId, processedAt: new Date() } })
    if (!payment) { await finishEvent('ignored', 'payment_not_found'); return { ignored: true } }

    if (event.event === 'payment.authorized' || event.event === 'payment.captured') {
      if (paymentEntity.amount !== payment.amount || paymentEntity.currency !== payment.currency) {
        await finishEvent('failed', 'amount_or_currency_mismatch', payment.id); return { ignored: true }
      }
      const captured = event.event === 'payment.captured'
      const updatedPayment = await tx.payment.update({ where: { id: payment.id }, data: {
        status: statusAfterGatewayPayment(payment.status, captured ? 'captured' : 'authorized'),
        razorpayPaymentId: paymentEntity.id,
        ...(captured ? { capturedAt: new Date() } : {}),
      } })
      const effect = captured ? await applyCapturedPaymentEffect(tx, updatedPayment) : null
      await finishEvent('processed', event.event, payment.id)
      return { processed: true, notificationBookingId:
        effect?.type === 'scheduled_ride_advance' ? effect.bookingId : null }
    }
    if (event.event === 'payment.failed') {
      if (payment.status !== 'captured' && payment.status !== 'refunded') await tx.payment.update({ where: { id: payment.id }, data: {
        status: 'failed', razorpayPaymentId: paymentEntity.id,
        failureCode: paymentEntity.error_code ?? null, failureDescription: paymentEntity.error_description ?? null,
      } })
      await finishEvent('processed', event.event, payment.id); return { processed: true }
    }
    if (event.event === 'refund.processed') {
      const refundedPayment = await tx.payment.update({ where: { id: payment.id }, data: { status: 'refunded', razorpayRefundId: refundEntity.id, refundedAt: new Date() } })
      await applyRefundedPaymentEffect(tx, refundedPayment)
      await finishEvent('processed', event.event, payment.id); return { processed: true }
    }
    if (event.event === 'refund.failed') {
      await tx.payment.updateMany({ where: { id: payment.id, status: 'refund_pending' }, data: {
        status: 'captured', failureCode: 'REFUND_FAILED', failureDescription: refundEntity.error_description ?? null,
      } })
      await finishEvent('processed', event.event, payment.id); return { processed: true }
    }
    await finishEvent('ignored', 'unsupported_event', payment.id)
    return { ignored: true }
  })
  const notify = notifyPayment ?? (db === prisma ? notifyWhatsAppScheduledPaymentConfirmed : null)
  if (outcome.notificationBookingId && notify) await notify(outcome.notificationBookingId).catch(() => {})
  const { notificationBookingId: _notificationBookingId, ...result } = outcome
  return result
}

export async function refundPayment({ paymentId, gateway = createRazorpayGateway(), db = prisma }) {
  const payment = await db.payment.findUnique({ where: { id: paymentId } })
  if (!payment) throw new PaymentError('PAYMENT_NOT_FOUND', 'Payment not found', 404)
  if (payment.status === 'refunded' || payment.status === 'refund_pending')
    return { paymentId, status: payment.status, refundId: payment.razorpayRefundId, alreadyApplied: true }
  if (payment.status !== 'captured' || !payment.razorpayPaymentId)
    throw new PaymentError('REFUND_NOT_ALLOWED', 'Only a captured payment can be refunded')
  const claimed = await db.payment.updateMany({ where: { id: payment.id, status: 'captured' }, data: { status: 'refund_pending' } })
  if (!claimed.count) throw new PaymentError('REFUND_BUSY', 'Refund is already in progress')
  try {
    const refund = await gateway.createRefund(payment.razorpayPaymentId, { amount: payment.amount, notes: { internal_payment_id: payment.id } })
    const updated = await db.payment.update({ where: { id: payment.id }, data: { razorpayRefundId: refund.id } })
    return { paymentId, status: updated.status, refundId: updated.razorpayRefundId }
  } catch (error) {
    await db.payment.updateMany({ where: { id: payment.id, status: 'refund_pending', razorpayRefundId: null }, data: {
      status: 'captured', failureCode: error.code ?? 'REFUND_FAILED', failureDescription: String(error.message).slice(0, 500),
    } })
    throw error
  }
}
