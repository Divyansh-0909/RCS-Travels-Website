export default {
  testRunner: 'command', coverageAnalysis: 'off', tsconfigFile: 'tests/quality/phase6b-no-tsconfig.json',
  commandRunner: { command: 'node --import ./tests/helpers/phase9UnitIsolation.js --import tsx --test tests/responsibilityShadowDiagnostics.test.js tests/responsibilityShadowAdjudication.test.js' },
  mutate: ['services/responsibilityShadowDiagnostics.js', 'services/responsibilityShadowAdjudication.js:203:0-206:0'],
  ignorePatterns: ['.env', '.env.*', 'coverage', 'logs', 'node_modules', 'uploads', 'output'],
  reporters: ['clear-text', 'json'], jsonReporter: { fileName: '../output/phase9-ui-2026-10-10/backend-mutation.json' },
  concurrency: 2, timeoutMS: 10000, timeoutFactor: 2, cleanTempDir: true,
};
