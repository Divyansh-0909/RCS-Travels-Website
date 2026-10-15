import base from './stryker.search-hindi-temporal-v2.config.mjs';
export default { ...base, concurrency: 2, timeoutMS: 5000,
  jsonReporter: { fileName: 'coverage/search-hindi-temporal-casefold-mutation.json' } };
