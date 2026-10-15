import base from './outbox-stryker.config.mjs';
export default {...base,mutate:['tools/phase9d/export-core.mjs','tools/phase9d/export-projection.mjs','tools/phase9d/export-pump.mjs','tools/phase9d/outbox-replay.mjs'],
  jsonReporter:{fileName:'output/phase9d-outbox-broker-2026-10-13/mutation-outbox-round2.json'}};
