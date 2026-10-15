import js from '@eslint/js'
import globals from 'globals'

export default [{
  files: ['scripts/*provider-light*.mjs', 'scripts/provider-resume-manifest.mjs', 'scripts/search-s6-verifier-package.mjs', 'tests/providerLightDevelopmentDiagnostics.test.js'],
  languageOptions: { globals: globals.node },
  rules: { ...js.configs.recommended.rules, complexity: ['error', 21] },
}]
