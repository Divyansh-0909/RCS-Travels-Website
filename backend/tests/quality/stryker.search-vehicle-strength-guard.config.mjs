import base from './stryker.search-vehicle-routing-questions.config.mjs'

export default { ...base,
  commandRunner: { command: 'node --import tsx --test --experimental-test-isolation=none --test-concurrency=1 tests/rideSearchExtractorWitnesses.test.js tests/rideSearchRequestPrefix.test.js tests/rideSearchDevelopmentSafety.test.js tests/rideSearchParser.test.js tests/rideSearchAdversarial.test.js tests/rideSearchObservationMutations.test.js tests/rideSearchFinalMutationRegressions.test.js tests/rideSearchFreezeClosure.test.js' },
  mutate: ['services/search/extractor.ts', 'services/search/vehiclePolicy.ts', 'services/search/questions.ts'],
  jsonReporter: { fileName: 'coverage/search-vehicle-strength-guard-mutation.json' },
}
