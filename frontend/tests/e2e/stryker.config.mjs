export default {
  testRunner: 'command', coverageAnalysis: 'off', disableTypeChecks: false,
  commandRunner: { command: 'node --test tests/responsibilityCaseLoad.test.js tests/cancelledAdvanceSummary.test.js tests/responsibilityInspection.test.js' },
  mutate: ['src/lib/responsibilityCaseLoad.js', 'src/lib/cancelledAdvanceSummary.js', 'src/lib/responsibilityInspection.js'],
  ignorePatterns: ['.env', '.env.*', 'node_modules', 'dist', 'tests/e2e'],
  reporters: ['clear-text', 'json'], jsonReporter: { fileName: '../output/phase9-ui-2026-10-10/frontend-mutation.json' },
  concurrency: 2, timeoutMS: 4000, timeoutFactor: 2, cleanTempDir: true,
};
