import base from './stryker.phase81-final-critical.config.mjs'
export default {
  ...base,
  mutate: ['benchmarks/responsibility/rawGatedMetrics.js', 'benchmarks/responsibility/developmentBudget.js:12-14',
    'benchmarks/responsibility/phase81Development.js:19-22', 'benchmarks/responsibility/phase81Failures.js',
    'benchmarks/responsibility/benchmark.js:284-284', 'benchmarks/responsibility/metrics.js:61-61',
    'benchmarks/responsibility/metrics.js:135-135', 'benchmarks/responsibility/metrics.js:148-150',
    'benchmarks/responsibility/metrics.js:183-183'],
  jsonReporter: { fileName: 'coverage/phase81-witness-mutation.json' },
}
