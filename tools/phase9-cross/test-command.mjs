import { access, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { criticalTests, mutationGroups } from './scope.mjs';

const repository = process.env.RCS_PHASE9_REPOSITORY_ROOT;
if (repository) for (const surface of ['backend', 'frontend', 'driver-app']) {
  const dependencies = join(process.cwd(), surface, 'node_modules');
  try { await access(dependencies); }
  catch { await symlink(join(repository, surface, 'node_modules'), dependencies, 'junction'); }
}
const selected = process.argv[2];
if (selected && !Object.hasOwn(mutationGroups, selected)) throw new Error('Unknown critical mutation group');
const selectedTests = selected ? mutationGroups[selected].tests : criticalTests;
for (const captain of [false, true]) {
  const tests = selectedTests.filter(file => file.startsWith('driver-app/') === captain);
  if (!tests.length) continue;
  const code = await new Promise((done, fail) => {
    const child = spawn(process.execPath, ['--import', './backend/tests/helpers/phase9UnitIsolation.js',
      ...(captain ? [] : ['--import', './backend/node_modules/tsx/dist/loader.mjs']),
      '--test', '--test-concurrency=1', '--test-timeout=12000', ...tests], { windowsHide: true, stdio: 'inherit' });
    child.once('error', fail); child.once('close', done);
  });
  if (code !== 0) { process.exitCode = code ?? 1; break; }
}
