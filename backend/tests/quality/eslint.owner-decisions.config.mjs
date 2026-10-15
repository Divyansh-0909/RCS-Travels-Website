import base from './eslint.search-s2.config.mjs';
import js from '@eslint/js';
import globals from 'globals';
export default [...base,{files:['benchmarks/search/family*.js','benchmarks/search/toolAudit.js','benchmarks/search/freeze.js','benchmarks/common/providerAvailability.js','benchmarks/responsibility/evidenceCriteriaV*.js'],languageOptions:{globals:globals.node},rules:{...js.configs.recommended.rules,complexity:['error',21]}}];
