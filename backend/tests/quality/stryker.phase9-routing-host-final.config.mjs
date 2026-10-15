import base from './stryker.phase9-routing-multiline.config.mjs'
export default { ...base, mutate: ['services/driverDispatchOffers.js:8-11'], jsonReporter: { fileName: 'coverage/phase9-routing-host-final.json' } }
