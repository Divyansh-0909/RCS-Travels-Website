import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { now, classifyError, readJson } from './core.mjs';

export function codexInvocation(config, run, prompt) {
  const args = [config.codexEntry, 'exec', '--ignore-user-config', '-c', 'forced_login_method="chatgpt"', '-c', 'model_provider="openai"', '-c', 'approval_policy="never"', '--sandbox', 'workspace-write'];
  // Skipping user config also skips Windows' sandbox implementation selection.
  // Keep the existing sandbox boundary and explicitly select its configured implementation.
  if (process.platform === 'win32') args.push('-c', 'windows.sandbox="elevated"');
  // Local API fixtures, Docker and the USB/ADB server require network access.
  args.push('-c', 'sandbox_workspace_write.network_access=true');
  if (run.threadId) args.push('resume', '--json', run.threadId, '-');
  else args.push('--json', '-C', config.root, '-');
  const env = { ...process.env };
  for (const key of ['OPENAI_API_KEY', 'CODEX_API_KEY', 'OPENAI_BASE_URL', 'OPENAI_ORG_ID', 'OPENAI_ORGANIZATION', 'CODEX_THREAD_ID']) delete env[key];
  return { command: process.execPath, args, options: { cwd: config.root, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }, prompt };
}
export function checkpoint(root) {
  const git = args => { try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 15_000, stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return 'unavailable'; } };
  return { at: now(), head: git(['rev-parse', 'HEAD']), files: git(['status', '--porcelain']), note: 'File contents remain in the working tree; no stash/reset/commit was performed.' };
}
export function launchCodex(config, run, prompt, onEvent) {
  const call = codexInvocation(config, run, prompt);
  const child = spawn(call.command, call.args, call.options);
  let failure = null, completed = false, lastError = null;
  const completion = new Promise(resolve => {
    const lines = createInterface({ input: child.stdout });
    lines.on('line', line => {
      let event; try { event = JSON.parse(line); } catch { return; }
      if (event.type === 'thread.started') onEvent({ type: event.type, threadId: event.thread_id });
      else if (event.type === 'turn.completed') { completed = true; failure = null; lastError = null; onEvent({ type: event.type, usage: event.usage }); }
      else if (event.type === 'turn.failed' || event.type === 'error') {
        const detail = event.error || event;
        failure = classifyError(detail);
        // Persist classification/timing only. Command output and model text can contain private data.
        const reportedDate = String(detail.message || '').match(/\b\d{4}-\d\d-\d\dT[\d:.]+Z\b/)?.[0];
        lastError = { message: failure, resets_at: detail.resets_at ?? (reportedDate ? Date.parse(reportedDate) / 1000 : undefined), reset_at: detail.reset_at };
        onEvent({ type: event.type, failure, error: lastError });
      } else onEvent({ type: event.type });
    });
    child.stderr.on('data', data => {
      const kind = classifyError(data.toString());
      if (kind !== 'FAILED') { failure = kind; lastError = { message: kind }; }
    });
    child.on('error', () => { failure = 'FAILED'; });
    child.on('close', code => resolve({ code, completed, failure: failure || (code || !completed ? 'FAILED' : null), error: lastError }));
  });
  child.stdin.on('error', () => {});
  child.stdin.end(prompt);
  return { child, completion };
}

export function taskInstructions(config, run) {
  const result = path.join(run.directory, 'result.json');
  const artifacts = path.join(run.directory, 'artifacts');
  const progress = path.join(config.root, 'tools/handoff/cli.mjs');
  return `You are the sole RCS handoff executor for ${run.phase} version ${run.version}, run ${run.id}.
Read AGENTS.md, relevant skills, CONTEXT.md and ROADMAP.txt. Preserve all unrelated dirty changes.
The human-authored prompt below is authoritative within its approved product boundaries.
Never deploy, touch production/customer data, expose credentials, change paid provider, purchase credits, or make unapproved business-logic/redesign changes.
Use only safe fixtures. Home and Outstation remain separate. Never invent a next phase.
This is a local Windows watcher task, not a task visible in the already-open desktop conversation.
Update the live viewer before/after each meaningful fix with:
node "${progress}" progress --screen "route/screen" --issue "issue" --doing "current action" --status Investigating|Editing|Testing|Blocked|Fixed
For Fixed, also provide --verified true --evidence "actual passing checks" only after functional, theme, responsive and regression checks pass; record the actual test evidence in result.json.
Immediately after EVERY verification command, persist its real result with:
node "${progress}" check --command "actual test command" --exit-code 0 --scope "what was checked"
Use the actual exit code, including failures. This preserves last successful tests if usage ends before the final report.
Place only shareable reports/screenshots (no private data) in ${artifacts}.
Do not write to Google Drive yourself: the watcher uploads/verifies files, then appends your report in red atomically with revision protection.
Write ${result} only after verification with JSON shape:
{"status":"complete|blocked|approval_required","summary":"factual outcome","tests":[{"command":"actual command","exitCode":0,"scope":"what was checked"}],"artifacts":["filename.md"],"requiredArtifacts":["filename.md"],"verified":true,"blocker":"if applicable"}.
Use the exact primary filenames requested in the prompt. A complete P01 requires all eight original P01 deliverables plus all three connection deliverables. Missing evidence must remain blocked, never complete.
Required artifact contract for this run: ${JSON.stringify(run.requiredArtifacts || [])}. If no filename was specified by a later prompt, write ${run.phase}-execution-report.md.
If interrupted, resume the existing checkpoint/thread, inspect the working tree and previous tests, and continue unfinished work; do not restart completed steps.
Prior checkpoint: ${JSON.stringify(run.checkpoint || null)}.
Prior successful tests: ${JSON.stringify(readJson(path.join(run.directory, 'checks.json'), []).filter(t => t.exitCode === 0))}.
AUTHOR: CODEX. PHASE: ${run.phase}.
\n--- AUTHORITATIVE PROMPT ---\n${fs.readFileSync(path.join(run.directory, 'prompt.md'), 'utf8')}`;
}
