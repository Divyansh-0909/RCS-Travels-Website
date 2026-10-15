import payoutSignoff from './stryker.phase2-signoff.config.mjs'

export default {
  ...payoutSignoff,
  commandRunner: {
    command: 'node --import tsx --test tests/payoutWebhookDbIsolation.test.js',
  },
  mutate: ['services/razorpayXPayoutWebhook.js:58-58'],
  jsonReporter: { fileName: 'coverage/phase2-payout-db-boundary-mutation.json' },
}
