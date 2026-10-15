import base from './stryker.phase9-financial.config.mjs'
export default { ...base, concurrency: 1,
  commandRunner: { command: base.commandRunner.command + ' tests/phase9Safety.test.js' },
  mutate: ['services/scheduledOfferAcceptance.js:25-25', 'services/rideSettlement.js:120-120'],
  jsonReporter: { fileName: 'coverage/phase9-callsite-mutation.json' },
}
