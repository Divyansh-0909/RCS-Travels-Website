export const COUPON_TIERS = Object.freeze([
  { spend: 5000, amount: 500 }, { spend: 2500, amount: 200 }, { spend: 2000, amount: 100 },
])
export const couponAmountForSpend = (spend) => COUPON_TIERS.find((tier) => spend >= tier.spend)?.amount ?? 0
export const customerPaymentFor = (fare, couponAmount = 0) => Math.max(0, fare - Math.max(0, couponAmount))

export async function issueMonthlyCoupon(tx, { userId, earnedFor, from, to }) {
  const rides = await tx.booking.aggregate({ where: {
    userId, status: 'completed', completedAt: { gte: from, lt: to },
  }, _sum: { customerPayment: true } })
  const amount = couponAmountForSpend(rides._sum.customerPayment ?? 0)
  if (!amount) return null
  await tx.coupon.createMany({ data: [{ userId, earnedFor, amount }], skipDuplicates: true })
  return tx.coupon.findUnique({ where: { userId_earnedFor: { userId, earnedFor } } })
}
