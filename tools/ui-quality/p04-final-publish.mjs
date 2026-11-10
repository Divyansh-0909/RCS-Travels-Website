// Finalize the approved P04 pilot, retaining the original audit/A1 evidence.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { config } from '../handoff/config.mjs';
import { Google } from '../handoff/google.mjs';
import { Engine } from '../handoff/engine.mjs';
import { readJson, atomicJson, hash, readyPrompt, documentText, alive } from '../handoff/core.mjs';
import { nativeStatus } from '../handoff/native-status.mjs';

const worker = readJson(path.join(config.runtime, 'worker.json'));
assert(!worker || !alive(worker.pid), 'Stop the watcher before final publication; keep the separate native fixture running');
const engine = new Engine(config, new Google(config)), google = engine.google, run = engine.state.run;
assert.equal(run.phase, 'P04');
const out = path.join(run.directory, 'artifacts'), native = readJson(path.join(out, 'P04-A2-native-results.json'));
assert.equal(native.status, 'PASS'); assert.equal(native.checks.length, 8);
assert.equal(hash(fs.readFileSync(path.join('driver-app', native.source.file))), native.source.sha256);
assert.equal(readJson(path.join(out, 'P04-viewer-verification.json')).status, 'PASS');
const doc = await google.document();
assert.equal(readyPrompt(documentText(doc))?.hash, run.hash, 'The authoritative prompt must still be P04');
function coloredHash(document, color) {
  const content = [];
  const walk = blocks => { for (const block of blocks || []) {
    for (const e of block.paragraph?.elements || []) {
      const c = e.textRun?.textStyle?.foregroundColor?.color?.rgbColor;
      if (c && ['red', 'green', 'blue'].every((key, i) => Math.abs((c[key] || 0) - color[i] / 255) < 0.00001)) content.push(e.textRun.content);
    }
    for (const row of block.table?.tableRows || []) for (const cell of row.tableCells || []) walk(cell.content);
  } };
  const tabs = list => { for (const tab of list || []) { walk((tab.documentTab || tab).body?.content); tabs(tab.childTabs); } };
  document.tabs ? tabs(document.tabs) : walk(document.body?.content); return hash(content.join(''));
}
const green = coloredHash(doc, [24, 113, 60]);
const previous = ['P04-review-publication.json', 'P04-A1-publication.json'].map(file => readJson(path.join(config.runtime, file)));
const references = [];
for (const receipt of previous) {
  const record = await google.verifyArtifact(receipt.manifest.id);
  assert.equal(record.sha256, receipt.manifest.sha256, 'Archived manifest hash');
  references.push({ ...record, readbackVerified: true, artifacts: receipt.artifacts.length });
}
const folderId = new URL(previous[0].evidenceFolder).pathname.split('/').filter(Boolean).at(-1);
const folder = await google.metadata(folderId); assert(folder.parents.includes(config.folderId));
const evidence = new Google({ ...config, folderId }); evidence.token = (...args) => google.token(...args);
const files = native.screenshots.flatMap(s => ['png', 'xml', 'json'].map(ext => path.join(out, 'P04-evidence', s.replace(/\.png$/, '.' + ext))));
files.push(...['png', 'xml', 'json'].map(ext => path.join(out, 'P04-evidence', 'a2-review-final.' + ext)));
files.push(...['a2-selected-maestro.yaml', 'a2-selected-maestro.log', 'a2-selected-maestro-usb-interruption.log', 'a2-lint.log', 'a2-typecheck.log', 'a2-native-unit.log'].map(name => path.join(out, 'P04-evidence', name)));
files.push(path.join(run.directory, 'P04-A2-owner-direction.json'));
const mime = file => ({ '.json': 'application/json', '.png': 'image/png', '.xml': 'application/xml', '.yaml': 'application/yaml', '.log': 'text/plain' })[path.extname(file)];
const secret = /-----BEGIN (?:\w+ )?PRIVATE KEY-----|(?:access_token|refresh_token|client_secret|OPENAI_API_KEY|DATABASE_URL)\s*["']?\s*[:=]\s*["']?[^\s"'<>]{12,}|Bearer\s+[a-zA-Z0-9._-]{20,}/i;
for (const file of files) {
  const bytes = fs.readFileSync(file), text = bytes[0] === 255 && bytes[1] === 254 ? bytes.subarray(2).toString('utf16le') : bytes.toString();
  assert(bytes.length <= 30 * 1024 * 1024 && (file.endsWith('.png') || !secret.test(text)), 'Artifact safety/size: ' + path.basename(file));
}
const uploaded = [], receiptFile = path.join(config.runtime, 'P04-final-publication.json');
for (let i = 0; i < files.length; i += 3) {
  uploaded.push(...await Promise.all(files.slice(i, i + 3).map(async file => {
    const record = await evidence.upload(file, run.id + ':A2', mime(file));
    assert.equal(record.sha256, hash(fs.readFileSync(file))); return { ...record, readbackVerified: true };
  })));
  atomicJson(receiptFile, { status: 'UPLOADING', artifacts: uploaded });
  console.log(JSON.stringify({ verified: uploaded.length, total: files.length }));
}
assert(nativeStatus(config.runtime).live, 'Actual foreground phone must be live before completion');
atomicJson(path.join(out, 'P04-final-evidence-manifest.json'), { phase: 'P04', runId: run.id, at: new Date().toISOString(), originalAuditAndA1: references, artifacts: uploaded, native: nativeStatus(config.runtime), ownerDirection: readJson(path.join(run.directory, 'P04-A2-owner-direction.json')) });
const checks = readJson(path.join(run.directory, 'checks.json'));
const commands = ['node tools/ui-quality/p04-a1-device-test.mjs', 'node tools/handoff/p04-maestro.mjs a1-fade-maestro', 'node tools/ui-quality/p04-a2-device-test.mjs', 'node tools/handoff/p04-maestro.mjs a2-selected-maestro', 'npm --prefix driver-app run lint', 'node driver-app/node_modules/typescript/bin/tsc --noEmit --project driver-app/tsconfig.json', 'node --test backend/tests/phase9NativePreviewHealth.test.mjs backend/tests/phase9NativeHierarchy.test.mjs backend/tests/phase9NativeInfrastructure.test.js backend/tests/phase9NativeTransport.test.js', 'node tools/ui-quality/p04-viewer-verify.mjs'];
const tests = commands.map(command => { const check = checks.filter(c => c.command === command).at(-1); assert.equal(check?.exitCode, 0, command); return check; });
const prior = readJson(path.join(run.directory, 'result.json'));
const baselineTests = checks.filter(c => c.exitCode !== 0).map(c => ({ ...c, status: 'HISTORICAL FAILURE / see execution report', preExisting: !/a2-/.test(c.command) }));
baselineTests.push({ command: 'Spoken TalkBack, iOS/other devices, release build and fresh full business journeys', status: 'NOT RUN', scope: 'Native accessibility metadata and focused local routes verified; no broader claim' });
const artifacts = [...run.requiredArtifacts, 'P04-A1-approved-tap-guard.md', 'P04-A2-approved-selected-state.md', 'P04-A2-native-results.json', 'P04-A2-source-verification.json', 'P04-A2-validation.json', 'P04-viewer-verification.json', 'P04-live-viewer-1440.png', 'P04-live-viewer-390.png', 'P04-final-evidence-manifest.json'];
const summary = 'P04 complete: both explicit owner choices implemented and verified. A1 keeps the floating fade layout and blocks covered content taps until the fade disappears (13 native Light/Dark checks plus Maestro). A2 adds only selected accessibility metadata to the current tab (8 fresh native Light/Dark checks across all four tabs plus selected-state/Legal-and-Back Maestro). Lint (7 existing warnings), TypeScript, 20 native developer tests and desktop/mobile live viewer checks passed. Home/Outstation and role gates preserved. Spoken TalkBack and full business journeys were not rerun; historical unrelated backend failures remain documented. No P05 or production action.';
atomicJson(path.join(run.directory, 'a2-result-before.json'), prior);
atomicJson(path.join(run.directory, 'result.json'), { ...prior, status: 'complete', verified: true, blocker: null, summary, tests, baselineTests, artifacts, issueResults: { A1: { status: 'VERIFIED', ownerApproved: true, nativeChecks: 13 }, A2: { status: 'VERIFIED', ownerApproved: true, nativeChecks: 8 } } });
const s = engine.state;
s.approvalRequired = { ...s.approvalRequired, active: false, issues: [], pendingVerification: [], resolvedIssues: ['P04-A1', 'P04-A2'], reason: 'Both issues explicitly approved, implemented and verified', updatedAt: new Date().toISOString() };
const decision = s.ownerDecisions.find(d => d.issue === 'P04-A2'); assert(decision); decision.decision = 'APPROVED_IMPLEMENTED_VERIFIED';
run.stage = 'verifying'; engine.save();
await engine.finish();
assert.equal(run.stage, 'published', 'Final publication must complete');
const after = await google.document();
assert.equal(coloredHash(after, [24, 113, 60]), green, 'Preserve ChatGPT green text');
const marker = 'RCS_OUTPUT_RUN: ' + run.id;
assert(documentText(after).includes(marker));
// Verify that the completion marker is inside a dark-red text run.
const runs = [];
const walk = blocks => { for (const b of blocks || []) { runs.push(...(b.paragraph?.elements || []).filter(e => e.textRun).map(e => e.textRun)); for (const row of b.table?.tableRows || []) for (const cell of row.tableCells || []) walk(cell.content); } };
const tabs = list => { for (const t of list || []) { walk((t.documentTab || t).body?.content); tabs(t.childTabs); } };
after.tabs ? tabs(after.tabs) : walk(after.body?.content);
assert(runs.some(r => r.content.includes(marker) && ['red', 'green', 'blue'].every((key, i) => Math.abs((r.textStyle?.foregroundColor?.color?.rgbColor?.[key] || 0) - [180, 35, 46][i] / 255) < 0.00001)), 'Dark red completion status');
const publication = { status: 'OUTPUT_READY', at: new Date().toISOString(), manifest: run.manifest, artifacts: run.artifacts, evidence: uploaded, previousManifests: references, docVerified: true, darkRedVerified: true, greenPreserved: true };
atomicJson(receiptFile, publication);
console.log(JSON.stringify({ status: 'OUTPUT_READY', artifacts: run.artifacts.length, evidence: uploaded.length, previousManifests: references.length, manifest: run.manifest.url, docVerified: true }));
