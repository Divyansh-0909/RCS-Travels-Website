// Use only for the owner's explicit keep-current instruction, never inferred approval.
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../handoff/config.mjs';
import { Google } from '../handoff/google.mjs';
import { readJson, atomicJson, hash, documentText, readyPrompt } from '../handoff/core.mjs';

if (!process.argv.includes('--record-owner-keep-current')) throw Error('Explicit owner keep-current instruction required');
const state = readJson(path.join(config.runtime, 'state.json')), run = state.run;
if (run?.phase !== 'P03' || !state.bootstrap?.active) throw Error('Current interactive P03 ownership required');
const dir = path.join(run.directory, 'artifacts'), google = new Google(config);
const prompt = readyPrompt(documentText(await google.document()));
if (prompt?.hash !== run.hash) throw Error('The current prompt changed; read it before closing');
const sourceProof = readJson(path.join(dir, 'P03-source-preservation.json'));
for (const source of sourceProof.sources) if (hash(fs.readFileSync(path.join(config.root, source.file))) !== source.currentHash)
  throw Error('Page source changed since verification; preserve it and review evidence: ' + source.file);

const receiptFile = path.join(config.runtime, 'P03-owner-decision.json');
const decision = readJson(receiptFile, null) || {
  author: 'OWNER', source: 'Explicit user message in Codex chat', phase: 'P03', at: new Date().toISOString(),
  exactInstruction: 'leave these pages as they are now', choice: 'KEEP_CURRENT_PAGES',
  routes: ['/', '/outstation'], issues: ['P03-H1', 'P03-H2', 'P03-H3', 'P03-O1', 'P03-O2'],
  newVisualTreatmentsApproved: [], remediation: 'DEFERRED_BY_OWNER',
  meaning: 'Keep current Home and Outstation source/appearance, including the already implemented nonvisual dialog keyboard fix. Do not apply the proposed visual candidates. Existing accessibility/width findings remain, without a WCAG PASS claim.'
};
if (decision.choice !== 'KEEP_CURRENT_PAGES') throw Error('An incompatible owner decision already exists');
atomicJson(receiptFile, decision);
atomicJson(path.join(dir, 'P03-owner-decision.json'), decision);
const queue = readJson(path.join(config.runtime, 'review.json'));
queue.status = 'OWNER_DECISION_RECORDED'; queue.ownerDecision = decision;
queue.issues = queue.issues.map(issue => ({ ...issue, stage: 'DEFERRED_BY_OWNER', approved: false,
  ownerDirection: decision.exactInstruction, visualImplementation: 'NOT APPLIED — OWNER KEPT CURRENT PAGE' }));
