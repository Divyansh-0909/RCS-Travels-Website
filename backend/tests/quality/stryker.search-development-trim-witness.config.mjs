import base from './stryker.search-development-candidate-boundaries.config.mjs'

export default { ...base,
  mutate: ['services/search/locations/candidates.ts:46-46'],
  jsonReporter: { fileName: 'coverage/search-development-trim-witness-mutation.json' },
}
