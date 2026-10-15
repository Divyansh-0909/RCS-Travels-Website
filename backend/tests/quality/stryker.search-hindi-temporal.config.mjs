export default {
  testRunner: 'command', coverageAnalysis: 'off', tsconfigFile: 'tests/quality/independent-guard-js-only.json',
  commandRunner: { command: 'node --import tsx --test --experimental-test-isolation=none --test-concurrency=1 tests/rideSearchHindiTemporal.test.js tests/rideSearchObservationMutations.test.js tests/rideSearchS3Candidates.test.js tests/rideSearchRequestPrefix.test.js' },
  mutate: ['services/search/hindiTemporal.ts', 'services/search/observations.ts:57-57',
    'services/search/observations.ts:88-89', 'services/search/observations.ts:116-116', 'services/search/locations/requestPrefix.ts:9-9'],
  ignorePatterns: ['.env', '.env.*', 'coverage', 'logs', 'node_modules', 'uploads'],
  reporters: ['progress-append-only', 'json'], jsonReporter: { fileName: 'coverage/search-hindi-temporal-mutation.json' },
  concurrency: 4, timeoutMS: 2000, timeoutFactor: 2, cleanTempDir: true,
}
