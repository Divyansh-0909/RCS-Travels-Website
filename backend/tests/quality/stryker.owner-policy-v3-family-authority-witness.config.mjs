export default {
  "testRunner": "command",
  "coverageAnalysis": "off",
  "commandRunner": {
    "command": "node --import tsx --test --experimental-test-isolation=none --test-concurrency=1 --test-name-pattern=\"owner-approved family|all family variants\" tests/rideSearchOwnerDecisions.test.js tests/rideSearchOwnerDecisionSafety.test.js"
  },
  "mutate": [
    "benchmarks/search/familyOwnerReview.js:18-18",
    "benchmarks/search/familyOwnerReview.js:71-78"
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
    "fileName": "coverage/owner-policy-v3-family-authority-witness-mutation.json"
  },
  "concurrency": 4,
  "timeoutMS": 20000,
  "timeoutFactor": 2,
  "cleanTempDir": true
}
