import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {readJson,atomicJson,hash,alive,transition} from '../../../handoff/core.mjs';
const stateFile='output/handoff/state.json',state=readJson(stateFile),run=state.run;assert.equal(run.phase,'P06');
const worker=readJson('output/handoff/worker.json');for(let i=0;worker&&alive(worker.pid)&&i<50;i++)await new Promise(r=>setTimeout(r,200));assert(!worker||!alive(worker.pid),'Stop watcher before registering owner approval');
const directory=path.join(run.directory,'fixes-2026-10-24'),out=path.join(directory,'artifacts');fs.mkdirSync(out,{recursive:true});fs.mkdirSync(path.join(directory,'private'),{recursive:true});
const baselineFile=path.join(directory,'source-before.json');
if(!fs.existsSync(baselineFile)){
  const original=readJson(path.join(run.directory,'product-source-before.json'));
  atomicJson(baselineFile,original.map(f=>({file:f.file,sha256:hash(fs.readFileSync(f.file)),auditSha256:f.sha256})));
  for(const file of ['frontend/src/pages/OnBoarding.jsx','frontend/src/components/ui/DateTimeSelector.jsx','frontend/src/pages/VehicleSelect.jsx','frontend/src/components/ui/Button.jsx'])fs.copyFileSync(file,path.join(directory,'private',path.basename(file)+'.before'));
  fs.copyFileSync('tools/ui-quality/coverage/master-ui-coverage.csv',path.join(directory,'coverage-before.csv'));
  atomicJson(path.join(directory,'approval.json'),{phase:'P06',date:'2026-10-24',source:'Explicit owner message in this conversation',request:'fix these website issues P06-B01-01 P06-B01-02 P06-B01-03 P06-B01-04',issues:['P06-B01-01','P06-B01-02','P06-B01-03','P06-B01-04'],treatments:['Ignore obsolete autocomplete responses','Use one earliest-valid instant for default date and time','Keep focus within the address group and support keyboard suggestion selection','Expose the existing selected vehicle button using aria-pressed'],scope:'Existing design and business rules preserved; read-only synthetic testing only'});
}
const approval=readJson(path.join(directory,'approval.json'));state.ownerDecisions=[...(state.ownerDecisions||[]).filter(d=>d.marker!=='P06-FIXES-2026-10-24'),{marker:'P06-FIXES-2026-10-24',phase:'P06',issues:approval.issues,decision:'APPROVED_FOR_FIX',source:'Explicit owner message',at:new Date().toISOString()}];
state.approvalRequired={...state.approvalRequired,active:false,approvedIssues:[...new Set([...(state.approvalRequired.approvedIssues||[]),...approval.issues])],pendingVerification:approval.issues,issues:[],reason:'Owner explicitly approved fixes for all four P06 findings',updatedAt:new Date().toISOString()};
run.stage='running';run.pid=null;run.followup={directory,phase:'P06',status:'FIXING_APPROVED_ISSUES',issues:approval.issues};state.phases[run.key]={...state.phases[run.key],status:'CODEX_RUNNING'};state.bootstrap={...state.bootstrap,active:true,reason:'Current interactive session implements explicitly approved P06 fixes; suppress duplicate dispatch'};transition(state,'CODEX_RUNNING','Implementing four explicitly approved P06 website fixes');atomicJson(stateFile,state);
atomicJson('output/handoff/progress.json',{screen:'P06 approved website fixes',route:'/book',issue:approval.issues.join(', '),doing:'Implementing the four owner-approved fixes while preserving the booking design and rules',status:'Fixing',updatedAt:new Date().toISOString()});
console.log(JSON.stringify({phase:'P06',status:'APPROVED_FOR_FIX',issues:approval.issues,directory}));
