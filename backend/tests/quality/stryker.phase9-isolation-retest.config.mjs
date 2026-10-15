import base from './stryker.phase9.config.mjs'
export default { ...base, mutate: ['tests/helpers/phase9Isolation.js'], concurrency: 1,
  jsonReporter: { fileName: 'coverage/phase9-isolation-retest.json' } }
