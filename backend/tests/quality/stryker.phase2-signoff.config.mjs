export default {
  testRunner: 'command',
  coverageAnalysis: 'off',
  commandRunner: {
    command: 'node --import tsx --test tests/payoutWebhook.test.js',
  },
  mutate: [
    'services/driverPayouts.js:116-118',
    'services/razorpayXPayoutWebhook.js:19-19',
    'services/razorpayXPayoutWebhook.js:73-73',
  ],
  ignorePatterns: ['.env', '.env.*', 'coverage', 'logs', 'node_modules', 'uploads'],
  reporters: ['clear-text', 'json'],
  jsonReporter: { fileName: 'coverage/phase2-signoff-mutation.json' },
  concurrency: 4,
  timeoutMS: 10_000,
  timeoutFactor: 2,
  cleanTempDir: true,
}
