import base from './stryker.phase6c.config.mjs'

export default {
  ...base,
  commandRunner: {
    command: 'node --import tsx --test tests/phase6cBookingCreation.test.js tests/responsibilityFinancialMath.test.js tests/responsibilityCompensation.test.js tests/responsibilityLiabilityRecovery.test.js tests/criticalRideTransactions.test.js',
  },
  mutate: [
    'services/bookingCreation.js',
    'services/responsibilityFinancialMath.js',
    'services/responsibilityCompensation.js',
    'services/responsibilityLiabilityRecovery.js',
  ],
  jsonReporter: { fileName: 'coverage/phase6c-remediation-local-mutation.json' },
}
