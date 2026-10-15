import base from './stryker.search-authorized-closure.config.mjs'
export default { ...base,
  commandRunner: { command: 'node --import tsx --test --experimental-test-isolation=none --test-concurrency=1 tests/rideSearchFreezeClosure.test.js tests/rideSearchS3Candidates.test.js tests/rideSearchOwnerDecisions.test.js tests/rideSearchOwnerDecisionSafety.test.js tests/rideSearchTemporal.test.js' },
  mutate: ['services/search/locations/candidates.ts:5-5', 'services/search/locations/candidates.ts:41-47', 'services/search/timezonePolicy.ts'],
  jsonReporter: { fileName: 'coverage/search-authorized-zoned-suffix-mutation.json' },
}
