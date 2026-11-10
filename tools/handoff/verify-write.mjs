import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import { config } from './config.mjs';
import { launchCodex } from './codex.mjs';
import { atomicJson, readJson, now } from './core.mjs';

const resuming = process.argv.includes('--resume-readonly');
const previous = resuming ? readJson(path.join(config.runtime, 'codex-smoke-verification.json')) : null;
if (resuming && !previous?.threadId) throw Error('Expected the prior read-only smoke thread');
const directory = path.join(config.runtime, resuming ? 'codex-smoke' : 'codex-write-smoke');
fs.mkdirSync(directory, { recursive: true });
execFileSync('git', ['init', '--quiet'], { cwd: directory, windowsHide: true });
const name = resuming ? 'resume-write-probe.txt' : 'write-probe.txt';
const target = path.join(directory, name);
fs.rmSync(target, { force: true });
const proof = { at: now(), purpose: 'Real workspace write and loopback probe in an isolated Git fixture; no RCS phase execution', resumingReadOnlyThread: resuming, threadId: previous?.threadId, loopbackRequests: 0, events: [] };
const server = http.createServer((req, res) => { if (req.url !== '/probe') { res.writeHead(404).end(); return; } proof.loopbackRequests++; res.end('HANDOFF_WRITE_OK'); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/probe`;
const { child, completion } = launchCodex({ ...config, root: directory }, previous ? { threadId: previous.threadId } : {},
  `This is a bounded executor-permission smoke test, not an RCS phase. Use a local tool to GET ${url} and create ${name} in the current directory containing the exact response HANDOFF_WRITE_OK. Do not inspect or edit anything outside this fixture and do not access any other network address. Then stop. A reply alone is not proof: the HTTP request and file must actually exist.`,
  event => { proof.events.push(event); if (event.threadId) proof.threadId = event.threadId; });
const timeout = setTimeout(() => {
  proof.timedOut = true;
  if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  else child.kill();
}, 120000);
try {
  proof.outcome = await completion;
  proof.actualFileWrite = fs.existsSync(target) && fs.readFileSync(target, 'utf8').trim() === 'HANDOFF_WRITE_OK';
  proof.verified = proof.actualFileWrite && proof.loopbackRequests > 0 && proof.outcome.completed && !proof.outcome.failure;
  atomicJson(path.join(config.runtime, resuming ? 'codex-resume-write-verification.json' : 'codex-write-verification.json'), proof);
  console.log(JSON.stringify({ threadId: proof.threadId, actualFileWrite: proof.actualFileWrite, loopbackRequests: proof.loopbackRequests, verified: proof.verified }));
  if (!proof.verified) process.exitCode = 1;
} finally { clearTimeout(timeout); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
