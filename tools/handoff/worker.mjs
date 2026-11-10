import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { config } from './config.mjs';
import { atomicJson, readJson, lock, now } from './core.mjs';
import { Google } from './google.mjs';
import { Engine } from './engine.mjs';
import { checkpoint } from './codex.mjs';
import { viewerHandler } from './viewer-server.mjs';

const release = lock(path.join(config.runtime, 'worker.lock'));
const engine = new Engine(config, new Google(config));
if (engine.state.action.startsWith('Worker stopped')) engine.state.action = engine.state.bootstrap?.active ? `${engine.state.bootstrap.phase} remains owned by the current interactive session; duplicate dispatch suppressed` : 'Worker restarted; reconciling the saved phase';
engine.state.workerPid = process.pid; engine.heartbeat();
atomicJson(path.join(config.runtime, 'worker.json'), { pid: process.pid, startedAt: now() });
const server = http.createServer(viewerHandler(config, engine));
server.on('error', error => { console.error(`Viewer cannot start: ${error.code}`); engine.stopping = true; release(); process.exitCode = 1; });
server.listen(config.port, '127.0.0.1');
let ticking = false;
async function cycle() {
  if (ticking || engine.stopping) return; ticking = true;
  try {
    const commandFile = path.join(config.runtime, 'command.json');
    const command = readJson(commandFile, null);
    if (command) {
      fs.unlinkSync(commandFile);
      if (command.targetPid && command.targetPid !== process.pid) return;
      if (command.action === 'stop') { shutdown(); return; }
      if (command.action === 'publish-bootstrap') {
        if (!engine.state.bootstrap?.active) throw new Error('No bootstrap session registered');
        if (engine.state.run.stage === 'published') return;
        engine.state.run.stage = 'verifying'; engine.state.run.checkpoint = checkpoint(config.root); engine.save();
        await engine.finish(); return;
      }
      if (command.action === 'release-bootstrap') {
        if (engine.state.run?.stage !== 'published') throw new Error('Cannot release bootstrap before verified publication');
        engine.state.bootstrap.active = false; engine.save(); return;
      }
      if (command.action === 'resume') {
        engine.state.nextAttempt = null;
        await engine.tick({ force: true }); return;
      }
    }
    await engine.tick();
  } catch (error) { engine.set('FAILED', error.message); }
  finally { ticking = false; }
}
const heart = setInterval(() => engine.heartbeat(), 5000);
const poll = setInterval(cycle, config.pollMs);
const control = setInterval(() => { if (fs.existsSync(path.join(config.runtime, 'command.json'))) cycle(); }, 1000);
async function shutdown() {
  if (engine.stopping) return;
  engine.stopping = true;
  clearInterval(heart); clearInterval(poll); clearInterval(control);
  // Kill the tracked child process tree only; preserve checkpoint and thread for continuation.
  if (engine.state.run?.pid) {
    const { spawnSync } = await import('node:child_process');
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(engine.state.run.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    else try { process.kill(engine.state.run.pid, 'SIGTERM'); } catch {}
  }
  engine.state.action = 'Worker stopped; unfinished checkpoint retained'; engine.save();
  server.close(() => { release(); process.exit(0); });
}
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
cycle();
