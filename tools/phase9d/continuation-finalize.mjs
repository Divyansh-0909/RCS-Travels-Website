import assert from 'node:assert/strict';
import { readFile,writeFile,readdir,mkdir } from 'node:fs/promises';
import { resolve,join,dirname } from 'node:path';
import { verifyBaseline,hash } from './baseline.mjs';
const root=resolve(import.meta.dirname,'../..'),output=join(root,'output/phase9d-1-continuation-2026-10-13');
const names=await readdir(output), records=[];
for(const name of names.filter(name=>name.endsWith('.json'))){const value=JSON.parse(await readFile(join(output,name)));records.push({name,value});}
const baseline=await verifyBaseline();
const scope=['tools/phase9d/privacy.mjs','tools/phase9d/repository.mjs','tools/phase9d/worker-core.mjs','tools/phase9d/worker.mjs'];
const current=Object.fromEntries(await Promise.all(scope.map(async file=>[file,hash(await readFile(join(root,file)))])));
const identity=(file,m)=>JSON.stringify([file,m.location,m.mutatorName,m.replacement]);
const initial=JSON.parse(await readFile(join(output,'mutation-worker.json'))),focused=JSON.parse(await readFile(join(output,'mutation-worker-focused.json')));
for(const report of [initial,focused])for(const[file,value]of Object.entries(report.files))assert.equal(hash(value.source),current[file]);
const amendments=new Map(Object.entries(focused.files).flatMap(([file,value])=>value.mutants.map(m=>[identity(file,m),m])));
const reviews=JSON.parse(await readFile(join(output,'reviewed-worker-equivalences.json')));
assert.equal(reviews.sourceSha256,current['tools/phase9d/worker-core.mjs']);
const reviewed=new Set(reviews.witnesses.map(m=>identity('tools/phase9d/worker-core.mjs',m)));
let reconciled=0;const mutations=Object.entries(initial.files).flatMap(([file,value])=>value.mutants.map(m=>{
  const correction=amendments.get(identity(file,m));if(correction)reconciled++;
  const status=correction?.status??m.status;
  assert.ok(status==='Killed'||(status==='Survived'&&reviewed.has(identity(file,m))));
  return {file,location:m.location,mutatorName:m.mutatorName,replacement:m.replacement,originalStatus:m.status,
    finalRawStatus:status,reviewedEquivalent:status==='Survived',selectedReport:correction?'mutation-worker-focused.json':'mutation-worker.json'};
}));
assert.equal(reconciled,amendments.size);assert.equal(mutations.length,173);
const mutationClosure={schema:'phase9d-worker-mutation-closure-v1',scope,sources:current,unique:mutations.length,
  killed:mutations.filter(m=>m.finalRawStatus==='Killed').length,reviewedEquivalent:mutations.filter(m=>m.reviewedEquivalent).length,
  meaningfulSurvivors:0,timeouts:0,ignored:0,errors:0,rawReportsPreserved:true,
  initialReportSha256:hash(await readFile(join(output,'mutation-worker.json'))),focusedReportSha256:hash(await readFile(join(output,'mutation-worker-focused.json'))),
  reviewSha256:hash(await readFile(join(output,'reviewed-worker-equivalences.json'))),mutations};
