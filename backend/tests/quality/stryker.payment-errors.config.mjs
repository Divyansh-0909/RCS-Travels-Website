import paymentsGaps from './stryker.payments-gaps.config.mjs'

export default {
  ...paymentsGaps,
  mutate: [
    'services/payments.js:44-44',
    'services/payments.js:57-57',
    'services/payments.js:85-85',
    'services/payments.js:89-89',
    'services/payments.js:98-98',
    'services/payments.js:100-100',
    'services/payments.js:103-103',
    'services/payments.js:109-109',
    'services/payments.js:210-210',
    'services/payments.js:261-261',
    'services/payments.js:265-265',
    'services/payments.js:275-275',
    'services/payments.js:277-277',
    'services/payments.js:285-285',
    'services/payments.js:288-288',
    'services/payments.js:291-291',
    'services/payments.js:294-294',
    'services/payments.js:311-311',
    'services/payments.js:317-323',
  ],
  jsonReporter: { fileName: 'coverage/phase2-payment-errors-mutation.json' },
}
