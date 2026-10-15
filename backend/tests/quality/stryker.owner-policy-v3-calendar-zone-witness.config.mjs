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
    "command": "node --import tsx --test --experimental-test-isolation=none --test-concurrency=1 --test-name-pattern=\"calendar|omitted|recognized\" tests/rideSearchOwnerDecisions.test.js"
  },
  "mutate": [
    "services/search/calendarPolicy.ts",
    "services/search/timezonePolicy.ts"
  ],
  "jsonReporter": {
    "fileName": "coverage/owner-policy-v3-calendar-zone-witness-mutation.json"
  }
}
