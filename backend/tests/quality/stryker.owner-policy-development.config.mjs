export default {
  testRunner: 'command', coverageAnalysis: 'off',
  commandRunner: { command: 'node --import tsx --test --experimental-test-isolation=none --test-concurrency=1 tests/rideSearchS5OwnerPolicy.test.js tests/responsibilityEvidenceAwareSeverity.test.js tests/responsibilityPacedDevelopment.test.js tests/responsibilityDevelopmentSeverityGate.test.js' },
  mutate: ['benchmarks/search/ownerPolicyReview.js', 'benchmarks/responsibility/evidenceAwareSeverity.js',
    'benchmarks/responsibility/pacedDevelopment.js', 'benchmarks/responsibility/developmentSeverityGate.js'],
  ignorePatterns: ['.env', '.env.*', 'coverage', 'logs', 'node_modules', 'uploads'],
  reporters: ['progress-append-only', 'json'], jsonReporter: { fileName: 'coverage/owner-policy-development-mutation.json' },
  concurrency: 6, timeoutMS: 10000, timeoutFactor: 2, cleanTempDir: true,
}
