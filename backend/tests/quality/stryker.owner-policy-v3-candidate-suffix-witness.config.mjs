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
    "command": "node --import tsx --test --experimental-test-isolation=none --test-concurrency=1 --test-name-pattern=\"approximate clock suffix|stable|identity|delimiter|suffix\" tests/rideSearchOwnerDecisionSafety.test.js tests/rideSearchS3Candidates.test.js"
  },
  "mutate": [
    "services/search/locations/candidates.ts:5-5",
    "services/search/locations/candidates.ts:41-42"
  ],
  "jsonReporter": {
    "fileName": "coverage/owner-policy-v3-candidate-suffix-witness-mutation.json"
  }
}
