export default {
  testRunner: 'command',
  coverageAnalysis: 'off',
  // This mutation scope is JavaScript-only; no TypeScript config rewrite is needed.
  tsconfigFile: 'tests/quality/phase6b-no-tsconfig.json',
  commandRunner: {
    command: 'node --import tsx --test tests/responsibilityLifecyclePhase6B.test.js tests/responsibilityLifecyclePhase6B.coverage.test.js',
  },
  mutate: [
    'services/responsibilityCaseState.js',
    'services/responsibilityLifecycleRepository.js',
    'services/responsibilityNoticeService.js',
    'services/responsibilityFinalizationService.js',
    'services/responsibilityReviewService.js',
    'services/responsibilityAppealService.js',
    'services/responsibilityProvisionalLifecycle.js',
    'services/responsibilityFinalizationSweep.js',
  ],
  ignorePatterns: ['.env', '.env.*', 'coverage', 'logs', 'node_modules', 'uploads'],
  reporters: ['clear-text', 'json'],
  jsonReporter: { fileName: 'coverage/phase6b-mutation.json' },
  concurrency: 4,
  timeoutMS: 10_000,
  timeoutFactor: 2,
  cleanTempDir: true,
}
