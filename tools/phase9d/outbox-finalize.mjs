import assert from 'node:assert/strict';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';
import {verifyBaseline,hash} from './baseline.mjs';
const root=resolve(import.meta.dirname,'../..'),output=join(root,'output/phase9d-outbox-broker-2026-10-13');
const scope=['export-projection','export-repository','export-pump','export-core','export-child','outbox-replay'].map(name=>'tools/phase9d/'+name+'.mjs');
const current=Object.fromEntries(await Promise.all(scope.map(async file=>[file,hash(await readFile(join(root,file)))])));
const artifacts=new Map();
async function bind(path){const bytes=await readFile(path);artifacts.set(relative(root,path).replaceAll('\\','/'),{sha256:hash(bytes),bytes:bytes.length});return bytes;}
async function load(path){return JSON.parse(await bind(path));}
async function select(prefix,directory=output,predicate=record=>record.code===0&&record.sourcesUnchanged){
  const matches=(await readdir(directory)).filter(name=>name.startsWith(prefix)&&name.endsWith('.json')).sort().reverse();
  for(const name of matches){const path=join(directory,name),record=JSON.parse(await readFile(path));if(predicate(record)){
    await bind(path);const log=path.replace(/\.json$/,'.log');try{await bind(log);}catch(error){if(error.code!=='ENOENT')throw error;}return {path,record};
  }}throw Error('MISSING_ACCEPTED_EXECUTION:'+prefix);
}
const executions={};
for(const mode of ['unit','integration','full','typecheck','record-replay','saved-replay']){
  const selected=await select(mode+'-');assert.ok(scope.every(file=>selected.record.sources[file]===current[file]));
  executions[mode]={path:relative(root,selected.path).replaceAll('\\','/'),code:selected.record.code,summary:selected.record.summary,sourcesUnchanged:true};
}
for(const [mode,directory,prefix]of [['broaderDb','phase9d-1-sql-broker-2026-10-13','all-db-'],['readinessDb','phase9d-1-continuation-2026-10-13','db-']]){
  const selected=await select(prefix,join(root,'output',directory));executions[mode]={path:relative(root,selected.path).replaceAll('\\','/'),code:0,summary:selected.record.summary};
}
const witness=await select('outbox-witness-',output,record=>record.status==='PASS'&&record.securityCatalog?.routines.length===12&&record.seededMutations?.length===13);
assert.ok(witness.record.seededMutations.every(row=>row.status==='KILLED'));assert.equal(witness.record.mutationCatalogRestored,true);
const sqlHash=hash(await readFile(join(root,'tools/phase9d/outbox.sql')));
const capsule=await select('capsule-',output,record=>record.status==='PASS'&&record.exporterWitness?.denied.length===22&&record.outboxPermissionsSha256===sqlHash);
assert.equal(capsule.record.applicationUnchanged,true);assert.equal(capsule.record.workerWitness.outcome.calls,1);
const mutations=new Map(),rawReports=['mutation-outbox.json','mutation-outbox-round2.json','mutation-outbox-round3.json'];
for(const report of rawReports){const record=await load(join(output,report));
  for(const [file,value]of Object.entries(record.files)){
    assert.equal(hash(value.source),current[file],'MUTATION_SOURCE_DRIFT');
    for(const mutant of value.mutants){const identity=JSON.stringify([file,mutant.location,mutant.mutatorName,mutant.replacement]);
      const previous=mutations.get(identity);mutations.set(identity,{file,location:mutant.location,mutatorName:mutant.mutatorName,replacement:mutant.replacement,
        status:mutant.status,observations:[...(previous?.observations??[]),{report,id:mutant.id,status:mutant.status}]});
    }
  }
}
const survivors=[...mutations.values()].filter(row=>row.status!=='Killed');assert.equal(survivors.length,1);
assert.equal(survivors[0].file,'tools/phase9d/export-pump.mjs');assert.equal(survivors[0].mutatorName,'BlockStatement');assert.equal(survivors[0].replacement,'{}');
const equivalence={...survivors[0],review:'A caught delivery exception leaves receipt undefined. The subsequent null-receipt branch awaits the identical retry persistence and returns the identical RETRYABLE outcome. Both paths propagate retry-persistence failure identically.',
  witness:'backend/tests/phase9dExport.test.js: reviewed catch omission has identical complete outcomes and repository effects',scope:'Current pump composition, including the following receipt==null branch; any change invalidates this review.'};
