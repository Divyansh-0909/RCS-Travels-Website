import { mock } from 'node:test'
import { basePayment, paymentDb } from './paymentDb.js'

const scheduledPayment = () => paymentDb(basePayment({
  purpose: 'scheduled_ride_advance', status: 'order_created', razorpayOrderId: 'order_1',
}))
const productionDb = scheduledPayment()
const isolatedTestDb = scheduledPayment()
const delivered = []

mock.module(new URL('../../db/prisma.js', import.meta.url), {
  namedExports: { prisma: productionDb },
})
mock.module(new URL('../../services/notification.js', import.meta.url), {
  namedExports: { notifyWhatsAppScheduledPaymentConfirmed: async bookingId => { delivered.push(bookingId) } },
})

const { verifyCheckoutPayment, processRazorpayWebhook } = await import('../../services/payments.js')
const gateway = {
  verifyPaymentSignature: () => true,
  fetchPayment: async () => ({ order_id: 'order_1', amount: 12345, currency: 'INR', status: 'captured' }),
}
const paymentInput = {
  paymentId: productionDb.row.id, userId: 'u1', razorpayOrderId: 'order_1',
  razorpayPaymentId: 'pay_1', signature: 'valid', gateway,
}

await verifyCheckoutPayment(paymentInput)
const afterProduction = [...delivered]
await verifyCheckoutPayment({ ...paymentInput, db: isolatedTestDb })
const afterIsolated = [...delivered]
// Exercise the real webhook's default notification choice with the same explicit
// module fakes. No production client or notification provider is reachable.
productionDb.payment.findFirst = async () => productionDb.row
productionDb.$transaction = work => work(productionDb)
productionDb.razorpayWebhookEvent = { createMany: async () => ({ count: 1 }), update: async ({ data }) => data }
await processRazorpayWebhook({ rawBody: Buffer.from(JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: {
  id: 'pay_1', order_id: 'order_1', amount: 12345, currency: 'INR',
} } } })), signature: 'test-signature', gateway: { verifyWebhookSignature: () => true } })
process.stdout.write(JSON.stringify({ afterProduction, afterIsolated, afterWebhook: delivered }))
