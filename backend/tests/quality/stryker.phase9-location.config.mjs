import base from './stryker.phase9-routing.config.mjs'
export default { ...base,
  mutate: ['services/rideGeofence.ts', 'services/cancellationLocationEvidence.js'],
  commandRunner: { command: 'node --import ./tests/helpers/phase9UnitIsolation.js --import tsx --test tests/rideGeofence.test.js tests/cancellationLocationEvidence.test.js' },
  jsonReporter: { fileName: 'coverage/phase9-location-mutation.json' },
}
