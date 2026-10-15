import base from './stryker.search-request-prefix-witness.config.mjs'

export default { ...base,
  commandRunner: { command: 'node --import tsx --test --experimental-test-isolation=none --test-concurrency=1 tests/rideSearchRequestPrefix.test.js tests/rideSearchS3Candidates.test.js tests/rideSearchDevelopmentWitnesses.test.js' },
  mutate: ['services/search/locations/bookingTail.ts', 'services/search/locations/temporalSuffix.ts'],
  jsonReporter: { fileName: 'coverage/search-booking-tail-mutation.json' },
}
