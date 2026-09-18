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

export async function issuePreviousMonthCoupons() {
  const now = new Date()
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 1, 1))
  const earnedFor = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`

  const users = await prisma.user.findMany({
    where: { bookings: { some: { status: 'completed', completedAt: { gte: start, lt: end } } } },
    select: { id: true },
  })

  let issued = 0
  for (const user of users) {
    const coupon = await prisma.$transaction((tx) => issueMonthlyCoupon(tx, {
      userId: user.id,
      earnedFor,
      from: start,
      to: end,
    }))
    if (coupon) issued += 1
  }
  return { issued, earnedFor }
}
