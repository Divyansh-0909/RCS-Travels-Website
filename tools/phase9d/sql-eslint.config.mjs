import base from './eslint.config.mjs';
export default base.map(config=>({...config,files:[
  'tools/phase9d/next-run.mjs','tools/phase9d/sql-finalize.mjs','tools/phase9d/sql-eslint.config.mjs',
  'backend/tests/helpers/phase9dCurrentPolicyWitness.js','backend/tests/helpers/phase9dSqlMutations.js',
  'backend/tests/integration/phase5DeferredPostgisValidation.test.js',
  'backend/tests/integration/phase7ShadowAdjudicationPostgres.test.js',
  'backend/tests/integration/phase9dSqlCertification.test.js',
],rules:{...config.rules,complexity:'off'}}));
// These are regression/fixture orchestrators. Critical runtime complexity
// remains certified separately over the four unchanged worker modules.
