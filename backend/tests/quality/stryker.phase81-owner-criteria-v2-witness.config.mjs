export default {
  "testRunner": "command",
  "coverageAnalysis": "off",
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
  "concurrency": 4,
  "timeoutMS": 20000,
  "timeoutFactor": 2,
  "cleanTempDir": true,
  "commandRunner": {
    "command": "node --import tsx --test --experimental-test-isolation=none --test-concurrency=1 tests/responsibilityEvidenceCriteriaV2.test.js"
  },
  "mutate": [
    "benchmarks/responsibility/evidenceCriteriaV2.js"
  ],
  "jsonReporter": {
    "fileName": "coverage/phase81-owner-criteria-v2-witness-mutation.json"
  }
}
