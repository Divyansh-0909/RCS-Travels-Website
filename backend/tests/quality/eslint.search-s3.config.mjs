import base from './eslint.search-s2.config.mjs';
import js from '@eslint/js';
import globals from 'globals';
const searchRules = base.find(config => config.files?.includes('services/search/**/*.ts'));
export default [...base, { ...searchRules, files: ['scripts/search-s3-review.ts'] }, {
  files: ['routes/googleAPI.js'], languageOptions: { globals: globals.node },
  rules: { ...js.configs.recommended.rules, 'no-unused-vars': ['error', { caughtErrors: 'none' }], complexity: ['error', 21] },
}];
