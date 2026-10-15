export const basePayment = (overrides = {}) => ({
  id: '11111111-1111-4111-8111-111111111111',
  userId: 'u1',
  driverId: null,
  bookingId: 'b1',
  purpose: 'other_customer_payment',
  status: 'created',
  amount: 12345,
  currency: 'INR',
  razorpayOrderId: null,
  razorpayPaymentId: null,
  razorpayRefundId: null,
  orderCreationStartedAt: null,
  refundRequestKey: null,
  refundRequestedAmount: null,
  refundOperationStatus: null,
  ...overrides,
})

export function paymentDb(initial = basePayment()) {
  let row = { ...initial }
  const calls = { findFirst: [], findUnique: [], updateMany: [], update: [] }
  return {
    $queryRaw: async () => [],
    get row() { return row },
    calls,
    booking: { updateMany: async () => ({ count: 1 }) },
    payment: {
      findUniqueOrThrow: async () => ({ ...row }),
      findFirst: async (input) => {
        calls.findFirst.push(input)
        const { where } = input
        if (!row || row.id !== where.id) return null
        if (Object.hasOwn(where, 'userId') && row.userId !== where.userId) return null
        if (Object.hasOwn(where, 'driverId') && row.driverId !== where.driverId) return null
        return { ...row }
      },
      findUnique: async (input = {}) => {
        calls.findUnique.push(input)
        const { where } = input
        return row && (!where?.id || where.id === row.id) ? { ...row } : null
      },
      updateMany: async (input) => {
        calls.updateMany.push(input)
        const { where, data } = input
        if (!row
          || (where.id && row.id !== where.id)
          || (where.status && row.status !== where.status)
          || (Object.hasOwn(where, 'razorpayOrderId') && where.razorpayOrderId !== row.razorpayOrderId)
          || (Object.hasOwn(where, 'orderCreationStartedAt')
            && where.orderCreationStartedAt?.getTime?.() !== row.orderCreationStartedAt?.getTime?.())
          || (Object.hasOwn(where, 'razorpayRefundId') && where.razorpayRefundId !== row.razorpayRefundId)
          || (Object.hasOwn(where, 'refundRequestKey') && where.refundRequestKey !== row.refundRequestKey)
          || (Object.hasOwn(where, 'cancellationRefundAmount')
            && where.cancellationRefundAmount !== row.cancellationRefundAmount)) return { count: 0 }
        row = { ...row, ...data }
        return { count: 1 }
      },
      update: async (input) => {
        calls.update.push(input)
        const { data } = input
        row = { ...row, ...data }
        return { ...row }
      },
    },
  }
}
