import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
for (const flag of ['--replay', '--replay=', '--replay=synthetic.json']) {
  test('cross-application CLI refuses unsupported saved UI replay before database setup: ' + flag, async () => {
    const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'ComSpec']
      .filter(key => process.env[key]).map(key => [key, process.env[key]]));
    await assert.rejects(execute(process.execPath, ['backend/tests/run-phase9-cross.js', flag], {
      cwd: new URL('../../', import.meta.url), windowsHide: true, timeout: 10000, env,
    }), error => {
      assert.equal(error.code, 1); assert.equal(error.killed, false);
      assert.match(error.stderr, /Exact saved-input cross-application UI replay is not implemented/);
      assert.equal(error.stdout, ''); return true;
    });
  });
}
for (const args of [[], ['--adversarial-browser'], ['--adversarial-native', '--adversarial-appeal'],
  ['--adversarial-native', '--reproduce-backend=synthetic.json']]) {
  test('controlled UI failure capture rejects unrelated recipes before database setup: ' + args.join(' '), async () => {
    await assert.rejects(execute(process.execPath, ['backend/tests/run-phase9-cross.js', '--capture-ui-failure', ...args], {
      cwd: new URL('../../', import.meta.url), windowsHide: true, timeout: 10000,
    }), error => {
      assert.equal(error.code, 1); assert.equal(error.killed, false);
      assert.match(error.stderr, /Controlled UI failure capture requires the isolated native race recipe only/);
      assert.equal(error.stdout, ''); return true;
    });
  });
}
