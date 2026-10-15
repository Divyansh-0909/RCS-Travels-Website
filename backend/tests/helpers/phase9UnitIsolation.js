// Preload before any application import, including mutation-test imports.
import { fileURLToPath } from 'node:url'
import { installPhase9NetworkFence } from './phase9Isolation.js'

const keep = new Set(['PATH', 'SystemRoot', 'WINDIR', 'USERPROFILE', 'TEMP', 'TMP', 'LOCALAPPDATA', 'APPDATA',
  'ComSpec', 'NODE_V8_COVERAGE', 'NODE_TEST_CONTEXT', '__STRYKER_ACTIVE_MUTANT__', 'RCS_PHASE9_REPOSITORY_ROOT'])
for (const key of Object.keys(process.env)) if (!keep.has(key)) delete process.env[key]
process.env.NODE_ENV = 'test'
process.env.PHASE9_ISOLATED = '1'
process.env.DATABASE_URL = 'postgresql://denied:denied@127.0.0.1:1/phase9_forbidden'
process.env.DIRECT_URL = process.env.DATABASE_URL
process.env.DOTENV_CONFIG_PATH = fileURLToPath(new URL('./phase9-empty.env', import.meta.url))
process.env.TEST_DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/phase9_unit_test'
installPhase9NetworkFence(process.env)
