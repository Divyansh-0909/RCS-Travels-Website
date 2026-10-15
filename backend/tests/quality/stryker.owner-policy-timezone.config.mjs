import base from './stryker.owner-policy-development.config.mjs'
export default { ...base,
  commandRunner: { command: 'node --import tsx --test --experimental-test-isolation=none --test-name-pattern="host-timezone independent" tests/rideSearchS5OwnerPolicy.test.js' },
  mutate: ['benchmarks/search/ownerPolicyReview.js:19-19'], concurrency: 2,
  jsonReporter: { fileName: 'coverage/owner-policy-timezone-mutation.json' },
}
