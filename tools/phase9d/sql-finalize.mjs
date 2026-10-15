import assert from 'node:assert/strict';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {verifyBaseline,hash} from './baseline.mjs';
const root=resolve(import.meta.dirname,'../..'),out=join(root,'output/phase9d-1-sql-broker-2026-10-13');
const read=async file=>JSON.parse(await readFile(join(root,file),'utf8'));
const previous='output/phase9d-1-continuation-2026-10-13/manifest.json';
const old=await read(previous),baseline=await verifyBaseline();
const sqlSha=hash(await readFile(join(root,'tools/phase9d/permissions.sql')));
const records=await Promise.all((await readdir(out)).filter(n=>/^(sql|historical|all-db|full|typecheck)-.*\.json$/.test(n)).map(async file=>({file,record:JSON.parse(await readFile(join(out,file),'utf8'))})));
const sourceNames=[...new Set(records.flatMap(r=>Object.keys(r.record.sources??{})))];
const currentSources=Object.fromEntries(await Promise.all(sourceNames.map(async file=>[file,hash(await readFile(join(root,file)))])));
const selected={};
for(const mode of ['sql','all-db','full','typecheck']){
  const valid=records.filter(r=>r.record.mode===mode&&r.record.code===0&&r.record.sourcesUnchanged&&r.record.sources['tools/phase9d/permissions.sql']===sqlSha&&Object.entries(r.record.sources).every(([file,value])=>currentSources[file]===value)).sort((a,b)=>a.record.started.localeCompare(b.record.started));
  assert.ok(valid.length,mode+' accepted current SQL epoch');selected[mode]=valid.at(-1).file;
}
const sqlWitnessNames=(await readdir(out)).filter(n=>n.startsWith('sql-witness-')).sort();
let sqlWitnessFile,witness;
for(const file of sqlWitnessNames){const w=JSON.parse(await readFile(join(out,file),'utf8'));if(w.status==='PASS'&&w.sourceSha256===hash(await readFile(join(root,'tools/phase9d/permissions.sql')))&&w.mutations.length===26){sqlWitnessFile=file;witness=w;}}
assert.ok(witness);assert.ok(witness.mutations.every(m=>m.status==='KILLED'));
const native=witness.nativeCoverage.reduce((a,r)=>({statements:a.statements+r.counts.statements.total,statementHits:a.statementHits+r.counts.statements.hit,branches:a.branches+r.counts.branches.total,branchHits:a.branchHits+r.counts.branches.hit}),{statements:0,statementHits:0,branches:0,branchHits:0});
assert.deepEqual(native,{statements:102,statementHits:102,branches:47,branchHits:47});
const capsuleFile='output/phase9d-1-continuation-2026-10-13/capsule-1791861236843-0669507f-f7e4-48df-a43e-cba56dcc3318.json';
const capsule=await read(capsuleFile);assert.equal(capsule.status,'PASS');assert.equal(capsule.permissionsSha256,witness.sourceSha256);assert.equal(capsule.applicationUnchanged,true);
const critical=['tools/phase9d/privacy.mjs','tools/phase9d/repository.mjs','tools/phase9d/worker-core.mjs','tools/phase9d/worker.mjs'];
for(const file of critical)assert.equal(hash(await readFile(join(root,file))),old.sources[file]);
const matrix=witness.routines.map(r=>({signature:r.signature,source:'tools/phase9d/permissions.sql',definitionSha256:r.definitionSha256,language:r.lanname,owner:r.owner,securityDefiner:r.prosecdef,searchPath:r.proconfig,acl:r.acl,
  executablePrincipals:witness.permissions.filter(p=>p.signature===r.signature&&p.executable).map(p=>p.rolname),
  expectedEntry:{append:'trusted audit recorder/owner append; no worker authority',valid_categories:'owner-only bounded category validator',valid_instant:'owner-only UTC/calendar validator',valid_snapshot:'owner-only fully minimized evidence schema',enqueue:'capture-only bounded immutable deduplicated queue',set_stop:'ops-only stop/epoch update',claim:'worker lease/capacity/retry admission',permit:'worker current owner/token/epoch/deadline/budget admission',complete:'worker advisory-only current lease result commit',fail:'worker owned lease bounded failure bookkeeping',delete_payload:'ops-only terminal payload deletion with metadata retained'}[r.proname],
  nativeCoverage:witness.nativeCoverage.find(c=>c.signature===r.signature)?.counts??null,
  missingCoverage:r.lanname==='sql'?'No native SQL-language statement/expression branch instrumentation; explicit truth tables/ACL/rollback probes only.':'Native PL/pgSQL statement/branch shape is fully exercised; Boolean subconditions and SQL-expression CASE arms are not those branches. Mutation adequacy/whole-SQL structural certification remains partial.',
  threatAssumptions:'Trusted disposable owner/bootstrap and trusted capture/recorder. Restricted worker has no app-table, owner-role, schema-create or direct-audit privileges. Capture identity is not a committed-journal ownership proof.'}));
