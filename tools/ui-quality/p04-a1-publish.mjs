import fs from 'node:fs';
import path from 'node:path';
import { config } from '../handoff/config.mjs';
import { Google } from '../handoff/google.mjs';
import { readJson, atomicJson, hash, readyPrompt, documentText } from '../handoff/core.mjs';
import { nativeStatus } from '../handoff/native-status.mjs';
const state = readJson(path.join(config.runtime, 'state.json')), run = state.run, out = path.join(run.directory, 'artifacts');
const proof = readJson(path.join(out, 'P04-A1-native-results.json'));
if (run.phase !== 'P04' || proof.status !== 'PASS') throw Error('Verified current A1 native proof required');
const google = new Google(config), doc = await google.document();
if (readyPrompt(documentText(doc))?.hash !== run.hash) throw Error('P04 prompt changed');
function green(doc) {
  const content = [];
  const walk = list => { for (const b of list || []) {
    for (const e of b.paragraph?.elements || []) {
      const c = e.textRun?.textStyle?.foregroundColor?.color?.rgbColor;
      if (c && Math.abs((c.red || 0) - 24 / 255) < 0.00001 && Math.abs((c.green || 0) - 113 / 255) < 0.00001 && Math.abs((c.blue || 0) - 60 / 255) < 0.00001) content.push(e.textRun.content);
    }
    for (const row of b.table?.tableRows || []) for (const cell of row.tableCells || []) walk(cell.content);
  } };
  const tabs = list => { for (const t of list || []) { walk((t.documentTab || t).body?.content); tabs(t.childTabs); } };
  doc.tabs ? tabs(doc.tabs) : walk(doc.body.content); return hash(content.join(''));
}
const greenBefore = green(doc), previous = readJson(path.join(config.runtime, 'P04-review-publication.json'));
const folderId = new URL(previous.evidenceFolder).pathname.split('/').filter(Boolean).at(-1), folder = await google.metadata(folderId);
if (!folder.parents?.includes(config.folderId) || folder.name !== 'P04-evidence') throw Error('Shared evidence folder verification failed');
const evidence = new Google({ ...config, folderId }); evidence.token = (...args) => google.token(...args);
const reports = [...run.requiredArtifacts, 'P04-A1-approved-tap-guard.md'];
const roots = [...reports, 'P04-A1-native-results.json', 'P04-A1-validation.json', 'P04-A1-source-verification.json', 'P04-viewer-verification.json'];
const stems = [...proof.screenshots.map(s => s.replace(/\.png$/, '')), 'a1-before-visible', 'a1-before-gutter-tap', 'a1-boundary-failure'];
const names = [...new Set(stems)].flatMap(s => ['png', 'xml', 'json'].map(ext => s + '.' + ext));
names.push('a1-fade-maestro.yaml', 'a1-fade-maestro.log', 'a1-lint.log', 'a1-typecheck.log', 'a1-native-unit.log');
const files = [...roots.map(name => ({ name, file: path.join(out, name), root: true })), ...names.map(name => ({ name: 'P04-evidence/' + name, file: path.join(out, 'P04-evidence', name), root: false }))];
const secret = /-----BEGIN (?:\w+ )?PRIVATE KEY-----|(?:access_token|refresh_token|client_secret|OPENAI_API_KEY|DATABASE_URL)\s*["']?\s*[:=]\s*["']?[^\s"'<>]{12,}|Bearer\s+[a-zA-Z0-9._-]{20,}/i;
for (const f of files) { const b = fs.readFileSync(f.file); if (b.length > 30 * 1024 * 1024 || (!f.file.endsWith('.png') && secret.test(b.toString()))) throw Error('Artifact safety/size check failed: ' + f.name); f.sha = hash(b); }
const mime = file => ({ '.md': 'text/markdown', '.json': 'application/json', '.png': 'image/png', '.xml': 'application/xml', '.yaml': 'application/yaml', '.log': 'text/plain' })[path.extname(file)];
const uploaded = [], receipt = path.join(config.runtime, 'P04-A1-publication.json');
for (let i = 0; i < files.length; i += 3) {
  uploaded.push(...await Promise.all(files.slice(i, i + 3).map(async f => {
    const a = await (f.root ? google : evidence).upload(f.file, run.id + ':A1', mime(f.file));
    if (a.sha256 !== f.sha) throw Error('Artifact readback mismatch'); return { ...a, relativePath: f.name, verified: true };
  })));
  atomicJson(receipt, { status: 'UPLOADING', artifacts: uploaded }); console.log(JSON.stringify({ verified: uploaded.length, total: files.length }));
}
const current = nativeStatus(config.runtime); if (!current.live) throw Error('Restore actual live phone before final owner update');
const manifest = { phase: 'P04', issue: 'A1', status: 'A1_IMPLEMENTED_A2_PENDING', at: new Date().toISOString(), runId: run.id, ownerDirection: readJson(path.join(run.directory, 'P04-A1-owner-direction.json')), native: current, validation: readJson(path.join(out, 'P04-A1-validation.json')), tests: readJson(path.join(run.directory, 'checks.json')), artifacts: uploaded };
const file = path.join(out, 'P04-A1-artifact-manifest.json'); atomicJson(file, manifest);
const published = await google.upload(file, run.id + ':A1', 'application/json');
if (published.sha256 !== hash(fs.readFileSync(file))) throw Error('Manifest readback mismatch');
if (readyPrompt(documentText(await google.document()))?.hash !== run.hash) throw Error('Prompt changed during upload');
const marker = 'RCS_P04_A1_IMPLEMENTED: ' + run.id;
await google.appendRed(`\nCODEX STATUS - P04 A1 OWNER-DIRECTED IMPLEMENTATION\n${marker}\nAUTHOR: CODEX | PHASE: P04 | VERSION: 1\nSTATUS: APPROVAL_REQUIRED (A2 ONLY)\nP04-A1: IMPLEMENTED AND VERIFIED. The owner explicitly chose to keep the existing fade and floating layout, blocking page-content taps under that fade while it is visible and allowing them again after scrolling hides the app bar/fade. This replaces the earlier suggested viewport-spacing treatment. No additional A1 approval is needed or inferred.\nIMPLEMENTATION: a guard inside Account's ScrollView intercepts covered taps while allowing native scrolling, including swipes starting in the fade. The visual fade stays pointerEvents=none. Shared animated visibility keeps the guard active until opacity reaches zero. Root-relative measured bounds match touch pageY, avoiding Android inset offsets. Open settings modals bypass the guard. Colors, geometry, padding totals, tab controls, replace-history, AppBar, Home and Outstation are preserved.\nVERIFIED: ${proof.checks.length} actual-device Light/Dark checks, including covered taps, fade boundary, native modal backdrop, fade-start swipes, tappable hidden area, restored blocking, uncovered controls, tab navigation and restored Light preference. Focused Maestro additionally passed Home/Rides and Legal-and-Back. Captain-app lint passed (7 existing warnings, 0 errors), captain-app TypeScript passed, and 20 native infrastructure/transport/hierarchy/preview-health tests passed. Native bundle source hashes match all four changed files.\nTEST-DRIVEN CORRECTIONS: rejected an outside-scroll ancestor that trapped drags; corrected window coordinates to root pageY after boundary checks caught taps being blocked above the fade. Final native checks passed on the corrected source; failed evidence/checkpoints remain preserved.\nLIVE REVIEW: http://127.0.0.1:4317/?mode=android&issue=P04-A1 - actual DEVICE / VIEW-ONLY, fresh foreground isolated com.rcstravels.driver.phase9. Interact on the physical phone. USB keep-awake remains enabled.\nREADBACK-VERIFIED A1 MANIFEST (${uploaded.length} artifacts): ${published.url}\n${reports.map(name => name + ': ' + uploaded.find(a => a.relativePath === name).url).join('\n')}\nLIMITS: one SM-A528B Android14 phone; no other-device, iOS, spoken TalkBack, release-APK or fresh full-business-journey claim. Existing APK reused with rebuilt native JS bundle. The earlier unrelated StudyAI backend typecheck failure and unfinished full backend suite remain documented; neither is presented as passing. No production action or credential handling change.\nP04-A2 remains pending; the owner approved only A1. No selected-state change was made to the tab buttons. Overall P04 remains APPROVAL_REQUIRED for A2, with no OUTPUT_READY, automatic next phase or P05.\n`, marker);
const after = await google.document(); if (!documentText(after).includes(marker) || green(after) !== greenBefore) throw Error('Doc readback/preserved green-text check failed');
atomicJson(receipt, { status: 'A1_IMPLEMENTED_A2_PENDING', manifest: published, artifacts: uploaded, docVerified: true, greenPreserved: true, at: new Date().toISOString() });
console.log(JSON.stringify({ status: 'A1_IMPLEMENTED_A2_PENDING', artifacts: uploaded.length, manifest: published.url, docVerified: true }));
