export default {
  "testRunner": "command",
  "coverageAnalysis": "off",
  "commandRunner": {
    "command": "node --import tsx --test --experimental-test-isolation=none --test-concurrency=1 tests/responsibilityBenchmarkOwnerMutation.test.js"
  },
  "mutate": [
    "benchmarks/responsibility/benchmark.js:143-148",
    "benchmarks/responsibility/benchmark.js:169-171"
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
    "fileName": "coverage/phase81-owner-evidence-witness-mutation.json"
  },
  "concurrency": 4,
  "timeoutMS": 15000,
  "timeoutFactor": 2,
  "cleanTempDir": true
}
