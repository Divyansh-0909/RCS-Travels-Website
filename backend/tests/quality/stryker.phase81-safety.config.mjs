export default {
  testRunner: 'command', coverageAnalysis: 'off',
  commandRunner: { command: 'node --test --experimental-test-isolation=none --test-concurrency=1 tests/responsibilityBenchmark.test.js tests/responsibilityBenchmarkDataset.test.js tests/responsibilityBenchmarkGroundTruth.test.js tests/responsibilityBenchmarkMetrics.test.js tests/responsibilityBenchmarkEvaluation.test.js tests/responsibilityBenchmarkCoverage.test.js tests/responsibilityBenchmarkSafety.test.js tests/responsibilityBenchmarkCli.test.js tests/responsibilityBenchmarkPhase81Safety.test.js tests/responsibilityBenchmarkPhase81Runner.test.js tests/responsibilityBenchmarkDevelopment.test.js tests/responsibilityBenchmarkMutationSafety.test.js tests/responsibilityBenchmarkBudget.test.js tests/benchmarkCache.test.js' },
  mutate: ['benchmarks/responsibility/contracts.js', 'benchmarks/responsibility/dataset.js:166-202',
    'benchmarks/responsibility/metrics.js', 'benchmarks/responsibility/benchmark.js:133-219',
    'benchmarks/responsibility/benchmark.js:268-287', 'benchmarks/responsibility/benchmark.js:71-131',
    'benchmarks/responsibility/evaluation.js', 'benchmarks/responsibility/phase81.js',
    'benchmarks/responsibility/replay.js', 'benchmarks/responsibility/phase81Failures.js',
    'benchmarks/responsibility/phase81Development.js', 'benchmarks/responsibility/rawGatedMetrics.js',
    'benchmarks/responsibility/developmentBudget.js', 'benchmarks/common/cache.js'],
  ignorePatterns: ['.env', '.env.*', 'coverage', 'logs', 'node_modules', 'uploads'],
  reporters: ['progress-append-only', 'json'], jsonReporter: { fileName: 'coverage/phase81-safety-mutation.json' },
  concurrency: 8, timeoutMS: 30_000, timeoutFactor: 2, cleanTempDir: true,
}
