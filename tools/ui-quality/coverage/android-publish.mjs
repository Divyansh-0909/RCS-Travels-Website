import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { config } from '../../handoff/config.mjs';
import { Google } from '../../handoff/google.mjs';
import { readJson, atomicJson, hash, documentText, readyPrompt } from '../../handoff/core.mjs';
import { parse } from './core.mjs';

const directory='output/handoff/p05-android-followup-2026-10-23',out=path.join(directory,'artifacts');
const run=readJson('output/handoff/state.json').run,google=new Google(config),original=readJson('output/handoff/P05-publication.json');
assert.equal(run.phase,'P05');assert.equal(run.stage,'published');
const grounding=readJson('output/handoff/android-prompt-grounding.json');assert.equal(grounding.prompt.hash,run.hash);
const proof=readJson(path.join(out,'P05-android-device-verification.json'));assert.equal(proof.status,'PASS');
assert.equal(proof.package,'com.rcstravels.driver.phase9');assert.equal(proof.productSourceUnchanged,true);
const baseline=readJson(path.join(directory,'product-source-before.json'));
assert(baseline.every(f=>hash(fs.readFileSync(f.file))===f.sha256),'Preserve all product source');
const receiptFile=path.join(directory,'publication.json'),receipt=readJson(receiptFile,{phase:'P05',continuation:'ANDROID_CONNECTED',runId:run.id+':android-connected-2026-10-23',artifacts:[]});
assert(!receipt.docVerified,'This connected continuation is already published; retain its immutable evidence');
const mime=file=>({'.md':'text/markdown','.csv':'text/csv','.json':'application/json','.png':'image/png','.xml':'application/xml'})[path.extname(file)];
const secret=/-----BEGIN (?:\w+ )?PRIVATE KEY-----|(?:access_token|refresh_token|client_secret|OPENAI_API_KEY|DATABASE_URL)\s*["']?\s*[:=]\s*["']?[^\s"'<>]{12,}|Bearer\s+[a-zA-Z0-9._-]{20,}/i;
async function upload(name){
  assert.equal(path.basename(name),name);const file=path.join(out,name),bytes=fs.readFileSync(file),type=mime(file);assert(type,'Unsupported evidence type');assert(bytes.length<30*1024*1024);
  if(type!=='image/png')assert(!secret.test(bytes.toString()),'Potential credential in evidence');
  const sha256=hash(bytes),old=receipt.artifacts.find(a=>a.name===name&&a.sha256===sha256);
  const artifact=old?await google.verifyArtifact(old.id):await google.upload(file,receipt.runId,type,'P05');
  assert.equal(artifact.sha256,sha256);receipt.artifacts=[...receipt.artifacts.filter(a=>a.name!==name),artifact];atomicJson(receiptFile,receipt);
  console.log('Verified Android artifact: '+name);return artifact;
}
if(process.argv.includes('--evidence')){
  const evidence=await upload('P05-android-device-verification.json');
  for(const name of proof.screenshots){await upload(name);await upload(name.replace(/\.png$/,'.xml'));}
  const rows=parse(fs.readFileSync('tools/ui-quality/coverage/master-ui-coverage.csv','utf8')),byId=new Map(rows.map(r=>[r.id,r]));
  const navigation={
    'A.HOME':['Use the connected isolated synthetic captain fixture','Tap Home'],
    'A.MARKET':['Use the connected isolated synthetic captain fixture','Tap Market'],
    'A.RIDES':['Use the connected isolated synthetic captain fixture','Tap Rides'],
    'A.ACCOUNT':['Use the connected isolated synthetic captain fixture','Tap Account'],
    'A.ACCOUNT.APPEARANCE':['Tap Account','Scroll Appearance above the floating fade','Open Appearance without selecting a preference'],
    'A.ACCOUNT.LANGUAGE':['Tap Account','Scroll Language above the floating fade','Open Language without selecting a language'],
    'A.LEGAL':['Tap Account','Scroll Legal into view','Tap Legal; inspect native list only; do not open external documents'],
  };
  const ids=[...new Set(proof.checks.flatMap(c=>c.ids))];assert.equal(ids.length,7);
  const entries=ids.map(id=>{assert(byId.has(id)&&navigation[id]);return {id,navigation:navigation[id],source_file:byId.get(id).source_file,source_sha256:hash(fs.readFileSync(byId.get(id).source_file))};});
  atomicJson('tools/ui-quality/coverage/android-observations.json',{phase:'P05',status:'PASS',scope:'NATIVE_NAVIGATION_REACHABILITY_ONLY',at:proof.completedAt,package:proof.package,evidence,entries});
  console.log(JSON.stringify({evidenceReady:true,observedEntries:entries.length,verifiedNativeArtifacts:receipt.artifacts.length}));
  process.exit(0);
}
const viewer=readJson(path.join(out,'P05-android-viewer-verification.json')),final=readJson(path.join(out,'P05-final-validation.json'));
assert.equal(viewer.status,'PASS');assert.equal(final.tests.failed,0);assert(final.tests.passed>=41);
assert.equal(final.observedNativeEntries,7);assert.equal(final.deviceExecution,'CONNECTED_NAVIGATION_REACHABILITY_ONLY');
const checks=readJson(path.join(directory,'checks.json'));
for(const command of ['node tools/ui-quality/coverage/android-device.mjs','node tools/ui-quality/coverage/android-viewer-test.mjs','node --test tools/handoff/tests/*.test.mjs tools/ui-quality/coverage/coverage.test.mjs'])assert.equal(checks.filter(c=>c.command===command).at(-1)?.exitCode,0,command);
const before=parse(fs.readFileSync(path.join(directory,'coverage-before.csv'),'utf8')),after=parse(fs.readFileSync('tools/ui-quality/coverage/master-ui-coverage.csv','utf8'));
assert.deepEqual(after.map(r=>r.id),before.map(r=>r.id),'Preserve stable IDs');
for(const row of after){const old=before.find(r=>r.id===row.id);for(const field of ['audit_status','audit_dimensions','owner_decision','implementation_status','verification_status','last_review_phase','last_review_date'])assert.deepEqual(row[field],old[field],row.id+' '+field);}
fs.copyFileSync('tools/ui-quality/coverage/android-observations.json',path.join(out,'P05-android-observations.json'));
const required=['master-ui-coverage.csv','master-ui-coverage-summary.md','master-ui-next-batches.md','P05-execution-report.md','P05-tracker-validation.md','P05-live-viewer-instructions.md'];
const additional=['P05-android-viewer-verification.json',...viewer.screenshots,'P05-android-observations.json','P05-coverage-validation.json','P05-final-validation.json','P05-source-preservation.json','P05-android-test-output.md','P05-android-regeneration-proof.json','P05-android-device-attempt1.json','P05-android-menu-diagnostic.png','P05-android-menu-diagnostic.xml'];
for(const name of [...required,...additional])await upload(name);
const finalTests=[...new Set(checks.map(c=>c.command))].map(command=>checks.filter(c=>c.command===command).at(-1));
assert(finalTests.every(check=>check.exitCode===0),'Every final executed check must pass');
const baselineTests=checks.filter(c=>c.exitCode!==0).map(c=>({...c,status:'RESOLVED TEST ASSERTION; retained historical attempt'}));
const manifest={author:'CODEX',phase:'P05',kind:'ANDROID_CONNECTED_CONTINUATION',at:new Date().toISOString(),promptHash:run.hash,originalManifest:original.manifest,tests:finalTests,baselineTests,checksHistory:checks,productSourceUnchanged:baseline.length,scope:proof.scope,observedNativeEntries:7,artifacts:receipt.artifacts};
atomicJson(path.join(out,'P05-android-followup-manifest.json'),manifest);
receipt.manifest=await upload('P05-android-followup-manifest.json');
atomicJson(receiptFile,receipt);
const doc=await google.document();assert.equal(readyPrompt(documentText(doc))?.hash,run.hash,'The authoritative P05 prompt changed');
function textRuns(document){const result=[];const walk=blocks=>{for(const b of blocks||[]){result.push(...(b.paragraph?.elements||[]).filter(e=>e.textRun).map(e=>e.textRun));for(const row of b.table?.tableRows||[])for(const cell of row.tableCells||[])walk(cell.content);}};const tabs=list=>{for(const t of list||[]){walk((t.documentTab||t).body?.content);tabs(t.childTabs);}};document.tabs?tabs(document.tabs):walk(document.body?.content);return result;}
const color=(r,rgb)=>['red','green','blue'].every((key,i)=>Math.abs((r.textStyle?.foregroundColor?.color?.rgbColor?.[key]||0)-rgb[i]/255)<0.00001);
const greenHash=d=>hash(textRuns(d).filter(r=>color(r,[24,113,60])).map(r=>r.content).join('')),green=greenHash(doc);
const marker='RCS_ANDROID_FOLLOWUP: P05-2026-10-23';
const text=`\nCODEX FOLLOW-UP — P05 ANDROID CONNECTED\n${marker}\nAUTHOR: CODEX | PHASE: P05 | VERSION: 1 | CONTINUATION: OWNER REQUESTED\nSTATUS: OUTPUT_READY\nREVIEW STATUS: AWAITING_REVIEW\nCOMPLETED: ${new Date().toISOString()}\nThe owner reconnected the phone and requested the Android part of P05. This follow-up replaces the initial disconnected-only limitation for the tested native viewer/navigation scope. The original P05 output and all earlier Drive artifacts remain preserved. No P06 was authored.\nACTUAL DEVICE: isolated com.rcstravels.driver.phase9 on one connected Android phone; disposable local database and synthetic captain only. USB keep-awake remains enabled.\nPASS: ${proof.checks.length} native observations covering seven distinct inventory entries — Home, Market, Rides, Account, Appearance menu, Language menu and Legal — plus Account return. The four main tabs' selected native nodes match their actual destinations. Menus were opened/closed without changing preferences; external Legal documents and business actions were not invoked.\nVIEWER PASS: actual DEVICE / VIEW-ONLY advancing frames, coverage search/query persistence, desktop 1440x1000 and mobile390x844 fit, stale hiding/recovery, and preserved website/owner-deferred issue mode. The former hardcoded disconnected message now follows actual fixture/device status. Selecting a coverage row still does not control the phone or assert the selected row is currently displayed.\nTRACKER: all 347 stable IDs retained (206 website / 141 Android), seven entries marked DEVICE_OBSERVED with exact evidence. Existing audit, owner, implementation, verification statuses and historical dates are unchanged; children are not auto-completed. ${final.tests.passed} tracker/handoff tests passed, ${final.tests.skipped} existing platform test skipped, zero failed. All ${baseline.length} protected product source files remain byte-identical. Initial menu-test failure is retained: the test was corrected from the system preference key to the actual UI label “Use device setting”; product code was not changed.\nLIMITS: navigation/render reachability only; comprehensive screen/child audits, loading/error/theme matrices, spoken TalkBack, other devices/iOS, and fresh full business journeys remain NOT_RUN. No new full app/backend suite or production acceptance is claimed. Earlier P01 failures, five owner-deferred P03 defects, and bounded P04 results remain intact.\nLIVE ANDROID REVIEW: http://127.0.0.1:4317/?mode=android&coverage=A.ACCOUNT&width=390&theme=light\nVERIFIED FOLLOW-UP MANIFEST: ${receipt.manifest.url}\n${required.map(name=>name+' — '+receipt.artifacts.find(a=>a.name===name).url).join('\n')}\n`;
await google.appendRed(text,marker);
const verified=await google.document(),body=documentText(verified);
assert.equal(greenHash(verified),green,'Preserve ChatGPT green text');assert.equal(body.split(marker).length-1,1,'Exactly one Android continuation');
assert.equal((body.match(/^CODEX OUTPUT — P05\r?$/gm)||[]).length,1,'Preserve the single original P05 completion block');
assert(textRuns(verified).some(r=>r.content.includes(marker)&&color(r,[180,35,46])),'Dark red continuation required');
Object.assign(receipt,{status:'OUTPUT_READY',docVerified:true,darkRedVerified:true,greenPreserved:true,completedAt:new Date().toISOString(),observedNativeEntries:7,tests:final.tests});atomicJson(receiptFile,receipt);
console.log(JSON.stringify({status:receipt.status,artifacts:receipt.artifacts.length,manifest:receipt.manifest.url,docVerified:true}));
