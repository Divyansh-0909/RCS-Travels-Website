import base from './stryker.search-development-candidate-boundaries.config.mjs'

export default { ...base,
  mutate: ['services/search/locations/temporalSuffix.ts:4-4'],
  jsonReporter: { fileName: 'coverage/search-development-landmark-witness-mutation.json' },
}
