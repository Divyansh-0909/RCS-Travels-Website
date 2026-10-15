import paymentsGaps from './stryker.payments-gaps.config.mjs'

export default {
  ...paymentsGaps,
  mutate: [
    'services/payments.js:331-331',
    'services/payments.js:334-334',
    'services/payments.js:350-350',
    'services/payments.js:352-352',
    'services/payments.js:354-354',
    'services/payments.js:360-360',
    'services/payments.js:362-367',
  ],
  jsonReporter: { fileName: 'coverage/phase2-payment-debt-mutation.json' },
}
