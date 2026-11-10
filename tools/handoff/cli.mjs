import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { config, runtime, root } from './config.mjs';
import { atomicJson, readJson, initialState, now, alive, readyPrompt, documentText, transition } from './core.mjs';
import { Google } from './google.mjs';
import { checkpoint } from './codex.mjs';

const [command = 'status', ...args] = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf('--' + name); return i < 0 ? fallback : args[i + 1]; };
const stateFile = path.join(runtime, 'state.json');
const workerRecord = () => readJson(path.join(runtime, 'worker.json'), null);
const isRunning = () => { const w = workerRecord(); return w && alive(w.pid); };
try {
  if (command === 'configure') {
    if (isRunning()) throw new Error('Stop the worker before changing configuration');
    const next = { ...readJson(path.join(runtime, 'config.json'), {}), googleAccount: option('account', config.googleAccount), gcloudPath: option('gcloud', config.gcloudPath), codexEntry: option('codex', config.codexEntry), previewUrl: option('preview', config.previewUrl) };
    if (!next.codexEntry || !fs.existsSync(next.codexEntry)) throw new Error('Supply --codex with the installed @openai/codex/bin/codex.js path');
    atomicJson(path.join(runtime, 'config.json'), next); console.log('Local configuration saved. Credentials remain in the Google/Codex profiles.');
  } else if (command === 'bootstrap') {
    if (isRunning()) throw new Error('Bootstrap registration requires the worker stopped');
    const google = new Google(config), doc = await google.document();
    const prompt = readyPrompt(documentText(doc));
    if (!prompt || prompt.phase !== 'P01') throw new Error('Expected the active P01 prompt');
    const state = readJson(stateFile, initialState());
    state.bootstrap = { active: true, threadId: process.env.CODEX_THREAD_ID || option('thread', null), registeredAt: now(), phase: 'P01', hash: prompt.hash };
    state.detectedPrompt = { phase: prompt.phase, version: prompt.version, hash: prompt.hash };
    state.lastProcessedRevision = doc.revisionId; state.connections.google = 'connected';
    state.checkpoint = checkpoint(root);
    fs.mkdirSync(runtime, { recursive: true }); fs.writeFileSync(path.join(runtime, 'P01-authoritative-prompt.md'), prompt.content);
    if (!state.run) {
      const id = 'bootstrap-' + (state.bootstrap.threadId || Date.now());
      const directory = path.join(runtime, 'runs', id);
      fs.mkdirSync(path.join(directory, 'artifacts'), { recursive: true });
      fs.writeFileSync(path.join(directory, 'prompt.md'), prompt.content);
      state.run = { id, directory, phase: prompt.phase, version: prompt.version, key: prompt.key, hash: prompt.hash, threadId: state.bootstrap.threadId, stage: 'running', startedAt: now(), checkpoint: state.checkpoint };
      state.phases[prompt.key] = { hash: prompt.hash, runId: id, status: 'CODEX_RUNNING' };
    } else if (state.run.id.startsWith('bootstrap-') && state.run.stage === 'running') {
      state.run.hash = prompt.hash; state.phases[prompt.key].hash = prompt.hash;
      fs.writeFileSync(path.join(state.run.directory, 'prompt.md'), prompt.content);
    }
    transition(state, 'CODEX_RUNNING', 'P01 registered to the current bootstrap session; no second P01 agent will launch');
    atomicJson(stateFile, state); console.log('P01 registered to the current session.');
  } else if (command === 'start') {
    if (isRunning()) { console.log(`Watcher already running, PID ${workerRecord().pid}`); }
    else {
      if (!config.codexEntry) throw new Error('Run configure first');
      fs.mkdirSync(runtime, { recursive: true });
      const log = fs.openSync(path.join(runtime, 'worker.log'), 'a');
      const child = spawn(process.execPath, [path.join(root, 'tools/handoff/worker.mjs')], { cwd: root, detached: true, windowsHide: true, stdio: ['ignore', log, log] });
      child.unref(); fs.closeSync(log); console.log(`Watcher starting, PID ${child.pid}. Viewer: http://127.0.0.1:${config.port}/`);
    }
  } else if (command === 'status') {
    const s = readJson(stateFile, initialState());
    console.log(JSON.stringify({ running: Boolean(isRunning()), state: s.state, action: s.action, heartbeat: s.heartbeat, lastPoll: s.lastPoll, phase: s.detectedPrompt?.phase, bootstrap: s.bootstrap?.active, runId: s.run?.id, threadId: s.run?.threadId, nextAttempt: s.nextAttempt, connections: s.connections, viewer: `http://127.0.0.1:${config.port}/` }, null, 2));
  } else if (command === 'stop' || command === 'resume' || command === 'publish-bootstrap' || command === 'release-bootstrap') {
    if (!isRunning()) throw new Error('Watcher is stopped; run start first');
    atomicJson(path.join(runtime, 'command.json'), { action: command, targetPid: workerRecord().pid, at: now() }); console.log(`${command} requested; worker will preserve its checkpoint.`);
  } else if (command === 'check') {
    const state = readJson(stateFile, null);
    if (!state?.run) throw new Error('No active run for a test checkpoint');
    const testCommand = option('command', ''), exitCode = Number(option('exit-code', 'NaN'));
    if (!testCommand || testCommand.length > 300 || !Number.isInteger(exitCode) || /Bearer|(?:TOKEN|PASSWORD|SECRET|API_KEY|DATABASE_URL)\s*=/i.test(testCommand)) throw new Error('Supply a bounded, non-secret test command and numeric exit code');
    const file = path.join(state.run.directory, 'checks.json');
    atomicJson(file, [...readJson(file, []), { command: testCommand, exitCode, scope: option('scope', ''), at: now() }].slice(-100));
    console.log('Test checkpoint recorded.');
  } else if (command === 'progress') {
    const file = path.join(runtime, 'progress.json'), prev = readJson(file, { recent: [] });
    const status = option('status', 'Investigating');
    if (!['Investigating', 'Editing', 'Testing', 'Fixed', 'Blocked', 'Awaiting Review'].includes(status)) throw new Error('Unknown progress status');
    const verified = option('verified', 'false') === 'true';
    const proof = option('evidence', '');
    if (status === 'Fixed' && (!verified || !proof)) throw new Error('Fixed requires --verified true and --evidence with functional/theme/responsive/regression test evidence');
    const entry = { screen: option('screen', prev.screen || 'Connection setup'), route: option('route', prev.route || '/'), issue: option('issue', prev.issue || ''), doing: option('doing', ''), status, updatedAt: now(), recent: prev.recent || [] };
    if (status === 'Fixed') entry.recent = [...entry.recent, { title: entry.issue, verified, evidence: proof, at: entry.updatedAt }].slice(-30);
    atomicJson(file, entry); console.log('Live work status updated.');
  } else if (command === 'probe') {
    const google = new Google(config);
    const folder = await google.metadata(config.folderId), doc = await google.document();
    console.log(JSON.stringify({ folderId: folder.id, canUpload: folder.capabilities?.canAddChildren, documentId: doc.documentId, active: readyPrompt(documentText(doc))?.key, revision: doc.revisionId, changeFeed: Boolean((await google.changes()).startPageToken) }, null, 2));
  } else throw new Error('Commands: configure, bootstrap, start, stop, status, resume, probe, progress, publish-bootstrap, release-bootstrap');
} catch (error) { console.error(error.message); process.exitCode = 1; }
