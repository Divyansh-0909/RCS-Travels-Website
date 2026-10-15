import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { join } from 'node:path';

const root = 'output/phase9c-adversarial-2026-10-11';
const proof = JSON.parse(await readFile(join(root, 'reproduction-resume-3-proof.json')));
assert.equal(proof.status, 'PASS');
assert.match(proof.failure.run, /^race-\d+-[a-f0-9-]+$/);
const directory = join(root, proof.failure.run);
const artifact = join(directory, 'reproduction.json');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const before = {};
for (const name of await readdir(directory)) {
  if (name === 'reproduction.json' || /^backend-.*\.json$/.test(name)) before[name] = sha(await readFile(join(directory, name)));
}
for (const name of ['captured-ui-backend-input.json', 'captured-ui-backend-result.json']) {
  try { before['root/' + name] = sha(await readFile(join(root, name))); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const report = { schema: 'phase9c-reproduction-retention-regression-v1', status: 'RUNNING', invocations: [], before };
try {
  for (let index = 0; index < 2; index++) {
    const args = ['tools/phase9-cross/reproduce-ui-failure.mjs', artifact, '--backend-only'];
    const exitCode = await new Promise((done, fail) => {
      const child = spawn(process.execPath, args, { windowsHide: true, stdio: 'inherit' });
      child.once('error', fail); child.once('close', done);
    });
    report.invocations.push({ args, exitCode }); assert.equal(exitCode, 0);
  }
  for (const [name, expected] of Object.entries(before)) {
    const path = name.startsWith('root/') ? join(root, name.slice(5)) : join(directory, name);
    assert.equal(sha(await readFile(path)), expected, 'Prior report changed: ' + name);
  }
  const indexes = (await readdir(directory)).filter(name => /^backend-.*-index\.json$/.test(name) && !Object.hasOwn(before, name));
  assert.equal(indexes.length, 2);
  report.newReports = [];
  for (const name of indexes) {
    const index = JSON.parse(await readFile(join(directory, name)));
    for (const field of ['input', 'result']) {
      assert.match(index[field], /^backend-\d+-[a-f0-9-]+-(?:input|result)\.json$/);
      assert.equal(sha(await readFile(join(directory, index[field]))), index[field + 'Sha256']);
    }
    report.newReports.push({ path: join(directory, name), sha256: sha(await readFile(join(directory, name))), ...index });
  }
  report.status = 'PASS';
} catch (error) { report.status = 'FAILED'; report.error = error.message; process.exitCode = 1; }
report.finishedAt = new Date().toISOString();
await writeFile(join(root, 'reproduction-retention-regression.json'), JSON.stringify(report, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ status: report.status, newReports: report.newReports?.length }));