await writeFile(join(out,'sql-testability-matrix.json'),JSON.stringify({schema:'phase9d-sql-matrix-v1',sourceSha256:witness.sourceSha256,routines:matrix,
  constraints:witness.constraints,defaultPrivileges:witness.defaultPrivileges,policies:witness.policies,triggers:witness.triggers,tableSecurity:witness.tableSecurity,
  bootstrapSources:['tools/phase9d/capsule.mjs','tools/phase9d/worker.mjs','backend/tests/helpers/database.js','backend/tests/helpers/postgisEnvironment.js'],
  migrationBoundary:'83 migrations and 51 application-table permission/state checks are capsule dependencies, not a statement/branch certificate over those migrations.',
  nativeMethod:witness.denominatorMethod,scopeLimits:['Three SQL-language routines and embedded SQL logical subconditions lack numerical branch certification.','No full SQL cognitive/Halstead/CRAP structural certificate.','26 selected SQL/DDL mutants are not all possible condition/ACL mutations.','Wrong database/URI/role admission and broader operative denials are separately bound to accepted worker/container witnesses.','Journal-backed export, standalone broker and external custody are not implemented.']},null,2));
const gates=await read('output/phase9d-1-continuation-2026-10-13/readiness-gates.json');
for(const gate of gates.criteria){
  if(gate.id==='Q4'){gate.status='VERIFIED_IN_ISOLATION';gate.evidence='Versioned current-policy Phase 5/7 witnesses preserve original purpose and downstream paths; current broader disposable suite 58/58. Original sources/reports archived unchanged.';}
  if(gate.id==='Q2'){gate.status='DESIGNED_NOT_VERIFIED';gate.evidence='Native eight-routine certificate 102/102 statements and 47/47 branches; 26/26 seeded SQL/DDL mutants. Whole-SQL logical-condition/SQL-language/structural certification is incomplete.';}
  gate.nextAction=gate.status==='VERIFIED_IN_ISOLATION'?'Preserve the bounded witness; reverify if its actual boundary changes.':
    gate.status==='NOT_IMPLEMENTED'?'Implement the isolated '+gate.criterion.toLowerCase()+' and execute its failure/recovery tests before readiness.':
    gate.status==='BLOCKED_EXTERNAL'?'Obtain separately approved external evidence for '+gate.criterion.toLowerCase()+'; local fixtures cannot close this gate.':
    gate.status==='REQUIRES_OWNER_APPROVAL'?'Prepare a concrete reviewable proposal and obtain the specific owner approval for '+gate.criterion.toLowerCase()+'.':
    'Execute the designed '+gate.criterion.toLowerCase()+' in the stated isolated scope; retain missing production proof.';
}
gates.schema='phase9d-preactivation-gates-sql-v1';gates.criteria.push({id:'Q2P',criterion:'Native critical PL/pgSQL statement/branch execution',status:'VERIFIED_IN_ISOLATION',evidence:'Eight exact catalog definitions, pinned native profiler, 102/102 visible statements and 47/47 native branches; no whole-SQL percentage.',nextAction:'Keep SQL-language/logical-condition and structural coverage separate; expand mutation adequacy.'});
await writeFile(join(out,'readiness-gates.json'),JSON.stringify(gates,null,2));
const sourcesList=[...critical,'tools/phase9d/permissions.sql','tools/phase9d/next-run.mjs','tools/phase9d/sql-finalize.mjs','tools/phase9d/sql-eslint.config.mjs','tools/phase9d/sql-profiler.Dockerfile',
  'tools/phase9d/profiler-vendor/postgresql-server-dev-17.deb','tools/phase9d/profiler-vendor/plpgsql-check.tar.gz',
  'backend/tests/helpers/phase9dCurrentPolicyWitness.js','backend/tests/helpers/phase9dSqlMutations.js','backend/tests/integration/phase9dSqlCertification.test.js',
  'backend/tests/integration/phase5DeferredPostgisValidation.test.js','backend/tests/integration/phase7ShadowAdjudicationPostgres.test.js',
  'docs/benchmarks/phase9d-1-sql-certification-checkpoint-2026-10-13.md','CONTEXT.md','ROADMAP.txt'];
