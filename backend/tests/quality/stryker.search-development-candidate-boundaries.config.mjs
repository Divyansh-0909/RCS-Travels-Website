import base from './stryker.search-development-safety.config.mjs'
export default { ...base,
  commandRunner: { command: 'node --import tsx --test --experimental-test-isolation=none --test-concurrency=1 tests/rideSearchDevelopmentWitnesses.test.js tests/rideSearchDevelopmentSafety.test.js tests/rideSearchS3Candidates.test.js' },
  mutate: ['services/search/locations/candidates.ts', 'services/search/locations/temporalSuffix.ts'],
  jsonReporter: { fileName: 'coverage/search-development-temporal-boundaries-mutation.json' },
  concurrency: 4,
}
