import base from './stryker.search-booking-tail.config.mjs'

export default { ...base,
  mutate: ['services/search/locations/bookingTail.ts'],
  jsonReporter: { fileName: 'coverage/search-flag-tail-mutation.json' },
}
