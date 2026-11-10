// End-to-end dispatcher test: simulated Drive P99, one REAL Codex turn in a separate Git fixture,
// publication to a fake Drive sink, then duplicate events and a real Engine reload.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { config } from './config.mjs';
import { Engine } from './engine.mjs';
import { launchCodex } from './codex.mjs';
import { atomicJson, hash, now } from './core.mjs';
const root = path.join(config.runtime, 'dispatch-fixture'); fs.mkdirSync(root, { recursive: true });
execFileSync('git', ['init', '--quiet'], { cwd: root, windowsHide: true });
const local = { ...config, root, runtime: path.join(root, 'runtime'), pollMs: 0 };
if (fs.existsSync(path.join(local.runtime, 'state.json'))) throw new Error('Dispatch fixture already ran; do not spend another model call automatically');
const text = 'P99 | Synthetic dispatcher verification only\nSTATUS: PROMPT_READY\nVERSION: 1\nDELIVERABLES: P99-execution-report.md\n';
const doc = { revisionId: 'fixture-revision', body: { content: [{ paragraph: { elements: [{ textRun: { content: text } }] } }] } };
const records = new Map(), appended = []; let launches = 0;
const google = {
  document: async () => doc, metadata: async () => ({ version: '1' }), changes: async () => ({ startPageToken: 'fixture-cursor' }),
  upload: async file => { const name = path.basename(file); const entry = { id: name, name, url: 'https://example.invalid/fixture/' + name, sha256: hash(fs.readFileSync(file)) }; records.set(name, entry); return entry; },
  verifyArtifact: async id => records.get(id), appendRed: async text => { appended.push(text); },
};
const launcher = (settings, run, _instructions, onEvent) => {
  launches++;
  const real = launchCodex(settings, run, 'This is a synthetic dispatcher connection check in an empty test Git repository. Do not call any tools or modify any file. Reply exactly DISPATCH_VERIFIED.', onEvent);
  return { child: real.child, completion: real.completion.then(outcome => {
    if (!outcome.failure && outcome.completed) {
      fs.writeFileSync(path.join(run.directory, 'artifacts/P99-execution-report.md'), 'AUTHOR: CODEX TEST HARNESS\nPHASE: P99\nOne real Codex turn completed. No product changes or real Drive publication occurred.\n');
      atomicJson(path.join(run.directory, 'result.json'), { status: 'complete', verified: true, summary: 'Real CLI turn launched once through the fixture dispatcher', tests: [{ command: 'real Codex JSON turn.completed / exit 0', exitCode: 0 }], artifacts: ['P99-execution-report.md'] });
    }
    return outcome;
  }) };
};
const engine = new Engine(local, google, launcher);
await engine.tick(); await engine.tick(); await engine.task;
assert.equal(launches, 1); assert.equal(engine.state.state, 'AWAITING_REVIEW'); assert.ok(engine.state.run.threadId);
await engine.tick(); await engine.tick();
const recovered = new Engine(local, google, launcher); await recovered.tick();
assert.equal(launches, 1); assert.equal(appended.length, 1);
const proof = { at: now(), readyEvent: 'P99 synthetic Drive document', actualCodexLaunches: launches, threadId: engine.state.run.threadId, state: recovered.state.state, duplicateEventsIgnored: true, restartRecovered: true, productModified: false, realDriveModified: false, publicationSink: 'fixture', hostGeneratedFixtureArtifact: true };
atomicJson(path.join(config.runtime, 'dispatch-verification.json'), proof);
console.log(JSON.stringify(proof, null, 2));
