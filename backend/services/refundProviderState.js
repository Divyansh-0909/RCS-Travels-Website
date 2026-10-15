import { applyRefundedPaymentEffect } from './scheduledPayments.js'

function refundKind(payment, refund) {
  if (refund.payment_id !== payment.razorpayPaymentId
    || refund.currency !== payment.currency
    || !Number.isInteger(refund.amount)
    || typeof refund.id !== 'string') return null
  if (payment.purpose === 'scheduled_ride_advance'
    && payment.cancellationRefundAmount === refund.amount) return 'scheduled_partial'
  if (payment.purpose === 'driver_debt_settlement'
    && payment.driverDebtRefundAmount === refund.amount) return 'driver_debt_excess'
  if (payment.refundRequestedAmount === refund.amount || payment.amount === refund.amount) return 'full'
  return null
}

const identifiedData = (refund, status) => ({
  razorpayRefundId: refund.id,
  refundOperationStatus: status,
  failureCode: null,
  failureDescription: null,
})

async function applyProcessedRefund(tx, payment, refund, kind) {
  const data = { ...identifiedData(refund, 'succeeded'), refundedAt: new Date() }
  if (kind === 'full') data.status = 'refunded'
  const updated = await tx.payment.update({ where: { id: payment.id }, data })
  if (kind === 'scheduled_partial' && payment.bookingId) {
    await tx.booking.updateMany({
      where: { id: payment.bookingId, scheduledAdvanceDisposition: 'partial_refund_pending' },
      data: { scheduledAdvanceDisposition: 'partially_refunded' },
    })
  }
  if (kind === 'full') await applyRefundedPaymentEffect(tx, updated)
  return { processed: true, result: `${kind}.processed` }
}

async function applyFailedRefund(tx, payment, refund, kind) {
  const data = {
    refundOperationStatus: 'failed',
    failureCode: 'REFUND_FAILED',
    failureDescription: refund.error_description ?? null,
  }
  if (kind === 'scheduled_partial') {
    data.razorpayRefundId = null
    data.cancellationRefundAmount = null
  } else if (kind === 'full') data.status = 'captured'
  await tx.payment.update({ where: { id: payment.id }, data })
  return { processed: true, result: `${kind}.failed` }
}

export async function applyRefundProviderState(tx, payment, refund) {
  // Serialize webhook and provider acknowledgement on the real payment row.
  // Re-read after acquiring the lock: the caller can hold an older snapshot.
  await tx.$queryRaw`SELECT id FROM payments WHERE id = ${payment.id} FOR UPDATE`
  payment = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } })
  const kind = refundKind(payment, refund)
  if (!kind) return { ignored: true, result: 'unexpected_refund' }
  if (payment.razorpayRefundId && payment.razorpayRefundId !== refund.id)
    return { ignored: true, result: 'conflicting_refund_identity' }
  if (['succeeded', 'failed'].includes(payment.refundOperationStatus))
    return { ignored: true, result: 'terminal_refund' }
  if (refund.status === 'processed') return applyProcessedRefund(tx, payment, refund, kind)
  if (refund.status === 'failed') return applyFailedRefund(tx, payment, refund, kind)
  await tx.payment.update({
    where: { id: payment.id },
    data: identifiedData(refund, 'provider_identified'),
  })
  return { processed: true, result: `${kind}.identified` }
}
