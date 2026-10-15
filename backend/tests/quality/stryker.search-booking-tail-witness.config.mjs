import base from './stryker.search-booking-tail.config.mjs'

export default { ...base,
  mutate: ['services/search/locations/bookingTail.ts:13-13', 'services/search/locations/temporalSuffix.ts:12-12',
    'services/search/locations/temporalSuffix.ts:17-18'],
  jsonReporter: { fileName: 'coverage/search-booking-tail-witness-mutation.json' },
}
