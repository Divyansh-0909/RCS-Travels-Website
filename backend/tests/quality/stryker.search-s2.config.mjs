export default {
  testRunner: 'command',
  coverageAnalysis: 'off',
  tsconfigFile: 'tsconfig.json',
  commandRunner: {
    command: 'node --import tsx --experimental-test-isolation=none --test-concurrency=1 --test tests/rideSearch*.test.js',
  },
  mutate: process.env.RCS_SEARCH_MUTATE?.split(',') ?? ['services/search/*.ts', 'lib/scheduling.js'],
  ignorePatterns: ['.env', '.env.*', 'coverage', 'logs', 'node_modules', 'uploads'],
  reporters: ['clear-text', 'json'],
  jsonReporter: { fileName: process.env.RCS_SEARCH_MUTATION_REPORT ?? 'coverage/search-s2-mutation.json' },
  concurrency: Number(process.env.RCS_SEARCH_MUTATION_CONCURRENCY ?? 4),
  timeoutMS: 10_000,
  timeoutFactor: 2,
  cleanTempDir: true,
}
