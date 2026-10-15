import assert from 'node:assert/strict';
import {readFile,writeFile,readdir,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {hash,verifyBaseline} from './baseline.mjs';
const output='output/phase9d-broker-recovery-2026-10-14',load=async file=>JSON.parse(await readFile(file));
const priorPath='output/phase9d-broker-2026-10-13/manifest.json',prior=await load(priorPath),baseline=await verifyBaseline(),preserved=[];
for(const [file,identity]of Object.entries(prior.artifacts)){
  if(['CONTEXT.md','ROADMAP.txt'].includes(file))continue;
  assert.equal(hash(await readFile(file)),identity.sha256,file);preserved.push(file);
}
for(const [file,sha]of Object.entries(prior.criticalSources))assert.equal(hash(await readFile(file)),sha,file);
assert.equal(hash(await readFile('tools/phase9d/broker.sql')),prior.brokerSqlSha256);
const names=await readdir(output),current=async record=>{
  if(record.code!==0||!record.sourcesUnchanged)return false;
  for(const [file,sha]of Object.entries(record.sources))if(hash(await readFile(file))!==sha)return false;
  return true;
};
const artifacts={},add=async file=>{const bytes=await readFile(file);artifacts[file]={sha256:hash(bytes),bytes:bytes.length};};
const executions={};
for(const mode of ['unit','integration','adversarial','integrity','full','typecheck','record-replay','saved-replay']){
  const candidates=[];
  for(const name of names.filter(name=>name.startsWith(mode+'-')&&name.endsWith('.json'))){const r=await load(join(output,name));if(await current(r))candidates.push({name,r});}
  candidates.sort((a,b)=>b.r.started.localeCompare(a.r.started));assert.ok(candidates.length,'missing current accepted '+mode);
  const {name,r}=candidates[0];executions[mode]={path:join(output,name),code:r.code,sourcesUnchanged:true,summary:r.summary,started:r.started,finished:r.finished};
  await add(join(output,name));await add(join(output,r.id+'.log'));assert.equal(artifacts[join(output,r.id+'.log')].sha256,r.logSha256);
}
const integration=executions.integration,within=async name=>{const time=(await stat(join(output,name))).mtimeMs;return Date.parse(integration.started)<=time&&time<=Date.parse(integration.finished);};
const witnesses=[];for(const name of names.filter(name=>/^recovery-witness-.*\.json$/.test(name)))if(await within(name))witnesses.push(name);
assert.equal(witnesses.length,1);const witness=await load(join(output,witnesses[0]));assert.equal(witness.sqlMutations.reports.length,10);assert.ok(witness.sqlMutations.reports.every(row=>row.status==='KILLED'));assert.equal(witness.sqlMutations.catalogRestored,true);await add(join(output,witnesses[0]));
const closures=[];for(const name of names.filter(name=>/^recovery-closure-witness-.*\.json$/.test(name))){const time=(await stat(join(output,name))).mtimeMs;if(Date.parse(executions.adversarial.started)<=time&&time<=Date.parse(executions.adversarial.finished))closures.push(name);}
assert.equal(closures.length,1);const closure=await load(join(output,closures[0]));assert.equal(closure.groups.length,26);assert.equal(closure.terminal.length,5);assert.ok(closure.races.length>=18);assert.equal(closure.backlog.physicalProcesses,4);assert.equal(closure.backlog.connectionOutageRecovered,true);assert.equal(closure.versions.unsupportedSourceHeld,true);await add(join(output,closures[0]));
const matrix=await load(output+'/acceptance-matrix.json');assert.equal(matrix.requiredRaces.length,15);assert.equal(matrix.transitions.length,14);
for(const category of matrix.requiredRaces){
  const groups=category.mode==='adversarial'?closure.groups:witness.groups;
  assert.ok(groups.filter(name=>name.startsWith(category.testPrefix)).length>=category.minimumGroups,'missing executed race witness: '+category.id);
}
const restarts=[];for(const name of names.filter(name=>/^database-restart-.*\.json$/.test(name)))if(await within(name))restarts.push(name);
assert.equal(restarts.length,1);assert.equal((await load(join(output,restarts[0]))).status,'PASS');await add(join(output,restarts[0]));
const scope=['session','receipt','operations'].map(name=>'tools/phase9d/recovery-'+name+'.mjs'),criticalSources={};for(const file of scope){criticalSources[file]=hash(await readFile(file));await add(file);}
const mutation=await load(output+'/mutation-recovery-round3.json'),counts={};for(const [file,value]of Object.entries(mutation.files)){
  assert.equal(hash(value.source),criticalSources[file]);for(const mutant of value.mutants)counts[mutant.status]=(counts[mutant.status]??0)+1;
}
assert.deepEqual(counts,{Killed:191,Survived:1});const equivalent=await load(output+'/reviewed-equivalences.json');assert.equal(equivalent.sourceSha256,criticalSources[equivalent.source]);assert.equal(equivalent.comparisons,118);
const survivor=mutation.files[equivalent.source].mutants.filter(m=>m.status==='Survived');assert.equal(survivor.length,1);assert.equal(survivor[0].replacement,'a <= b');
const coverage=await load(output+'/coverage/coverage-summary.json');for(const key of ['statements','branches','functions','lines'])assert.equal(coverage.total[key].pct,100);
const custody=await load(output+'/coverage-custody.json');assert.deepEqual(custody.sources,criticalSources);
const structural=await load(output+'/quality-verified.json'),maxima=structural.summary;
assert.equal(structural.originalReportSha256,hash(await readFile(output+'/quality.json')));for(const row of structural.files)assert.equal(row.sourceSha256,criticalSources[row.file]);
assert.ok(maxima.cyclomatic<22&&maxima.cognitive<22&&maxima.halsteadDifficulty<80&&maxima.crap<25&&maxima.physicalLines<500);
const clones=await load(output+'/clones/jscpd-report.json');assert.equal(clones.duplicates.length,0);
const capsules=[];for(const name of names.filter(name=>/^capsule-.*\.json$/.test(name))){const r=await load(join(output,name));if(r.status!=='PASS'||r.recoverySqlSha256!==hash(await readFile('tools/phase9d/broker-recovery.sql')))continue;let good=true;for(const [file,sha]of Object.entries(r.sources))if(hash(await readFile(file))!==sha)good=false;if(good)capsules.push({name,r});}
capsules.sort((a,b)=>b.r.started.localeCompare(a.r.started));assert.ok(capsules.length);const capsule=capsules[0];await add(join(output,capsule.name));
const replayRecords=[];for(const mode of ['record-replay','saved-replay']){
  const record=await load(executions[mode].path);assert.ok(record.recipePath);await add(record.recipePath);const recipe=await load(record.recipePath);
  const matched=[];for(const name of names.filter(name=>name.startsWith('recovery-replay-outcome-'+recipe.id+'-'))){const r=await load(join(output,name));if(r.recipeSha256===hash(JSON.stringify(recipe))){assert.equal(r.outcomeSha256,hash(JSON.stringify(r.outcome)));matched.push({name,r});}}
  assert.equal(matched.length,2,'paired fresh-process outcomes');for(const outcome of matched)await add(join(output,outcome.name));assert.equal(matched[0].r.outcomeSha256,matched[1].r.outcomeSha256);replayRecords.push({recipe:record.recipePath,outcomeSha256:matched[0].r.outcomeSha256,executions:matched.map(row=>row.name)});
}
const regressionDirectories={broker:'output/phase9d-broker-2026-10-13',transport:'output/phase9d-transport-2026-10-13',outbox:'output/phase9d-outbox-broker-2026-10-13','all-db':'output/phase9d-1-sql-broker-2026-10-13',historical:'output/phase9d-1-sql-broker-2026-10-13'},regressions={};
regressionDirectories['broker-unit']='output/phase9d-broker-2026-10-13';
for(const [name,directory]of Object.entries(regressionDirectories)){
  const prefix=name==='historical'?'replay-':name==='all-db'?'all-db-':name==='broker-unit'?'unit-':'integration-',rows=[];
  for(const file of (await readdir(directory)).filter(file=>file.startsWith(prefix)&&file.endsWith('.json'))){const r=await load(join(directory,file));if(await current(r))rows.push({file,r});}
  rows.sort((a,b)=>b.r.started.localeCompare(a.r.started));assert.ok(rows.length,name);const r=rows[0];regressions[name]={path:join(directory,r.file),summary:r.r.summary,sourcesUnchanged:true};await add(regressions[name].path);await add(join(directory,r.r.id+'.log'));
}
for(const file of (await readdir('tools/phase9d')).filter(name=>name==='broker-recovery.sql'||name.startsWith('recovery-')&&name.endsWith('.mjs')))await add('tools/phase9d/'+file);
for(const file of ['acceptance-matrix.json','readiness-gates.json','reviewed-equivalences.json','mutation-recovery-round3.json','coverage-custody.json','quality.json','quality-verified.json','coverage/coverage-final.json','coverage/coverage-summary.json','clones/jscpd-report.json','lint.json','whitespace.json'])await add(join(output,file));
for(const kind of ['lint','whitespace']){
  const check=await load(output+'/'+kind+'.json');assert.equal(check.code,0);
  for(const [file,sha]of Object.entries(check.sources))assert.equal(hash(await readFile(file)),sha,kind+' source drift: '+file);
}
await add('docs/benchmarks/phase9d-broker-recovery-checkpoint-2026-10-14.md');await add(priorPath);
const manifest={schema:'broker-recovery-closure-v1',createdAt:new Date().toISOString(),baseline,criticalSources,recoverySqlSha256:hash(await readFile('tools/phase9d/broker-recovery.sql')),executions,regressions,witness:join(output,witnesses[0]),restart:join(output,restarts[0]),capsule:{path:join(output,capsule.name),brokerChecks:capsule.r.brokerWitness.checks.length,brokerDenials:capsule.r.brokerWitness.denied.length,guardChecks:capsule.r.guardWitness.checks.length,guardDenials:capsule.r.guardWitness.denied.length,applicationUnchanged:capsule.r.applicationUnchanged},replay:replayRecords[0],preservation:{priorManifest:priorPath,immutableArtifacts:preserved.length,originalCriticalSources:prior.criticalSources,originalBrokerSQLUnchanged:true},coverage:coverage.total,quality:maxima,mutation:{total:192,killed:191,reviewedEquivalent:1,meaningfulSurvivors:0,timeouts:0,ignored:0,errors:0,scope},scope:'Three complete critical JS modules. SQL/replay/CLI/orchestration do not share this certificate.',status:{phase9d1:'PARTIAL',brokerRecovery:'PARTIAL',productionReady:false,productionDeployment:'NOT_AUTHORIZED',productionShadow:'OFF',autoAdjudication:'OFF',productionConsequences:'OFF',searchRollout:'OFF',phase9d2:'NOT_STARTED'},artifacts};
manifest.acceptanceClosure={path:join(output,closures[0]),groups:closure.groups.length,races:closure.races.length,terminalVariants:closure.terminal.length,backlog:closure.backlog,versions:closure.versions};
const review=await load(output+'/independent-review.json');assert.equal(review.status,'PASS');
for(const [file,sha]of Object.entries(review.sources))assert.equal(hash(await readFile(file)),sha,'independent review source drift: '+file);
assert.equal(review.runtimeWitness.sha256,hash(await readFile(review.runtimeWitness.path)));
const reviewedRuntime=await load(review.runtimeWitness.path);
assert.equal(reviewedRuntime.status,'PASS');assert.equal(reviewedRuntime.recoverySqlSha256,capsule.r.recoverySqlSha256);
assert.deepEqual(reviewedRuntime.sources,capsule.r.sources,'capsule repeat differs from independently reviewed runtime composition');
for(const field of ['dependencies','migrations','schemaSha256','permissionsSha256','outboxPermissionsSha256','brokerSqlSha256','transportSql','profile'])assert.deepEqual(reviewedRuntime[field],capsule.r[field],'capsule repeat composition: '+field);
await add(review.runtimeWitness.path);
for(const file of Object.keys(review.sources))await add(file);
manifest.capsule.hostRunner={path:'tools/phase9d/recovery-capsule.mjs',sha256:review.sources['tools/phase9d/recovery-capsule.mjs'],binding:'current host source independently reviewed against the selected runtime witness; the original capsule record binds staged runtime sources'};
await add(output+'/independent-review.json');await add(output+'/independent-review.md');
assert.equal(capsule.r.reconcilerWitness.outcome.actor,'broker9d_reconciler');assert.equal(capsule.r.reconcilerWitness.outcome.disposition,'ACCEPTED');
assert.equal(capsule.r.reconcilerWitness.checks.length,17);assert.equal(capsule.r.reconcilerWitness.denied.length,30);
manifest.independentReview={path:output+'/independent-review.json',status:review.status,reviewedRuntime:review.runtimeWitness.path,currentRuntime:join(output,capsule.name),unchangedReviewedSources:true,matchingRuntimeComposition:true};manifest.status.brokerRecovery='VERIFIED_IN_ISOLATION';
await add(output+'/acceptance-history.json');const history=await load(output+'/acceptance-history.json');for(const row of Object.values(history.artifacts)){assert.equal(hash(await readFile(row.copy)),row.sha256);await add(row.copy);}
manifest.retainedTrials=[];
for(const path of [
  'output/phase9d-transport-2026-10-13/integration-1791962421962-e0b10f1a-6c4e-4cd1-b26d-34d7404d37d9.json',
  'output/phase9d-1-sql-broker-2026-10-13/all-db-1791973898855-604cd8a4-199d-4ea6-a9be-7d6a5a1f20e5.json',
  output+'/interrupted-db-1791973877630.json'
]){
  const trial=await load(path);assert.ok(trial.code!==0||trial.status==='INTERRUPTED_NO_RESULT');await add(path);
  const log=path.replace(/\.json$/,'.log');if(trial.logSha256){await add(log);assert.equal(artifacts[log].sha256,trial.logSha256);}
  manifest.retainedTrials.push({path,code:trial.code,status:trial.status,summary:trial.summary,error:trial.error,selectedAsPass:false});
}
await writeFile(output+'/manifest.json',JSON.stringify(manifest,null,2));console.log(JSON.stringify({status:'PASS',executions:Object.fromEntries(Object.entries(executions).map(([k,v])=>[k,v.summary])),mutations:manifest.mutation,artifacts:Object.keys(artifacts).length,maxima}));
