// Append-only progress evidence, deliberately not an acceptance manifest.
import assert from 'node:assert/strict';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {hash,verifyBaseline} from './baseline.mjs';
import {closureCoreScope} from './closure-scope.mjs';
const output=resolve('output/phase9d-custody-closure-2026-10-15'),id='progress-'+Date.now()+'-'+randomUUID();
const original='output/phase9d-audit-custody-2026-10-14/manifest.json',accepted=JSON.parse(await readFile(original));
for(const [file,identity]of Object.entries(accepted.sources))assert.equal(hash(await readFile(file)),identity,'ACCEPTED_CUSTODY_SOURCE_CHANGED:'+file);
const sources={};for(const name of await readdir('tools/phase9d'))if(name.startsWith('closure-'))sources['tools/phase9d/'+name]=hash(await readFile('tools/phase9d/'+name));
for(const file of ['backend/tests/phase9dCustodyClosure.test.js','backend/tests/phase9dCustodyClosureTransport.test.js','backend/tests/phase9dCustodyObserver.test.js','backend/tests/phase9dCustodyReplayInput.test.js','backend/tests/helpers/phase9dClosureIngressCrash.mjs','backend/tests/helpers/phase9dCustodyClosureFixture.js','backend/tests/helpers/phase9dCustodyLineageFixture.js','backend/tests/integration/phase9dCustodyClosure.test.js','backend/tests/integration/phase9dCustodyLineage.test.js'])sources[file]=hash(await readFile(file));
const executions=[];
for(const name of (await readdir(output)).filter(name=>/^(unit|db|lineage|full|typecheck)-.*\.json$/.test(name))){
  const bytes=await readFile(join(output,name)),run=JSON.parse(bytes);
  executions.push({file:name,sha256:hash(bytes),code:run.code,sourcesUnchanged:run.sourcesUnchanged??false,summary:run.summary,error:run.error??null,
    currentCoreHashesMatch:closureCoreScope.every(file=>run.sources?.[file]===sources[file]),
    currentTestHashesMatch:Object.keys(sources).filter(file=>file.startsWith('backend/tests/')).every(file=>run.sources?.[file]===sources[file])});
}
const artifacts=[];
for(const name of (await readdir(output)).filter(name=>/^independent-review-.*\.(json|md)$/.test(name)||/^capsule-.*\.json$/.test(name)))artifacts.push({file:name,sha256:hash(await readFile(join(output,name)))});
const record={schema:'custody-closure-progress-v2',id,at:new Date().toISOString(),status:'PARTIAL',productionReady:false,baseline:await verifyBaseline(),
  acceptedCustody:{file:original,sha256:hash(await readFile(original)),identitiesMatched:Object.keys(accepted.sources).length},sources,executions,artifacts,
  observedInfrastructureFailure:{component:'Docker Desktop',engineAvailable:false,condition:'Startup cannot rename sailor-ingest.sock to sailor-ingest.sock.stale; normal CLI stop failed. Owner asked to quit/reopen without reset.',rootCauseEstablished:false},
  mutation:{status:'RUNNING_NOT_ACCEPTED',instrumented:593,rawReport:'mutation-core-initial.json'},
  boundaries:{coreCoverage:'Nine stated helpers only; see source-bound quality measurement',capsuleAcceptance:'NOT_VERIFIED',denialDelivery:'IMPLEMENTED_PENDING_REAL_SERVER_EXECUTION',savedInputReplay:'INPUT_VALIDATION_ONLY_EXECUTABLE_REPLAY_NOT_IMPLEMENTED',sqlCertification:'PARTIAL',financialAuthority:'UNCHANGED',productionShadow:'OFF',phase9d2:'NOT_STARTED'},
  next:['Restore Docker without reset; check owned interrupted resource labels before cleanup','Run current db and lineage suites in fresh disposable servers','Execute corrected custody capsule and independent denial recipe','Finish complete rotation/restart/storage and saved-input event replay matrices','Reconcile mutation identities and any meaningful survivors; obtain final independent review','Finish changed-SQL catalogs/profiling/logical/omission proofs and source-bound acceptance reconciliation']};
await writeFile(join(output,id+'.json'),JSON.stringify(record,null,2),{flag:'wx'});console.log(JSON.stringify({id,status:record.status,acceptedCustodyIdentities:record.acceptedCustody.identitiesMatched,executions:executions.length}));
