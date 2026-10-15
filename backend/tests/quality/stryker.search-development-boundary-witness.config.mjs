import base from './stryker.search-development-candidate-boundaries.config.mjs'
export default { ...base,
  mutate: ['services/search/locations/candidates.ts:41-42', 'services/search/locations/candidates.ts:46-46',
    'services/search/locations/candidates.ts:136-136', 'services/search/locations/candidates.ts:150-150',
    'services/search/locations/candidates.ts:162-162'],
  jsonReporter: { fileName: 'coverage/search-development-boundary-witness-mutation.json' },
}
