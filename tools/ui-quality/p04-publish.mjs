import fs from 'node:fs';
import path from 'node:path';
import { config } from '../handoff/config.mjs';
import { Google } from '../handoff/google.mjs';
import { readJson, atomicJson, hash, readyPrompt, documentText } from '../handoff/core.mjs';
import { nativeStatus } from '../handoff/native-status.mjs';
const state = readJson(path.join(config.runtime, 'state.json')), run = state.run, out = path.join(run.directory, 'artifacts');
if (run.phase !== 'P04' || !state.bootstrap?.active || state.state !== 'APPROVAL_REQUIRED') throw Error('Current P04 owner approval checkpoint required');
if (readJson(path.join(out, 'P04-viewer-verification.json')).status !== 'PASS') throw Error('Live viewer verification required');
const google = new Google(config), original = await google.document();
if (readyPrompt(documentText(original))?.hash !== run.hash) throw Error('Active P04 prompt changed');
function greenRuns(doc) {
  const runs = [];
  const walk = content => { for (const block of content || []) {
    for (const element of block.paragraph?.elements || []) {
      const t = element.textRun, c = t?.textStyle?.foregroundColor?.color?.rgbColor;
      if (c && Math.abs((c.red || 0) - 24 / 255) < 0.00001 && Math.abs((c.green || 0) - 113 / 255) < 0.00001 && Math.abs((c.blue || 0) - 60 / 255) < 0.00001) runs.push(t.content);
    }
    for (const row of block.table?.tableRows || []) for (const cell of row.tableCells || []) walk(cell.content);
  } };
  const tabs = list => { for (const tab of list || []) { walk((tab.documentTab || tab).body?.content); tabs(tab.childTabs); } };
  if (doc.tabs?.length) tabs(doc.tabs); else walk(doc.body?.content);
  return runs.join('');
}
const originalGreen = hash(greenRuns(original));
const reports = run.requiredArtifacts;
const all = fs.readdirSync(out, { withFileTypes: true }).filter(f => f.isFile() && /^P04-.*\.(md|json|png)$/.test(f.name) && f.name !== 'P04-review-artifact-manifest.json').map(f => ({ relativePath: f.name, file: path.join(out, f.name), evidence: false }));
all.push(...fs.readdirSync(path.join(out, 'P04-evidence'), { withFileTypes: true }).filter(f => f.isFile() && /\.(json|png|xml|yaml|log)$/.test(f.name)).map(f => ({ relativePath: 'P04-evidence/' + f.name, file: path.join(out, 'P04-evidence', f.name), evidence: true })));
for (const report of reports) if (!all.some(f => f.relativePath === report)) throw Error('Mandatory report missing');
const secret = /-----BEGIN (?:\w+ )?PRIVATE KEY-----|(?:access_token|refresh_token|client_secret|OPENAI_API_KEY|DATABASE_URL)\s*["']?\s*[:=]\s*["']?[^\s"'<>]{12,}|Bearer\s+[a-zA-Z0-9._-]{20,}/i;
for (const entry of all) {
  const bytes = fs.readFileSync(entry.file); entry.localHash = hash(bytes);
  if (bytes.length > 30 * 1024 * 1024) throw Error('Artifact exceeds size bound: ' + entry.relativePath);
  if (!entry.file.endsWith('.png') && secret.test(bytes.toString())) throw Error('Potential credential; stopped before upload: ' + entry.relativePath);
}
// The requested P04-evidence folder is a direct child of the existing shared folder.
const query = `'${config.folderId}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder' and name='P04-evidence'`;
let folder = (await google.request('https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(query) + '&fields=files(id)&pageSize=100')).files[0];
if (!folder) folder = await google.request('https://www.googleapis.com/drive/v3/files?fields=id', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'P04-evidence', mimeType: 'application/vnd.google-apps.folder', parents: [config.folderId] }) });
const folderMeta = await google.metadata(folder.id);
if (!folderMeta.parents?.includes(config.folderId)) throw Error('Evidence folder is outside the shared folder');
const evidenceGoogle = new Google({ ...config, folderId: folder.id });
evidenceGoogle.token = (...args) => google.token(...args);
const mime = file => ({ '.json': 'application/json', '.png': 'image/png', '.xml': 'application/xml', '.yaml': 'application/yaml', '.log': 'text/plain', '.md': 'text/markdown' })[path.extname(file)];
const uploaded = [], receipt = path.join(config.runtime, 'P04-review-publication.json');
for (let i = 0; i < all.length; i += 3) {
  const batch = await Promise.all(all.slice(i, i + 3).map(async entry => {
    const remote = await (entry.evidence ? evidenceGoogle : google).upload(entry.file, run.id, mime(entry.file));
    if (remote.sha256 !== entry.localHash) throw Error('Readback hash mismatch: ' + entry.relativePath);
    return { ...remote, relativePath: entry.relativePath, readbackVerified: true };
  }));
  uploaded.push(...batch);
  atomicJson(receipt, { status: 'PUBLISHING_APPROVAL_EVIDENCE', runId: run.id, folder: folderMeta, artifacts: uploaded, at: new Date().toISOString() });
  console.log(JSON.stringify({ verifiedArtifacts: uploaded.length, total: all.length }));
}
const native = nativeStatus(config.runtime);
if (!native.live) throw Error('Evidence saved; restore the actual live phone before publishing owner review');
const manifest = { author: 'CODEX', phase: 'P04', version: 1, status: 'APPROVAL_REQUIRED', runId: run.id, promptHash: run.hash, at: new Date().toISOString(),
  viewer: 'http://127.0.0.1:4317/?mode=android&issue=P04-A1', native,
  evidenceFolder: folderMeta.webViewLink || 'https://drive.google.com/drive/folders/' + folder.id,
  validation: readJson(path.join(out, 'P04-validation-results.json')), tests: readJson(path.join(run.directory, 'checks.json')), artifacts: uploaded };
