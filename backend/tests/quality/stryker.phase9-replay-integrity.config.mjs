import base from './stryker.phase9-incidents.config.mjs'
export default { ...base, disableTypeChecks: false, concurrency: 3,
  mutate: ['tests/helpers/phase9ReplayCanonical.js', 'tests/helpers/phase9ReplayContract.js',
    'tests/helpers/phase9ControlledTime.js', 'tests/helpers/phase9ReplaySources.js'],
  commandRunner: { command: 'node --import ./tests/helpers/phase9UnitIsolation.js --import tsx tests/phase9ReplaySafety.test.js' },
  jsonReporter: { fileName: 'coverage/phase9-replay-integrity-mutation.json' },
}
