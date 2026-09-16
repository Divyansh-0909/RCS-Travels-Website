export async function followCapturedPaymentEffect(effect, { db, refundPaymentFn }) {
  if (effect?.type !== 'scheduled_ride_advance_refund') return null
  return refundPaymentFn({ paymentId: effect.paymentId, db })
}
