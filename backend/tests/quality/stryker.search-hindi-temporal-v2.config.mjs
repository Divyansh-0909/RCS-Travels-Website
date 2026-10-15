import base from './stryker.search-hindi-temporal.config.mjs';
export default { ...base,
  mutate: ['services/search/hindiTemporal.ts', 'services/search/hindiCalendar.ts',
    'services/search/observations.ts:57-57', 'services/search/observations.ts:88-89', 'services/search/observations.ts:116-116',
    'services/search/locations/requestPrefix.ts', 'services/search/locations/candidates.ts:51-52'],
  jsonReporter: { fileName: 'coverage/search-hindi-temporal-v2-mutation.json' },
};
