export async function followCapturedPaymentEffect(effect, { db, refundPaymentFn, refundDebtExcessFn }) {
  if (effect?.type === 'scheduled_ride_advance_refund' || effect?.type === 'late_final_payment_refund') {
    return refundPaymentFn({ paymentId: effect.paymentId, db })
  }
  if (effect?.type === 'driver_debt_excess_refund') {
    return refundDebtExcessFn({ paymentId: effect.paymentId, amount: effect.amount, db })
  }
  return null
}
