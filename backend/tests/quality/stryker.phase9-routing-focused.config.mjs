import base from './stryker.phase9-routing.config.mjs'
export default { ...base,
  mutate: ['services/driverDispatchOffers.js', 'services/driverDispatchCandidates.js', 'services/driverDelay.js', 'services/googleRoutes.js'],
  commandRunner: { command: 'node --import ./tests/helpers/phase9UnitIsolation.js --import tsx tests/phase9RoutingIntegration.test.js' },
  jsonReporter: { fileName: 'coverage/phase9-routing-focused-mutation.json' },
}
