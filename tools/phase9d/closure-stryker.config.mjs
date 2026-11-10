import {closureCoreScope} from './closure-scope.mjs';
import {join} from 'node:path';
const output=process.env.CUSTODY_OUTPUT??'output/phase9d-custody-local-2026-10-17';
const execution=process.env.CUSTODY_MUTATION_ID??String(Date.now());
const selected=process.env.CUSTODY_MUTATION_FILE;
if(selected&&!closureCoreScope.includes(selected))throw Error('Unsupported mutation scope');
const patterns={
  keys:'historical keys|durable signer|signer refuses',
  status:'read-only status|source inspection|independent status|lineage status',
  contract:'closed.*frames|closed.*contracts|lineage action|authentication actor',
  http:'bounded ingress HTTP|completed-body handler deadline',
  ingress:'rotation-aware ingress|real ingress child|ingress crash hooks|requested ingress kill',
  session:'database admission|capsule principal|PostgreSQL identity',
  rotation:'rotation validates',
  observer:'server JSON|observer spool|server observation',
  'denial-contract':'server JSON|observer spool|server observation|closed action|authentication actor',
  client:'capsule HTTP client',
};
const moduleName=selected?.slice('tools/phase9d/closure-'.length,-'.mjs'.length);
const selection=selected?' --test-name-pattern="'+patterns[moduleName]+'"':'';
export default {
  testRunner:'command',coverageAnalysis:'off',tsconfigFile:'backend/tests/quality/phase6b-no-tsconfig.json',
  commandRunner:{command:'node --max-old-space-size=384 --test --test-concurrency=1'+selection+' backend/tests/phase9dCustodyClosure.test.js backend/tests/phase9dCustodyClosureTransport.test.js backend/tests/phase9dCustodyObserver.test.js backend/tests/phase9dCustodyBoundary.test.js backend/tests/phase9dCustodyAdversarial.test.js backend/tests/phase9dCustodyReplayInput.test.js'},
  mutate:selected?[selected]:closureCoreScope,
  ignorePatterns:['**/node_modules/**','**/.env','**/.env.*','.*','**/.*','output','docs','plugins','decisions','ds-bundle','legal-review','screenshots','search_assignment','temporary screenshots','test-results','tmp','backend/{coverage,uploads,rcs-rag}','frontend/{dist,public}','driver-app/{android,ios}','founder'],
  reporters:['clear-text','json'],jsonReporter:{fileName:join(output,'mutation-core-'+execution+'.json')},
  concurrency:1,timeoutMS:12000,timeoutFactor:2,cleanTempDir:false,
};
