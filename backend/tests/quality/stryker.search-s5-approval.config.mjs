export default {
  testRunner: 'command', coverageAnalysis: 'off',
  commandRunner: { command: 'node --import tsx --test --experimental-test-isolation=none --test-concurrency=1 tests/rideSearchS5Approval.test.js tests/rideSearchS5GoogleIdentity.test.js tests/rideSearchS3Places.test.js tests/rideSearchS3Grounding.test.js' },
  mutate: ['benchmarks/search/approval.js', 'benchmarks/search/classReview.js', 'services/googlePlaceIdentity.js',
    'services/search/locations/places.ts:57-105', 'services/search/locations/grounding.ts:84-126'],
  ignorePatterns: ['.env', '.env.*', 'coverage', 'logs', 'node_modules', 'uploads'],
  reporters: ['progress-append-only', 'json'], jsonReporter: { fileName: 'coverage/search-s5-approval-mutation.json' },
  concurrency: 4, timeoutMS: 30_000, timeoutFactor: 2, cleanTempDir: true,
}
