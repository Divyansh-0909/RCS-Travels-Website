import { mock } from 'node:test'

mock.module(new URL('../../db/prisma.js', import.meta.url), {
  namedExports: {
    prisma: { $transaction: async () => { throw new Error('application database was selected') } },
  },
})

const { processRazorpayXPayoutWebhook } = await import('../../services/razorpayXPayoutWebhook.js')
const payout = {
  id: 'local-payout', batchId: 'local-batch', driverId: 'driver-1',
  externalPayoutId: 'pout_1', status: 'processing', amount: 50000, currency: 'INR',
  driver: { walletBalance: 500 },
}
let eventResult = null
const tx = {
  razorpayWebhookEvent: {
    createMany: async () => ({ count: 1 }),
    update: async ({ data }) => { eventResult = data.result; return data },
  },
  driverPayout: {
    findFirst: async () => payout,
    findUnique: async () => payout,
    update: async ({ data }) => ({ ...payout, ...data }),
    findMany: async () => [{ status: 'processing' }],
  },
  driverPayoutBatch: { update: async ({ data }) => data },
}
const db = { $transaction: async work => work(tx) }
const rawBody = Buffer.from(JSON.stringify({
  event: 'payout.pending',
  payload: { payout: { entity: {
    id: 'pout_1', reference_id: payout.id, status: 'pending',
    amount: payout.amount, currency: payout.currency,
  } } },
}))
const result = await processRazorpayXPayoutWebhook({
  rawBody, signature: 'valid', eventId: 'evt_local',
  gateway: { verifyWebhookSignature: () => true }, db,
})
process.stdout.write(JSON.stringify({ result, eventResult }))
