import base from './eslint.config.mjs';
const runtime=['session','offline','execution','guard','child','replay'].map(name=>'tools/phase9d/broker-'+name+'.mjs');
const orchestration=['tools/phase9d/broker-*.mjs',
  'backend/tests/phase9dBroker.test.js','backend/tests/integration/phase9dBroker.test.js','backend/tests/integration/phase9dBrokerReplay.test.js','backend/tests/helpers/phase9dBrokerProcesses.js','backend/tests/helpers/phase9dBrokerMutations.js'];
export default [...base.map(config=>({...config,files:orchestration,rules:{...config.rules,complexity:'off'}})),...base.map(config=>({...config,files:runtime}))];
