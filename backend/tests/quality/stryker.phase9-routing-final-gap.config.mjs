import base from './stryker.phase9-routing-retest.config.mjs'
export default { ...base, concurrency: 1, mutate: ['services/googleRoutes.js:72-72'],
  jsonReporter: { fileName: 'coverage/phase9-routing-final-gap.json' },
}
