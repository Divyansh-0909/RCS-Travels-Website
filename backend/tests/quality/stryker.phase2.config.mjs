export default {
  testRunner: 'command',
  coverageAnalysis: 'off',
  commandRunner: {
    command: 'node --import tsx --test tests/providerFakes.test.js tests/providerFakes.edges.test.js',
  },
  mutate: [
    'tests/helpers/providerPlan.js',
    'tests/helpers/razorpayFake.js',
    'tests/helpers/razorpayXFake.js',
    'tests/helpers/settlementBoundary.js',
  ],
  ignorePatterns: ['.env', '.env.*', 'coverage', 'logs', 'node_modules', 'uploads'],
  reporters: ['clear-text', 'json'],
  jsonReporter: { fileName: 'coverage/phase2-mutation.json' },
  concurrency: 4,
  timeoutMS: 10_000,
  timeoutFactor: 2,
  cleanTempDir: true,
}
