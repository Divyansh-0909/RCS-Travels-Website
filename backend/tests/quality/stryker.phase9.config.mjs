export default {
  testRunner: 'command', coverageAnalysis: 'off',
  tsconfigFile: 'tests/quality/phase6b-no-tsconfig.json',
  commandRunner: { command: 'node --import tsx --test tests/phase9Safety.test.js' },
  mutate: ['services/scheduledOfferAcceptance.js', 'tests/helpers/phase9Isolation.js', 'services/driverRideCancellation.js:17-22',
    'services/scheduledOffers.js:95-95', 'services/scheduledOffers.js:128-131',
    'services/assignScheduledRides.js:37-42', 'services/assignScheduledRides.js:54-54',
    'services/assignScheduledRides.js:67-72', 'routes/payments.js:59-75'],
  ignorePatterns: ['.env', '.env.*', 'coverage', 'logs', 'node_modules', 'uploads'],
  reporters: ['clear-text', 'json'], jsonReporter: { fileName: 'coverage/phase9-mutation.json' },
  // Bound Windows child/tsx startup separately from the application/model deadlines.
  concurrency: 4, timeoutMS: 20_000, timeoutFactor: 2, cleanTempDir: true,
}
