import base from './stryker.search-development-candidate-boundaries.config.mjs'
export default { ...base,
  mutate: ['services/search/locations/temporalSuffix.ts'],
  jsonReporter: { fileName: 'coverage/search-development-temporal-helper-mutation.json' },
}
