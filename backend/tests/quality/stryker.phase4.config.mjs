export default {
  testRunner: 'command',
  coverageAnalysis: 'off',
  commandRunner: { command: 'node --import tsx --test tests/responsibilityEvidence.test.js' },
  mutate: ['tests/helpers/responsibilityEvidence.js'],
  ignorePatterns: ['.env', '.env.*', 'coverage', 'logs', 'node_modules', 'uploads'],
  reporters: ['clear-text', 'json'],
  jsonReporter: { fileName: 'coverage/phase4-mutation.json' },
  concurrency: 4,
  timeoutMS: 10_000,
  timeoutFactor: 2,
  cleanTempDir: true,
}

