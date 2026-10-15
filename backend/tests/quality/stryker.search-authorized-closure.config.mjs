import { fileURLToPath } from 'node:url'
// Stryker stages backend sources; the immutable review artifact stays in repository docs.
process.env.RCS_SEARCH_FROZEN_DATASET_PATH = fileURLToPath(new URL('../../../docs/search/benchmark-v1/frozen-v1/dataset.json', import.meta.url))
export default {
  testRunner: 'command', coverageAnalysis: 'off',
  commandRunner: { command: 'node --import tsx --test --experimental-test-isolation=none --test-concurrency=1 tests/rideSearchOwnerDecisions.test.js tests/rideSearchOwnerDecisionSafety.test.js tests/rideSearchToolAudit.test.js tests/rideSearchTemporal.test.js tests/rideSearchFreezeClosure.test.js tests/rideSearchS3Candidates.test.js tests/rideSearchS3Followup.test.js tests/rideSearchParser.test.js tests/rideSearchObservationMutations.test.js tests/rideSearchAdversarial.test.js tests/benchmarkProviderAvailability.test.js' },
  mutate: ['services/search/calendarPolicy.ts', 'services/search/timezonePolicy.ts',
    'services/search/vehiclePolicy.ts', 'services/search/complex/ownerConflicts.ts',
    'services/search/locations/formResolution.ts', 'benchmarks/search/toolAudit.js', 'benchmarks/search/freeze.js',
    'benchmarks/common/providerAvailability.js', 'services/search/extractor.ts:58-91',
    'services/search/questions.ts:69-73', 'services/search/observations.ts:72-82',
    'services/search/locations/followup.ts:30-40', 'services/search/locations/candidates.ts:4-4',
    'services/search/locations/candidates.ts:41-42'],
  ignorePatterns: ['.env', '.env.*', 'coverage', 'logs', 'node_modules', 'uploads'],
  reporters: ['progress-append-only', 'json'],
  jsonReporter: { fileName: 'coverage/search-authorized-closure-mutation.json' },
  concurrency: 4, timeoutMS: 20000, timeoutFactor: 2, cleanTempDir: true,
}