await writeFile(join(output,'mutation-closure.json'),JSON.stringify(mutationClosure,null,2));
function execution(mode){const selected=records.filter(r=>r.value.mode===mode&&r.value.code===0&&r.value.sourcesUnchanged).sort((a,b)=>Date.parse(b.value.started)-Date.parse(a.value.started))[0];assert.ok(selected,mode);return selected;}
const selected=Object.fromEntries(['unit','db','full','lint','typecheck'].map(mode=>[mode,execution(mode)]));
for(const mode of ['unit','db','full'])for(const file of scope)assert.equal(selected[mode].value.sources[file],current[file]);
assert.equal(selected.db.value.sources['tools/phase9d/permissions.sql'],hash(await readFile(join(root,'tools/phase9d/permissions.sql'))));
assert.equal(selected.db.value.sources['backend/tests/integration/phase9dReadiness.test.js'],hash(await readFile(join(root,'backend/tests/integration/phase9dReadiness.test.js'))));
const capsuleCandidates=records.filter(r=>r.value.schema==='phase9d-capsule-execution-v1'&&r.value.status==='PASS'&&r.value.hostAuthentication&&r.value.witness.denied.length===16);
for(const r of capsuleCandidates){assert.equal(r.value.launcherSha256,hash(await readFile(join(root,'tools/phase9d/capsule.mjs'))));for(const[file,sha]of Object.entries(r.value.sources))assert.equal(sha,hash(await readFile(join(root,file))));}
assert.ok(capsuleCandidates.length>=2);const capsules=capsuleCandidates.sort((a,b)=>Date.parse(b.value.started)-Date.parse(a.value.started)).slice(0,2);
const [primary,repeat]=capsules.map(r=>r.value);
for(const field of ['imageId','sources','migrations','schemaSha256','permissionsSha256','launcherSha256','dependencies','profile'])assert.deepEqual(primary[field],repeat[field],field);
for(const value of [primary,repeat]){assert.equal(value.witness.checks.length,17);assert.equal(value.hostSentinelPositiveControl,true);assert.equal(value.privateCanaryExcludedAndUnchanged,true);assert.equal(value.applicationUnchanged,true);assert.ok(value.cleanup.every(item=>item.status==='REMOVED_OWNED'));assert.equal(value.witness.liveModelCalls,0);}
await writeFile(join(output,'capsule-repeat-comparison.json'),JSON.stringify({schema:'phase9d-capsule-repeat-v1',runs:capsules.map(r=>r.name),status:'PASS',imageId:primary.imageId,
  sourceFiles:Object.keys(primary.sources).length,migrations:Object.keys(primary.migrations).length,checks:17,denials:16,applicationTables:primary.publicTables,
  boundary:'Two fresh isolated databases/processes with the identical image and source/configuration; recipe repeat, not saved-input event replay.'},null,2));
const database=records.filter(r=>r.value.schema==='phase9d-isolation-v1'&&r.value.status==='PASS'&&r.value.sqlMutations?.length===9).sort((a,b)=>b.name.localeCompare(a.name))[0];assert.ok(database);
const coverage=JSON.parse(await readFile(join(output,'coverage/coverage-summary.json'))).total;
for(const field of ['lines','statements','branches','functions'])assert.equal(coverage[field].pct,100);
const quality=JSON.parse(await readFile(join(output,'quality.json'))),methods=quality.files.flatMap(file=>file.methods);
const maxima={cyclomatic:Math.max(...methods.map(m=>m.cyclomatic)),cognitive:Math.max(...methods.map(m=>m.cognitive)),halsteadDifficulty:Math.max(...methods.map(m=>m.halsteadDifficulty)),crap:Math.max(...methods.map(m=>m.crap)),physicalLines:Math.max(...quality.files.map(f=>f.physicalLines))};
assert.ok(maxima.cyclomatic<22&&maxima.cognitive<22&&maxima.halsteadDifficulty<80&&maxima.crap<25&&maxima.physicalLines<500);
const clones=JSON.parse(await readFile(join(output,'clones/jscpd-report.json')));assert.equal(clones.duplicates.length,0);
const old=join(root,'output/phase9d-1-2026-10-12/manifest.json'),gates=JSON.parse(await readFile(join(root,'output/phase9d-1-2026-10-12/readiness-gates.json')));
gates.schema='phase9d-preactivation-gates-continuation-v1';gates.previousManifestSha256=hash(await readFile(old));
for(const criterion of gates.criteria){
  if(criterion.id==='A3'){criterion.historicalEvidence=criterion.evidence;criterion.evidence='Two current restricted-worker image executions with owner/worker/ops password probes, SQL denials and unchanged application state.';criterion.status='VERIFIED_IN_ISOLATION';criterion.currentEvidence=capsules.map(r=>r.name);criterion.boundary='Actual readonly nonroot offline worker, fresh SCRAM logins, closed private namespace, capability/resource/file/host-route and server-file/program/role negative tests. Deployed IAM, hostile-kernel escape, DNS-channel completeness and a live-provider broker are not certified.';}
  if(criterion.id==='Q1'){criterion.currentEvidence=['coverage-custody.json','mutation-closure.json','quality.json'];criterion.scope=scope;}
  if(criterion.id==='Q2'){criterion.status='NOT_IMPLEMENTED';criterion.remaining='JS entry and core now have full scoped coverage/quality/mutation closure. Full SQL statement/branch/structural and mutation certification remains absent; nine seeded SQL witnesses do not satisfy it. Capsule orchestration is executable fixture evidence, not a full coverage certificate.';}
  if(criterion.id==='Q3'){criterion.currentEvidence=[selected.full.name,selected.db.name];criterion.boundary='Current full unit and dedicated readiness DB checks pass. Prior lifecycle/replay acceptance is linked through the previous manifest; historical broader DB expectations remain unresolved.';}
}
await writeFile(join(output,'readiness-gates.json'),JSON.stringify(gates,null,2));
const files=(await readdir(join(root,'tools/phase9d'))).filter(name=>/\.(mjs|sql|json)$/.test(name)).map(name=>'tools/phase9d/'+name)
  .concat(['backend/tests/phase9dReadiness.test.js','backend/tests/phase9dWorker.test.js','backend/tests/integration/phase9dReadiness.test.js',
    'docs/benchmarks/phase9d-1-continuation-checkpoint-2026-10-13.md','CONTEXT.md','ROADMAP.txt']);
