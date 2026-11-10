import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { config } from '../../handoff/config.mjs';
import { Google } from '../../handoff/google.mjs';
import { Engine } from '../../handoff/engine.mjs';
import { readJson, atomicJson, hash, readyPrompt, documentText, alive } from '../../handoff/core.mjs';
import { parse, validate } from './core.mjs';

const worker=readJson(path.join(config.runtime,'worker.json'));
assert(!worker||!alive(worker.pid),'Stop the watcher before publishing its durable checkpoint');
const google=new Google(config),engine=new Engine(config,google),run=engine.state.run;
assert.equal(run.phase,'P05');
assert.equal(run.key,'P05:v1');
const out=path.join(run.directory,'artifacts'),receiptFile=path.join(config.runtime,'P05-publication.json');
const rows=parse(fs.readFileSync('tools/ui-quality/coverage/master-ui-coverage.csv','utf8'));
const validation=validate(rows,{issues:readJson('tools/ui-quality/coverage/issues.json'),routes:readJson('tools/ui-quality/coverage/discovered-routes.json')});
assert.equal(validation.sourceTraces,rows.length);
assert.equal(hash(fs.readFileSync(path.join(out,'master-ui-coverage.csv'))),hash(fs.readFileSync('tools/ui-quality/coverage/master-ui-coverage.csv')));
const baseline=readJson(path.join(run.directory,'product-source-before.json'));
assert.equal(baseline.length,264);
assert(baseline.every(f=>hash(fs.readFileSync(f.file))===f.sha256),'Preserve all protected product source files');
const final=readJson(path.join(out,'P05-final-validation.json')),browser=readJson(path.join(out,'P05-browser-verification.json'));
assert.equal(final.sourceFilesUnchanged,baseline.length);
assert.equal(final.tests.failed,0);assert(final.tests.passed>=40);
assert.equal(final.deviceExecution,'NOT_RUN');assert.equal(browser.status,'PASS');
assert.equal(browser.checks.filter(c=>c.websiteCoverageToAndroidToWebsite).length,2,'Mode switching must pass at both viewports');
const checks=readJson(path.join(run.directory,'checks.json'));
const commands=['npm --prefix frontend run build','node --test tools/handoff/tests/*.test.mjs tools/ui-quality/coverage/coverage.test.mjs','node tools/ui-quality/coverage/browser-test.mjs','node tools/ui-quality/coverage/build.mjs (stable regeneration)'];
const tests=commands.map(command=>{const check=checks.filter(c=>c.command===command).at(-1);assert.equal(check?.exitCode,0,command);return check;});

function textRuns(document){
  const runs=[];
  const walk=blocks=>{for(const block of blocks||[]){runs.push(...(block.paragraph?.elements||[]).filter(e=>e.textRun).map(e=>e.textRun));for(const row of block.table?.tableRows||[])for(const cell of row.tableCells||[])walk(cell.content);}};
  const tabs=list=>{for(const tab of list||[]){walk((tab.documentTab||tab).body?.content);tabs(tab.childTabs);}};
  document.tabs?tabs(document.tabs):walk(document.body?.content);return runs;
}
const hasColor=(run,color)=>['red','green','blue'].every((key,i)=>Math.abs((run.textStyle?.foregroundColor?.color?.rgbColor?.[key]||0)-color[i]/255)<0.00001);
const greenHash=doc=>hash(textRuns(doc).filter(r=>hasColor(r,[24,113,60])).map(r=>r.content).join(''));
const doc=await google.document();
assert.equal(readyPrompt(documentText(doc))?.hash,run.hash,'The authoritative P05 prompt must remain unchanged');
const preservationFile=path.join(run.directory,'publication-document-before.json');
const preservation=readJson(preservationFile,{greenHash:greenHash(doc)});
assert.equal(preservation.greenHash,greenHash(doc),'Preserve the prior ChatGPT text');
atomicJson(preservationFile,preservation);

if(run.stage!=='published'){
  const artifacts=[...run.requiredArtifacts,'P05-source-discovery.json','P05-evidence-catalog.json','P05-coverage-validation.json','P05-final-validation.json','P05-issues.json','P05-source-preservation.json','P05-regeneration-proof.json','P05-browser-verification.json','P05-test-output.md','P05-browser-initial-classification-failure.json','P05-browser-before-mobile-reveal.json',...browser.screenshots];
  assert.equal(new Set(artifacts).size,artifacts.length);
  const baselineTests=checks.filter(c=>c.exitCode!==0).map(c=>({...c,status:'RESOLVED IMPLEMENTATION / TEST FAILURE; retained for traceability',preExisting:false}));
  baselineTests.push({command:'Android device execution, ADB/Maestro positioning, native rendering and spoken TalkBack in P05',status:'NOT_RUN',scope:'Phone disconnected; 141 Android entries source-mapped only. Historical P02/P04 evidence is separately scoped.'},{command:'Backend and captain-app suites',status:'NOT_RUN',scope:'No backend/captain product source changed. Earlier unrelated failures remain in cited historical evidence.'});
  const summary=`P05 complete, website-first: ${rows.length} source-traced inventory entries (${final.counts.platform.website} website, ${final.counts.platform.android} Android), a stable hierarchical CSV, grouped coverage counts and eight proposed batches of 3–5 targets. Searchable coverage navigation uses actual synthetic website previews in the existing reviewer. ${final.tests.passed} tracker/handoff tests passed, ${final.tests.skipped} existing platform test skipped; frontend build and desktop/mobile browser navigation, mode-switch restoration and honest offline checks passed. All ${baseline.length} protected product source files remain byte-identical. Nine historical P01 sample failures and five owner-deferred P03 findings remain FAIL; P04 verification stays bounded to its actual native checks. No Home/Outstation redesign. Android device execution in P05 is NOT_RUN while disconnected. This completes inventory/planning, not all-screen audits; proposed batches do not authorize P06.`;
  atomicJson(path.join(run.directory,'result.json'),{status:'complete',verified:true,blocker:null,summary,tests,baselineTests,artifacts});
  engine.state.connections.google='connected';
  engine.state.approvalRequired={...engine.state.approvalRequired,active:false,phase:'P05',issues:[],pendingVerification:[],reason:'Inventory and planning completed within the authorized prompt; no blocking product decision',updatedAt:new Date().toISOString()};
  run.stage='verifying';engine.save();
  const upload=google.upload.bind(google);
  google.upload=async(...args)=>{const artifact=await upload(...args);console.log('Verified Drive artifact: '+path.basename(args[0]));return artifact;};
  await engine.finish();
}
assert.equal(run.stage,'published','Publish only after the artifact contract and active prompt are verified');
const after=await google.document(),marker='RCS_OUTPUT_RUN: '+run.id,body=documentText(after);
assert.equal(greenHash(after),preservation.greenHash,'Preserve all ChatGPT green text');
assert.equal(body.split(marker).length-1,1,'Exactly one P05 completion block');
assert(textRuns(after).some(r=>r.content.includes(marker)&&hasColor(r,[180,35,46])),'Dark red completion marker required');
const publication={status:'OUTPUT_READY',phase:'P05',runId:run.id,at:new Date().toISOString(),manifest:run.manifest,artifacts:run.artifacts,docVerified:true,darkRedVerified:true,greenPreserved:true,counts:final.counts,tests:final.tests,deviceExecution:'NOT_RUN',protectedSourceUnchanged:baseline.length};
atomicJson(receiptFile,publication);
console.log(JSON.stringify({status:publication.status,artifacts:run.artifacts.length,manifest:run.manifest.url,docVerified:true,greenPreserved:true}));
