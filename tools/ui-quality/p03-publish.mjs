import fs from 'node:fs';
import path from 'node:path';
import { config } from '../handoff/config.mjs';
import { Google } from '../handoff/google.mjs';
import { readJson, atomicJson, documentText, readyPrompt, hash } from '../handoff/core.mjs';
import { nativeStatus } from '../handoff/native-status.mjs';
const state=readJson(path.join(config.runtime,'state.json')),run=state.run,dir=path.join(run.directory,'artifacts');
if(run.phase!=='P03'||!state.bootstrap?.active)throw Error('Current P03 session must own publication');
const google=new Google(config),doc=await google.document(),active=readyPrompt(documentText(doc));
if(active?.hash!==run.hash)throw Error('The active prompt changed; inspect it before publication');
const proof=readJson(path.join(dir,'P03-viewer-verification.json'));
if(proof?.status!=='PASS')throw Error('Viewer must pass before review publication');
const reports=['P03-execution-report.md','P03-accessibility-metrics.md','P03-responsive-evidence.md','P03-visual-diff.md','P03-visual-approval-board.md','P03-live-viewer-instructions.md'];
const evidence=['P03-before-metrics.json','P03-current-metrics.json','P03-review-queue.json','P03-viewer-verification.json','P03-native-preview-proof.json','P03-restored-pilot.json','P03-source-preservation.json','P03-functional-change.md','P03-deferred-candidates.md','P03-frontend-regressions.json'];
const metrics=[...readJson(path.join(dir,'P03-before-metrics.json')),...readJson(path.join(dir,'P03-current-metrics.json'))];
const names=[...reports,...evidence,...metrics.map(r=>r.screenshot),...proof.screenshots];
const native=nativeStatus(config.runtime);
if(native.live){const response=await fetch('http://127.0.0.1:4317/native-screen.png');if(response.ok&&nativeStatus(config.runtime).live){fs.writeFileSync(path.join(dir,'P03-native-device-current.png'),Buffer.from(await response.arrayBuffer()));names.push('P03-native-device-current.png');}}
const records=[];
const secret=/-----BEGIN (?:\w+ )?PRIVATE KEY-----|(?:access_token|refresh_token|client_secret|OPENAI_API_KEY|DATABASE_URL)\s*["']?\s*[:=]\s*["']?[^\s"'<>]{12,}|Bearer\s+[a-zA-Z0-9._-]{20,}/i;
// Validate every local file before the first upload.
for(const name of [...new Set(names)]){
 const file=path.resolve(dir,name);if(!file.startsWith(path.resolve(dir)+path.sep))throw Error('Artifact escapes run directory');
 const bytes=fs.readFileSync(file);if(bytes.length>30*1024*1024)throw Error('Artifact too large');
 if(!/\.(?:md|json|png)$/.test(name))throw Error('Unsupported artifact type');
 if(!name.endsWith('.png')&&secret.test(bytes.toString()))throw Error('Possible credential; publication stopped');
 records.push({file,name,digest:hash(bytes)});
}
const uploaded=[];
for(const record of records){const artifact=await google.upload(record.file,run.id,record.name.endsWith('.png')?'image/png':record.name.endsWith('.json')?'application/json':'text/markdown',run.phase);
 if(artifact.sha256!==record.digest)throw Error('Drive readback differs from verified local bytes');uploaded.push({...artifact,localName:record.name});
 atomicJson(path.join(config.runtime,'P03-review-links.json'),uploaded);
 console.log(`${uploaded.length}/${records.length} verified ${record.name}`);
}
const manifest={author:'CODEX',phase:'P03',runId:run.id,promptHash:run.hash,status:'APPROVAL_REQUIRED',at:new Date().toISOString(),
 viewer:'http://127.0.0.1:4317/?issue=P03-O1&width=390&theme=dark',native,tests:readJson(path.join(run.directory,'checks.json')),artifacts:uploaded};
const manifestPath=path.join(run.directory,'review-artifact-manifest.json');atomicJson(manifestPath,manifest);
const published=await google.upload(manifestPath,run.id,'application/json');
if(published.sha256!==hash(fs.readFileSync(manifestPath)))throw Error('Review manifest readback mismatch');
atomicJson(path.join(config.runtime,'P03-review-publication.json'),{manifest:published,artifacts:uploaded,at:new Date().toISOString()});
if(readyPrompt(documentText(await google.document()))?.hash!==run.hash)throw Error("Prompt changed during uploads; review before appending status");
const marker=`RCS_APPROVAL_RUN: ${run.id}`;
await google.appendRed(`\nCODEX STATUS — P03\n${marker}\nAUTHOR: CODEX | PHASE: P03 | VERSION: 1\nSTATUS: APPROVAL_REQUIRED\nOWNER CHOICE NEEDED FOR VISUAL FIXES\nThe latest live-preview-first addendum is implemented through its owner review checkpoint. Website Home/Outstation remain separate and all exact brand colors are retained. Five measured live issues are ready. Only the reproduced nonvisual Outstation dialog Tab trap is fixed; its keyboard behavior passes. Earlier visual pilot candidates are saved and restored to their exact pre-pilot baseline pending owner choice.\nLIVE WEBSITE REVIEW (local computer only): ${manifest.viewer}\nISSUE LINKS: ${['P03-H1','P03-H2','P03-H3','P03-O1','P03-O2'].map(id=>`http://127.0.0.1:4317/?issue=${id}&width=390&theme=dark`).join('\n')}\nANDROID: http://127.0.0.1:4317/?mode=android — actual DEVICE, ${native.status}, ${native.width||'?'} × ${native.height||'?'}, VIEW-ONLY. Interact on the connected physical phone; browser clicks do not control it. Capture hides outside the isolated foreground package, inactive fixture, disconnection or 15s stale state.\nSTART: powershell -NoProfile -ExecutionPolicy Bypass -File tools/ui-quality/preview.ps1 start\nPHONE KEEP-AWAKE: node tools/phase9-native/phone-awake.mjs enable (already active).\nSTOP NATIVE: preview.ps1 stop-native; keeps USB awake enabled.\nREADBACK-VERIFIED REVIEW MANIFEST: ${published.url}\n${reports.map(name=>`${name} — ${uploaded.find(a=>a.name===name).url}`).join('\n')}\nCHECKS:\n${manifest.tests.map(t=>`${t.command} — exit ${t.exitCode} — ${t.scope}`).join('\n')}\nThe axe findings remain unresolved visual choices, not accessibility PASS. No approved after screenshots or replacement goldens are claimed.\nOWNER NEXT ACTION: open the live viewer and tell Codex the treatment for each issue ID (H1/O2 shared copyright contrast, H2 touch targets, H3 hero overflow, O1 destination prompt contrast). Suggestions are optional and brand colors are locked. No automatic visual approval from tests or silence.\nWATCHER: APPROVAL_REQUIRED persists across retries, restart and newer prompts; no P04 or OUTPUT_READY. Existing hourly reviewer should surface this owner decision and must not advance the phase.\n`,marker);
const verified=await google.document();if(!documentText(verified).includes(marker)||!documentText(verified).includes(published.url))throw Error('Doc publication readback missing');
console.log(JSON.stringify({artifacts:uploaded.length,manifest:published.url,status:'APPROVAL_REQUIRED',docVerified:true}));