const sources={};for(const file of files){const bytes=await readFile(join(root,file));sources[file]=hash(bytes);const copy=join(output,'source-custody',file);await mkdir(dirname(copy),{recursive:true});await writeFile(copy,bytes);}
const artifacts={};for(const name of (await readdir(output)).filter(name=>/\.(json|log|sql)$/.test(name)&&name!=='manifest.json'))artifacts[name]=hash(await readFile(join(output,name)));
for(const name of ['coverage/coverage-summary.json','coverage/coverage-final.json','clones/jscpd-report.json'])artifacts[name]=hash(await readFile(join(output,name)));
const failures=records.filter(r=>r.value.code!==undefined&&(r.value.code!==0||r.value.sourcesUnchanged===false)).map(r=>({artifact:r.name,code:r.value.code,sourcesUnchanged:r.value.sourcesUnchanged}));
const legacy=records.find(r=>r.value.status==='BYPASS_REPRODUCED');assert.ok(legacy);
const manifest={schema:'phase9d-continuation-manifest-v1',generatedAt:new Date().toISOString(),previousManifest:{path:'output/phase9d-1-2026-10-12/manifest.json',sha256:hash(await readFile(old))},baseline,sources,artifacts,
  selectedExecutions:Object.fromEntries(Object.entries(selected).map(([mode,r])=>[mode,r.name])),databaseWitness:database.name,capsuleExecutions:capsules.map(r=>r.name),legacyAuthenticationWitness:legacy.name,
  results:{coverage,maxima,mutations:{unique:173,killed:171,equivalent:2,meaningfulSurvivors:0},sqlSeededMutations:9,databaseDenials:database.value.denials.length,capsuleDenials:16,capsuleChecks:17},
  retainedFailedExecutions:failures,liveModelCalls:0,phase9d1:'PARTIAL',productionReady:false,productionDeploymentAuthorized:false,phase9d2:'NOT_STARTED',
  productionShadow:'OFF',autoAdjudication:'OFF',productionConsequences:'OFF',searchRollout:'OFF',projectWideProofloop:'NOT_STARTED',publicGeneralization:'NOT_STARTED'};
await writeFile(join(output,'manifest.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify({manifest:'output/phase9d-1-continuation-2026-10-13/manifest.json',phase9d1:manifest.phase9d1,productionReady:false,selectedExecutions:manifest.selectedExecutions,capsules:manifest.capsuleExecutions,maxima,coverage,retainedFailures:failures.length}));
