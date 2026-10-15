export default {
  testRunner: 'command', coverageAnalysis: 'off',
  commandRunner: { command: 'node --import tsx --test --experimental-test-isolation=none --test-concurrency=1 tests/responsibilityAuthorizedGateSafety.test.js tests/responsibilityAuthorizedClosure.test.js tests/responsibilityBenchmarkOwnerMutation.test.js tests/responsibilityBenchmarkSafety.test.js tests/responsibilityDevelopmentSeverityGate.test.js tests/responsibilityEvidenceCriteriaV2.test.js' },
  mutate: ['benchmarks/responsibility/benchmark.js:193-210', 'benchmarks/responsibility/run.js:97-131',
    'benchmarks/responsibility/developmentSeverityGate.js:7-7',
    'benchmarks/responsibility/evidenceCriteriaV2.js', 'benchmarks/responsibility/evidenceCriteriaV3.js'],
  ignorePatterns: ['.env', '.env.*', 'coverage', 'logs', 'node_modules', 'uploads'],
  reporters: ['progress-append-only', 'json'],
  jsonReporter: { fileName: 'coverage/phase81-authorized-safety-witness-mutation.json' },
  concurrency: 2, timeoutMS: 20000, timeoutFactor: 2, cleanTempDir: true,
}
