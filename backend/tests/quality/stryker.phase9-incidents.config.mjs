export default {
  testRunner: 'command', coverageAnalysis: 'off', tsconfigFile: 'tests/quality/phase6b-no-tsconfig.json',
  commandRunner: { command: 'node --import ./tests/helpers/phase9UnitIsolation.js --import tsx --test tests/phase9IncidentIntegration.test.js tests/driverCancellations.test.js tests/phase9FinancialSafety.test.js' },
  mutate: ['services/lifecycleIncidentEvidence.js', 'services/customerLifecycleIncidents.js',
    'services/scheduledReservationHandoff.js', 'services/driverLocationUpdate.js'],
  ignorePatterns: ['.env', '.env.*', 'coverage', 'logs', 'node_modules', 'uploads', 'output'],
  reporters: ['clear-text', 'json'], jsonReporter: { fileName: 'coverage/phase9-incidents-mutation.json' },
  concurrency: 2, timeoutMS: 20000, timeoutFactor: 2, cleanTempDir: true,
}
