import base from './stryker.search-vehicle-strength-guard.config.mjs'
export default { ...base,
  commandRunner: { command: 'node --import tsx --test tests/rideSearchExtractorWitnesses.test.js' },
  mutate: ['services/search/extractor.ts:10-10'],
  jsonReporter: { fileName: 'coverage/search-direct-witness-diagnostic-mutation.json' },
  cleanTempDir: true, concurrency: 1,
}
