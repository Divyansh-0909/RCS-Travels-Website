export default {
  testRunner: 'command',
  coverageAnalysis: 'off',
  commandRunner: {
    command: 'node --test --experimental-test-isolation=none --test-concurrency=1 tests/responsibilityBenchmark.test.js tests/responsibilityBenchmarkDataset.test.js tests/responsibilityBenchmarkGroundTruth.test.js tests/responsibilityBenchmarkMetrics.test.js tests/responsibilityBenchmarkEvaluation.test.js tests/responsibilityBenchmarkCoverage.test.js tests/responsibilityBenchmarkSafety.test.js tests/responsibilityBenchmarkCli.test.js tests/responsibilityBenchmarkPhase81Safety.test.js tests/responsibilityBenchmarkDevelopment.test.js',
  },
  mutate: [
    'benchmarks/responsibility/contracts.js',
    'benchmarks/responsibility/dataset.js',
    'benchmarks/responsibility/metrics.js',
    'benchmarks/responsibility/benchmark.js',
    'benchmarks/responsibility/evaluation.js',
    'benchmarks/responsibility/run.js',
  ],
  ignorePatterns: ['.env', '.env.*', 'coverage', 'logs', 'node_modules', 'uploads'],
  reporters: ['clear-text', 'progress-append-only', 'json'],
  jsonReporter: { fileName: 'coverage/phase8-mutation.json' },
  concurrency: 4,
  timeoutMS: 40_000,
  timeoutFactor: 2,
  cleanTempDir: true,
}
