import base from './stryker.phase81-authorized-safety-witness.config.mjs'
export default { ...base,
  mutate: ['benchmarks/responsibility/benchmark.js:222-234', 'benchmarks/responsibility/dataset.js:187-187'],
  jsonReporter: { fileName: 'coverage/phase81-authorized-metadata-witness-mutation.json' },
}
