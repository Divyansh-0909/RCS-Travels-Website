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
    "command": "node --import tsx --test --experimental-test-isolation=none --test-concurrency=1 --test-name-pattern=\"calendar|omitted|recognized|bare|SUV|form readiness|temporal conflicts|Luna cannot|ambiguous negative|DST|soft AC|S6 packet|advisory verifier|v2 criteria\" tests/rideSearchOwnerDecisions.test.js tests/rideSearchOwnerDecisionSafety.test.js tests/rideSearchToolAudit.test.js tests/responsibilityEvidenceCriteriaV2.test.js tests/rideSearchTemporal.test.js"
  },
  "mutate": [
    "services/search/calendarPolicy.ts",
    "services/search/timezonePolicy.ts",
    "services/search/vehiclePolicy.ts",
    "services/search/complex/ownerConflicts.ts",
    "services/search/locations/formResolution.ts",
    "benchmarks/search/toolAudit.js",
    "benchmarks/responsibility/evidenceCriteriaV2.js"
  ],
  "jsonReporter": {
    "fileName": "coverage/owner-policy-v3-current-core-mutation.json"
  }
}
