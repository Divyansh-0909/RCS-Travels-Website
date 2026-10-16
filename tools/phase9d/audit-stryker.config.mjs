export default {
  testRunner:'command',coverageAnalysis:'off',tsconfigFile:'backend/tests/quality/phase6b-no-tsconfig.json',
  commandRunner:{command:'node --test --test-concurrency=1 backend/tests/phase9dCustodyClosure.test.js backend/tests/phase9dCustodyClosureTransport.test.js backend/tests/phase9dCustodyObserver.test.js backend/tests/phase9dCustodyBoundary.test.js'},
  mutate:['keys','status','rotation','session','http','ingress','contract','observer','client'].map(name=>'tools/phase9d/closure-'+name+'.mjs'),
  ignorePatterns:['**/node_modules/**','**/.env','**/.env.*','.*','**/.*','output','docs','plugins','decisions','ds-bundle','legal-review','screenshots','search_assignment','temporary screenshots','test-results','tmp','backend/{coverage,uploads,rcs-rag}','frontend/{dist,public}','driver-app/{android,ios}','founder'],
  reporters:['clear-text','json'],jsonReporter:{fileName:'output/phase9d-custody-closure-cloud-2026-10-15/mutation-initial.json'},
  concurrency:2,timeoutMS:15000,timeoutFactor:2,cleanTempDir:false,
};
