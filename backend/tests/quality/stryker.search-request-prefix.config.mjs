import base from './stryker.search-development-candidate-boundaries.config.mjs'

export default { ...base,
  commandRunner: { command: 'node --import tsx --test --experimental-test-isolation=none --test-concurrency=1 tests/rideSearchRequestPrefix.test.js tests/rideSearchDevelopmentWitnesses.test.js tests/rideSearchDevelopmentSafety.test.js tests/rideSearchS3Candidates.test.js tests/rideSearchParser.test.js tests/rideSearchObservationMutations.test.js tests/rideSearchAdversarial.test.js tests/rideSearchProvider.test.js tests/rideSearchProviderMutations.test.js' },
  mutate: ['services/search/locations/candidates.ts', 'services/search/locations/requestPrefix.ts', 'services/search/questions.ts'],
  jsonReporter: { fileName: 'coverage/search-request-prefix-mutation.json' },
}
