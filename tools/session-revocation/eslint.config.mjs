import { createRequire } from 'node:module';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const require = createRequire(join(tmpdir(), 'rcs-phase1-quality-tools/package.json'));
const js = require('@eslint/js'), globals = require('globals');
export default [{ files: ['backend/middleware/{auth,liveSession}.js', 'shared/auth/*.mjs', 'tools/session-revocation/*.mjs',
  'backend/tests/liveSession*.test.js', 'backend/tests/authMiddleware.test.js', 'backend/tests/sessionLogout.test.js', 'backend/tests/helpers/liveSessionFake.js',
  'backend/tests/integration/phase9SessionRevocation.test.js'],
  languageOptions: { globals: { ...globals.node, ...globals.browser } },
  rules: { ...js.configs.recommended.rules, complexity: ['error', 21],
    'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }] } }];
