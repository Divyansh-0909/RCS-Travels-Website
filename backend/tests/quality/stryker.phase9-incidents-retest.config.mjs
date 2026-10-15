import base from './stryker.phase9-incidents.config.mjs'
export default { ...base, concurrency: 1,
  mutate: ['services/lifecycleIncidentEvidence.js:17-17', 'services/lifecycleIncidentEvidence.js:41-41'],
  jsonReporter: { fileName: 'coverage/phase9-incidents-retest.json' },
}
