import { prisma } from '../db/prisma.js'
import { createRazorpayGateway } from './razorpay.js'
import { PaymentError } from './paymentErrors.js'
import { createPaymentIntent, MIN_PAYMENT_SUBUNITS, toSubunits } from './paymentIntents.js'
import { applyCapturedPaymentEffect } from './scheduledPayments.js'
import { notifyWhatsAppScheduledPaymentConfirmed } from './notification.js'
import { followCapturedPaymentEffect } from './paymentEffects.js'
import { statusAfterGatewayPayment } from './paymentStatus.js'
import { processRazorpayWebhookEvent } from './razorpayWebhook.js'
import { systemClock } from '../lib/clock.js'
import {
  ORDER_CREATION_LEASE_MS,
  orderReceiptFor,
  providerOutcomeIsUnknown,
  refundRequestKey,
  selectPaymentOrder,
  selectPaymentRefund,
} from './providerReconciliation.js'
import { applyRefundProviderState } from './refundProviderState.js'

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

const transaction = (db, work) => db.$transaction ? db.$transaction(work) : work(db)

async function saveOrder(payment, order, gateway, db) {
  if (!order?.id || order.amount !== payment.amount || order.currency !== payment.currency) {
    throw new PaymentError('GATEWAY_ORDER_MISMATCH', 'Gateway returned mismatched order values')
  }
  await db.payment.updateMany({
    where: { id: payment.id, razorpayOrderId: null },
    data: {
      status: 'order_created',
      razorpayOrderId: order.id,
      orderCreationStartedAt: null,
      failureCode: null,
      failureDescription: null,
    },
  })
  const saved = await db.payment.findUnique({ where: { id: payment.id } })
  if (!saved?.razorpayOrderId) throw new PaymentError('PAYMENT_BUSY', 'Payment order is already being created')
  return checkoutOf(saved, gateway.keyId)
}

async function reconcileOrder(payment, gateway, db) {
  if (typeof gateway.findOrdersByReceipt !== 'function') return null
  const orders = await gateway.findOrdersByReceipt(orderReceiptFor(payment.id))
  const order = selectPaymentOrder(payment, orders)
  return order ? saveOrder(payment, order, gateway, db) : null
}

async function claimOrderCreation(payment, now, db) {
  if (payment.status === 'order_creating') {
    const startedAt = payment.orderCreationStartedAt?.getTime?.() ?? 0
    if (now.getTime() - startedAt < ORDER_CREATION_LEASE_MS) return false
  }
  const where = { id: payment.id, razorpayOrderId: null, status: payment.status }
  if (payment.status === 'order_creating') where.orderCreationStartedAt = payment.orderCreationStartedAt ?? null
  const claimed = await db.payment.updateMany({
    where,
    data: { status: 'order_creating', orderCreationStartedAt: now, failureCode: null, failureDescription: null },
  })
  return claimed.count === 1
}

async function recoverCreatingOrder(payment, gateway, db) {
  if (payment.status !== 'order_creating') return null
  const recovered = await reconcileOrder(payment, gateway, db).catch(() => {
    throw new PaymentError('ORDER_OUTCOME_UNKNOWN', 'Payment order is awaiting provider reconciliation', 503)
  })
  if (recovered) return recovered
  if (payment.failureCode === 'ORDER_OUTCOME_UNKNOWN') {
    throw new PaymentError('ORDER_OUTCOME_UNKNOWN', 'Payment order is awaiting provider reconciliation', 503)
  }
  return null
}

