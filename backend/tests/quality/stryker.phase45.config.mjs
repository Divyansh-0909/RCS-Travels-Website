export default {
  testRunner: 'command',
  coverageAnalysis: 'off',
  commandRunner: {
    command: 'node --import tsx --test tests/locationProvenance.test.js tests/notificationProvenance.test.js tests/routeProvenance.test.js tests/cancellationLocationEvidence.test.js',
  },
  mutate: [
    'lib/locationProvenance.ts',
    'services/cancellationLocationEvidence.js',
    'services/notificationProvenance.js',
    'services/routeProvenance.js',
  ],
  ignorePatterns: ['.env', '.env.*', 'coverage', 'logs', 'node_modules', 'uploads'],
  reporters: ['clear-text', 'json'],
  jsonReporter: { fileName: 'coverage/phase45-mutation.json' },
  concurrency: 4,
  timeoutMS: 10_000,
  timeoutFactor: 2,
  cleanTempDir: true,
}
