import base from './stryker.phase81-final-critical.config.mjs'
export default {
  ...base,
  commandRunner: { command: 'node --test --experimental-test-isolation=none --test-concurrency=1 tests/responsibilityBenchmarkPhase81Runner.test.js tests/responsibilityBenchmarkIdentityGuards.test.js' },
  mutate: ['benchmarks/responsibility/phase81.js:30-34', 'benchmarks/responsibility/phase81.js:38-38',
    'benchmarks/responsibility/phase81.js:52-58'],
  jsonReporter: { fileName: 'coverage/phase81-identity-witness-mutation.json' },
  concurrency: 2,
}
