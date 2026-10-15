export default {
  "testRunner": "command",
  "coverageAnalysis": "off",
  "commandRunner": {
    "command": "node --import tsx --test --experimental-test-isolation=none --test-concurrency=1 tests/responsibilityEvidenceCriteriaV4.test.js tests/responsibilityAuthorizedClosure.test.js"
  },
  "mutate": [
    "benchmarks/responsibility/evidenceCriteriaV3.js",
    "benchmarks/responsibility/evidenceCriteriaV4.js"
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
    "fileName": "coverage/phase81-criteria-v4-mutation.json"
  },
  "concurrency": 2,
  "timeoutMS": 20000,
  "timeoutFactor": 2,
  "cleanTempDir": true
}
