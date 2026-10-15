import base from './stryker.search-request-prefix.config.mjs'

export default { ...base,
  commandRunner: { command: 'node --import tsx --test --experimental-test-isolation=none --test-concurrency=1 tests/rideSearchRequestPrefix.test.js tests/rideSearchS3Candidates.test.js' },
  mutate: ['services/search/locations/requestPrefix.ts', 'services/search/locations/candidates.ts:54-54',
    'services/search/locations/candidates.ts:125-125', 'services/search/locations/candidates.ts:170-170',
    'services/search/questions.ts:7-10', 'services/search/questions.ts:45-49', 'services/search/questions.ts:56-60',
    'services/search/questions.ts:67-75'],
  jsonReporter: { fileName: 'coverage/search-request-prefix-witness-mutation.json' },
}
