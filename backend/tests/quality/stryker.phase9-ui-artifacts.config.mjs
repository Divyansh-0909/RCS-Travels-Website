export default {
  testRunner: 'command', coverageAnalysis: 'off', tsconfigFile: 'tests/quality/phase6b-no-tsconfig.json',
  commandRunner: { command: 'node --import ./tests/helpers/phase9UnitIsolation.js --import tsx --test tests/phase9TraceRedaction.test.js tests/phase9BrowserReceipt.test.js' },
  mutate: ['tests/helpers/phase9TraceRedaction.js', 'tests/helpers/phase9BrowserReceipt.js'],
  ignorePatterns: ['.env', '.env.*', 'coverage', 'logs', 'node_modules', 'uploads', 'output'],
  reporters: ['clear-text', 'json'], jsonReporter: { fileName: '../output/phase9-ui-2026-10-10/artifact-mutation.json' },
  concurrency: 2, timeoutMS: 10000, timeoutFactor: 2, cleanTempDir: true,
};
