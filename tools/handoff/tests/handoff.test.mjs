import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initialState, atomicJson, readJson, readyPrompt, documentText, disposition, redInsertion, usageRetry, classifyError, lock, hash } from '../core.mjs';
import { Engine, validateResult } from '../engine.mjs';
import { codexInvocation } from '../codex.mjs';

const prompt = (phase = 'P02', version = 1, status = 'PROMPT_READY') => `${phase} | Safe fixture phase\nSTATUS: ${status}\nVERSION: ${version}\nProduce ${phase}-report.md using fixtures only.\n`;
const doc = text => ({ documentId: 'fixture', revisionId: 'rev1', tabs: [{ tabProperties: { tabId: 't.0' }, documentTab: { body: { content: [{ endIndex: 1, sectionBreak: {} }, { startIndex: 1, endIndex: text.length + 1, paragraph: { elements: [{ textRun: { content: text } }] } }] } } }] });
function fixture(t, text = prompt()) {
  const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'rcs-handoff-'));
  t.after(() => fs.rmSync(runtime, { recursive: true, force: true }));
  const config = { runtime, root: runtime, pollMs: 0, codexEntry: '/fixture/codex.js' };
  let document = doc(text), launches = 0, uploadFailure = false;
  const uploaded = new Map(), appends = [];
  const google = {
    metadata: async () => ({ version: '1' }), changes: async () => ({ startPageToken: 'cursor' }), document: async () => document,
    appendRed: async text => { appends.push(text); document = doc(documentText(document) + text); },
    upload: async file => {
      if (uploadFailure) throw new Error('network offline');
      const name = path.basename(file), record = { id: name, name, url: 'https://example.test/' + name, sha256: hash(fs.readFileSync(file)) };
      uploaded.set(name, record); return record;
    },
    verifyArtifact: async id => uploaded.get(id),
  };
  let outcome = { code: 0, completed: true, failure: null }, latestRun;
  const launcher = (_config, run, _instructions, event) => {
    launches++; latestRun = run; event({ type: 'thread.started', threadId: 'fixture-thread' });
    const filename = run.requiredArtifacts?.[0] || `${run.phase}-report.md`;
    fs.writeFileSync(path.join(run.directory, 'artifacts', filename), 'AUTHOR: CODEX\nPHASE: ' + run.phase + '\nSafe fixture report.');
    atomicJson(path.join(run.directory, 'result.json'), { status: 'complete', summary: 'Verified fixture', verified: true, tests: [{ command: 'fixture test', exitCode: 0 }], artifacts: [filename] });
    return { child: { pid: null }, completion: Promise.resolve(outcome) };
  };
  const engine = new Engine(config, google, launcher);
  return { engine, config, google, launcher, uploaded, appends, launches: () => launches, setOutcome: v => { outcome = v; }, setDocument: v => { document = doc(v); }, failUpload: v => { uploadFailure = v; }, lastRun: () => latestRun };
}
async function dispatch(f) { await f.engine.tick(); await f.engine.tick(); if (f.engine.task) await f.engine.task; }

test('only explicit phase header and adjacent ready status authorize execution', () => {
  assert.equal(readyPrompt('notes about PROMPT_READY P02'), null);
  assert.equal(readyPrompt(prompt('P01', 1, 'AWAITING_REVIEW')), null);
  assert.equal(readyPrompt(prompt('P01', 1, 'ACTIVE / AWAITING CODEX OUTPUT')).phase, 'P01');
  assert.equal(readyPrompt(prompt('P01') + prompt('P02')).phase, 'P02');
});

