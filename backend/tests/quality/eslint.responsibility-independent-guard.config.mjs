import js from '@eslint/js'
import globals from 'globals'
export default [{
  files: ['services/responsibilityEvidenceSafety.js', 'services/responsibilityPolicyGate.js', 'benchmarks/responsibility/benchmark.js',
    'tests/responsibilityIndependentGuard.test.js'],
  languageOptions: { globals: globals.node },
  rules: { ...js.configs.recommended.rules, complexity: ['error', 21] },
}]