export async function createOrderForPayment({
  paymentId, userId, driverId, gateway = createRazorpayGateway(), db = prisma, clock = systemClock,
}) {
  const payment = await db.payment.findFirst({ where: ownerWhere({ paymentId, userId, driverId }) })
  if (!payment) throw new PaymentError('PAYMENT_NOT_FOUND', 'Payment not found', 404)
  if (!Number.isInteger(payment.amount) || payment.amount < MIN_PAYMENT_SUBUNITS)
    throw new PaymentError('INVALID_AMOUNT', 'Payment amount must be at least 100 subunits', 400)
  if (payment.razorpayOrderId) return checkoutOf(payment, gateway.keyId)
  if (!['created', 'order_creating'].includes(payment.status)) {
    throw new PaymentError('ORDER_NOT_ALLOWED', 'Payment is not eligible for order creation', 409)
  }
  const recovered = await recoverCreatingOrder(payment, gateway, db)
  if (recovered) return recovered
  const now = clock.now()
  if (!await claimOrderCreation(payment, now, db)) {
    throw new PaymentError('PAYMENT_BUSY', 'Payment order is already being created', 409)
  }
  try {
    const order = await gateway.createOrder({ amount: payment.amount, currency: payment.currency,
      receipt: orderReceiptFor(payment.id), notes: { internal_payment_id: payment.id } })
    return await saveOrder(payment, order, gateway, db)
  } catch (error) {
    const recovered = await reconcileOrder(payment, gateway, db).catch(() => null)
    if (recovered) return recovered
    const mapped = error instanceof PaymentError ? error : gatewayOrderError(error)
    const outcomeUnknown = !(error instanceof PaymentError) && providerOutcomeIsUnknown(error)
    await db.payment.updateMany({ where: {
      id: payment.id, status: 'order_creating', orderCreationStartedAt: now,
    }, data: {
      status: outcomeUnknown ? 'order_creating' : 'created',
      orderCreationStartedAt: outcomeUnknown ? now : null,
      failureCode: outcomeUnknown ? 'ORDER_OUTCOME_UNKNOWN' : mapped.code,
      failureDescription: mapped.message,
    } })
    throw mapped
  }
}

async function verifiedGatewayPayment(payment, { razorpayPaymentId, razorpayOrderId, signature }, gateway) {
  if (!payment.razorpayOrderId || payment.razorpayOrderId !== razorpayOrderId) {
    throw new PaymentError('ORDER_MISMATCH', 'Payment order does not match', 400)
  }
  if (!gateway.verifyPaymentSignature({
    orderId: payment.razorpayOrderId, paymentId: razorpayPaymentId, signature,
  })) throw new PaymentError('INVALID_SIGNATURE', 'Invalid payment signature', 400)
  const external = await gateway.fetchPayment(razorpayPaymentId)
  if (external.order_id !== payment.razorpayOrderId
    || external.amount !== payment.amount
    || external.currency !== payment.currency) {
    throw new PaymentError('PAYMENT_MISMATCH', 'Gateway payment does not match the internal payment', 400)
  }
  if (!['captured', 'authorized'].includes(external.status)) {
    throw new PaymentError('PAYMENT_NOT_VERIFIED', `Gateway payment is ${external.status}`)
  }
  return external
}

