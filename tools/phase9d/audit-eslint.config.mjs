import base from './eslint.config.mjs';
const files=['tools/phase9d/closure-*.mjs','tools/phase9d/audit-*.mjs','backend/tests/integration/phase9dCustody{Closure,Lineage,Safety,Sql,Replay}.test.js','backend/tests/phase9dCustodyBoundary.test.js','backend/tests/helpers/phase9dCustody{ClosureFixture,LineageFixture,ReplayFixture}.js','backend/tests/helpers/phase9dCustodyReplaySender.mjs','backend/tests/helpers/phase9dTransportProcesses.js'];
const runtime=['keys','status','rotation','session','http','ingress','contract','observer','client'].map(name=>'tools/phase9d/closure-'+name+'.mjs');
export default [...base.map(config=>({...config,files,rules:{...config.rules,complexity:'off'}})),...base.map(config=>({...config,files:runtime}))];
