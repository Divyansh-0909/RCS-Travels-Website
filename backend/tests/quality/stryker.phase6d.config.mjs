export default {
  testRunner: 'command',
  coverageAnalysis: 'off',
  tsconfigFile: 'tests/quality/phase6b-no-tsconfig.json',
  commandRunner: {
    command: 'node --import tsx --test tests/responsibilityReliabilityConsequences.test.js tests/driverReliability.test.js tests/driverNewWorkEligibility.test.js tests/nearbyDrivers.test.js',
  },
  mutate: [
    'services/responsibilityReliabilityConsequences.js',
    'services/driverReliability.js',
    'services/driverNewWorkEligibility.js',
    'services/nearbyDrivers.js:62-68',
  ],
  ignorePatterns: ['.env', '.env.*', 'coverage', 'logs', 'node_modules', 'uploads'],
  reporters: ['clear-text', 'json'],
  jsonReporter: { fileName: 'coverage/phase6d-mutation.json' },
  concurrency: 4,
  timeoutMS: 10_000,
  timeoutFactor: 2,
  cleanTempDir: true,
}
