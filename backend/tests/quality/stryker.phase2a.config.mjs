export default {
  testRunner: 'command',
  coverageAnalysis: 'off',
  commandRunner: { command: 'node --test tests/postgisPrerequisites.test.js' },
  mutate: ['tests/helpers/postgisPrerequisites.js'],
  ignorePatterns: ['.env', '.env.*', 'coverage', 'logs', 'node_modules', 'uploads'],
  reporters: ['clear-text', 'json'],
  jsonReporter: { fileName: 'coverage/phase2a-mutation.json' },
  concurrency: 1,
  timeoutMS: 10_000,
  timeoutFactor: 2,
  cleanTempDir: true,
}
