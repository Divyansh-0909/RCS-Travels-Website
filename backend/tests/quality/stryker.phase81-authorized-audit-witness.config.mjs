import base from './stryker.phase81-authorized-safety-witness.config.mjs'
export default { ...base,
  mutate: ['benchmarks/responsibility/benchmark.js:198-198', 'benchmarks/responsibility/benchmark.js:208-208',
    'benchmarks/responsibility/run.js:98-129'],
  jsonReporter: { fileName: 'coverage/phase81-authorized-audit-witness-mutation.json' },
}
