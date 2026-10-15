export default {
  "testRunner": "command",
  "coverageAnalysis": "off",
  "commandRunner": {
    "command": "node --import tsx --test --experimental-test-isolation=none --test-concurrency=1 tests/responsibilityBenchmark.test.js tests/responsibilityBenchmarkOwnerMutation.test.js tests/responsibilityBenchmarkSafety.test.js tests/responsibilityBenchmarkDevelopment.test.js tests/responsibilityBenchmarkBudget.test.js tests/responsibilityBenchmarkPhase81Runner.test.js tests/responsibilityBenchmarkMutationSafety.test.js tests/responsibilityAuthorizedClosure.test.js"
  },
  "mutate": [
    "benchmarks/responsibility/benchmark.js",
    "benchmarks/responsibility/developmentBudget.js",
    "benchmarks/responsibility/phase81Development.js",
    "benchmarks/responsibility/phase81Failures.js"
  ],
  "ignorePatterns": [
    ".env",
    ".env.*",
    "coverage",
    "logs",
    "node_modules",
    "uploads"
  ],
  "reporters": [
    "progress-append-only",
    "json"
  ],
  "jsonReporter": {
    "fileName": "coverage/phase81-authorized-current-source-mutation.json"
  },
  "concurrency": 4,
  "timeoutMS": 15000,
  "timeoutFactor": 2,
  "cleanTempDir": true
}
