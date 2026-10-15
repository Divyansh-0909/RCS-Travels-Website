import base from './stryker.phase9-incidents.config.mjs'
export default { ...base,
  mutate: ['services/driverCancellations.js:76-76', 'services/scheduledDepositLifecycle.js:21-21'],
  jsonReporter: { fileName: 'coverage/phase9-integration-calls-mutation.json' },
}
