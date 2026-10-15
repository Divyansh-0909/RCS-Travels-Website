export default {
  testRunner: 'command',
  coverageAnalysis: 'off',
  commandRunner: { command: 'node --import tsx --test tests/phase3Evidence.test.js' },
  mutate: [
    'tests/helpers/routingEvidence.js',
    'tests/helpers/locationEvidence.js',
    'tests/helpers/connectivityEvidence.js',
    'tests/helpers/notificationSink.js',
  ],
  ignorePatterns: ['.env', '.env.*', 'coverage', 'logs', 'node_modules', 'uploads'],
  reporters: ['clear-text', 'json'],
  jsonReporter: { fileName: 'coverage/phase3-mutation.json' },
  concurrency: 4,
  timeoutMS: 10_000,
  timeoutFactor: 2,
  cleanTempDir: true,
}
