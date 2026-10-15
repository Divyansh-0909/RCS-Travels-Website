export default {
  testRunner:'command',coverageAnalysis:'off',tsconfigFile:'backend/tests/quality/phase6b-no-tsconfig.json',
  commandRunner:{command:'node --test --test-concurrency=1 backend/tests/phase9dBroker.test.js'},
  mutate:['session','offline','execution','guard','child','replay'].map(name=>'tools/phase9d/broker-'+name+'.mjs'),
  ignorePatterns:['**/node_modules/**','**/.env','**/.env.*','.*','**/.*','output','docs','plugins','decisions','ds-bundle','legal-review','screenshots','search_assignment','temporary screenshots','test-results','tmp','backend/{coverage,uploads,rcs-rag}','frontend/{dist,public}','driver-app/{android,ios}','founder'],
  reporters:['clear-text','json'],jsonReporter:{fileName:'output/phase9d-broker-2026-10-13/mutation-broker.json'},
  concurrency:2,timeoutMS:12000,timeoutFactor:2,cleanTempDir:false,
};
