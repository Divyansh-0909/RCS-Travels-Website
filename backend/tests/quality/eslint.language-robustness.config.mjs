import base from './eslint.provider-resume.config.mjs'
import js from '@eslint/js'
import globals from 'globals'

export default [...base, {
  files: ['scripts/freeze-search-language-robustness.mjs', 'tests/searchLanguageRobustness.test.js'],
  languageOptions: { globals: globals.node },
  rules: { ...js.configs.recommended.rules, complexity: ['error', 21] },
}]
