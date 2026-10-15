export default {
  testRunner: 'command',
  coverageAnalysis: 'off',
  commandRunner: {
    command: 'node --import tsx --test tests/responsibilityDecisionPhase5.test.js tests/responsibilityEvidence.test.js',
  },
  mutate: [
    'services/responsibilityEvidence.js',
    'services/responsibilityContracts.js',
    'services/responsibilityAnalyst.js',
    'services/responsibilityCaseState.js',
    'services/responsibilityPolicyGate.js',
    'services/responsibilityDecisionRepository.js',
    'services/responsibilityDecisionService.js',
  ],
  ignorePatterns: ['.env', '.env.*', 'coverage', 'logs', 'node_modules', 'uploads'],
  reporters: ['clear-text', 'json'],
  jsonReporter: { fileName: 'coverage/phase5-mutation.json' },
  concurrency: 4,
  timeoutMS: 10_000,
  timeoutFactor: 2,
  cleanTempDir: true,
}
