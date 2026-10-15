import assert from 'node:assert/strict';
import {readFile,writeFile,readdir,stat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {hash,verifyBaseline} from './baseline.mjs';
const out=resolve('output/phase9d-audit-custody-2026-10-14'),names=await readdir(out);
const checkSources=async sources=>{for(const [file,digest]of Object.entries(sources))assert.equal(hash(await readFile(file)),digest,'SOURCE_CHANGED:'+file);};
const selected={};
for(const mode of ['unit','db','full','typecheck']){
  const records=[];for(const name of names.filter(n=>n.startsWith(mode+'-')&&n.endsWith('.json'))){const record=JSON.parse(await readFile(join(out,name)));if(record.code===0&&record.sourcesUnchanged&&record.sources)records.push({name,record});}
  records.sort((a,b)=>Date.parse(b.record.finished)-Date.parse(a.record.finished));
  const current=[];for(const row of records){let valid=true;for(const [file,digest]of Object.entries(row.record.sources))if(hash(await readFile(file))!==digest){valid=false;break;}if(valid)current.push(row);}
  assert.ok(current.length,'CURRENT_EXECUTION_MISSING:'+mode);selected[mode]=current[0];if(mode==='db'){assert.ok(current.length>=2,'INDEPENDENT_REPEAT_MISSING');selected.repeat=current[1];}
}
const witnesses=[];for(const chosen of [selected.db,selected.repeat]){
  const matches=[];for(const name of names.filter(n=>/^custody-witness-.*\.json$/.test(n))){const info=await stat(join(out,name));if(info.mtimeMs>=Date.parse(chosen.record.started)&&info.mtimeMs<=Date.parse(chosen.record.finished)){const w=JSON.parse(await readFile(join(out,name)));if(w.status==='PASS'&&w.verificationKeys&&w.localEvents)matches.push({name,w});}}
  assert.equal(matches.length,1,'WITNESS_SELECTION');witnesses.push({...matches[0],execution:chosen.name});
  assert.equal(chosen.record.servers.length,2);assert.notEqual(...chosen.record.servers);assert.ok(chosen.record.independentServerDenials.some(d=>d.sqlstate==='42501')&&chosen.record.independentServerDenials.some(d=>d.sqlstate==='28P01'));
}
const normalized=w=>({groups:w.groups,actions:w.localEvents.map(e=>({sequence:e.event.sequence,action:e.event.action,actor:e.event.actor,generation:e.event.generation,frozen:e.event.frozen,service:e.event.service})),accounting:w.accounting,outcome:w.outcome,
  financialCounts:w.financialBefore.counts,wallets:w.financialBefore.drivers.map(d=>d.walletBalance).sort((a,b)=>a-b)});
assert.deepEqual(normalized(witnesses[0].w),normalized(witnesses[1].w));
const witnessHashes=await Promise.all(witnesses.map(async w=>({file:w.name,sha256:hash(await readFile(join(out,w.name)))})));
await writeFile(join(out,'independent-repeat.json'),JSON.stringify({code:0,executions:witnesses.map(w=>w.execution),witnesses:witnessHashes,comparison:'ordered recipe groups, actions, generations, accounting, outcome and financial counts/balances',excluded:'Generated IDs, source DB identity, hash/receipt/signing identities and custodian wall-clock differ. Every receipt is verified within its run; this is not saved-input event replay.',fullEventReplay:false},null,2));
for(const [mode,count]of [['unit',5],['db',20],['full',1834]])assert.ok(selected[mode].record.summary.includes('# pass '+count));
for(const mode of ['lint','whitespace','structural']){const check=JSON.parse(await readFile(join(out,mode+'.json')));assert.equal(check.code,0);await checkSources(check.sources);}
const review=JSON.parse(await readFile(join(out,'independent-review.json')));await checkSources(review.currentReviewedSources);
const coverageRecord=JSON.parse(await readFile(join(out,'coverage-custody.json')));await checkSources(coverageRecord.sources);
for(const w of witnesses){const audit=JSON.parse(await readFile(join(out,'receipt-audit-'+w.name)));assert.equal(audit.code,0);assert.equal(audit.witnessHash,hash(await readFile(join(out,w.name))));}
const coverage=JSON.parse(await readFile(join(out,'coverage/coverage-summary.json'))).total;for(const metric of ['statements','branches','functions','lines'])assert.equal(coverage[metric].pct,100);
const mutation=JSON.parse(await readFile(join(out,'mutation-closure.json')));assert.equal(mutation.code,0);
const baseline=await verifyBaseline(),files=[];
for(const name of await readdir('tools/phase9d'))if(name.startsWith('custody-'))files.push('tools/phase9d/'+name);
files.push('backend/tests/phase9dCustody.test.js','backend/tests/integration/phase9dCustody.test.js','backend/tests/helpers/phase9dCustodyFixture.js','backend/tests/helpers/phase9dCustodyFaultChild.js');
const sourceHashes=Object.fromEntries(await Promise.all(files.map(async f=>[f,hash(await readFile(f))])));
const documentation=Object.fromEntries(await Promise.all(['docs/benchmarks/phase9d-1-audit-custody-checkpoint-2026-10-14.md','CONTEXT.md','ROADMAP.txt'].map(async f=>[f,hash(await readFile(f))])));
const artifactNames=(await readdir(out)).filter(n=>n.endsWith('.json')||n.endsWith('.md')||n.endsWith('.log')).filter(n=>n!=='manifest.json');
const artifacts=[];for(const n of artifactNames){const bytes=await readFile(join(out,n));artifacts.push({file:'output/phase9d-audit-custody-2026-10-14/'+n,sha256:hash(bytes),bytes:bytes.length});}
const collect=async directory=>{for(const entry of await readdir(directory,{withFileTypes:true})){const file=join(directory,entry.name);if(entry.isDirectory())await collect(file);else{const bytes=await readFile(file);artifacts.push({file:file.replaceAll('\\','/'),sha256:hash(bytes),bytes:bytes.length});}}};
for(const directory of ['coverage','clones']){try{await stat(join(out,directory));}catch{continue;}await collect('output/phase9d-audit-custody-2026-10-14/'+directory);}
const regressionRoot='output/phase9d-broker-recovery-2026-10-14',regressionNames=(await readdir(regressionRoot)).filter(n=>n.startsWith('regression-verification-')).sort();
const regressionFile=regressionRoot+'/'+regressionNames.at(-1),regression=JSON.parse(await readFile(regressionFile));assert.equal(regression.code,0);assert.equal(regression.results.length,6);
const regressions=[];
for(const directory of ['output/phase9d-broker-2026-10-13','output/phase9d-transport-2026-10-13','output/phase9d-outbox-broker-2026-10-13','output/phase9d-1-sql-broker-2026-10-13'])for(const name of await readdir(directory)){
  if(!/^(unit|integration|all-db|replay)-.*\.json$/.test(name))continue;const file=directory+'/'+name,record=JSON.parse(await readFile(file));
  if(record.code!==0||Date.parse(record.started)<Date.parse(regression.started)||Date.parse(record.finished)>Date.parse(regression.finished))continue;
  assert.equal(record.sourcesUnchanged,true);await checkSources(record.sources);regressions.push(file);
  const bytes=await readFile(file);artifacts.push({file,sha256:hash(bytes),bytes:bytes.length});const log=file.replace(/\.json$/,'.log');const logBytes=await readFile(log);artifacts.push({file:log,sha256:hash(logBytes),bytes:logBytes.length});
}
assert.equal(regressions.length,6,'REGRESSION_SELECTION');const regressionBytes=await readFile(regressionFile);artifacts.push({file:regressionFile,sha256:hash(regressionBytes),bytes:regressionBytes.length});
const manifest={schema:'audit-custody-closure-v1',at:new Date().toISOString(),phase9d1:'PARTIAL',independentAuditCustody:'PARTIAL',boundedBrokerJournal:'VERIFIED_IN_ISOLATION',productionReady:false,
  selected:Object.fromEntries(Object.entries(selected).map(([k,v])=>[k,v.name])),sources:sourceHashes,documentation,regressions,coverage,mutation:{unique:mutation.unique,totals:mutation.totals},baseline,artifacts,
  preservedBaseline:'output/phase9d-broker-recovery-2026-10-14/manifest.json',remaining:'readiness-gates.json',productionShadow:'OFF',consequences:'OFF',phase9d2:'NOT_STARTED'};
await writeFile(join(out,'manifest.json'),JSON.stringify(manifest,null,2));console.log(JSON.stringify({selected:manifest.selected,artifacts:artifacts.length,phase9d1:manifest.phase9d1}));
