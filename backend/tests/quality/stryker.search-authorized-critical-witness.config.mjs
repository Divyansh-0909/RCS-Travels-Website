import base from './stryker.search-authorized-closure.config.mjs'
export default { ...base,
  commandRunner: { command: 'node --import tsx --test --experimental-test-isolation=none --test-concurrency=1 tests/rideSearchFreezeClosure.test.js tests/benchmarkProviderAvailability.test.js tests/rideSearchS3Followup.test.js' },
  mutate: ['benchmarks/common/providerAvailability.js', 'benchmarks/search/freeze.js',
    'services/search/vehiclePolicy.ts', 'services/search/locations/followup.ts:30-40', 'services/search/observations.ts:72-82'],
  jsonReporter: { fileName: 'coverage/search-authorized-critical-witness-mutation.json' },
}
