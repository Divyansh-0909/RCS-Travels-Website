export default {
  testRunner: 'command', coverageAnalysis: 'off', tsconfigFile: 'tests/quality/phase6b-no-tsconfig.json',
  commandRunner: { command: 'node --import ./tests/helpers/phase9UnitIsolation.js --import tsx --test tests/phase9RoutingIntegration.test.js tests/driverDelay.test.js tests/clock.test.js tests/rideGeofence.test.js tests/cancellationLocationEvidence.test.js tests/phase9IncidentIntegration.test.js tests/driverCancellations.test.js tests/phase9FinancialSafety.test.js' },
  mutate: ['services/driverDispatchOffers.js', 'services/driverDispatchCandidates.js',
    'services/driverDelay.js', 'services/googleRoutes.js', 'services/rideGeofence.ts',
    'services/cancellationLocationEvidence.js', 'services/driverCancellations.js:76-76',
    'services/scheduledDepositLifecycle.js:21-21'],
  ignorePatterns: ['.env', '.env.*', 'coverage', 'logs', 'node_modules', 'uploads', 'output'],
  reporters: ['clear-text', 'json'], jsonReporter: { fileName: 'coverage/phase9-routing-mutation.json' },
  concurrency: 2, timeoutMS: 20000, timeoutFactor: 2, cleanTempDir: true,
}
