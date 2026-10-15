export default {
  testRunner: 'command', coverageAnalysis: 'off',
  commandRunner: { command: 'node --test --experimental-test-isolation=none --test-concurrency=1 tests/responsibilityBenchmarkDevelopment.test.js tests/responsibilityBenchmarkMutationSafety.test.js tests/responsibilityBenchmarkBudget.test.js tests/responsibilityBenchmarkPhase81Runner.test.js tests/responsibilityBenchmarkAudit.test.js tests/responsibilityBenchmarkMetrics.test.js tests/responsibilityBenchmarkEvaluation.test.js tests/responsibilityBenchmarkCoverage.test.js tests/responsibilityBenchmarkSafety.test.js tests/benchmarkCache.test.js' },
  mutate: ['benchmarks/responsibility/rawGatedMetrics.js', 'benchmarks/responsibility/phase81Development.js',
    'benchmarks/responsibility/developmentBudget.js', 'benchmarks/responsibility/phase81Failures.js',
    'benchmarks/responsibility/phase81.js', 'benchmarks/responsibility/benchmark.js:273-287',
    'benchmarks/responsibility/metrics.js:60-62', 'benchmarks/responsibility/metrics.js:133-136',
    'benchmarks/responsibility/metrics.js:147-150', 'benchmarks/responsibility/metrics.js:182-184',
    'benchmarks/responsibility/evaluation.js:20-43', 'benchmarks/responsibility/evaluation.js:66-75'],
  ignorePatterns: ['.env', '.env.*', 'coverage', 'logs', 'node_modules', 'uploads'],
  reporters: ['progress-append-only', 'json'], jsonReporter: { fileName: 'coverage/phase81-final-critical-mutation.json' },
  concurrency: 4, timeoutMS: 30_000, timeoutFactor: 2, cleanTempDir: true,
}
