export default {
  testRunner: 'command', coverageAnalysis: 'off',
  commandRunner: { command: 'node --import tsx --test --experimental-test-isolation=none --test-concurrency=1 tests/responsibilityBenchmarkIsolation.test.js' },
  mutate: ['benchmarks/responsibility/phase81.js:36-36'],
  ignorePatterns: ['.env', '.env.*', 'coverage', 'logs', 'node_modules', 'uploads'],
  reporters: ['progress-append-only', 'json'], jsonReporter: { fileName: 'coverage/phase81-final-timeout-witness-mutation.json' },
  concurrency: 2, timeoutMS: 15000, timeoutFactor: 2, cleanTempDir: true,
}
