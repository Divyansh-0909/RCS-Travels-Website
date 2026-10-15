export default {
  testRunner: 'command', coverageAnalysis: 'off',
  commandRunner: { command: 'node --test --experimental-test-isolation=none --test-concurrency=1 tests/responsibilityBenchmarkLunaBaseline.test.js tests/responsibilityBenchmarkMetrics.test.js tests/responsibilityBenchmarkPhase81Safety.test.js tests/responsibilityBenchmarkPhase81Runner.test.js tests/benchmarkCache.test.js' },
  mutate: ['benchmarks/responsibility/lunaBaseline.js', 'benchmarks/responsibility/metrics.js:35-51', 'benchmarks/common/cache.js'],
  ignorePatterns: ['.env', '.env.*', 'coverage', 'logs', 'node_modules', 'uploads'],
  reporters: ['clear-text', 'progress-append-only', 'json'],
  jsonReporter: { fileName: 'coverage/phase81-changed-mutation.json' },
  concurrency: 4, timeoutMS: 20_000, timeoutFactor: 2, cleanTempDir: true,
}
