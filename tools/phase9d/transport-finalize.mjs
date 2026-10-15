import assert from 'node:assert/strict';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';
import {hash,verifyBaseline} from './baseline.mjs';
const root=resolve(import.meta.dirname,'../..'),out=join(root,'output/phase9d-transport-2026-10-13');
const scope=['protocol','http','service','database','pump','child','replay'].map(name=>'tools/phase9d/transport-'+name+'.mjs');
const artifacts={},sources={};
async function bind(file){const bytes=await readFile(file);artifacts[relative(root,file).replaceAll('\\','/')]={sha256:hash(bytes),bytes:bytes.length};return bytes;}
async function load(file){return JSON.parse(await bind(file));}
for(const file of scope)sources[file]=hash(await readFile(join(root,file)));
const hashCache=Object.fromEntries(await Promise.all(['transport-sender.sql','transport-receiver.sql'].map(async file=>[file,hash(await readFile(join(root,'tools/phase9d',file)))])));
async function sourceCurrent(record){
  if(!record.sources)return false;
  for(const [file,sha] of Object.entries(record.sources))if(hash(await readFile(join(root,file)))!==sha)return false;
  return true;
}
async function select(prefix,predicate){
  for(const file of (await readdir(out)).filter(file=>file.startsWith(prefix)&&file.endsWith('.json')).sort().reverse()){
    const path=join(out,file),record=JSON.parse(await readFile(path));
    if(await predicate(record,file)){await bind(path);try{await bind(path.replace(/\.json$/,'.log'));}catch(error){if(error.code!=='ENOENT')throw error;}return {path:relative(root,path).replaceAll('\\','/'),record};}
  }
  throw Error('MISSING_ACCEPTED_CURRENT:'+prefix);
}
const executions={};
for(const mode of ['unit','integration','full','typecheck','record-replay','saved-replay'])executions[mode]=await select(mode+'-',async record=>record.code===0&&record.sourcesUnchanged&&await sourceCurrent(record));
const regressions={};
for(const [name,file]of Object.entries({broaderDatabase:'output/phase9d-1-sql-broker-2026-10-13/all-db-1791900280723-01125861-7c72-48c3-a624-dfbc443182eb.json',originalOutbox:'output/phase9d-outbox-broker-2026-10-13/integration-1791900293305-c53d9496-289f-4559-8023-f2c9d1a6045c.json'})){
  const record=await load(join(root,file));assert.equal(record.code,0);assert.ok(record.sourcesUnchanged);assert.ok(await sourceCurrent(record));
  await bind(join(root,file.replace(/\.json$/,'.log')));regressions[name]={path:file,summary:record.summary,sourcesUnchanged:true};
}
const capsule=await select('capsule-',async record=>record.status==='PASS'&&await sourceCurrent(record)&&Object.entries(record.transportSql).every(([file,sha])=>sha===hashCache[file]));
const witness=await select('transport-witness-',(record,file)=>{
  const at=Number(file.slice('transport-witness-'.length,-'.json'.length)),execution=executions.integration.record;
  const {digest,...body}=record;
  return at>=Date.parse(execution.started)&&at<=Date.parse(execution.finished)&&digest===hash(JSON.stringify(body))&&
    record.groups.length===14&&record.liveCalls===0&&record.productionCalls===0&&record.distinctDatabases===true&&
    record.sqlMutations?.catalogRestored&&record.sqlMutations.reports.length===12&&record.sqlMutations.reports.every(row=>row.status==='KILLED');
});
const outcomes=[];
for(const mode of ['record-replay','saved-replay']){
  const path=executions[mode].record.recipePath,recipe=await load(path);
  for(const file of (await readdir(out)).filter(file=>file.startsWith('transport-replay-outcome-'+recipe.id+'-'))){
    const value=await load(join(out,file));assert.equal(value.recipeSha256,hash(JSON.stringify(recipe)));assert.equal(value.outcomeSha256,hash(JSON.stringify(value.outcome)));outcomes.push({file,digest:value.outcomeSha256,recipeId:recipe.id});
  }
}
assert.equal(new Set(outcomes.map(row=>row.recipeId)).size,1);assert.ok(outcomes.length>=2);assert.equal(new Set(outcomes.map(row=>row.digest)).size,1);
await writeFile(join(out,'saved-replay-comparison.json'),JSON.stringify({status:'PASS',outcomes,boundary:'One explicit transport recipe; generated receipt UUID/MAC, database names, ports, lease tokens and audit wall-clock fields are excluded. Actual authenticated receipt identities agree within each run. Initial/final financial observations, minimized payload, receiver advisory result, ordered events and cleanup state are compared.'},null,2));
await bind(join(out,'saved-replay-comparison.json'));
const coverage=await load(join(out,'coverage/coverage-summary.json')),quality=await load(join(out,'quality.json'));
assert.ok(['statements','branches','functions','lines'].every(name=>coverage.total[name].pct===100));
await bind(join(out,'coverage/coverage-final.json'));const custody=await load(join(out,'coverage-custody.json'));assert.ok(await sourceCurrent(custody));await bind(join(out,'clones/jscpd-report.json'));
const closure=await load(join(out,'mutation-closure.json'));assert.equal(closure.meaningfulSurvivors,0);
assert.ok(await sourceCurrent(closure));
await bind(join(out,'reviewed-equivalences.json'));
for(const report of closure.rawReports)await bind(join(out,report));
for(const file of ['lint.json','whitespace.json']){const record=await load(join(out,file));assert.equal(record.code,0);assert.ok(await sourceCurrent(record));}
const prior=await load(join(root,'output/phase9d-outbox-broker-2026-10-13/manifest.json'));
const baselineArtifacts={unchanged:[],supersededReferences:[]};
for(const [file,identity]of Object.entries(prior.artifacts)){
  const current=hash(await readFile(join(root,file)));
  if(['CONTEXT.md','ROADMAP.txt'].includes(file)){baselineArtifacts.supersededReferences.push({file,previousSha256:identity.sha256,currentSha256:current,reason:'Authorized active checkpoint/remaining-work reference update; original evidence manifest and checkpoint retained.'});}
  else{assert.equal(current,identity.sha256,'BASELINE_ARTIFACT:'+file);baselineArtifacts.unchanged.push(file);}
}
for(const [file,identity]of Object.entries(prior.criticalSources))assert.equal(hash(await readFile(join(root,file))),identity,'BASELINE_SOURCE:'+file);
assert.equal(hash(await readFile(join(root,'tools/phase9d/outbox.sql'))),prior.outboxSqlSha256);
const readiness=await load(join(root,'output/phase9d-outbox-broker-2026-10-13/readiness-gates.json'));
readiness.criteria=readiness.criteria.map(row=>({...row,previousRecord:row,currentBoundary:'Preserved prior approved isolated scope; this continuation does not establish deployed readiness.'}));
readiness.criteria.push({id:'TR1',criterion:'Separate HTTP transport and independently committed receipt persistence',status:'VERIFIED_IN_ISOLATION',evidence:witness.path,nextAction:'Preserve this adapter; add standalone broker accounting without weakening source/receipt fencing.'},
  {id:'TR2',criterion:'Separate transport container containment',status:'VERIFIED_IN_ISOLATION',evidence:capsule.path,nextAction:'Deployed IAM, TLS/key lifecycle and cross-host resilience require separately approved proof.'});
