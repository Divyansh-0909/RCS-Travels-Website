export default {
  testRunner:'command',coverageAnalysis:'off',tsconfigFile:'backend/tests/quality/phase6b-no-tsconfig.json',
  commandRunner:{command:'node --test --test-concurrency=1 backend/tests/phase9dExport.test.js'},
  mutate:['tools/phase9d/export-projection.mjs','tools/phase9d/export-repository.mjs','tools/phase9d/export-pump.mjs','tools/phase9d/export-core.mjs','tools/phase9d/export-child.mjs'],
  ignorePatterns:['**/node_modules/**','**/.env','**/.env.*','.*','**/.*','output','docs','plugins','decisions','ds-bundle','legal-review','screenshots','search_assignment','temporary screenshots','test-results','tmp','backend/{coverage,uploads,rcs-rag}','frontend/{dist,public}','driver-app/{android,ios}','founder'],
  reporters:['clear-text','json'],jsonReporter:{fileName:'output/phase9d-outbox-broker-2026-10-13/mutation-outbox.json'},
  concurrency:2,timeoutMS:12000,timeoutFactor:2,cleanTempDir:false,
};
