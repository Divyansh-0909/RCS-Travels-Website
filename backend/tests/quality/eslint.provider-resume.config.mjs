import base from './eslint.provider-light.config.mjs'
import js from '@eslint/js'
import globals from 'globals'

export default [...base, {
  files: ['benchmarks/search/providerStages.js', 'scripts/search-separated-development-resume.mjs',
    'scripts/audit-separated-development.mjs', 'scripts/prepare-responsibility-luna-consistency.mjs',
    'tests/searchProviderStages.test.js', 'tests/separatedDevelopmentAudit.test.js'],
  languageOptions: { globals: globals.node },
  rules: { ...js.configs.recommended.rules, complexity: ['error', 21] },
}]
