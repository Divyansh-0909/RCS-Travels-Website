import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { atomicJson, readJson, initialState, transition, now, documentText, readyPrompt, disposition, classifyError, usageRetry, alive, hash } from './core.mjs';
import { checkpoint, launchCodex, taskInstructions } from './codex.mjs';

export const P01_FILES = ['P01-execution-report.md', 'P01-screen-theme-registry.csv', 'P01-component-audit.md', 'P01-ux-flow-audit.md', 'P01-visual-baselines.md', 'P01-test-matrix.md', 'P01-pilot-report.md', 'P01-rollout-plan.md', 'P01-connection-setup-report.md', 'P01-automation-verification.md', 'P01-live-viewer-instructions.md'];
export function validateResult(run) {
  const result = readJson(path.join(run.directory, 'result.json'), null);
  if (!result || !['complete', 'blocked', 'approval_required'].includes(result.status)) throw new Error('No valid completed result/checkpoint from Codex');
  if (result.status !== 'complete') return { result, files: [] };
  if (result.verified !== true || !result.tests?.length || result.tests.some(t => !t.command || t.exitCode !== 0)) throw new Error('Incomplete or failing verification cannot be published as OUTPUT_READY');
  const required = run.phase === 'P01' ? P01_FILES : run.requiredArtifacts;
  if (!required?.length) throw new Error('No required artifact contract');
  if (required.some(name => !result.artifacts?.includes(name))) throw new Error('Required phase artifacts missing');
  const dir = fs.realpathSync(path.join(run.directory, 'artifacts'));
  const files = result.artifacts.map(name => {
    if (path.basename(name) !== name || !/\.(md|csv|json|png|jpg|jpeg|webp|webm|pdf)$/i.test(name)) throw new Error('Artifact filename/type rejected');
    const file = fs.realpathSync(path.join(dir, name));
    if (path.dirname(file) !== dir) throw new Error('Artifact escapes the evidence directory');
    const bytes = fs.readFileSync(file);
    if (bytes.length > 30 * 1024 * 1024) throw new Error('Artifact exceeds local upload size bound');
    if (/\.(md|csv|json)$/i.test(name) && /-----BEGIN (?:\w+ )?PRIVATE KEY-----|(?:access_token|refresh_token|client_secret|OPENAI_API_KEY|DATABASE_URL)\s*["']?\s*[:=]\s*["']?[^\s"'<>]{12,}|Bearer\s+[a-zA-Z0-9._-]{20,}/i.test(bytes.toString())) throw new Error('Potential credential in artifact; upload stopped');
    return file;
  });
  return { result, files };
}
const mime = name => ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.webm': 'video/webm', '.pdf': 'application/pdf', '.csv': 'text/csv', '.json': 'application/json' })[path.extname(name)] || 'text/markdown';

