export default {
  testRunner: 'command', coverageAnalysis: 'off',
  commandRunner: { command: 'node --import tsx --test --experimental-test-isolation=none --test-concurrency=1 tests/rideSearchS5GoogleIdentity.test.js tests/rideSearchS3Places.test.js tests/rideSearchS3Grounding.test.js' },
  mutate: ['services/search/locations/places.ts:32-39', 'services/search/locations/places.ts:188-195', 'services/search/locations/grounding.ts:76-84'],
  ignorePatterns: ['.env', '.env.*', 'coverage', 'logs', 'node_modules', 'uploads'],
  reporters: ['progress-append-only', 'json'], jsonReporter: { fileName: 'coverage/search-s5-identity-mutation.json' },
  concurrency: 2, timeoutMS: 20_000, timeoutFactor: 2, cleanTempDir: true,
}
