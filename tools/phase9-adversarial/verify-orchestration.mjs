import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const require = createRequire(join(tmpdir(), 'rcs-phase1-quality-tools/package.json'));
const { ESLint } = require('eslint'), js = require('@eslint/js'), globals = require('globals');
const files = ['tools/phase9-cross/run-live-clerk-revocation.mjs', 'backend/tests/e2e/phase9LiveClerkReadOnly.mjs',
  'tools/phase9-cross/reproduce-ui-failure.mjs', 'backend/tests/e2e/phase9UiBackendReproduction.mjs',
  'tools/phase9-adversarial/verify-reproduction-retention.mjs', 'tools/phase9-adversarial/verify-orchestration.mjs',
  'tools/phase9-adversarial/build-execution-manifest.mjs'];
const eslint = new ESLint({ overrideConfigFile: true, overrideConfig: [{ files: ['**/*.mjs'],
  languageOptions: { globals: { ...globals.node, ...globals.browser } },
  rules: { ...js.configs.recommended.rules, 'no-empty': ['error', { allowEmptyCatch: true }],
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }] } }] });
const results = await eslint.lintFiles(files);
const formatter = await eslint.loadFormatter('stylish');
const log = formatter.format(results);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const errors = results.reduce((sum, row) => sum + row.errorCount, 0);
const sources = Object.fromEntries(await Promise.all(files.map(async file => [file, hash(await readFile(file))])));
await writeFile('output/phase9c-adversarial-2026-10-11/orchestration-lint.log', log);
await writeFile('output/phase9c-adversarial-2026-10-11/orchestration-lint.json', JSON.stringify({
  status: errors === 0 ? 'PASS' : 'FAILED', errors, sources, logSha256: hash(log),
  boundary: 'ESLint recommended rules for seven test-orchestration sources; not a coverage or structural-quality certification.',
}, null, 2));
console.log(log); assert.equal(errors, 0);
