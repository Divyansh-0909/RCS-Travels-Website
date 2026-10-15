const mutateIndex = process.argv.indexOf('--mutate')
const mutateTarget = mutateIndex >= 0 ? process.argv[mutateIndex + 1] : ''
const targetFile = mutateTarget.split(':')[0]

const commandByTarget = {
  'services/bookingCreation.js': 'node --test tests/phase6cBookingCreation.test.js',
  'services/responsibilityFinancialMath.js': 'node --test tests/responsibilityFinancialMath.test.js',
  'services/responsibilityFinancialPolicy.js': 'node --test tests/responsibilityFinancialSweep.test.js tests/responsibilityFinancialConsequences.test.js',
  'services/responsibilityCompensation.js': 'node --test tests/responsibilityCompensation.test.js',
  'services/responsibilityLiabilityRecovery.js': 'node --test tests/responsibilityLiabilityRecovery.test.js',
  'services/responsibilityFinancialConsequences.js': 'node --test tests/responsibilityFinancialConsequences.test.js tests/responsibilityFinancialSweep.test.js',
  'services/scheduledPayments.js': 'node --test tests/scheduledCustomerPayments.test.js',
  'services/rideSettlement.js': 'node --test tests/criticalRideTransactions.test.js',
}

const command = commandByTarget[targetFile]

if (!command) {
  throw new Error(`Unsupported Phase 6C mutation target: ${targetFile || '<missing>'}`)
}

export default {
  testRunner: 'command',
  coverageAnalysis: 'off',
  tsconfigFile: 'tests/quality/phase6b-no-tsconfig.json',
  commandRunner: { command },
  mutate: [targetFile],
  ignorePatterns: ['.env', '.env.*', 'coverage', 'logs', 'node_modules', 'uploads'],
  reporters: ['clear-text', 'json'],
  jsonReporter: { fileName: 'coverage/phase6c-targeted-mutation.json' },
  concurrency: 8,
  timeoutMS: 10_000,
  timeoutFactor: 2,
  cleanTempDir: true,
}