atomicJson(path.join(config.runtime, 'review.json'), queue);
atomicJson(path.join(dir, 'P03-review-queue.json'), queue);
const metrics = readJson(path.join(dir, 'P03-current-metrics.json'));
const checks = readJson(path.join(run.directory, 'checks.json'));
const native = await fetch('http://127.0.0.1:4317/api/native/status').then(r => r.json()).catch(() => ({ live: false, status: 'VIEWER UNAVAILABLE AT CLOSURE' }));
const reviewed = readJson(path.join(config.runtime, 'P03-review-publication.json'));
const head = title => `# ${title}\n\nAUTHOR: CODEX\nPHASE: P03 | VERSION: 1\nDATE: 22 October 2026 (Asia/Calcutta)\nSTATUS: OWNER-DIRECTED CLOSURE — KNOWN VISUAL FINDINGS DEFERRED\n\n`;
const owner = 'Owner instruction: “leave these pages as they are now.” Home (/) and Outstation (/outstation) are kept exactly as currently implemented. No new visual treatment is approved or applied. The existing contrast, touch-target and width findings are deferred by owner direction, not repaired or counted as accessibility PASS. The earlier nonvisual Outstation modal keyboard fix is retained.\n\n';
const write = (name, body) => {
  const file = path.join(dir, name), saved = path.join(run.directory, 'review-snapshot', name);
  if (fs.existsSync(file) && !fs.existsSync(saved)) { fs.mkdirSync(path.dirname(saved), { recursive: true }); fs.copyFileSync(file, saved); }
  fs.writeFileSync(file, head(name.replace(/\.md$/, '')) + body);
  fs.copyFileSync(file, path.join(config.root, 'docs/ui-quality', name));
};
const failures = [
  'P03-H1 / P03-O2 — shared copyright: #606067 on #121220, measured 2.97:1 versus 4.5:1 required.',
  'P03-H2 — Home carousel targets: inactive 10 × 10px, active 12.5 × 12.5px; nearest safe offset 16px versus 24px minimum.',
  'P03-H3 — Home document/capture is 30px wider at 360/390/768px, including 390 → 420px; no blanket overflow clipping added.',
  'P03-O1 — Outstation destination prompt: #121220 on #262636, measured 1.24:1 versus 4.5:1 required.'
];
write('P03-owner-decision.md', owner + 'This decision came directly from the owner in chat after the live review was supplied. It overrides the remaining visual-remediation portion of P03. It does not authorize a new design, palette change, baseline replacement, removal of functionality, real booking/dispatch/payment action, or a new phase written by Codex.\n\nRetained findings:\n\n' + failures.map(f => '- ' + f).join('\n') + '\n\nChatGPT should review the existing evidence and this owner decision. Do not reopen the same Home/Outstation appearance work without a new owner direction.\n');
write('P03-accessibility-metrics.md', owner + 'Twenty real loaded cases covered Home and Outstation at 360/390/768/1280/1440px and both account preferences. Their existing legacy root appearance is retained; no counterpart theme is invented. Exact selectors, foreground/background ratios, keyboard focus and geometry are in P03-current-metrics.json.\n\n' + failures.map(f => '- ' + f).join('\n') + '\n\nAccessibility verdict for the retained visual findings: FAIL / DEFERRED BY OWNER. Technical reproduction and keyboard/contact checks pass; they do not prove WCAG conformance. The modal Tab escape was fixed without styling changes, with Tab/Shift+Tab wrapping, Escape and trigger focus restoration verified. No new audit or page edits were needed for this owner decision; source hashes still match the verified checkpoint.\n');
const table = '| Route | Width | Preference | Actual root | Document | PNG | axe IDs |\n|---|---:|---|---|---:|---:|---|\n' + metrics.map(r => `| ${r.route} | ${r.width} | ${r.preference} | ${r.actualTheme} | ${r.geometry.scroll} | ${r.imageWidth} | ${r.violations.map(v => v.id).join(', ')} |`).join('\n');
write('P03-responsive-evidence.md', owner + table + '\n\nThe hero uses overflow: clip with overflow-clip-margin: 30px and intentionally transformed artwork. Home extends horizontally by 30px at 360/390/768px; desktop 1280/1440px fits. Clipped off-canvas carousel slides have separate large geometry and are not alone proof of document overflow. Outstation fits every measured width. The proposed page-specific correction is retained as an unapplied candidate, and no content is hidden to turn the result green. Captures wait for actual footer/hero readiness.\n');
const previousDiff = fs.readFileSync(path.join(dir, 'P03-visual-diff.md'), 'utf8');
const index = previousDiff.slice(previousDiff.indexOf('Current image index:'));
write('P03-visual-diff.md', owner + 'No visual before/after fix is claimed because the owner kept the current pages. The clean before/current captures, actual native screenshots and live-viewer proof remain audit evidence rather than approved goldens. P03-deferred-candidates.md preserves the earlier interrupted pilot patch, which was not applied. P03-source-preservation.json and P03-owner-decision.json establish the retained source and owner direction.\n\n' + (index.startsWith('Current image index:') ? index : 'See the prior review manifest for all image links.\n'));
write('P03-visual-approval-board.md', owner + queue.issues.map(issue => `## ${issue.id} — ${issue.name}\n\nRoute ${issue.route}; selector \`${issue.selector}\`.\n\n${issue.baseline}\n\nOwner direction: KEEP CURRENT. Remediation: DEFERRED. Proposed treatment: NOT APPLIED.\n`).join('\n'));
const oldInstructions = fs.readFileSync(path.join(dir, 'P03-live-viewer-instructions.md'), 'utf8');
const instructionsBody = oldInstructions.slice(oldInstructions.indexOf('Open http://'))
  .replace(/APPROVAL_REQUIRED is durable\.[\s\S]*$/, 'The owner has now chosen KEEP CURRENT for all five P03 visual findings. The decision is recorded; there is no pending P03 visual-choice request. Existing technical findings remain and no WCAG PASS is claimed. The phase is handed back for ChatGPT review, not expanded to other pages.\n');
