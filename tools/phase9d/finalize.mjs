import assert from 'node:assert/strict';
import { readFile,writeFile,readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { verifyBaseline,output,hash } from './baseline.mjs';
const json=async p=>JSON.parse((await readFile(p,'utf8')).replace(/^\uFEFF/,''));
const baseline=await verifyBaseline(),files=await readdir(output);
const records=[];
for(const file of files.filter(p=>p.endsWith('.json'))){
  const row=await json(join(output,file));
  if(row.run&&row.mode)records.push({path:file,...row});
}
const selected={};
for(const mode of ['unit','full','full-serial','db','historical','phase9','replay','cross','lint','typecheck','coverage']){
  const options=records.filter(r=>r.mode===mode).sort((a,b)=>a.started.localeCompare(b.started));
  const passing=options.filter(r=>r.code===0&&r.sourcesUnchanged);
  selected[mode]=passing.at(-1)?.path??null;
}
if(selected['full-serial'])selected.full=selected['full-serial'];
const isolations=await Promise.all(files.filter(p=>/^isolation-.*\.json$/.test(p)).map(async p=>({path:p,...await json(join(output,p))})));
const isolation=isolations.filter(r=>r.status==='PASS').sort((a,b)=>a.path.localeCompare(b.path)).at(-1);
assert.ok(isolation,'No complete isolation witness');
assert.equal(isolation.tables.length,51);assert.equal(isolation.denials.length,436);
assert.equal(isolation.serviceDenials.length,7);assert.ok(isolation.serviceDenials.every(s=>s.denied));
assert.equal(isolation.sqlMutations.length,7);assert.ok(isolation.sqlMutations.every(s=>s.status==='Killed'));
assert.equal(isolation.applicationStateUnchanged,true);assert.equal(isolation.finalApplicationStateUnchanged,true);
const coverage=(await json(join(output,'coverage/coverage-summary.json'))).total;
for(const metric of ['statements','branches','functions','lines'])assert.equal(coverage[metric].pct,100);
const mutation=await json(join(output,'mutation-final.json')),counts={};
for(const [file,row] of Object.entries(mutation.files)){
  assert.equal(hash(row.source),hash(await readFile(file)));
  for(const mutant of row.mutants)counts[mutant.status]=(counts[mutant.status]??0)+1;
}
assert.equal(counts.Killed,71);assert.equal(counts.Survived??0,0);
const newSources=['docs/benchmarks/phase9d-1-checkpoint-2026-10-12.md','docs/benchmarks/phase9d-1-operations-2026-10-12.md','docs/benchmarks/phase9d-1-privacy-calibration-2026-10-12.md',
  'backend/tests/phase9dReadiness.test.js','backend/tests/integration/phase9dReadiness.test.js',
  ...(await readdir('tools/phase9d')).filter(p=>/\.(mjs|sql|json)$/.test(p)).map(p=>'tools/phase9d/'+p)];
const sources=Object.fromEntries(await Promise.all(newSources.map(async p=>[p,hash(await readFile(p))])));
const artifacts=[];
async function collect(relative=''){
  for(const entry of await readdir(join(output,relative),{withFileTypes:true})){
    const path=join(relative,entry.name).replaceAll('\\','/');
    if(entry.isDirectory()){if(entry.name!=='coverage-raw')await collect(path)}
    else if(entry.isFile()&&entry.name!=='manifest.json')artifacts.push({path,sha256:hash(await readFile(join(output,path)))});
  }
}
await collect();
const remaining=await Promise.all(files.filter(p=>/^remaining-.*\.json$/.test(p)).map(p=>json(join(output,p))));
const failed=records.filter(r=>r.code!==0||!r.sourcesUnchanged).map(r=>({path:r.path,mode:r.mode,code:r.code,sourcesUnchanged:r.sourcesUnchanged,summary:r.summary,
  currentSourceDifferences:Object.entries(r.sources??{}).filter(([p,h])=>sources[p]&&sources[p]!==h).map(([p])=>p)}));
const quality=await json(join(output,'quality.json'));
const methods=quality.files.flatMap(f=>f.methods);
const limits={cyclomatic:Math.max(...methods.map(m=>m.cyclomatic)),cognitive:Math.max(...methods.map(m=>m.cognitive)),
  halsteadDifficulty:Math.max(...methods.map(m=>m.halsteadDifficulty)),crap:Math.max(...methods.map(m=>m.crap)),maxPhysicalLoc:Math.max(...quality.files.map(f=>f.physicalLines))};
assert.ok(limits.cyclomatic<22&&limits.cognitive<22&&limits.halsteadDifficulty<80&&limits.crap<25&&limits.maxPhysicalLoc<500);
const missingChecks=['full-serial','db','phase9','replay','cross','lint','typecheck'].filter(mode=>!selected[mode]);
if(!remaining.flatMap(r=>r.stages).some(s=>s.name==='independent-saved-replay'&&s.status==='PASS'))missingChecks.push('independent-saved-replay');
const readiness=await json(join(output,'readiness-gates.json'));
const q=readiness.criteria.find(r=>r.id==='Q3');
q.status=missingChecks.length?'DESIGNED_NOT_VERIFIED':'VERIFIED_IN_ISOLATION';
q.evidence=missingChecks.length?'Current verification still missing: '+missingChecks.join(', '):'Completed current serial execution records selected in manifest; interrupted attempts retained';
await writeFile(join(output,'readiness-gates.json'),JSON.stringify(readiness,null,2));
const matrixArtifact=artifacts.find(a=>a.path==='readiness-gates.json');matrixArtifact.sha256=hash(await readFile(join(output,'readiness-gates.json')));
const manifest={schema:'phase9d-1-execution-manifest-v1',generatedAt:new Date().toISOString(),phase9d1:'PARTIAL',productionReady:false,
  baseline,sources,selected,isolationWitness:isolation.path,isolation:{tests:18,tables:51,directDenials:436,serviceDenials:7,targetedSqlMutationsKilled:7,noApplicationStateChanged:true},
  quality:{scope:quality.scopedFiles,coverage,mutation:counts,meaningfulSurvivors:0,structural:limits,duplication:(await json(join(output,'duplication/jscpd-report.json'))).statistics.total,
    fullCriticalEntryAndSqlCertification:'NOT_IMPLEMENTED'},
  executions:records.map(r=>({path:r.path,mode:r.mode,code:r.code,started:r.started,finished:r.finished,summary:r.summary,sourcesUnchanged:r.sourcesUnchanged,currentSourceDifferences:Object.entries(r.sources??{}).filter(([p,h])=>sources[p]&&sources[p]!==h).map(([p])=>p)})),
  epochExplanation:'Lifecycle/replay/cross completed before final disposable metadata-only SQL/test hardening. Their application import graphs and all frozen/auth sources remain unchanged; they do not import the new prototype SQL or integration test. Final private-boundary DB evidence executes the final metadata-hardened sources. Full-serial helper/test sources match the final tree.',
  preservedFailures:failed,serializedVerification:remaining,missingChecks,artifacts,
  readinessGates:'readiness-gates.json',
  productionBlockers:readiness.criteria.filter(r=>r.status!=='VERIFIED_IN_ISOLATION'),
  safety:{realIncidentCollection:false,liveEvaluationProviderCalls:0,liveClerkLoadCalls:0,productionConsequences:false,productionDeployment:false,productionRolesModified:false,frozenSourcesModified:false,
    authMiddlewareModified:false,financialPolicyModified:false,productionShadow:'OFF',autoAdjudication:'OFF',searchRollout:'OFF',phase9d2:'NOT_STARTED',
    applicabilityAudit:'INDEPENDENT',projectWideProofloop:'NOT_STARTED',publicGeneralization:'NOT_STARTED',rejectedViteCleanupRetried:false}};
await writeFile(join(output,'manifest.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify({phase9d1:manifest.phase9d1,productionReady:false,selected,missingChecks,isolation:manifest.isolation,quality:manifest.quality.structural}));