const file = path.join(out, 'P04-review-artifact-manifest.json'); atomicJson(file, manifest);
const published = await google.upload(file, run.id, 'application/json');
if (published.sha256 !== hash(fs.readFileSync(file))) throw Error('Manifest readback mismatch');
if (readyPrompt(documentText(await google.document()))?.hash !== run.hash) throw Error('Prompt changed during publication; inspect before Doc insertion');
const marker = 'RCS_P04_APPROVAL_REVIEW: ' + run.id;
const text = `\nCODEX STATUS - P04\n${marker}\nAUTHOR: CODEX | PHASE: P04 | VERSION: 1\nSTATUS: APPROVAL_REQUIRED\nTwo real Android findings are ready on the connected physical test device. No P04 native production UI, navigation semantics, brand colors, Home or Outstation source was changed. The owner's P03 keep-current decision remains in force.\nLIVE OWNER REVIEW, on this computer: ${manifest.viewer}\nA1: http://127.0.0.1:4317/?mode=android&issue=P04-A1 - Account settings extend behind the visible tabs; 48 physical pixel hitbox intersection. A tap at (540,2305) opened Rides. Appearance works after scrolling. Owner choice: reserve the visible tab-bar area in the Account scroll viewport while retaining hide/show behavior, or keep/defer.\nA2: http://127.0.0.1:4317/?mode=android&issue=P04-A2 - the visually active tab reports selected=false, like all other tabs. Owner choice: expose selected state on the existing buttons without changing styling, labels, routes or replace-history, or keep/defer. Spoken TalkBack was not tested.\nThe same live viewer now has a native issue queue, actual DEVICE stream, VIEW-ONLY label, capture age and stale hiding. Selecting an issue changes its description; it does not navigate Android. Both issues are prepared on the same Account top screen. Interact on the connected physical phone. USB keep-awake is enabled.\nAndroid SM-A528B / Android14 / 1080x2400 / isolated com.rcstravels.driver.phase9; synthetic captain and local disposable database only. Original font0.9 and rotation preferences restored.\nNONVISUAL SETUP FIXES: replaced the failed ad-hoc ADB capture with the existing tested USB/private hierarchy helpers; repaired missing owned USB forwarding, and strengthened developer preview health to check both Metro and the isolated gateway and restore only missing owned mappings without rebinding conflicts. Controlled physical recovery restored one mapping. Mobile review framing now fits the entire device below a wrapping header.\nPASS: actual Maestro theme/menu/Legal-Back/tab-Back flow; 20 focused native tests; 27 handoff tests with 1 platform skip; desktop/mobile live viewer, advancing real frames, stale hiding/recovery and preserved website preview. Light/Dark/System selections and cold-start font1.3 Appearance menu worked.\nLIMITS: changing font size live produced a Clerk multiple-provider render error in the debug client; cold start recovered. Landscape attempt was inconclusive; app is portrait. Full TalkBack/keyboard, other devices, native business journeys, app build/lint were not run anew. Backend typecheck failed in untouched StudyAI/index_langGraph.ts:127 TS2719. Full backend tests were unfinished after517s and their own validation tree was terminated; no full-suite PASS is claimed.\nREADBACK-VERIFIED REVIEW MANIFEST (${uploaded.length} artifacts): ${published.url}\nP04-evidence folder: ${manifest.evidenceFolder}\n${reports.map(name => name + ': ' + uploaded.find(a => a.relativePath === name).url).join('\n')}\nOWNER DECISION NEEDED: explicitly approve or defer A1 and A2 after live review. No approval is inferred from continue, passing tests or silence. No proposed native treatment is implemented. No OUTPUT_READY or P05 is issued. The approval gate remains active across watcher retries/restarts/new prompts.\n`;
await google.appendRed(text, marker);
const verified = await google.document();
if (!documentText(verified).includes(marker) || !documentText(verified).includes(published.url)) throw Error('Doc output readback missing');
if (hash(greenRuns(verified)) !== originalGreen) throw Error('Existing ChatGPT green text changed; inspect Doc');
atomicJson(receipt, { status: 'APPROVAL_REQUIRED', runId: run.id, manifest: published, evidenceFolder: manifest.evidenceFolder, artifacts: uploaded, docVerified: true, greenTextPreserved: true, at: new Date().toISOString() });
console.log(JSON.stringify({ status: 'APPROVAL_REQUIRED', artifacts: uploaded.length, manifest: published.url, docVerified: true, greenTextPreserved: true }));