export async function verifyCheckoutPayment({ paymentId, userId, driverId, razorpayPaymentId, razorpayOrderId, signature,
  gateway = createRazorpayGateway(), db = prisma, notifyPayment = null,
  refundPaymentFn = refundPayment, refundDebtExcessFn = refundDriverDebtExcess }) {
  const payment = await db.payment.findFirst({ where: ownerWhere({ paymentId, userId, driverId }) })
  if (!payment) throw new PaymentError('PAYMENT_NOT_FOUND', 'Payment not found', 404)
  const external = await verifiedGatewayPayment(payment, {
    razorpayPaymentId, razorpayOrderId, signature,
  }, gateway)
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

async function providerRefundFor(payment, amount, requestKey, notes, gateway) {
  const findExisting = async () => {
    if (typeof gateway.findRefundsByPayment !== 'function') return null
    const refunds = await gateway.findRefundsByPayment(payment.razorpayPaymentId)
    return selectPaymentRefund(payment, amount, requestKey, refunds)
  }
  if (payment.refundOperationStatus === 'outcome_unknown') {
    const existing = await findExisting()
    if (existing) return existing
  }
  let refund
  try {
    refund = await gateway.createRefund(payment.razorpayPaymentId, {
      amount,
      idempotencyKey: requestKey,
      notes: { ...notes, internal_payment_id: payment.id, refund_request_key: requestKey },
    })
  } catch (error) {
    if (providerOutcomeIsUnknown(error)) {
      const existing = await findExisting().catch(() => null)
      if (existing) return existing
    }
    throw error
  }
  if (!refund?.id && typeof gateway.findRefundsByPayment === 'function') {
    refund = await findExisting()
  }
  if (!refund?.id) {
    const error = new PaymentError('REFUND_OUTCOME_UNKNOWN', 'Refund outcome is awaiting provider reconciliation', 503)
    error.outcomeUnknown = true
    throw error
  }
  return {
    payment_id: payment.razorpayPaymentId,
    amount,
    currency: payment.currency,
    status: 'pending',
    notes: { ...notes, internal_payment_id: payment.id, refund_request_key: requestKey },
    ...refund,
  }
}

async function performRefund({ payment, amount, requestKey, notes, gateway, db }) {
  const operationPayment = {
    ...payment,
    refundRequestKey: requestKey,
    refundRequestedAmount: amount,
  }
  try {
    await db.payment.updateMany({
      where: { id: payment.id, refundRequestKey: requestKey, razorpayRefundId: null },
      data: { refundOperationStatus: 'requested', refundLastAttemptAt: new Date() },
    })
    const refund = await providerRefundFor(operationPayment, amount, requestKey, notes, gateway)
    await transaction(db, tx => applyRefundProviderState(tx, operationPayment, refund))
    const updated = await db.payment.findUnique({ where: { id: payment.id } })
    return {
      paymentId: payment.id,
      status: updated.status,
      refundId: updated.razorpayRefundId,
      refundOperationStatus: updated.refundOperationStatus,
    }
  } catch (error) {
    const outcomeUnknown = providerOutcomeIsUnknown(error)
    await db.payment.updateMany({
      where: { id: payment.id, refundRequestKey: requestKey, razorpayRefundId: null },
      data: {
        refundOperationStatus: outcomeUnknown ? 'outcome_unknown' : 'failed',
        ...(payment.status === 'refund_pending' && !outcomeUnknown ? { status: 'captured' } : {}),
        failureCode: outcomeUnknown ? 'REFUND_OUTCOME_UNKNOWN' : (error.code ?? 'REFUND_FAILED'),
        failureDescription: String(error.message).slice(0, 500),
      },
    })
    throw error
  }
}

export async function refundPayment({ paymentId, gateway = createRazorpayGateway(), db = prisma }) {
  const payment = await db.payment.findUnique({ where: { id: paymentId } })
  if (!payment) throw new PaymentError('PAYMENT_NOT_FOUND', 'Payment not found', 404)
  if (payment.status === 'refunded' || (payment.status === 'refund_pending' && payment.razorpayRefundId))
    return { paymentId, status: payment.status, refundId: payment.razorpayRefundId, alreadyApplied: true }
  if (!['captured', 'refund_pending'].includes(payment.status) || !payment.razorpayPaymentId)
    throw new PaymentError('REFUND_NOT_ALLOWED', 'Only a captured payment can be refunded')
  const requestKey = refundRequestKey(payment, payment.amount)
  if (!payment.refundRequestKey) {
    const claimed = await db.payment.updateMany({
      where: { id: payment.id, status: payment.status, refundRequestKey: null },
      data: {
        status: 'refund_pending', refundOperationStatus: 'requested', refundRequestKey: requestKey,
        refundRequestedAmount: payment.amount, refundLastAttemptAt: new Date(),
      },
    })
    if (!claimed.count) throw new PaymentError('REFUND_BUSY', 'Refund is already in progress', 409)
  } else if (payment.refundRequestKey !== requestKey || payment.refundRequestedAmount !== payment.amount) {
    throw new PaymentError('REFUND_AMOUNT_MISMATCH', 'Refund does not match the existing operation')
  }
  return performRefund({ payment: { ...payment, status: 'refund_pending' }, amount: payment.amount,
    requestKey, notes: {}, gateway, db })
}

function scheduledRefundRequestKey(payment, amount) {
  if (!payment || payment.purpose !== 'scheduled_ride_advance') {
    throw new PaymentError('PAYMENT_NOT_FOUND', 'Scheduled advance payment not found', 404)
  }
  if (!Number.isInteger(amount) || amount <= 0 || amount >= payment.amount) {
    throw new PaymentError('INVALID_REFUND_AMOUNT', 'Cancellation refund must be a partial amount in paise')
  }
  if (payment.status !== 'captured' || !payment.razorpayPaymentId) {
    throw new PaymentError('REFUND_NOT_ALLOWED', 'Only a captured scheduled advance can be partially refunded')
  }
  if (payment.cancellationRefundAmount != null && payment.cancellationRefundAmount !== amount) {
    throw new PaymentError('REFUND_AMOUNT_MISMATCH', 'Cancellation refund amount does not match the existing settlement')
  }
  return refundRequestKey(payment, amount)
}

async function establishScheduledRefund(payment, amount, requestKey, db) {
  if (payment.cancellationRefundAmount == null) {
    const claimed = await db.payment.updateMany({
      where: { id: payment.id, status: 'captured', cancellationRefundAmount: null, razorpayRefundId: null },
      data: {
        cancellationRefundAmount: amount, refundOperationStatus: 'requested', refundRequestKey: requestKey,
        refundRequestedAmount: amount, refundLastAttemptAt: new Date(),
      },
    })
    if (!claimed.count) {
      const current = await db.payment.findUnique({ where: { id: payment.id } })
      if (current?.cancellationRefundAmount !== amount) {
        throw new PaymentError('REFUND_BUSY', 'Cancellation refund is already being settled')
      }
    }
    return
  }
  if (!payment.refundRequestKey) {
    await db.payment.updateMany({
      where: { id: payment.id, cancellationRefundAmount: amount, refundRequestKey: null },
      data: {
        refundOperationStatus: 'requested', refundRequestKey: requestKey,
        refundRequestedAmount: amount, refundLastAttemptAt: new Date(),
      },
    })
  }
}

export async function refundScheduledCancellationAdvance({ paymentId, amount, gateway = createRazorpayGateway(), db = prisma }) {
  const payment = await db.payment.findUnique({ where: { id: paymentId } })
  const requestKey = scheduledRefundRequestKey(payment, amount)
  if (payment.razorpayRefundId) {
    return { paymentId, status: 'partial_refund_pending', refundId: payment.razorpayRefundId, alreadyApplied: true }
  }
  if (payment.refundRequestKey && (payment.refundRequestKey !== requestKey || payment.refundRequestedAmount !== amount)) {
    throw new PaymentError('REFUND_AMOUNT_MISMATCH', 'Cancellation refund does not match the existing operation')
  }
  await establishScheduledRefund(payment, amount, requestKey, db)
  const result = await performRefund({
    payment: { ...payment, cancellationRefundAmount: amount }, amount, requestKey,
    notes: { reason: 'scheduled_cancellation_partial_refund' }, gateway, db,
  })
  return {
    ...result,
    status: result.refundOperationStatus === 'succeeded' ? 'partially_refunded' : 'partial_refund_pending',
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
  const requestKey = refundRequestKey(payment, amount)
  if (payment.refundRequestKey && (payment.refundRequestKey !== requestKey || payment.refundRequestedAmount !== amount)) {
    throw new PaymentError('REFUND_AMOUNT_MISMATCH', 'Debt refund does not match the existing operation')
  }
  if (!payment.refundRequestKey) {
    await db.payment.updateMany({ where: { id: payment.id, refundRequestKey: null }, data: {
      refundOperationStatus: 'requested', refundRequestKey: requestKey,
      refundRequestedAmount: amount, refundLastAttemptAt: new Date(),
    } })
  }
  return performRefund({ payment, amount, requestKey, notes: { reason: 'driver_debt_excess' }, gateway, db })
}
