export default {
  testRunner: 'command', coverageAnalysis: 'off', tsconfigFile: 'tests/quality/phase6b-no-tsconfig.json',
  commandRunner: { command: 'node --import tsx --test tests/phase9FinancialSafety.test.js tests/refundProviderState.test.js tests/criticalRideTransactions.test.js tests/walletMoney.test.js tests/driverCancellations.test.js' },
  mutate: ['services/scheduledDepositLifecycle.js', 'services/customerCancellation.js',
    'services/refundProviderState.js:51-66', 'services/rideSettlement.js:15-17',
    'services/rideSettlement.js:225-226', 'services/rideSettlement.js:241-241', 'services/driverRideCancellation.js:14-14',
    'services/walletKeys.js:69-70', 'services/commission.js:1-4', 'services/driverCancellations.js:53-58'],
  ignorePatterns: ['.env', '.env.*', 'coverage', 'logs', 'node_modules', 'uploads', 'output'],
  reporters: ['clear-text', 'json'], jsonReporter: { fileName: 'coverage/phase9-financial-mutation.json' },
  concurrency: 2, timeoutMS: 20_000, timeoutFactor: 2, cleanTempDir: true,
}
