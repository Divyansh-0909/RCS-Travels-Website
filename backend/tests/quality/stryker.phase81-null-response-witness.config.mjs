import base from './stryker.phase81-final-critical.config.mjs'
export default {
  ...base,
  commandRunner: { command: 'node --test --experimental-test-isolation=none --test-concurrency=1 tests/responsibilityBenchmarkDevelopment.test.js tests/responsibilityBenchmarkBudget.test.js' },
  mutate: ['benchmarks/responsibility/rawGatedMetrics.js:8-8', 'benchmarks/responsibility/developmentBudget.js:12-12'],
  jsonReporter: { fileName: 'coverage/phase81-null-response-witness-mutation.json' },
}
