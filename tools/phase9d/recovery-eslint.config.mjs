import base from './eslint.config.mjs';
const runtime=['session','receipt','operations'].map(name=>'tools/phase9d/recovery-'+name+'.mjs');
const orchestration=['tools/phase9d/recovery-*.mjs',
  'backend/tests/phase9dRecovery.test.js','backend/tests/integration/phase9dRecovery.test.js','backend/tests/integration/phase9dRecoveryReplay.test.js','backend/tests/integration/phase9dRecoveryClosure.test.js','backend/tests/integration/phase9dRecoveryToken.test.js','backend/tests/helpers/phase9dRecoveryFixture.js','backend/tests/helpers/phase9dRecoveryActions.js','backend/tests/helpers/phase9dRecoveryActionChild.js','backend/tests/helpers/phase9dBrokerMutations.js'];
export default [...base.map(config=>({...config,files:orchestration,rules:{...config.rules,complexity:'off'}})),...base.map(config=>({...config,files:runtime}))];
