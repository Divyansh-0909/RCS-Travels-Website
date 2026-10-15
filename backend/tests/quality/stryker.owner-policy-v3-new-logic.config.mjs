export default {
  "testRunner": "command",
  "coverageAnalysis": "off",
  "commandRunner": {
    "command": "node --import tsx --test --experimental-test-isolation=none --test-concurrency=1 tests/rideSearchOwnerDecisions.test.js tests/rideSearchOwnerDecisionSafety.test.js tests/rideSearchToolAudit.test.js tests/responsibilityEvidenceCriteriaV2.test.js tests/rideSearchTemporal.test.js"
  },
  "mutate": [
    "services/search/calendarPolicy.ts",
    "services/search/timezonePolicy.ts",
    "services/search/vehiclePolicy.ts",
    "services/search/complex/ownerConflicts.ts",
    "services/search/locations/formResolution.ts",
    "benchmarks/search/familyDefinitionProof.js",
    "benchmarks/search/familyOwnerReview.js",
    "benchmarks/search/toolAudit.js",
    "benchmarks/responsibility/evidenceCriteriaV2.js"
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
    "fileName": "coverage/owner-policy-v3-new-logic-mutation.json"
  },
  "concurrency": 4,
  "timeoutMS": 20000,
  "timeoutFactor": 2,
  "cleanTempDir": true
}