write('P03-live-viewer-instructions.md', owner + instructionsBody + '\nAt closure the Android transport reports ' + native.status + '. Earlier evidence verified the actual 1080×2400 physical DEVICE feed and stale-frame hiding. Current runtime state is separate from that prior verified implementation.\n');
write('P03-execution-report.md', owner + `P03 is complete against the owner's revised scope and ready for ChatGPT review. Original scope was Home/Outstation accessibility and responsiveness discovery, approved low-risk fixes, safe city/contact journey checks, five-width testing, and artifact handoff. The later addendum added the unified live website/actual Android reviewer and required owner choice before visual treatment. No other website page or Android screen redesign was authorized.\n\nCompleted work: 20 loaded audit cases; five measured issue selections; actual interactive HMR website; viewport/account-preference controls; nonblocking focus markers; safe unsent phone/WhatsApp intent; keyboard/carousel/city-route verification; truthful DEVICE/VIEW-ONLY native feed with freshness/foreground/fixture gates; source HMR proof; build/regressions; Drive evidence/readback. Only the already implemented nonvisual Outstation modal focus trap changes production page behavior. Three earlier visual candidates are saved but unapplied. Exact page hashes remain equal to the verified checkpoint.\n\nThe original review publication verified 60 artifacts and manifest ${reviewed.manifest.url}. This final handoff updates the reports with the owner's keep-current decision and retains the full prior evidence. No page source is edited for closure. No new screenshots are represented as corrected or aesthetically approved.\n\nRemaining findings:\n\n${failures.map(f => '- ' + f).join('\n')}\n\nThese are deferred by the owner, not missing implementation silently counted as PASS. No further P03 appearance work is pending. ChatGPT reviews the evidence and owner decision before the next phase; Codex does not author P04.\n\nVerification already performed (not rerun for a documentation-only decision):\n\n${checks.map(t => `- ${t.command} — exit ${t.exitCode}; ${t.scope}`).join('\n')}\n\nFrontend: 68 unit regressions PASS and build PASS. Existing browser suite: 28 PASS initially, two startup deadline failures PASS with unchanged assertions on targeted rerun; full history retained. Viewer checks: 20 PASS, including actual physical-device LIVE, HMR and stale-frame removal. Most recent handoff tools: 27 PASS, one Windows symlink-privilege SKIP. The separate initial preview launch exit 1 meant the existing fixture already occupied port 1575; the existing owned preview was inspected and reused. Known visual axe findings remain FAIL / OWNER DEFERRED. Backend/StudyAI/custody/full-native-business suites, shared-primitive Storybook changes, paid Chromatic and production operations are outside this closure and are not claimed.\n\nCurrent Android runtime: ${native.status}; implementation had previously passed actual-device proof. A runtime restart does not alter or waive the preserved website findings. The connection-refused recovery restarted local services after Windows reboot and added bounded Windows atomic-rename retries while preserving checkpoints.\n\nCheckpoint ${run.id} and all previous run/thread/usage history are retained. No reset, stash, commit, deployment, real ride, dispatch or payment action. Rollback for the existing nonvisual keyboard change is its bounded Tab branch; do not reset the dirty repository.\n`);

