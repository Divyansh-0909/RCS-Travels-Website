import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { replaceCheckpoint } from '../atomic-replace.mjs';

function files(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rcs-atomic-retry-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const previous = path.join(directory, 'state.json'), next = path.join(directory, 'next.tmp');
  fs.writeFileSync(previous, '{"phase":"P03","approval":true}');
  fs.writeFileSync(next, '{"phase":"P03","approval":true,"heartbeat":2}');
  return { previous, next };
}

test('transient Windows replacement failures preserve the old checkpoint until a complete rename', t => {
  const { previous, next } = files(t); let attempts = 0; const waits = [];
  replaceCheckpoint(next, previous, { wait: ms => waits.push(ms), rename: (source, destination) => {
    if (attempts++ < 3) {
      assert.deepEqual(JSON.parse(fs.readFileSync(destination)), { phase: 'P03', approval: true });
      throw Object.assign(new Error('Temporary Windows file lock'), { code: 'EPERM' });
    }
    fs.renameSync(source, destination);
  } });
  assert.equal(attempts, 4); assert.deepEqual(waits, [20, 40, 80]);
  assert.deepEqual(JSON.parse(fs.readFileSync(previous)), { phase: 'P03', approval: true, heartbeat: 2 });
});

test('persistent and non-transient errors remain bounded and leave the checkpoint unchanged', t => {
  const { previous, next } = files(t);
  for (const [code, count] of [['EPERM', 9], ['ENOSPC', 1]]) {
    let attempts = 0;
    assert.throws(() => replaceCheckpoint(next, previous, { wait: () => {}, rename: () => {
      attempts++; throw Object.assign(new Error('Fixture failure'), { code });
    } }), error => error.code === code);
    assert.equal(attempts, count);
    assert.deepEqual(JSON.parse(fs.readFileSync(previous)), { phase: 'P03', approval: true });
    assert.ok(fs.existsSync(next));
  }
});
