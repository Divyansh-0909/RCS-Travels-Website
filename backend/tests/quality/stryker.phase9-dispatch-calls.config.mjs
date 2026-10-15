import base from './stryker.phase9-routing-retest.config.mjs'
export default { ...base,
  commandRunner: { command: 'node --import ./tests/helpers/phase9UnitIsolation.js --import tsx tests/helpers/phase9RoutingMutationSuite.mjs' },
  mutate: ['services/driverAssignment.js:209-213', 'services/driverAssignment.js:230-232',
    'services/driverAssignment.js:247-247', 'services/driverAssignment.js:268-268'],
  jsonReporter: { fileName: 'coverage/phase9-dispatch-calls.json' },
}