const sources=Object.fromEntries(await Promise.all(sourcesList.map(async f=>[f,hash(await readFile(join(root,f)))])));
const artifacts=[];
async function collect(directory){for(const entry of await readdir(join(root,directory),{withFileTypes:true})){
  if(entry.name==='manifest.json'&&directory===rootRelativeOut)continue;
  const file=directory+'/'+entry.name;if(entry.isDirectory())await collect(file);else artifacts.push({file,sha256:hash(await readFile(join(root,file)))});
}}
const rootRelativeOut='output/phase9d-1-sql-broker-2026-10-13';await collect(rootRelativeOut);
for(const file of [previous,capsuleFile,'output/phase9d-1-continuation-2026-10-13/capsule-1791861234829-33a39181-0c25-4858-9dbc-e3a73cd587ba.log'])artifacts.push({file,sha256:hash(await readFile(join(root,file)))});
const lint=(await readdir(out)).filter(f=>/^lint-\d+\.json$/.test(f)).sort().at(-1);assert.equal((await read(rootRelativeOut+'/'+lint)).code,0);selected.lint=lint;
const replay=await read(rootRelativeOut+'/replay-preservation.json');assert.equal(replay.total,36);assert.equal(replay.runtimeSourcesCurrent,true);
for(const receipt of replay.receipts)artifacts.push({file:receipt.file,sha256:receipt.sha256});
const manifest={schema:'phase9d-sql-closure-v1',generatedAt:new Date().toISOString(),previousManifest:previous,baseline,sources,artifacts,selectedExecutions:selected,sqlWitness:sqlWitnessFile,capsule:capsuleFile,
  results:{fullBackend:'1793/1793',broaderDatabase:'58/58',focusedHistorical:'11/11 earlier epoch; all included in current broader suite',sql:'12/12',nativePlpgsql:native,seededSqlMutants:{killed:26,survivors:0,errors:0},criticalJs:'Four accepted runtime module hashes unchanged; prior scoped coverage/mutation/structural evidence preserved',replay:'37/37 actual paired suite; 36 receipts bind 208 current backend sources; outer wrapper epoch change retained'},
  retainedUnselectedExecutions:records.filter(r=>r.record.code!==0||!r.record.sourcesUnchanged).map(r=>({file:r.file,code:r.record.code,sourcesUnchanged:r.record.sourcesUnchanged})),
  phase9d1:'PARTIAL',sqlSecurityCertification:'PARTIAL',isolatedShadowContainment:'VERIFIED_FOR_SUPPORTED_SCOPE',independentAuditCustody:'PARTIAL',productionReady:false,phase9d2:'NOT_STARTED',productionDeploymentAuthorized:false,
  productionShadow:'OFF',autoAdjudication:'OFF',productionConsequences:'OFF',searchRollout:'OFF',projectWideProofloop:'NOT_STARTED',publicGeneralization:'NOT_STARTED',liveModelCalls:0,liveProductionProviderOperations:0,
  nextImplementation:'Continue the authorized isolated work: journal-backed bounded export/outbox, then standalone offline broker, independently controlled audit and production-shaped synthetic Clerk HTTP capacity. No new owner decision blocks that isolated implementation.'};
await writeFile(join(out,'manifest.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify({selectedExecutions:selected,sqlWitness:sqlWitnessFile,artifacts:artifacts.length,native,phase9d1:'PARTIAL',productionReady:false}));
