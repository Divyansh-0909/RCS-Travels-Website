import base from './continuation-stryker.config.mjs';
export default { ...base,
  mutate: ['tools/phase9d/worker-core.mjs', 'tools/phase9d/worker.mjs'],
  jsonReporter: { fileName: 'output/phase9d-1-continuation-2026-10-13/mutation-worker-focused.json' },
};
