import base from './eslint.config.mjs';
const runtime=['tools/phase9d/export-projection.mjs','tools/phase9d/export-repository.mjs','tools/phase9d/export-pump.mjs','tools/phase9d/export-core.mjs','tools/phase9d/export-child.mjs','tools/phase9d/outbox-replay.mjs'];
const orchestration=['tools/phase9d/outbox-run.mjs','tools/phase9d/outbox-quality.mjs','tools/phase9d/outbox-eslint.config.mjs','tools/phase9d/outbox-finalize.mjs',
  'tools/phase9d/outbox-whitespace.mjs',
  'tools/phase9d/outbox-stryker.config.mjs','tools/phase9d/outbox-focused-stryker.config.mjs','tools/phase9d/outbox-replay-stryker.config.mjs',
  'tools/phase9d/outbox-capsule-fixture.mjs','tools/phase9d/capsule.mjs','tools/phase9d/capsule-entry.mjs',
  'backend/tests/phase9dExport.test.js','backend/tests/helpers/phase9dExportFixture.js','backend/tests/helpers/phase9dOutboxMutations.js',
  'backend/tests/integration/phase9dOutbox.test.js','backend/tests/integration/phase9dOutboxReplay.test.js'];
export default [...base.map(config=>({...config,files:runtime})),...base.map(config=>({...config,files:orchestration,rules:{...config.rules,complexity:'off'}}))];
