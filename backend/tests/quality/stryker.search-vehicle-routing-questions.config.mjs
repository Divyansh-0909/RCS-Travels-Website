import base from './stryker.search-request-prefix.config.mjs'

export default { ...base,
  commandRunner: { command: 'node --import tsx --test --experimental-test-isolation=none --test-concurrency=1 tests/rideSearchRequestPrefix.test.js tests/rideSearchObservationMutations.test.js tests/rideSearchParser.test.js tests/rideSearchDevelopmentSafety.test.js tests/rideSearchProviderMutations.test.js' },
  mutate: ['services/search/questions.ts'],
  jsonReporter: { fileName: 'coverage/search-vehicle-routing-questions-mutation.json' },
}
