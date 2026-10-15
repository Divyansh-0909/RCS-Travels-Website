import base from './stryker.owner-policy-development.config.mjs'
export default { ...base,
  commandRunner: { command: 'node --import tsx --test --experimental-test-isolation=none --test-name-pattern="policy resolution preserves" tests/rideSearchS5OwnerPolicy.test.js' },
  mutate: ['benchmarks/search/ownerPolicyReview.js:19-38'], concurrency: 2,
  jsonReporter: { fileName: 'coverage/owner-policy-midnight-mutation.json' },
}
