import base from './stryker.search-s5-final-critical.config.mjs'
export default {
  ...base,
  mutate: ['benchmarks/search/approval.js:104-109', 'benchmarks/search/classReview.js:54-56',
    'services/search/locations/grounding.ts:117-117'],
  jsonReporter: { fileName: 'coverage/search-s5-audit-witness-mutation.json' },
}