export class Engine {
  constructor(config, google, launcher = launchCodex) {
    this.config = config; this.google = google; this.launcher = launcher;
    this.file = path.join(config.runtime, 'state.json'); this.state = readJson(this.file, initialState());
    this.task = null; this.stopping = false;
  }
  save() { atomicJson(this.file, this.state); }
  set(status, action, extra) { transition(this.state, status, action, extra); this.save(); }
  heartbeat() { this.state.heartbeat = now(); this.state.workerPid = process.pid; this.save(); }
  async tick({ force = false } = {}) {
    if (this.stopping || this.task) return;
    const s = this.state, run = s.run;
    if (s.nextAttempt && Date.parse(s.nextAttempt) > Date.now() && !force) return;
    if (s.state === 'PAUSED_USAGE_LIMIT' && !s.nextAttempt && !force) return;
    let readingGoogle = true;
    try {
      // Read metadata every minute as reconciliation: public-link docs may not appear in every account's changes feed.
      const meta = await this.google.metadata(this.config.documentId);
      const changes = await this.google.changes(s.changeCursor).catch(e => {
        if (e.httpStatus === 410) return { resetCursor: true };
        throw e;
      });
      s.changeCursor = changes.nextPageToken || changes.newStartPageToken || changes.startPageToken || (changes.resetCursor ? null : s.changeCursor);
      s.relevantChanges = (changes.changes || []).filter(c => c.fileId === this.config.documentId || c.fileId === this.config.folderId || c.file?.parents?.includes(this.config.folderId)).map(c => c.fileId);
      const doc = await this.google.document();
      s.connections.google = 'connected'; s.lastProcessedRevision = doc.revisionId; s.lastDriveVersion = meta.version; s.lastPoll = now();
      readingGoogle = false;
      if (s.connectionPausedFrom) {
        this.set(s.connectionPausedFrom, 'Google connection restored; checking the durable phase checkpoint');
        delete s.connectionPausedFrom;
      }
      const prompt = readyPrompt(documentText(doc));
      // A retry, restart, newer phase or correction is not an owner's visual decision.
      if (s.approvalRequired?.active || s.state === 'APPROVAL_REQUIRED') {
        this.set('APPROVAL_REQUIRED', 'OWNER CHOICE NEEDED FOR VISUAL FIXES — inspect the live viewer and record the owner decision before continuing');
        return;
      }
      if (run && ['blocked', 'interrupted', 'verifying', 'publishing'].includes(run.stage) && ['FAILED', 'APPROVAL_REQUIRED', 'CORRECTION_REQUIRED'].includes(s.state) && prompt?.phase === run.phase && prompt.version > run.version && prompt.status === 'CORRECTION_REQUIRED' && (!run.pid || !alive(run.pid))) {
        run.stage = 'abandoned';
        atomicJson(path.join(run.directory, 'superseded-checkpoint.json'), run);
        s.run = null; s.nextAttempt = null; s.candidate = null;
        this.set('CORRECTION_REQUIRED', `${run.key} retained; explicit correction ${prompt.key} will start after two stable observations`);
        return;
      }
      if (run && !['published', 'abandoned'].includes(run.stage)) {
        if (s.bootstrap?.active) { this.save(); return; }
        if (run.pid && alive(run.pid)) {
          this.set('CODEX_RUNNING', 'An existing Codex process is still running; waiting for its checkpoint'); return;
        }
        if (run.stage === 'publishing' || run.stage === 'verifying' || run.turnCompletedAt) { await this.finish(); return; }
        if (run.stage === 'blocked' && !force) { this.save(); return; }
        if (s.state === 'PAUSED_AUTH' && run.stage === 'interrupted' && !force) { this.save(); return; }
        if (!prompt || prompt.key !== run.key || prompt.hash !== run.hash) {
          this.set('CORRECTION_REQUIRED', 'Unfinished phase differs from the active prompt; publish an explicit correction/version before continuing'); return;
        }
        if (s.state === 'FAILED' && !force) { this.save(); return; }
        if (run.stage === 'reserved' && !run.threadId && !force) {
          this.set('FAILED', 'Interrupted launch has no confirmed thread; inspect checkpoint and use resume to continue safely'); return;
        }
        run.retryCount = (run.retryCount || 0) + 1; s.nextAttempt = null;
        this.startTask(true); return;
      }
      const decision = disposition(s, prompt);
      s.detectedPrompt = prompt ? { phase: prompt.phase, version: prompt.version, hash: prompt.hash } : null;
      if (decision !== 'dispatch') {
        if (['same-version-edited', 'correction-status-required'].includes(decision)) this.set('CORRECTION_REQUIRED', 'Publish a new VERSION with STATUS: CORRECTION_REQUIRED to retry a processed phase');
        else if (decision === 'bootstrap-owned') { s.action = `${s.bootstrap.phase} is owned by the current interactive session; duplicate dispatch suppressed`; this.save(); }
        else this.save();
        return;
      }
      // Two observations separated by one polling interval avoid executing a partially typed prompt.
      if (!s.candidate || s.candidate.hash !== prompt.hash) { s.candidate = { hash: prompt.hash, firstSeen: Date.now() }; this.set('PROMPT_READY', `${prompt.phase} ready; waiting for a stable second observation`); return; }
      if (Date.now() - s.candidate.firstSeen < this.config.pollMs && !force) { this.save(); return; }
      const id = crypto.randomUUID(), directory = path.join(this.config.runtime, 'runs', id);
      fs.mkdirSync(path.join(directory, 'artifacts'), { recursive: true });
      fs.writeFileSync(path.join(directory, 'prompt.md'), prompt.content, { mode: 0o600 });
      const explicit = [...prompt.content.matchAll(/\b(P\d{2,}-[\w-]+\.(?:md|csv|json))\b/g)].map(m => m[1]).filter(name => name.startsWith(prompt.phase + '-'));
      s.run = { id, phase: prompt.phase, version: prompt.version, key: prompt.key, hash: prompt.hash, directory, stage: 'reserved', startedAt: now(), requiredArtifacts: explicit.length ? [...new Set(explicit)] : [`${prompt.phase}-execution-report.md`], checkpoint: checkpoint(this.config.root) };
      s.phases[prompt.key] = { hash: prompt.hash, runId: id, status: 'CODEX_RUNNING' };
      this.set('CODEX_RUNNING', `Reserved ${prompt.key}; starting exactly one Codex process`);
      this.startTask(false);
    } catch (error) {
      const status = error.httpStatus === 429 ? 'PAUSED_OFFLINE' : classifyError(error);
      if (['PAUSED_AUTH', 'PAUSED_OFFLINE'].includes(status) && !['PAUSED_AUTH', 'PAUSED_OFFLINE'].includes(s.state)) s.connectionPausedFrom = s.state;
      if (readingGoogle || error.httpStatus || ['PAUSED_AUTH', 'PAUSED_OFFLINE'].includes(status)) this.state.connections.google = status;
      this.set(status, error.message, { nextAttempt: ['PAUSED_AUTH', 'PAUSED_OFFLINE'].includes(status) ? new Date(Date.now() + this.config.pollMs * 2).toISOString() : null });
    }
  }
  startTask(resuming) {
    const run = this.state.run;
    run.stage = 'running'; run.checkpoint = checkpoint(this.config.root); run.lastResume = resuming ? now() : null;
    this.set('CODEX_RUNNING', `${resuming ? 'Continuing' : 'Executing'} ${run.key}`);
    const launched = this.launcher(this.config, run, taskInstructions(this.config, run), event => {
      if (event.threadId) run.threadId = event.threadId;
      if (event.usage) run.usage = event.usage;
      if (event.failure) this.state.connections.codex = event.failure;
      else if (event.type === 'turn.completed' || event.type === 'turn.started') this.state.connections.codex = 'connected';
      if (event.type === 'turn.completed') run.turnCompletedAt = now();
      if (event.failure) { run.lastFailure = event.failure; run.reportedReset = event.error; }
      run.lastEvent = event.type; run.lastEventAt = now(); this.save();
    });
    run.pid = launched.child.pid; this.save();
    this.task = launched.completion.then(async outcome => {
      run.pid = null; run.checkpoint = checkpoint(this.config.root);
      run.lastTests = readJson(path.join(run.directory, 'checks.json'), []).filter(t => t.exitCode === 0);
      if (outcome.failure) {
        run.stage = 'interrupted';
        const attempts = run.usageRetries || 0;
        const nextAttempt = outcome.failure === 'PAUSED_USAGE_LIMIT' ? usageRetry(outcome.error || run.reportedReset, attempts) : outcome.failure === 'PAUSED_OFFLINE' ? new Date(Date.now() + this.config.pollMs * 2).toISOString() : null;
        if (outcome.failure === 'PAUSED_USAGE_LIMIT') run.usageRetries = attempts + 1;
        this.set(outcome.failure, `${run.key} paused; checkpoint retained`, { nextAttempt }); return;
      }
      run.stage = 'verifying'; this.save(); await this.finish();
    }).catch(error => {
      // A publication failure must retry publication, never dispatch the completed model task again.
      if (!['publishing', 'verifying'].includes(run.stage)) run.stage = 'interrupted';
      this.set(classifyError(error), error.message);
    }).finally(() => { this.task = null; });
  }
  async finish() {
    const s = this.state, run = s.run;
    const { result, files } = validateResult(run);
    run.lastTests = result.tests || []; run.resultSummary = result.summary;
    if (result.status !== 'complete') {
      run.stage = 'blocked';
      const status = result.status === 'approval_required' ? 'APPROVAL_REQUIRED' : 'FAILED';
      if (status === 'APPROVAL_REQUIRED') s.approvalRequired = { active: true, phase: run.phase, at: now(), reason: result.blocker || result.summary };
      this.set(status, result.blocker || result.summary || 'Phase requires attention');
      await this.google.appendRed(`\nCODEX STATUS EVENT — ${run.phase}\nRUN: ${run.id}\nSTATUS: ${status}\n${s.action}\nCheckpoint preserved. No completed output is claimed.\n`, `RUN: ${run.id}\nSTATUS: ${status}`);
      return;
    }
    const active = readyPrompt(documentText(await this.google.document()));
    if (!active || active.key !== run.key || active.hash !== run.hash) {
      run.stage = 'blocked';
      this.set('CORRECTION_REQUIRED', 'The active prompt changed during execution; retained evidence must be reviewed against an explicit correction before publishing completion');
      return;
    }
    run.stage = 'publishing'; run.artifacts ||= []; this.save();
    for (const file of files) {
      const digest = hash(fs.readFileSync(file));
      const existing = run.artifacts.find(a => a.name === path.basename(file) && a.sha256 === digest);
      const artifact = existing ? await this.google.verifyArtifact(existing.id) : await this.google.upload(file, run.id, mime(file), run.phase);
      if (artifact.sha256 !== digest) throw new Error('Remote artifact bytes differ from the local verified file');
      run.artifacts = [...run.artifacts.filter(a => a.name !== artifact.name), artifact]; this.save();
    }
    const manifest = { author: 'CODEX', phase: run.phase, runId: run.id, promptHash: run.hash, threadId: run.threadId, completedAt: now(), tests: result.tests, baselineTests: result.baselineTests || [], checkpoint: run.checkpoint, artifacts: run.artifacts };
    atomicJson(path.join(run.directory, 'artifact-manifest.json'), manifest);
    run.manifest = await this.google.upload(path.join(run.directory, 'artifact-manifest.json'), run.id, 'application/json');
    // Manifest exists locally AND in Drive before the first OUTPUT_READY publication.
    this.save();
    const marker = `RCS_OUTPUT_RUN: ${run.id}`;
    const unresolved = (result.baselineTests || []).map(t => `${t.command} — ${t.status || (t.exitCode === undefined ? 'NOT RUN' : 'exit ' + t.exitCode)}${t.preExisting ? ' (pre-existing)' : ''}${t.scope ? ' — ' + t.scope : ''}`).join('\n');
    await this.google.appendRed(`\nCODEX OUTPUT — ${run.phase}\n${marker}\nAUTHOR: CODEX | PHASE: ${run.phase} | VERSION: ${run.version}\nSTATUS: OUTPUT_READY\nREVIEW STATUS: AWAITING_REVIEW\nCOMPLETED: ${now()}\n${result.summary}\nCOMMIT: ${run.checkpoint?.head}\nARTIFACT MANIFEST: ${run.manifest.url}\n${run.artifacts.map(a => `${a.name} — ${a.url}`).join('\n')}\nTEST EVIDENCE:\n${result.tests.map(t => `${t.command} — exit ${t.exitCode} — ${t.scope || ''}`).join('\n')}\nBASELINE / UNRESOLVED CHECKS:\n${unresolved || 'See the execution report for remaining scope.'}\nChatGPT: review these artifacts using the existing hourly review. Do not advance without inspecting evidence.\nREADY-PROMPT FORMAT FOR THE EXISTING REVIEWER: write the next numbered header such as “P02 | Concrete task”, then a separate line “STATUS: PROMPT_READY” and “VERSION: 1”, followed by the actual task, acceptance checks and exact deliverable filenames. For a correction, retain the phase ID, increment VERSION, and use “STATUS: CORRECTION_REQUIRED”. Put review prose under a “CHATGPT REVIEW” heading. New ChatGPT text stays dark green #18713C. No signature, new authorization manifest or duplicate automation is required. If a later prompt omits filenames, its minimum output is Pxx-execution-report.md.\n`, marker);
    run.stage = 'published'; run.completedAt = now(); s.phases[run.key].status = 'OUTPUT_READY'; s.candidate = null;
    this.set('OUTPUT_READY', `${run.phase} artifacts verified and published for ChatGPT review`);
    this.set('AWAITING_REVIEW', 'Waiting for the existing hourly ChatGPT review and the next explicitly ready prompt');
  }
}
