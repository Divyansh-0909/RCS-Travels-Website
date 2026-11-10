import js from '@eslint/js';
import globals from 'globals';
import parser from '../../../frontend/node_modules/@typescript-eslint/parser/dist/index.js';
import plugin from '../../../frontend/node_modules/@typescript-eslint/eslint-plugin/dist/index.js';

export default [{
  files: ['services/search/**/*.ts'],
  languageOptions: { parser, globals: globals.node },
  plugins: { '@typescript-eslint': plugin },
  rules: { ...js.configs.recommended.rules, 'no-unused-vars': 'off', '@typescript-eslint/no-unused-vars': 'error',
    '@typescript-eslint/no-explicit-any': 'error', complexity: ['error', 21] },
}, {
  files: ['**/*.js', '**/*.mjs'], languageOptions: { globals: globals.node },
  rules: { ...js.configs.recommended.rules, complexity: ['error', 21] },
}];
