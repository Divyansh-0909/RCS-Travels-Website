import base from './eslint.config.mjs';
const runtime=['protocol','session','delivery','service'].map(n=>'tools/phase9d/custody-'+n+'.mjs');
const all=['tools/phase9d/custody-*.mjs','backend/tests/phase9dCustody.test.js','backend/tests/integration/phase9dCustody.test.js','backend/tests/helpers/phase9dCustodyFixture.js','backend/tests/helpers/phase9dCustodyFaultChild.js'];
export default [...base.map(c=>({...c,files:all,rules:{...c.rules,complexity:'off'}})),...base.map(c=>({...c,files:runtime}))];
