import base from './stryker.phase81-criteria-v4.config.mjs'

export default { ...base,
  commandRunner: { command: 'node --import tsx --test --experimental-test-isolation=none --test-concurrency=1 tests/responsibilityEvidenceCriteriaV5.test.js' },
  mutate: ['benchmarks/responsibility/evidenceCriteriaV5.js'],
  jsonReporter: { fileName: 'coverage/phase81-criteria-v5-mutation.json' },
}
