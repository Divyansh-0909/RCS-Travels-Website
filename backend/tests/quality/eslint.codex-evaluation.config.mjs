import js from '@eslint/js'
import globals from 'globals'

export default [{
  files: ['benchmarks/codex/*.js', 'scripts/*codex*.mjs', 'tests/codex*.test.js', 'tests/helpers/codexFixtures.js'],
  languageOptions: { globals: globals.node },
  rules: { ...js.configs.recommended.rules, complexity: ['error', 21] },
}]