await writeFile(join(output,'reviewed-equivalence.json'),JSON.stringify(equivalence,null,2));await bind(join(output,'reviewed-equivalence.json'));
const closure={schema:'outbox-mutation-closure-v1',sources:current,rawReports,unique:mutations.size,killed:mutations.size-1,reviewedEquivalent:1,
  meaningfulSurvivors:0,timeouts:0,ignored:0,errors:0,identities:[...mutations.values()]};
await writeFile(join(output,'mutation-closure.json'),JSON.stringify(closure,null,2));await bind(join(output,'mutation-closure.json'));
const paired=(await readdir(output)).filter(name=>name.startsWith('replay-outcome-')).sort(),selectedReplay=await select('saved-replay-');
const recipe=await load(selectedReplay.record.recipePath),outcomes=[];
for(const name of paired){const value=JSON.parse(await readFile(join(output,name)));if(value.recipeId===recipe.id){
  assert.equal(value.recipeSha256,hash(JSON.stringify(recipe)));assert.equal(value.outcomeSha256,hash(JSON.stringify(value.outcome)));await bind(join(output,name));outcomes.push({file:name,...value});
}}
assert.ok(outcomes.length>=2);assert.ok(outcomes.every(row=>row.outcomeSha256===outcomes[0].outcomeSha256));
const comparison={schema:'saved-outbox-replay-comparison-v1',recipeId:recipe.id,runs:outcomes.map(({file,outcomeSha256})=>({file,outcomeSha256})),equivalent:true,
  boundary:'One bounded saved-input source/delivery/worker recipe; generated journal IDs are explicit owned fixture inputs. Canonical projection, statuses/attempts, selected application financial observations and sanitized guarded result match. Lease UUIDs, audit wall-clock timestamps and full database contents are outside this comparison.'};
await writeFile(join(output,'saved-replay-comparison.json'),JSON.stringify(comparison,null,2));await bind(join(output,'saved-replay-comparison.json'));
for(const file of ['coverage/coverage-summary.json','coverage/coverage-final.json','coverage-custody.json','quality.json','clones/jscpd-report.json','lint-final.log','quality-accepted.log'])await bind(join(output,file));
assert.equal((await load(join(output,'whitespace.json'))).pass,true);
const coverage=await load(join(output,'coverage/coverage-summary.json')),quality=await load(join(output,'quality.json'));
assert.ok(['statements','branches','functions','lines'].every(key=>coverage.total[key].pct===100));
const methods=quality.files.flatMap(file=>file.methods),maxima=Object.fromEntries(['cyclomatic','cognitive','halsteadDifficulty','crap'].map(key=>[key,Math.max(...methods.map(method=>method[key]))]));
assert.ok(maxima.cyclomatic<22&&maxima.cognitive<22&&maxima.halsteadDifficulty<80&&maxima.crap<25);assert.ok(quality.files.every(file=>file.physicalLines<500));
assert.equal((await load(join(output,'clones/jscpd-report.json'))).statistics.total.duplicatedLines,0);
for(const file of [...scope,'tools/phase9d/outbox.sql','tools/phase9d/permissions.sql','tools/phase9d/outbox-run.mjs','tools/phase9d/outbox-finalize.mjs',
  'tools/phase9d/capsule.mjs','tools/phase9d/capsule-entry.mjs','tools/phase9d/outbox-capsule-fixture.mjs','backend/tests/phase9dExport.test.js',
  'backend/tests/integration/phase9dOutbox.test.js','backend/tests/integration/phase9dOutboxReplay.test.js','backend/tests/helpers/phase9dOutboxMutations.js'])await bind(join(root,file));
for(const file of ['docs/benchmarks/phase9d-outbox-checkpoint-2026-10-13.md','CONTEXT.md','ROADMAP.txt'])await bind(join(root,file));
const readiness={phase9d1:'PARTIAL',outbox:'VERIFIED_IN_ISOLATION_FOR_BOUNDED_SHARED_DATABASE_ADAPTER',broker:'NOT_IMPLEMENTED',productionReady:false,
  currentBoundaries:['Actual committed Phase 7 journals; reconciliation after source transaction commit','At-least-once SQL invocation with same-database receiver/result acknowledgement atomicity','Controlled fixture clock; no production server-time contract','Synthetic minimal evidence; no causal entitlement or real human calibration'],
  remaining:['Separate-service transport, receiver acknowledgement/reconciliation and retry contract','Standalone offline least-privilege broker with independent deadline and durable request/concurrency/token/currency/unknown-usage budgets',
    'Independent stop generation at broker dispatch and result commit; precise in-flight window','Independent external audit custody; production export clock/config selection; full SQL logical/DDL/structural certification',
    'Production-shaped Clerk capacity/availability and monitoring; in-flight financial/admin authorization policy','Approved real-evidence purpose/privacy/retention and independent human labels','Deployed IAM/grants/egress, stopped-first rollout and separate deployment/activation authorization'],
  phase9d2:'NOT_STARTED',productionShadow:'OFF',autoAdjudication:'OFF',productionConsequences:'OFF',searchRollout:'OFF'};
