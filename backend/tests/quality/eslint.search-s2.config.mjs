import js from '@eslint/js'
import globals from 'globals'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tsParser from '../../../frontend/node_modules/@typescript-eslint/parser/dist/index.js'
import tsPlugin from '../../../frontend/node_modules/@typescript-eslint/eslint-plugin/dist/index.js'

const backendRoot = fileURLToPath(new URL('../../', import.meta.url))
const toolDirectory = process.env.RCS_QUALITY_TOOLS_DIR || path.join(os.tmpdir(), 'rcs-phase1-quality-tools')
const requireQualityTool = createRequire(path.join(toolDirectory, 'package.json'))
const sonarjs = requireQualityTool('eslint-plugin-sonarjs')

export default [
  {
    files: ['services/search/**/*.ts'],
    languageOptions: {
      globals: globals.node,
      parser: tsParser,
      parserOptions: { project: './tsconfig.json', tsconfigRootDir: backendRoot },
    },
    plugins: { '@typescript-eslint': tsPlugin, sonarjs },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'error',
      complexity: ['error', { max: 21, variant: 'classic' }],
      'sonarjs/cognitive-complexity': ['error', 21],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-restricted-syntax': ['error', { selector: 'TSUnknownKeyword', message: 'Use a bounded runtime shape instead of unknown.' }],
    },
  },
  {
    files: ['lib/scheduling.js'],
    languageOptions: { globals: globals.node },
    plugins: { sonarjs },
    rules: {
      ...js.configs.recommended.rules,
      complexity: ['error', { max: 21, variant: 'classic' }],
      'sonarjs/cognitive-complexity': ['error', 21],
    },
  },
]
