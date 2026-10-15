import base from './stryker.search-development-safety.config.mjs'
export default { ...base,
  commandRunner: { command: 'node --import tsx --test --experimental-test-isolation=none --test-concurrency=1 tests/rideSearchDevelopmentClosure.test.js tests/rideSearchDevelopmentSafety.test.js' },
  mutate: ['services/search/locations/formResolution.ts:24-24', 'services/search/timezonePolicy.ts:19-19'],
  jsonReporter: { fileName: 'coverage/search-development-timezone-form-witness-mutation.json' },
  concurrency: 2,
}
