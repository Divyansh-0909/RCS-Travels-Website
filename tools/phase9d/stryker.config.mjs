export default {
  testRunner:'command',coverageAnalysis:'off',tsconfigFile:'backend/tests/quality/phase6b-no-tsconfig.json',
  commandRunner:{command:'node --test --test-reporter=tap backend/tests/phase9dReadiness.test.js'},
  mutate:['tools/phase9d/privacy.mjs','tools/phase9d/repository.mjs'],
  ignorePatterns:['**/node_modules/**','**/.env','**/.env.*','.*','**/.*','output','docs','plugins','decisions','ds-bundle','legal-review','screenshots','search_assignment','temporary screenshots','test-results','tmp','backend/{coverage,uploads,rcs-rag}','frontend/{dist,public}','driver-app/{android,assets}'],
  reporters:['clear-text','json'],jsonReporter:{fileName:'output/phase9d-1-2026-10-12/mutation-final.json'},
  concurrency:2,timeoutMS:12000,timeoutFactor:2,cleanTempDir:false
};
