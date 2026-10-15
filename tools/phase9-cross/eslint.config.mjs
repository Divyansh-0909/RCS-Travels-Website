import { createRequire } from 'node:module';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { criticalFiles } from './scope.mjs';
const require = createRequire(join(tmpdir(), 'rcs-phase1-quality-tools/package.json'));
const js = require('@eslint/js'), globals = require('globals');
export default [{ files: criticalFiles.filter(file => !file.endsWith('.ts')),
  languageOptions: { globals: { ...globals.node, ...globals.browser } },
  rules: { ...js.configs.recommended.rules, complexity: ['error', 21],
    'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }] } }];
