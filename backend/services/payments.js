import { prisma } from '../db/prisma.js'
import { createRazorpayGateway } from './razorpay.js'
import { PaymentError } from './paymentErrors.js'
import { createPaymentIntent, MIN_PAYMENT_SUBUNITS, toSubunits } from './paymentIntents.js'
import { applyCapturedPaymentEffect } from './scheduledPayments.js'
import { notifyWhatsAppScheduledPaymentConfirmed } from './notification.js'
import { followCapturedPaymentEffect } from './paymentEffects.js'
import { statusAfterGatewayPayment } from './paymentStatus.js'
import { processRazorpayWebhookEvent } from './razorpayWebhook.js'

export { PaymentError, createPaymentIntent, toSubunits }
export { statusAfterGatewayPayment } from './paymentStatus.js'

const gatewayOrderError = (error) => {
  if (error?.statusCode === 401 || error?.status === 401)
    return new PaymentError('RAZORPAY_AUTH_FAILED', 'Payment service authentication failed', 401)
  return new PaymentError('RAZORPAY_ORDER_FAILED', 'Could not create payment order', 500)
}

const checkoutOf = (payment, keyId) => ({
  paymentId: payment.id, keyId, orderId: payment.razorpayOrderId,
  amount: payment.amount, currency: payment.currency, status: payment.status,
})

const ownerWhere = ({ paymentId, userId, driverId }) => ({
  id: paymentId,
  ...(driverId ? { driverId, userId: null } : { userId, driverId: null }),
})

export async function createOrderForPayment({ paymentId, userId, driverId, gateway = createRazorpayGateway(), db = prisma }) {
  const payment = await db.payment.findFirst({ where: ownerWhere({ paymentId, userId, driverId }) })
  if (!payment) throw new PaymentError('PAYMENT_NOT_FOUND', 'Payment not found', 404)
  if (!Number.isInteger(payment.amount) || payment.amount < MIN_PAYMENT_SUBUNITS)
    throw new PaymentError('INVALID_AMOUNT', 'Payment amount must be at least 100 subunits', 400)
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
    throw error instanceof PaymentError ? error : gatewayOrderError(error)
  }
}

export async function verifyCheckoutPayment({ paymentId, userId, driverId, razorpayPaymentId, razorpayOrderId, signature,
  gateway = createRazorpayGateway(), db = prisma, notifyPayment = null,
  refundPaymentFn = refundPayment, refundDebtExcessFn = refundDriverDebtExcess }) {
  const payment = await db.payment.findFirst({ where: ownerWhere({ paymentId, userId, driverId }) })
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
  const refund = await followCapturedPaymentEffect(effect, { db, refundPaymentFn, refundDebtExcessFn })
  const notify = notifyPayment ?? (db === prisma ? notifyWhatsAppScheduledPaymentConfirmed : null)
  if (effect?.type === 'scheduled_ride_advance' && notify) await notify(effect.bookingId).catch(() => {})
  return { paymentId: updated.id, status: refund?.status ?? updated.status }
}

export async function processRazorpayWebhook(args) {
  return processRazorpayWebhookEvent({
    ...args,
    refundPaymentFn: args.refundPaymentFn ?? refundPayment,
    refundDebtExcessFn: args.refundDebtExcessFn ?? refundDriverDebtExcess,
  })
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
    const refund = await gateway.createRefund(payment.razorpayPaymentId, {
      amount: payment.amount,
      idempotencyKey: payment.id,
      notes: { internal_payment_id: payment.id },
    })
    const updated = await db.payment.update({ where: { id: payment.id }, data: { razorpayRefundId: refund.id } })
    return { paymentId, status: updated.status, refundId: updated.razorpayRefundId }
  } catch (error) {
    await db.payment.updateMany({ where: { id: payment.id, status: 'refund_pending', razorpayRefundId: null }, data: {
      status: 'captured', failureCode: error.code ?? 'REFUND_FAILED', failureDescription: String(error.message).slice(0, 500),
    } })
    throw error
  }
}

export async function refundDriverDebtExcess({ paymentId, amount, gateway = createRazorpayGateway(), db = prisma }) {
  const payment = await db.payment.findUnique({ where: { id: paymentId } })
  if (!payment || payment.purpose !== 'driver_debt_settlement')
    throw new PaymentError('PAYMENT_NOT_FOUND', 'Driver debt payment not found', 404)
  if (payment.status !== 'captured' || !payment.razorpayPaymentId)
    throw new PaymentError('REFUND_NOT_ALLOWED', 'Only a captured debt payment can return excess funds')
  if (!Number.isInteger(amount) || amount <= 0 || amount > payment.amount || payment.driverDebtRefundAmount !== amount)
    throw new PaymentError('INVALID_REFUND_AMOUNT', 'Debt-payment refund amount does not match the captured excess')
  if (payment.razorpayRefundId) {
    return { paymentId, status: payment.status, refundId: payment.razorpayRefundId, alreadyApplied: true }
  }
  const refund = await gateway.createRefund(payment.razorpayPaymentId, {
    amount,
    idempotencyKey: `driver-debt-excess:${payment.id}`,
    notes: { internal_payment_id: payment.id, reason: 'driver_debt_excess' },
  })
  const updated = await db.payment.update({ where: { id: payment.id }, data: { razorpayRefundId: refund.id } })
  return { paymentId, status: updated.status, refundId: updated.razorpayRefundId }
}
