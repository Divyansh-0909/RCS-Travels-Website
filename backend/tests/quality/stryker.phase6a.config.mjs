export default {
  testRunner: 'command',
  coverageAnalysis: 'off',
  commandRunner: {
    command: 'node --import tsx --test tests/responsibilityConsequencesPhase6A.test.js tests/driverCancellations.test.js tests/conductStrikes.test.js tests/criticalRideTransactions.test.js tests/walletMoney.test.js',
  },
  mutate: [
    'services/responsibilityConsequences.js',
    'services/driverCancellations.js',
    'services/driverRideCancellation.js',
    'services/complaints.js',
  ],
  ignorePatterns: ['.env', '.env.*', 'coverage', 'logs', 'node_modules', 'uploads'],
  reporters: ['clear-text', 'json'],
  jsonReporter: { fileName: 'coverage/phase6a-mutation.json' },
  concurrency: 4,
  timeoutMS: 10_000,
  timeoutFactor: 2,
  cleanTempDir: true,
}
