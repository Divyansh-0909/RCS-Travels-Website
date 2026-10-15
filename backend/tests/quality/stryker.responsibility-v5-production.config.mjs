export default {
  testRunner: 'command', coverageAnalysis: 'off', tsconfigFile: 'tests/quality/independent-guard-js-only.json',
  commandRunner: { command: 'node --import tsx --test --experimental-test-isolation=none --test-concurrency=1 tests/responsibilityJevV5.test.js' },
  mutate: ['services/responsibilityJevV5.js'],
  ignorePatterns: ['.env', '.env.*', 'coverage', 'logs', 'node_modules', 'uploads'],
  reporters: ['progress-append-only', 'json'], jsonReporter: { fileName: 'coverage/responsibility-v5-production-mutation.json' },
  concurrency: 4, timeoutMS: 2000, timeoutFactor: 2, cleanTempDir: true,
}
