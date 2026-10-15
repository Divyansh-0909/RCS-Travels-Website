import base from './stryker.phase9-replay-retest.config.mjs'
// The permanent suite rejects a deadlock at 30s, before the framework deadline.
export default { ...base, concurrency: 1, timeoutMS: 40000, mutate: ['tests/helpers/phase9ReplaySources.js:23-23'], jsonReporter: { fileName: 'coverage/phase9-replay-timeout-retest.json' } }
