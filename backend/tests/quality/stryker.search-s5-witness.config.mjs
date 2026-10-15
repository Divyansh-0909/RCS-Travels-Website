import base from './stryker.search-s5-final-critical.config.mjs'
export default {
  ...base,
  mutate: ['benchmarks/search/approval.js:104-124', 'benchmarks/search/classReview.js:38-40',
    'benchmarks/search/classReview.js:54-59', 'services/search/locations/grounding.ts:115-119'],
  jsonReporter: { fileName: 'coverage/search-s5-witness-mutation.json' },
}
