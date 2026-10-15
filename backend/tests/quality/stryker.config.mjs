// Run from backend/ using the separately installed quality tools documented in README.
export default {
  testRunner: 'command',
  coverageAnalysis: 'off',
  commandRunner: {
    command: 'node --import tsx --test tests/clock.test.js tests/driverDelay.test.js tests/scheduledScenario.test.js tests/financialInvariants.test.js tests/databaseHarness.test.js tests/integration/*.test.js',
  },
  mutate: [
    'lib/clock.js',
    'services/driverDelay.js',
    'tests/helpers/testClock.js',
    'tests/helpers/scheduledScenario.js',
    'tests/helpers/financialInvariants.js',
    'tests/helpers/database.js',
    'tests/prisma.config.js',
  ],
  ignorePatterns: ['.env', '.env.*', 'coverage', 'logs', 'node_modules', 'uploads'],
  reporters: ['clear-text', 'json'],
  jsonReporter: { fileName: 'coverage/phase1-mutation.json' },
  concurrency: 4,
  timeoutMS: 10_000,
  timeoutFactor: 2,
  cleanTempDir: true,
}
