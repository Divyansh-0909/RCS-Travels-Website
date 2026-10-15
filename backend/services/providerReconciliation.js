export const ORDER_CREATION_LEASE_MS = 30_000

export const orderReceiptFor = (paymentId) => String(paymentId).slice(0, 40)

const notesMatch = (entity, paymentId, requestKey = null) => {
  const notes = entity?.notes
  return notes && !Array.isArray(notes)
    && notes.internal_payment_id === paymentId
    && (requestKey === null || notes.refund_request_key === requestKey)
}

export function selectPaymentOrder(payment, orders) {
  const receipt = orderReceiptFor(payment.id)
  return orders
    .filter(order => order?.receipt === receipt
      && order.amount === payment.amount
      && order.currency === payment.currency
      && notesMatch(order, payment.id))
    .sort((left, right) => (left.created_at ?? 0) - (right.created_at ?? 0)
      || String(left.id).localeCompare(String(right.id)))[0] ?? null
}

export function refundRequestKey(payment, amount) {
  if (payment.purpose === 'scheduled_ride_advance' && amount < payment.amount) {
    return `scheduled-cancellation:${payment.id}:${amount}`
  }
  if (payment.purpose === 'driver_debt_settlement' && amount < payment.amount) {
    return `driver-debt-excess:${payment.id}`
  }
  return payment.id
}

export function selectPaymentRefund(payment, amount, requestKey, refunds) {
  return refunds
    .filter(refund => refund?.payment_id === payment.razorpayPaymentId
      && refund.amount === amount
      && refund.currency === payment.currency
      && notesMatch(refund, payment.id, requestKey))
    .sort((left, right) => (left.created_at ?? 0) - (right.created_at ?? 0)
      || String(left.id).localeCompare(String(right.id)))[0] ?? null
}

export function providerOutcomeIsUnknown(error) {
  if (typeof error?.outcomeUnknown === 'boolean') return error.outcomeUnknown
  const status = Number(error?.statusCode ?? error?.status)
  return !Number.isInteger(status) || status < 400 || status >= 500 || [408, 409, 429].includes(status)
}
