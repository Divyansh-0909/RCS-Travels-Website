import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { config } from './config.mjs';
import { launchCodex } from './codex.mjs';
import { atomicJson, now } from './core.mjs';
const directory = path.join(config.runtime, 'codex-smoke');
fs.mkdirSync(directory, { recursive: true });
execFileSync('git', ['init', '--quiet'], { cwd: directory, windowsHide: true });
const record = { at: now(), purpose: 'Single real Codex CLI/auth/event smoke; not a P01 agent', launches: 1, events: [] };
const { child, completion } = launchCodex({ ...config, root: directory }, {}, 'This is an isolated connection smoke test, not the RCS P01 phase. Do not call tools or modify any files. Reply exactly HANDOFF_SMOKE_OK.', event => {
  record.events.push(event); if (event.threadId) record.threadId = event.threadId;
});
const deadline = setTimeout(() => {
  record.timedOut = true;
  if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  else child.kill();
}, 120_000);
const outcome = await completion; clearTimeout(deadline);
record.outcome = outcome; record.verified = outcome.code === 0 && outcome.completed && !outcome.failure;
atomicJson(path.join(config.runtime, 'codex-smoke-verification.json'), record);
console.log(JSON.stringify(record, null, 2));
if (!record.verified) process.exitCode = 1;