const previous=await load(join(root,'output/phase9d-1-sql-broker-2026-10-13/readiness-gates.json'));
readiness.criteria=previous.criteria.map(row=>({...row,previousRecord:row,status:row.status==='DESIGNED_NOT_VERIFIED'?'PARTIAL':row.status,
  currentBoundary:'Inherited accepted isolated scope and original findings; no new production proof.'}));
for(const [id,status,evidence]of [
  ['B1E','PARTIAL','Actual committed Phase 7 source -> durable minimized outbox -> same-database certified receiver -> frozen offline guarded worker -> restricted SQL inspection verified. Distributed transport and production clock/selection remain open.'],
  ['Q1','VERIFIED_IN_ISOLATION','Six current runtime modules: 100% four coverage measures; 236 unique mutants, 235 killed and one executable reviewed equivalent; zero meaningful survivors.'],
  ['Q2','PARTIAL','Old SQL certificate preserved. Seven new PL/pgSQL native statement/branch ratios are 1.0; 13 new independent guards killed. SQL-language/logical-condition/DDL/whole-SQL structural certification remains incomplete.'],
  ['Q3','VERIFIED_IN_ISOLATION','Current backend 1804/1804, broader DB 58/58, readiness 20/20, outbox 21/21 and fresh saved-input outbox replay pass; original failures retained.'],
]){const row=readiness.criteria.find(row=>row.id===id);row.status=status;row.currentEvidence=evidence;}
readiness.criteria.find(row=>row.id==='Q1').scope=scope;
readiness.criteria.find(row=>row.id==='Q2').remaining='Whole-SQL logical subconditions, SQL-language expressions, DDL invariants and structural/mutation adequacy remain incomplete. Native percentages and selected seeded omissions do not replace that certificate.';
readiness.criteria.find(row=>row.id==='Q3').boundary='Current unchanged runtime executions and bounded saved-input outbox replay pass. Historical failures remain preserved; production and UI replay are outside this acceptance.';
readiness.criteria.push(
  {id:'OB1',criterion:'Bounded inactive source-bound outbox, interruption recovery and restricted inspection',status:'VERIFIED_IN_ISOLATION',evidence:relative(root,witness.path).replaceAll('\\','/'),boundary:readiness.currentBoundaries},
  {id:'OB2',criterion:'Fresh saved-input outbox replay',status:'VERIFIED_IN_ISOLATION',evidence:'saved-replay-comparison.json',boundary:comparison.boundary},
  {id:'BR1',criterion:'Standalone offline analyst broker',status:'NOT_IMPLEMENTED',nextAction:'Separate narrow protocol and broker principal/process; reuse immutable V5 factory without operative service imports.'},
  {id:'BR2',criterion:'Independent broker deadline, durable budgets and atomic stop-generation fencing',status:'NOT_IMPLEMENTED',nextAction:'Reserve request/token/currency/concurrency before dispatch; retain unknown usage; independently fence dispatch and result commit.'},
);
await writeFile(join(output,'readiness-gates.json'),JSON.stringify(readiness,null,2));await bind(join(output,'readiness-gates.json'));
const manifest={schema:'phase9d-outbox-execution-manifest-v1',createdAt:new Date().toISOString(),baseline:await verifyBaseline(),criticalSources:current,outboxSqlSha256:sqlHash,
  executions,sqlWitness:relative(root,witness.path).replaceAll('\\','/'),capsule:relative(root,capsule.path).replaceAll('\\','/'),
  coverage:coverage.total,structuralMaxima:{...maxima,sourceLOC:Math.max(...quality.files.map(file=>file.physicalLines))},mutations:{unique:closure.unique,killed:closure.killed,reviewedEquivalent:1,meaningfulSurvivors:0},
  readiness,artifacts:Object.fromEntries(artifacts)};
await writeFile(join(output,'manifest.json'),JSON.stringify(manifest,null,2));console.log(JSON.stringify({executions,mutations:manifest.mutations,structuralMaxima:manifest.structuralMaxima,replay:comparison.runs}));
