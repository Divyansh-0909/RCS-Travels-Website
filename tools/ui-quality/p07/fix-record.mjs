import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {parse,serialize,validate,summarize} from '../coverage/core.mjs';
const out='output/handoff/P07-fixes-2026-10-29',folder='https://drive.google.com/drive/folders/1h1mgl7VDO8yKKJH4DqWxpta-iU9O6Avk';
const read=f=>JSON.parse(fs.readFileSync(f)),json=(f,v)=>fs.writeFileSync(f,JSON.stringify(v,null,2)+'\n');
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const before=f=>out+'/before/'+f.replaceAll('/','__');
const csv='tools/ui-quality/coverage/master-ui-coverage.csv',reg='tools/ui-quality/coverage/registered-surfaces.json',issueFile='tools/ui-quality/coverage/issues.json',inventoryFile='docs/ui-quality/component-consistency-inventory.json';
const originals=parse(fs.readFileSync(before(csv),'utf8')),rows=parse(fs.readFileSync(csv,'utf8'));
const changedSource=['frontend/src/components/RideSettlementPanel.jsx','frontend/src/components/ui/RefreshNotice.jsx','frontend/src/pages/TrackingPage.jsx'];
// Map unchanged exact lines through the small source edits. A missing anchor
// stops recording instead of guessing among repeated JSX tokens.
function lineMap(a,b){const n=a.length,m=b.length,t=Array.from({length:n+1},()=>new Uint16Array(m+1));for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)t[i][j]=a[i]===b[j]?1+t[i+1][j+1]:Math.max(t[i+1][j],t[i][j+1]);const result=new Map();for(let i=0,j=0;i<n&&j<m;){if(a[i]===b[j]){result.set(i+1,j+1);i++;j++;}else if(t[i+1][j]>=t[i][j+1])i++;else j++;}return result;}
const maps=new Map(changedSource.map(f=>[f,lineMap(fs.readFileSync(before(f),'utf8').split(/\r?\n/),fs.readFileSync(f,'utf8').split(/\r?\n/))]));
const anchorChanges=[];
for(const row of rows){const original=originals.find(r=>r.id===row.id);assert(original,'Unexpected added row');if(!maps.has(row.source_file))continue;const line=maps.get(row.source_file).get(original.source_line);assert(line,`Source anchor needs manual reconciliation: ${row.id} ${row.source_file}:${original.source_line}`);row.source_line=line;if(line!==original.source_line)anchorChanges.push({id:row.id,file:row.source_file,before:original.source_line,after:line,source_token:row.source_token});}
const selected=['P07-B02-02','P07-B02-03','P07-B02-04'];
const changes=[];
for(const row of rows){if(!row.issue_ids.some(id=>selected.includes(id)))continue;const original=originals.find(r=>r.id===row.id);row.owner_decision='APPROVED_FOR_FIX';row.implementation_status='VERIFIED';row.verification_status='VERIFIED';row.last_review_phase='P07-APPROVED-FIXES';row.last_review_date='2026-10-29';row.verification_levels=[...new Set([...row.verification_levels,'BROWSER_INTERACTION',...(row.issue_ids.includes('P07-B02-03')?['KEYBOARD']:[])])];row.evidence_urls=[...new Set([...row.evidence_urls,folder])];row.blocker='Technical verification is bounded to the isolated actual renderer, denied writes and documented viewports. Provider/native/spoken assistive technology acceptance is not inferred.';row.next_action='Owner selected A and implementation is technically verified; review the updated live example. No further approval is requested to apply this already-approved fix.';changes.push({id:row.id,issue:row.issue_ids[0],before:{owner:original.owner_decision,implementation:original.implementation_status,verification:original.verification_status},after:{owner:row.owner_decision,implementation:row.implementation_status,verification:row.verification_status}});}
const pending=rows.find(r=>r.issue_ids.includes('P07-B02-01'));pending.next_action='Owner is considering WebSockets and asked about server load and costs. No transport option is approved; original defect remains FAIL and product polling is unchanged.';
const registry=read(before(reg)),issues=read(issueFile);
// Registered updates may be intentionally partial overlays. Retain their
// original shape and unrelated properties rather than expanding every entry
// into a full canonical row.
const fixFields=['owner_decision','implementation_status','verification_status','last_review_phase','last_review_date','verification_levels','evidence_urls','blocker','next_action'];
for(const collection of [registry.surfaces,registry.updates])for(const entry of collection){
  const current=rows.find(r=>r.id===entry.id);if(!current)continue;
  if(current.issue_ids.some(id=>selected.includes(id)))for(const key of fixFields)entry[key]=current[key];
  if(current.issue_ids.includes('P07-B02-01'))entry.next_action=current.next_action;
  if(maps.has(entry.source_file)&&Number.isInteger(entry.source_line)){const relocated=maps.get(entry.source_file).get(entry.source_line);assert(relocated,'Registered source anchor needs review: '+entry.id);entry.source_line=relocated;}
}
for(const collection of [registry.issues,issues])for(const issue of collection){if(selected.includes(issue.id)){
  const historical=read(before(issueFile)).find(i=>i.id===issue.id),row=rows.find(r=>r.issue_ids.includes(issue.id));issue.owner_decision='APPROVED_FOR_FIX';issue.implementation_status='VERIFIED';issue.verification_status='VERIFIED';issue.status='VERIFIED';issue.ownerChoice='A';issue.fixSource=row.source_file+':'+row.source_line;issue.approval='Owner explicitly requested the recommended02A,03A,04A changes in the current chat.';issue.fixHistory=[...(historical.fixHistory||[]),{phase:'P07',status:'FAIL',owner_decision:historical.owner_decision,implementation_status:historical.implementation_status,baseline:historical.baseline,evidence_urls:historical.evidence_urls},{phase:'P07-APPROVED-FIXES',status:'VERIFIED',date:'2026-10-29',choice:'A',evidence:folder}];issue.evidence_urls=[...new Set([...(issue.evidence_urls||[]),folder])];
}else if(issue.id==='P07-B02-01'){issue.transportDiscussion='Owner prefers exploring WebSockets and has asked about load and hosting costs. No polling or WebSocket implementation approved in this follow-up.';}}
registry.phaseNotes={...(registry.phaseNotes||{}),'P07-APPROVED-FIXES':'02A/03A/04A explicitly approved and technically verified. 01 remains unresolved pending WebSocket discussion. Item12 ON HOLD; parent/sibling audit/fix statuses unchanged.'};
const validation=validate(rows,{issues,routes:read('tools/ui-quality/coverage/discovered-routes.json')});
for(const original of originals){const current=rows.find(r=>r.id===original.id);assert.equal(current.parent_id,original.parent_id);if(!selected.some(id=>original.issue_ids.includes(id))){for(const key of ['audit_status','owner_decision','implementation_status','verification_status'])assert.equal(current[key],original[key],original.id+' changed '+key);}}
json(reg,registry);json(issueFile,issues);fs.writeFileSync(csv,serialize(rows));
const inventory=read(inventoryFile);inventory.phaseAssessments['P07-APPROVED-FIXES']={date:'2026-10-29',status:'PARTIAL_01_PENDING',ownerApproved:selected.map(id=>({id,choice:'A'})),implemented:{'P07-B02-02':'Announced inline failure, GET-only refresh, busy controls, paid outcome clears failure; Hindi/Hinglish copy added.','P07-B02-03':'Inert exit, timer cleanup, unmount after300ms (immediate reduced motion), owned-focus restoration/page fallback.','P07-B02-04':'Local support wrapping, shrinkable columns and scrollable completed panel at large text.'},evidence:folder,issue01:'Transport/cost discussion; no implementation.',item12:'ON HOLD',newGlobalVisualStandards:[],aestheticAcceptance:'Owner approved the treatment; no claim that the owner has inspected the final pixels.'};json(inventoryFile,inventory);
const allowed=[...changedSource,'shared/i18n/locales/hi/websiteCopy.json','shared/i18n/locales/hi-Latn/websiteCopy.json',csv,reg,inventoryFile];
const checks=read(out+'/source-before.json').map(p=>({...p,after:sha(p.file),changed:p.sha256!==sha(p.file),authorized:allowed.includes(p.file)}));assert(checks.every(p=>!p.changed||p.authorized),'Unrelated recorded input changed');
for(const f of ['shared/i18n/locales/hi/websiteCopy.json','shared/i18n/locales/hi-Latn/websiteCopy.json']){const a=read(before(f)),b=read(f);for(const[k,v]of Object.entries(a))assert.equal(b[k],v,'Existing translation changed: '+k);assert.equal(Object.keys(b).length-Object.keys(a).length,3);}
const git=read(out+'/git-before.json');assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),git.head);assert.equal(sha(execFileSync('git',['rev-parse','--git-path','index'],{encoding:'utf8'}).trim()),git.index);
json(out+'/source-preservation.json',{checks,status:'PASS',productInputs:checks.filter(p=>/^(frontend|driver-app|shared)\//.test(p.file)).length,changedProductInputs:checks.filter(p=>p.changed&&/^(frontend|driver-app|shared)\//.test(p.file)).map(p=>p.file),headUnchanged:true,indexUnchanged:true,scope:'Recorded inputs only. Dirty working tree preserved; no claim over every unrelated editor file.'});
json(out+'/tracker-validation.json',{...validation,before:summarize(originals),after:summarize(rows),addedRows:0,removedRows:0,fixChanges:changes,anchorChanges,parentSiblingStatusesPreserved:true,item01:'FAIL / OWNER_REVIEW_REQUIRED / NOT_CHANGED',item12:'ON HOLD'});
console.log(JSON.stringify({validation,fixes:changes.length,sourceAnchorReconciliations:anchorChanges.length,changedProductInputs:checks.filter(p=>p.changed&&/^(frontend|driver-app|shared)\//.test(p.file)).length}));