test('an owner review status entry cannot become part of its own prompt fingerprint', () => {
  const text=prompt('P03');
  for(const heading of ['CODEX STATUS — P03','CODEX STATUS EVENT — P03']) {
    assert.equal(readyPrompt(text+'\n'+heading+'\nSTATUS: APPROVAL_REQUIRED\nOwner chooses visual treatment.').hash,readyPrompt(text).hash);
  }
});
test('self-authored outputs and formatting edits do not change the prompt hash', () => {
  const original = prompt('P01') + '5. Codex output block — P01\nplaceholder\nP01 ADDENDUM — LIVE UI FIX VIEWER\nActual addendum\n';
  const before = readyPrompt(original);
  const after = readyPrompt(original + '\nCODEX OUTPUT — P01\nSTATUS: OUTPUT_READY\n');
  assert.equal(before.hash, after.hash);
  assert.match(before.content, /Actual addendum/);
  const formatted = doc(original); formatted.tabs[0].documentTab.body.content[1].paragraph.elements[0].textRun.textStyle = { bold: true };
  assert.equal(readyPrompt(documentText(formatted)).hash, before.hash);
});
test('same-version edits and undocumented reruns are held', () => {
  const s = initialState(), p = readyPrompt(prompt()); s.phases[p.key] = { hash: p.hash };
  assert.equal(disposition(s, p), 'already-dispatched');
  assert.equal(disposition(s, { ...p, hash: 'changed' }), 'same-version-edited');
  assert.equal(disposition(s, readyPrompt(prompt('P02', 2))), 'correction-status-required');
  assert.equal(disposition(s, readyPrompt(prompt('P02', 2, 'CORRECTION_REQUIRED'))), 'dispatch');
});
test('exactly one dispatch despite duplicate document events and missed events after restart', async t => {
  const f = fixture(t); await dispatch(f);
  assert.equal(f.launches(), 1); assert.equal(f.engine.state.state, 'AWAITING_REVIEW');
  for (let n = 0; n < 3; n++) await f.engine.tick();
  const restarted = new Engine(f.config, f.google, f.launcher); await restarted.tick();
  assert.equal(f.launches(), 1); assert.equal(restarted.state.run.stage, 'published');
  assert.equal(f.appends.length, 1); assert.ok(fs.existsSync(path.join(f.lastRun().directory, 'artifact-manifest.json')));
});
test('bootstrap ownership survives restart and prevents P01 or P02 launches', async t => {
  const f = fixture(t, prompt('P01')); f.engine.state.bootstrap = { active: true }; f.engine.save();
  const restarted = new Engine(f.config, f.google, f.launcher); await restarted.tick(); await restarted.tick();
  assert.equal(f.launches(), 0);
});
test('a new ready numbered phase launches after completed prior output', async t => {
  const f = fixture(t); await dispatch(f); f.setDocument(prompt('P02') + 'P03 | Next task without explicit filenames\nSTATUS: PROMPT_READY\nVERSION: 1\n'); await dispatch(f);
  assert.equal(f.launches(), 2); assert.equal(f.engine.state.run.phase, 'P03');
  assert.deepEqual(f.engine.state.run.requiredArtifacts, ['P03-execution-report.md']);
});
test('upload network failure resumes publication without executing Codex again', async t => {
  const f = fixture(t); f.failUpload(true); await dispatch(f);
  assert.equal(f.engine.state.state, 'PAUSED_OFFLINE'); assert.equal(f.launches(), 1);
  f.failUpload(false); await f.engine.tick({ force: true });
  assert.equal(f.launches(), 1); assert.equal(f.engine.state.state, 'AWAITING_REVIEW');
});
test('usage limit saves thread/checkpoint and resumes same unfinished phase', async t => {
  const f = fixture(t); f.setOutcome({ code: 1, failure: 'PAUSED_USAGE_LIMIT', error: { message: 'quota' } }); await dispatch(f);
  assert.equal(f.engine.state.state, 'PAUSED_USAGE_LIMIT'); assert.equal(f.engine.state.run.threadId, 'fixture-thread');
  assert.ok(f.engine.state.run.checkpoint); assert.ok(f.engine.state.nextAttempt);
  await f.engine.tick(); assert.equal(f.launches(), 1);
  f.setOutcome({ code: 0, completed: true, failure: null }); await f.engine.tick({ force: true }); await f.engine.task;
  assert.equal(f.launches(), 2); assert.equal(f.engine.state.run.threadId, 'fixture-thread'); assert.equal(f.engine.state.state, 'AWAITING_REVIEW');
});
test('a documented correction can supersede a failed run without repeating its version', async t => {
  const f = fixture(t); await dispatch(f);
  f.engine.state.run.stage = 'blocked'; f.engine.set('FAILED', 'Fixture failure');
  f.setDocument(prompt('P02', 2, 'CORRECTION_REQUIRED'));
  await f.engine.tick(); assert.equal(f.engine.state.run, null);
  await dispatch(f); assert.equal(f.launches(), 2); assert.equal(f.engine.state.run.version, 2);
});
test('model authentication failure waits for manual resume instead of repeated model calls', async t => {
  const f = fixture(t); f.setOutcome({ code: 1, failure: 'PAUSED_AUTH' }); await dispatch(f);
  await f.engine.tick(); await f.engine.tick(); assert.equal(f.launches(), 1);
  f.setOutcome({ code: 0, completed: true }); await f.engine.tick({ force: true }); await f.engine.task;
  assert.equal(f.launches(), 2); assert.equal(f.engine.state.state, 'AWAITING_REVIEW');
});
test('Google rate limiting backs off as a connection pause rather than model quota exhaustion', async t => {
  const f = fixture(t); f.google.metadata = async () => { const e = new Error('Google HTTP 429'); e.httpStatus = 429; throw e; };
  await f.engine.tick(); assert.equal(f.engine.state.state, 'PAUSED_OFFLINE'); assert.equal(f.launches(), 0); assert.ok(f.engine.state.nextAttempt);
});
test('incomplete, failing or absent required evidence cannot mark phase done', async t => {
  const f = fixture(t); await dispatch(f); const run = f.lastRun(), file = path.join(run.directory, 'result.json');
  const result = readJson(file); result.tests[0].exitCode = 1; atomicJson(file, result); assert.throws(() => validateResult(run), /verification/);
  result.tests[0].exitCode = 0; result.artifacts = []; atomicJson(file, result); assert.throws(() => validateResult(run), /missing/);
  result.artifacts = ['P02-report.md']; atomicJson(file, result);
  f.setDocument(prompt() + 'Changed acceptance criteria during execution.\n');
  await f.engine.finish(); assert.equal(f.engine.state.state, 'CORRECTION_REQUIRED'); assert.equal(run.stage, 'blocked');
});
test('artifact symlinks cannot upload outside evidence directory', async t => {
  const f = fixture(t); await dispatch(f); const run = f.lastRun();
  const outside = path.join(run.directory, 'private.md'); fs.writeFileSync(outside, 'private');
  const target = path.join(run.directory, 'artifacts', 'P02-report.md'); fs.unlinkSync(target);
  try { fs.symlinkSync(outside, target); } catch (e) { if (e.code === 'EPERM') return t.skip('Windows symlink privilege absent'); throw e; }
  assert.throws(() => validateResult(run), /escapes/);
});
test('red insertion only styles the new UTF-16 range with revision-safe shape', () => {
  const text = '\nCODEX 🚌\n'; const requests = redInsertion(doc('green history\n'), text);
  const range = requests[1].updateTextStyle.range;
  assert.equal(range.endIndex - range.startIndex, text.length);
  assert.equal(requests[1].updateTextStyle.fields, 'foregroundColor');
  assert.equal(requests[1].updateTextStyle.textStyle.foregroundColor.color.rgbColor.red, 180 / 255);
  assert.equal(range.tabId, 't.0'); assert.equal(range.startIndex, 'green history\n'.length);
});
test('repository lock rejects a concurrent worker and can be released', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rcs-lock-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const release = lock(path.join(dir, 'lock')); assert.throws(() => lock(path.join(dir, 'lock')), /Another worker/); release(); lock(path.join(dir, 'lock'))();
  // Crash between acquiring the directory and writing owner.json: recover only after the startup grace period.
  const orphan = path.join(dir, 'orphan'); fs.mkdirSync(orphan);
  assert.throws(() => lock(orphan), /Another worker/);
  const stale = new Date(Date.now() - 60_000); fs.utimesSync(orphan, stale, stale); lock(orphan)();
});
test('usage retry obeys a reported reset, uses conservative unknown retries, and eventually requires manual resume', () => {
  assert.equal(usageRetry({ resets_at: 10000 }, 0, 0), new Date(10000 * 1000 + 60000).toISOString());
  assert.equal(usageRetry({}, 0, 0), new Date(6 * 3600000).toISOString());
  assert.equal(usageRetry({}, 3, 0), null);
  assert.equal(classifyError(new Error('401 sign in')), 'PAUSED_AUTH'); assert.equal(classifyError(new Error('network offline')), 'PAUSED_OFFLINE');
});
test('Codex launch uses existing ChatGPT auth with no API-key fallback and exact thread resume', () => {
  const call = codexInvocation({ codexEntry: '/codex.js', root: '/repo' }, { threadId: 'saved-thread' }, 'continue');
  assert.ok(call.args.includes('forced_login_method="chatgpt"')); assert.ok(call.args.includes('saved-thread'));
  assert.ok(call.args.includes('--ignore-user-config')); assert.equal(call.options.env.OPENAI_API_KEY, undefined);
  assert.ok(call.args.includes('workspace-write'));
  if (process.platform === 'win32') assert.ok(call.args.includes('windows.sandbox="elevated"'));
  assert.ok(call.args.includes('sandbox_workspace_write.network_access=true'));
});
test('prior-phase evidence references do not become next-phase output requirements', async t => {
  const f = fixture(t);
  f.setDocument('P02 | Targeted native verification\nSTATUS: PROMPT_READY\nVERSION: 1\nRead P01-execution-report.md.\nDELIVERABLES: P02-execution-report.md\n');
  await dispatch(f);
  assert.deepEqual(f.lastRun().requiredArtifacts, ['P02-execution-report.md']);
  assert.equal(f.engine.state.state, 'AWAITING_REVIEW');
});
test('a missing model result does not mislabel a successful Google read as a connection failure', async t => {
  const f = fixture(t);
  await dispatch(f);
  fs.unlinkSync(path.join(f.lastRun().directory, 'result.json'));
  f.engine.state.run.stage = 'verifying';
  await f.engine.tick();
  assert.equal(f.engine.state.state, 'FAILED');
  assert.equal(f.engine.state.connections.google, 'connected');
});
test('atomic durable state roundtrip keeps thread and heartbeat', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rcs-state-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const s = initialState(); s.run = { threadId: 'thread' }; atomicJson(path.join(dir, 'state.json'), s);
  assert.deepEqual(readJson(path.join(dir, 'state.json')), s);
});


test('visual approval survives force retry, a new phase, and process restart', async t => {
  const f=fixture(t); await dispatch(f); const run=f.engine.state.run;
  run.stage='blocked'; f.engine.state.bootstrap=null;
  f.engine.state.approvalRequired={active:true,phase:run.phase,reason:'Owner chooses the treatment'};
  f.engine.set('APPROVAL_REQUIRED','Owner choice needed');
  const count=f.launches();
  f.setDocument(prompt('P03'));
  await f.engine.tick({force:true}); assert.equal(f.launches(),count); assert.equal(f.engine.state.run.id,run.id);
  f.setDocument(prompt('P02',2,'CORRECTION_REQUIRED'));
  await f.engine.tick({force:true}); assert.equal(f.launches(),count); assert.equal(run.stage,'blocked');
  const restarted=new Engine(f.config,f.google,f.launcher);
  await restarted.tick({force:true}); assert.equal(f.launches(),count); assert.equal(restarted.state.state,'APPROVAL_REQUIRED');
});
