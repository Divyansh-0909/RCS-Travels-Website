import { fileURLToPath } from 'node:url'
// Keep the external, non-mutated proposed-label artifact available inside Stryker's backend-only sandbox.
process.env.RCS_SEARCH_REVIEW_ARTIFACT = fileURLToPath(new URL('../../../docs/search/benchmark-v1/proposed.json', import.meta.url))
export default {
  testRunner: 'command', coverageAnalysis: 'off',
  commandRunner: { command: 'node --test --experimental-test-isolation=none --test-concurrency=1 tests/rideSearchS5Dataset.test.js tests/rideSearchS5Review.test.js' },
  mutate: ['benchmarks/search/dataset.js', 'benchmarks/search/templates.js', 'benchmarks/search/validation.js', 'benchmarks/search/review.js'],
  ignorePatterns: ['.env', '.env.*', 'coverage', 'logs', 'node_modules', 'uploads'],
  reporters: ['clear-text', 'progress-append-only', 'json'],
  jsonReporter: { fileName: 'coverage/search-s5-review-mutation.json' },
  concurrency: 4, timeoutMS: 20_000, timeoutFactor: 2, cleanTempDir: true,
}
