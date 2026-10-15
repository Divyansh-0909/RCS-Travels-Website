import assert from 'node:assert/strict';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import { resolve, sep, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateUiReproduction } from './ui-reproduction.mjs';
import { phase9UiSourceHashes } from '../../backend/tests/helpers/phase9UiSources.js';

// Only validator-approved recipes may launch. Captured request/provider content
// is diagnostic data and is never interpreted as a command or credential.
const repository = await realpath(fileURLToPath(new URL('../../', import.meta.url)));
const owned = await realpath(resolve(repository, 'output/phase9c-adversarial-2026-10-11'));
const file = await realpath(resolve(process.argv[2] ?? ''));
assert.ok(file.startsWith(owned + sep) && file.endsWith(sep + 'reproduction.json'), 'Expected an owned reproduction artifact');
const artifact = validateUiReproduction(JSON.parse(await readFile(file, 'utf8')));
const currentSources = await phase9UiSourceHashes(['backend/tests/run-phase9-cross.js',
  'backend/tests/e2e/phase9AdversarialNative.mjs', 'backend/tests/e2e/phase9AdversarialBrowser.mjs',
  'backend/tests/e2e/phase9NativeAppeal.mjs', 'backend/tests/e2e/phase9NativeCompetition.mjs',
  'backend/tests/e2e/phase9NativeTerminal.mjs', 'backend/tests/e2e/phase9NativePermissions.mjs',
  'backend/tests/e2e/phase9NativeOfferRecovery.mjs', 'backend/tests/e2e/phase9NativeSession.mjs',
  'backend/tests/e2e/phase9UiBackendReproduction.mjs',
  'backend/tests/helpers/phase9NativeGateway.js']);
const backendOnly = process.argv.includes('--backend-only');
if (backendOnly && !artifact.backend) throw new Error('This captured recipe has no implemented backend-only event reproduction');
const invocations = backendOnly ? [['backend/tests/run-phase9-cross.js', '--reproduce-backend=' + file]]
  : [...(artifact.backend ? [['backend/tests/run-phase9-cross.js', '--reproduce-backend=' + file]] : []), artifact.invocation.slice(1)];
const result = { schema: 'phase9c-ui-reproduction-execution-v1', artifactIntegrity: JSON.parse(await readFile(file, 'utf8')).integrity,
  executedSources: currentSources,
  recipe: artifact.recipe, startedAt: new Date().toISOString(), invocations: [],
  sourceDifferences: Object.entries(artifact.sources ?? {}).filter(([file, hash]) => currentSources[file] !== hash)
    .map(([file, hash]) => ({ file, original: hash, current: currentSources[file] ?? null })),
  boundary: 'Backend event ordering where implemented, followed by the fixed current UI recipe. Original source hashes remain in the artifact; matching OS/UI timing and old bytecode are not claimed.' };
try {
  for (const args of invocations) {
    const exitCode = await new Promise((done, fail) => {
      const child = spawn(process.execPath, args, { cwd: repository, windowsHide: true, stdio: 'inherit' });
      child.once('error', fail); child.once('close', done);
    });
    result.invocations.push({ args, exitCode });
    if (exitCode !== 0) { process.exitCode = exitCode ?? 1; break; }
  }
} finally {
  result.finishedAt = new Date().toISOString();
  await writeFile(resolve(dirname(file), 'reproduction-execution-' + Date.now() + '.json'), JSON.stringify(result, null, 2));
}
