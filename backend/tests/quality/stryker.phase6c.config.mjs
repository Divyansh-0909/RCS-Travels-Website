export default {
  testRunner: 'command',
  coverageAnalysis: 'off',
  tsconfigFile: 'tests/quality/phase6b-no-tsconfig.json',
  commandRunner: {
    command: 'node --import tsx --test tests/responsibilityFinancialMath.test.js tests/responsibilityCompensation.test.js tests/responsibilityLiabilityRecovery.test.js tests/criticalRideTransactions.test.js',
  },
  mutate: [
    'services/responsibilityFinancialMath.js',
    'services/responsibilityCompensation.js',
    'services/responsibilityLiabilityRecovery.js',
    'services/rideSettlement.js',
  ],
  ignorePatterns: ['.env', '.env.*', 'coverage', 'logs', 'node_modules', 'uploads'],
  reporters: ['clear-text', 'json'],
  jsonReporter: { fileName: 'coverage/phase6c-mutation.json' },
  concurrency: 4,
  timeoutMS: 10_000,
  timeoutFactor: 2,
  cleanTempDir: true,
}
