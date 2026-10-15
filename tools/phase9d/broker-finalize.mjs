import assert from 'node:assert/strict';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';
import {hash,verifyBaseline} from './baseline.mjs';
const root=resolve(import.meta.dirname,'../..'),out=join(root,'output/phase9d-broker-2026-10-13'),artifacts={};
const scope=['session','offline','execution','guard','child','replay'].map(name=>'tools/phase9d/broker-'+name+'.mjs');
async function bind(file){const bytes=await readFile(file);artifacts[relative(root,file).replaceAll('\\','/')]={sha256:hash(bytes),bytes:bytes.length};return bytes;}
const load=async file=>JSON.parse(await bind(file));
async function current(record){if(!record.sources)return false;for(const[file,sha]of Object.entries(record.sources))if(hash(await readFile(join(root,file)))!==sha)return false;return true;}
async function select(prefix,predicate,directory=out){
  for(const file of (await readdir(directory)).filter(f=>f.startsWith(prefix)&&f.endsWith('.json')).sort().reverse()){
    const record=JSON.parse(await readFile(join(directory,file)));if(await predicate(record,file)){
      await bind(join(directory,file));try{await bind(join(directory,file.replace(/\.json$/,'.log')));}catch(error){if(error.code!=='ENOENT')throw error;}
      return {path:relative(root,join(directory,file)).replaceAll('\\','/'),record};
    }
  }throw Error('NO_CURRENT_ACCEPTED_EXECUTION:'+prefix);
}
const accepted=record=>record.code===0&&record.sourcesUnchanged&&current(record),executions={};
for(const mode of ['unit','integration','full','typecheck','record-replay','saved-replay'])executions[mode]=await select(mode+'-',accepted);
const regressions={};
for(const[name,directory,prefix]of [['transport','phase9d-transport-2026-10-13','integration-'],['outbox','phase9d-outbox-broker-2026-10-13','integration-'],['broaderDatabase','phase9d-1-sql-broker-2026-10-13','all-db-']])regressions[name]=await select(prefix,accepted,join(root,'output',directory));
regressions.historicalPairedReplay=await select('replay-',accepted,join(root,'output/phase9d-1-sql-broker-2026-10-13'));
const capsule=await select('capsule-',async r=>r.status==='PASS'&&await current(r)&&r.brokerSqlSha256===hash(await readFile(join(root,'tools/phase9d/broker.sql'))));
const witness=await select('broker-witness-',(record,file)=>{
  const at=Number(file.slice('broker-witness-'.length,-5)),run=executions.integration.record,{digest,...body}=record;
  return at>=Date.parse(run.started)&&at<=Date.parse(run.finished)&&digest===hash(JSON.stringify(body))&&record.groups.length>=18&&record.sqlMutations?.catalogRestored;
});
const catalog=witness.record.catalog.map(row=>({...row,definitionSha256:hash(row.definition)}));
await writeFile(join(out,'sql-catalog.json'),JSON.stringify({sourceSha256:hash(await readFile(join(root,'tools/phase9d/broker.sql'))),routines:catalog,
  nativeDefinitionHashEncoding:'The original witness uses SHA256(JSON.stringify(definition)); this catalog separately records SHA256 of the exact UTF-8 catalog definition.',native:witness.record.nativeSql,
  boundary:'Native routine metrics, exact owners/search paths/ACLs and selected seeds. Logical subcondition/whole-SQL certification remains PARTIAL.'},null,2));await bind(join(out,'sql-catalog.json'));
const outcomes=[];
for(const mode of ['record-replay','saved-replay']){
  const recipe=await load(executions[mode].record.recipePath);
  for(const file of (await readdir(out)).filter(f=>f.startsWith('broker-replay-outcome-'+recipe.id+'-'))){const saved=await load(join(out,file));assert.equal(saved.recipeSha256,hash(JSON.stringify(recipe)));assert.equal(saved.outcomeSha256,hash(JSON.stringify(saved.outcome)));outcomes.push({file,digest:saved.outcomeSha256,recipeId:recipe.id});}
}
assert.equal(new Set(outcomes.map(o=>o.recipeId)).size,1);assert.ok(outcomes.length>=2);assert.equal(new Set(outcomes.map(o=>o.digest)).size,1);
await writeFile(join(out,'saved-replay-comparison.json'),JSON.stringify({status:'PASS',outcomes,boundary:'One bounded explicit transport/broker recipe. Generated broker request/attempt/token and receipt UUID/MAC identities are excluded from cross-run equality; bindings and identities are checked within each run. Complete canonical financial/source/projection/result and budget observations remain compared.'},null,2));await bind(join(out,'saved-replay-comparison.json'));
const coverage=await load(join(out,'coverage/coverage-summary.json')),quality=await load(join(out,'quality.json')),custody=await load(join(out,'coverage-custody.json'));assert.ok(await current(custody));
for(const file of ['coverage/coverage-final.json','clones/jscpd-report.json'])await bind(join(out,file));
for(const file of ['lint.json','whitespace.json']){const r=await load(join(out,file));assert.equal(r.code,0);assert.ok(await current(r));}
const prior=await load(join(root,'output/phase9d-transport-2026-10-13/manifest.json')),preservation={unchanged:[],supersededReferences:[]};
for(const[file,identity]of Object.entries(prior.artifacts)){
  const sha=hash(await readFile(join(root,file)));if(['CONTEXT.md','ROADMAP.txt'].includes(file))preservation.supersededReferences.push({file,previousSha256:identity.sha256,currentSha256:sha});
  else{assert.equal(sha,identity.sha256,'PRIOR_ARTIFACT:'+file);preservation.unchanged.push(file);}
}
for(const[file,sha]of Object.entries(prior.criticalSources))assert.equal(hash(await readFile(join(root,file))),sha);
const readiness=await load(join(root,'output/phase9d-transport-2026-10-13/readiness-gates.json'));
Object.assign(readiness,{phase9d1:'PARTIAL',broker:'PARTIAL',brokerSupportedSlice:'VERIFIED_IN_ISOLATION',productionReady:false});
readiness.criteria=readiness.criteria.map(row=>['BR1','BR2','Q1'].includes(row.id)?{...row,previousRecord:row,status:'PARTIAL',evidence:witness.path,currentBoundary:'Implemented supported offline slice and scoped coverage; broader lifecycle/operations/quality closure remains explicitly open.'}:row);
readiness.criteria=readiness.criteria.map(row=>row.id==='B4E'?{...row,previousRecord:row,criterion:'Independent broker dispatch/result generation admission, with explicit physical-send uncertainty',status:'PARTIAL',evidence:witness.path,
  currentBoundary:'Supported SQL fencing is verified. PostgreSQL cannot atomically retract external physical execution; the current owner request explicitly forbids claiming that guarantee.'}:row);
