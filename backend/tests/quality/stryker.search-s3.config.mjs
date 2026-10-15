export default {
  testRunner: 'command', coverageAnalysis: 'off', tsconfigFile: 'tsconfig.json',
  commandRunner: { command: 'node --import tsx --experimental-test-isolation=none --test-concurrency=1 --test '
    + (process.env.RCS_SEARCH_MUTATION_TESTS ?? 'tests/rideSearch*.test.js') },
  mutate: process.env.RCS_SEARCH_MUTATE?.split(',') ?? ['services/search/locations/**/*.ts', 'services/search/parser.ts', 'services/search/observations.ts', 'routes/googleAPI.js'],
  ignorePatterns: ['.env', '.env.*', 'coverage', 'logs', 'node_modules', 'uploads'],
  reporters: ['clear-text', 'json'],
  jsonReporter: { fileName: process.env.RCS_SEARCH_MUTATION_REPORT ?? 'coverage/search-s3-mutation.json' },
  concurrency: Number(process.env.RCS_SEARCH_MUTATION_CONCURRENCY ?? 8),
  timeoutMS: 10_000, timeoutFactor: 2, cleanTempDir: true,
};
