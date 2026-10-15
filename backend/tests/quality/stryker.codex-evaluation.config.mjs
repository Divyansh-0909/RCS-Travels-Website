export default {
  testRunner: 'command', coverageAnalysis: 'off',
  commandRunner: { command: 'node --import tsx --test --experimental-test-isolation=none --test-concurrency=1 tests/codexEvaluation.test.js tests/codexResume.test.js tests/codexMetrics.test.js' },
  mutate: ['benchmarks/codex/*.js'],
  ignorePatterns: ['.env', '.env.*', 'coverage', 'logs', 'node_modules', 'uploads'],
  reporters: ['progress-append-only', 'json'], jsonReporter: { fileName: 'coverage/codex-evaluation-mutation.json' },
  concurrency: 4, timeoutMS: 2000, timeoutFactor: 2, cleanTempDir: true,
}
