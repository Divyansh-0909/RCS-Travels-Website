export default {
  testRunner: 'command', coverageAnalysis: 'off',
  tsconfigFile: 'tests/quality/independent-guard-js-only.json',
  commandRunner: { command: 'node --import tsx --test --experimental-test-isolation=none --test-concurrency=1 tests/responsibilityIndependentGuard.test.js' },
  mutate: ['services/responsibilityEvidenceSafety.js', 'services/responsibilityPolicyGate.js:181-185',
    'benchmarks/responsibility/benchmark.js:183-183', 'benchmarks/responsibility/benchmark.js:207-210'],
  ignorePatterns: ['.env', '.env.*', 'coverage', 'logs', 'node_modules', 'uploads'],
  reporters: ['progress-append-only', 'json'], jsonReporter: { fileName: 'coverage/responsibility-independent-guard-mutation.json' },
  concurrency: 4, timeoutMS: 2000, timeoutFactor: 2, cleanTempDir: true,
}
