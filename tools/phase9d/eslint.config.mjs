import { createRequire } from 'node:module';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const require=createRequire(join(tmpdir(),'rcs-phase1-quality-tools/package.json'));
const js=require('@eslint/js'),globals=require('globals');
export default [{files:['tools/phase9d/*.mjs','backend/tests/phase9dReadiness.test.js','backend/tests/phase9dWorker.test.js','backend/tests/integration/phase9dReadiness.test.js'],languageOptions:{globals:globals.node},rules:{...js.configs.recommended.rules,complexity:['error',21],'no-unused-vars':['error',{argsIgnorePattern:'^_'}]}}];
