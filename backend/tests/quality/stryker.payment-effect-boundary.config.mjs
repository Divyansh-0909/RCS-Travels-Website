import paymentsGaps from './stryker.payments-gaps.config.mjs'

export default {
  ...paymentsGaps,
  commandRunner: { command: 'node --import tsx --test tests/payments.test.js tests/paymentMutationGaps.test.js' },
  mutate: ['services/payments.js:168-168'],
  jsonReporter: { fileName: 'coverage/phase2-payment-effect-boundary-mutation.json' },
}