const files = ['P03-execution-report.md', 'P03-accessibility-metrics.md', 'P03-responsive-evidence.md', 'P03-visual-diff.md', 'P03-visual-approval-board.md', 'P03-live-viewer-instructions.md', 'P03-owner-decision.md', 'P03-owner-decision.json', 'P03-review-queue.json'];
const uploaded = [];
for (const name of files) {
  const file = path.join(dir, name), artifact = await google.upload(file, run.id, name.endsWith('.json') ? 'application/json' : 'text/markdown', run.phase);
  if (artifact.sha256 !== hash(fs.readFileSync(file))) throw Error('Final artifact readback mismatch');
  uploaded.push(artifact); atomicJson(path.join(config.runtime, 'P03-closure-links.json'), uploaded);
  console.log('Verified owner closure artifact: ' + name);
}
const artifacts = [...reviewed.artifacts.filter(a => !files.includes(a.name)), ...uploaded];
const manifest = { author: 'CODEX', phase: 'P03', runId: run.id, promptHash: run.hash, at: new Date().toISOString(),
  status: 'OUTPUT_READY', outcome: 'OWNER_DIRECTED_CLOSURE_WITH_DEFERRED_VISUAL_FINDINGS', ownerDecision: decision,
  pageSourcesUnchanged: sourceProof.sources, accessibility: 'KNOWN VISUAL FINDINGS FAIL / DEFERRED BY OWNER',
  tests: checks, nativeRuntimeAtClosure: native, previousReviewManifest: reviewed.manifest, artifacts };
const manifestFile = path.join(run.directory, 'final-artifact-manifest.json'); atomicJson(manifestFile, manifest);
const remote = await google.upload(manifestFile, run.id, 'application/json');
if (remote.sha256 !== hash(fs.readFileSync(manifestFile))) throw Error('Final manifest readback mismatch');
if (readyPrompt(documentText(await google.document()))?.hash !== run.hash) throw Error('Prompt changed during final publication');
const marker = `RCS_OUTPUT_RUN: ${run.id}`;
await google.appendRed(`\nCODEX OUTPUT — P03\n${marker}\nAUTHOR: CODEX | PHASE: P03 | VERSION: 1\nSTATUS: OUTPUT_READY\nREVIEW STATUS: AWAITING_REVIEW\nOUTCOME: OWNER-DIRECTED CLOSURE; KNOWN VISUAL FINDINGS DEFERRED\nOWNER INSTRUCTION: “${decision.exactInstruction}” (explicit Codex chat instruction).\nHome and Outstation are kept exactly as currently implemented. No proposed visual candidate was applied, no new palette/theme/layout selected, and the prior nonvisual dialog keyboard fix remains.\nP03 covered more than scanning: Home/Outstation responsive/accessibility discovery, approved corrections, keyboard/city/contact checks, the unified live reviewer, testing, source preservation and evidence publication. No other page or Android screen redesign belonged to P03.\nKNOWN RETAINED FINDINGS: copyright contrast 2.97:1; destination prompt 1.24:1; small carousel targets; Home's 30px mobile width overhang. These remain FAIL / OWNER DEFERRED, not WCAG PASS.\nCOMPLETED: 20 audit cases, viewer and real physical-device implementation proof, safe unsent contact assertions, keyboard fix, production build, 68 frontend regressions, all 30 original browser cases across initial run/targeted timeout rerun, 20 viewer checks, latest 27 handoff tests PASS / one Windows symlink SKIP. No tests rerun for this documentation-only owner decision; page hashes still match the verified source.\nFINAL VERIFIED MANIFEST: ${remote.url}\n${uploaded.map(a => `${a.name} — ${a.url}`).join('\n')}\nPrevious 60-artifact review evidence remains in ${reviewed.manifest.url}.\nCurrent Android runtime: ${native.status}; do not confuse runtime startup with the previously verified real-device implementation.\nOWNER CHOICE RESOLVED: keep current; no P03 visual fixes pending. ChatGPT should review this explicit owner decision and retained findings, then choose the next bounded phase. Do not reopen Home/Outstation appearance changes without a new owner direction. Codex stops here and does not author P04.\n`, marker);
const readback = await google.document();
if (!documentText(readback).includes(marker) || !documentText(readback).includes(remote.url)) throw Error('Final Doc readback failed');
for (const source of sourceProof.sources) if (hash(fs.readFileSync(path.join(config.root, source.file))) !== source.currentHash) throw Error('Page source changed during closure; preserve and inspect');
atomicJson(path.join(config.runtime, 'P03-final-publication.json'), { at: new Date().toISOString(), manifest: remote, artifacts, ownerDecision: decision });
console.log(JSON.stringify({status: 'OUTPUT_READY', outcome: manifest.outcome, manifest: remote.url, artifacts: artifacts.length, pagesUnchanged: true}));