Object.assign(readiness,{phase9d1:'PARTIAL',transport:'VERIFIED_IN_ISOLATION',broker:'NOT_IMPLEMENTED',productionReady:false,
  currentBoundaries:[...readiness.currentBoundaries,'Authenticated loopback HTTP across two processes/containers and distinct databases in one PostgreSQL instance; no distributed exactly-once or cross-database atomicity.'],
  phase9d2:'NOT_STARTED',productionShadow:'OFF',autoAdjudication:'OFF',productionConsequences:'OFF',searchRollout:'OFF'});
readiness.remaining=readiness.remaining.filter(row=>!row.startsWith('Separate-service transport'));
readiness.remaining.unshift('Production transport provisioning/TLS/key lifecycle and cross-host or independent PostgreSQL-server resilience; bounded isolated HTTP transport is verified.');
await writeFile(join(out,'readiness-gates.json'),JSON.stringify(readiness,null,2));await bind(join(out,'readiness-gates.json'));
for(const file of ['CONTEXT.md','ROADMAP.txt','docs/benchmarks/phase9d-transport-checkpoint-2026-10-13.md',...(await readdir(join(root,'tools/phase9d'))).filter(name=>name.startsWith('transport-')).map(name=>'tools/phase9d/'+name),
  'backend/tests/phase9dTransport.test.js','backend/tests/integration/phase9dTransport.test.js','backend/tests/integration/phase9dTransportReplay.test.js','backend/tests/helpers/phase9dTransportMutations.js','backend/tests/helpers/phase9dTransportProcesses.js'])await bind(join(root,file));
const manifest={schema:'phase9d-separate-transport-evidence-v1',createdAt:new Date().toISOString(),baseline:await verifyBaseline(),baselineArtifacts,criticalSources:sources,
  executions:Object.fromEntries(Object.entries(executions).map(([mode,value])=>[mode,{path:value.path,code:value.record.code,summary:value.record.summary,sourcesUnchanged:true}])),regressions,capsule:capsule.path,sqlWitness:witness.path,
  coverage:coverage.total,quality,mutations:closure.summary,readiness:{phase9d1:'PARTIAL',transport:'VERIFIED_IN_ISOLATION',standaloneBroker:'NOT_IMPLEMENTED',wholeSql:'PARTIAL',externalCustody:'PARTIAL',productionReady:false},artifacts};
await writeFile(join(out,'manifest.json'),JSON.stringify(manifest,null,2));console.log(JSON.stringify({artifacts:Object.keys(artifacts).length,phase9d1:'PARTIAL',transport:'VERIFIED_IN_ISOLATION',broker:'NOT_IMPLEMENTED'}));