readiness.criteria.push({id:'BR_SLICE',criterion:'Offline receiver-bound request, durable conservative budgets, generation/lease dispatch and independent guard persistence',status:'VERIFIED_IN_ISOLATION',evidence:witness.path,
  nextAction:'Close remaining broader broker recovery/reconciliation/operational and quality gates; no production permission follows.'});
readiness.currentBoundaries.push('Broker state shares the bare receiver database with separate schema, non-login owner, execution/guard/ops identities. Confirmed and unknown attempts retain worst-case reservation; no paid provider or deployed clock/secret/IAM contract.');
readiness.remaining=readiness.remaining.map(row=>row.includes('Standalone')||row.includes('standalone')?'Broader broker recovery/reconciliation/operational closure remains; the supported offline standalone slice is implemented.':row);
readiness.remaining.unshift('Complete the broader broker failure matrix, authenticated usage reconciliation/manual operations, approved retry/configuration lifecycle and independent safety/quality closure.');
await writeFile(join(out,'readiness-gates.json'),JSON.stringify(readiness,null,2));await bind(join(out,'readiness-gates.json'));
let mutation=null;
try{mutation=await load(join(out,'mutation-closure.json'));assert.ok(await current(mutation));for(const file of mutation.rawReports)await bind(join(out,file));if(mutation.reviewedFile)await bind(join(out,mutation.reviewedFile));}
catch(error){if(error.code!=='ENOENT')throw error;const raw=await load(join(out,'mutation-broker-round2.json'));for(const[file,data]of Object.entries(raw.files))assert.equal(hash(data.source),hash(await readFile(join(root,file))));
  mutation={status:'PARTIAL',counts:Object.fromEntries(['Killed','Timeout','Survived','Ignored','CompileError','RuntimeError'].map(status=>[status,Object.values(raw.files).flatMap(f=>f.mutants).filter(m=>m.status===status).length]))};}
if(mutation.status==='PASS'){
  assert.equal(mutation.summary.meaningfulSurvivors,0);
  for(const name of ['statements','branches','functions','lines'])assert.equal(coverage.total[name].pct,100);
  const row=readiness.criteria.find(r=>r.id==='Q1');row.status='VERIFIED_IN_ISOLATION';row.currentBoundary='Current six critical broker modules: 100% coverage, exact framework reconciliation and four executable reviews. SQL and broader orchestration remain outside this certificate.';
  await writeFile(join(out,'readiness-gates.json'),JSON.stringify(readiness,null,2));await bind(join(out,'readiness-gates.json'));
}
await bind(join(out,'mutation-broker.json'));
const criticalSources=Object.fromEntries(await Promise.all(scope.map(async file=>[file,hash(await readFile(join(root,file)))])));
for(const file of ['CONTEXT.md','ROADMAP.txt','docs/benchmarks/phase9d-broker-checkpoint-2026-10-13.md',...(await readdir(join(root,'tools/phase9d'))).filter(f=>f.startsWith('broker-')||f==='broker.sql').map(f=>'tools/phase9d/'+f),
  'backend/tests/phase9dBroker.test.js','backend/tests/integration/phase9dBroker.test.js','backend/tests/integration/phase9dBrokerReplay.test.js','backend/tests/helpers/phase9dBrokerProcesses.js','backend/tests/helpers/phase9dBrokerMutations.js'])await bind(join(root,file));
const summarize=value=>({path:value.path,code:value.record.code,summary:value.record.summary,sourcesUnchanged:value.record.sourcesUnchanged});
const manifest={schema:'isolated-offline-broker-evidence-v1',createdAt:new Date().toISOString(),baseline:await verifyBaseline(),criticalSources,brokerSqlSha256:hash(await readFile(join(root,'tools/phase9d/broker.sql'))),
  executions:Object.fromEntries(Object.entries(executions).map(([k,v])=>[k,summarize(v)])),regressions:Object.fromEntries(Object.entries(regressions).map(([k,v])=>[k,summarize(v)])),capsule:capsule.path,witness:witness.path,
  preservation,coverage:coverage.total,quality,mutation,readiness:{phase9d1:'PARTIAL',standaloneBroker:'PARTIAL',supportedOfflineSlice:'VERIFIED_IN_ISOLATION',externalCustody:'PARTIAL',wholeSql:'PARTIAL',productionReady:false},artifacts};
await writeFile(join(out,'manifest.json'),JSON.stringify(manifest,null,2));console.log(JSON.stringify({artifacts:Object.keys(artifacts).length,status:manifest.readiness,mutation:mutation.summary??mutation.counts}));
