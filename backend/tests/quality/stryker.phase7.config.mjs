export default {
  testRunner: 'command',
  coverageAnalysis: 'off',
  commandRunner: {
    command: 'node --import tsx --test tests/responsibilityShadowAdjudication.test.js tests/responsibilityShadowRepository.test.js tests/responsibilityShadowProductionClient.test.js tests/responsibilityShadowProductionClientNoCredentials.test.js tests/driverCancellations.test.js tests/criticalRideTransactions.test.js tests/responsibilityShadowArchitecture.test.js',
  },
  mutate: [
    'services/responsibilityShadowConfig.js',
    'services/responsibilityShadowRepository.js',
    'services/responsibilityShadowAdjudication.js',
    'services/driverCancellations.js',
  ],
  ignorePatterns: ['.env', '.env.*', 'coverage', 'logs', 'node_modules', 'uploads'],
  reporters: ['clear-text', 'json'],
  jsonReporter: { fileName: 'coverage/phase7-mutation.json' },
  concurrency: 4,
  timeoutMS: 10_000,
  timeoutFactor: 2,
  cleanTempDir: true,
}
