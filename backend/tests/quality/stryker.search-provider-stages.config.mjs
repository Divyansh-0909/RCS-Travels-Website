import base from './stryker.search-request-prefix.config.mjs'

export default { ...base,
  commandRunner: { command: 'node --import tsx --test --experimental-test-isolation=none --test-concurrency=1 tests/searchProviderStages.test.js' },
  mutate: ['benchmarks/search/providerStages.js'],
  jsonReporter: { fileName: 'coverage/search-provider-stages-mutation.json' },
}
